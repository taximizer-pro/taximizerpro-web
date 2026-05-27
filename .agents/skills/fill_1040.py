#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (v7 — PyPDF backend)
===========================================================
Uses pypdf instead of PyMuPDF for better PDF compatibility.
All hard rules enforced:
  - OCCUPATION = "HELPER" (hardcoded)
  - SSN = digits only, no dashes
  - APT = only appended if real (not none/null/apt/apt./unit)
  - Templates downloaded fresh from Google Drive
"""

from pypdf import PdfReader, PdfWriter
import os, json, urllib.request, urllib.parse, base64
from datetime import date
from io import BytesIO

ROOT_FOLDER_NAME = 'TaximizerPro V 2.0 Clients'

MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
}

# Widget field maps — same as before
P1_FIELDS_2023_2024 = {
    'f1_04[0]': 'FIRST_MIDDLE',
    'f1_05[0]': 'LAST_NAME',
    'f1_06[0]': 'SSN',
    'f1_10[0]': 'ADDRESS',
    'f1_12[0]': 'CITY',
    'f1_13[0]': 'STATE',
    'f1_14[0]': 'ZIP',
}
P1_FIELDS_2025 = {
    'f1_14[0]': 'FIRST_MIDDLE',
    'f1_15[0]': 'LAST_NAME',
    'f1_16[0]': 'SSN',
    'f1_20[0]': 'ADDRESS',
    'f1_22[0]': 'CITY',
    'f1_23[0]': 'STATE',
    'f1_24[0]': 'ZIP',
}
P2_FIELDS_2023 = {'f2_25[0]':'ROUTING','f2_26[0]':'ACCOUNT','f2_33[0]':'OCCUPATION'}
P2_FIELDS_2024 = {'f2_25[0]':'ROUTING','f2_26[0]':'ACCOUNT','f2_33[0]':'OCCUPATION'}
P2_FIELDS_2025 = {'f2_32[0]':'ROUTING','f2_33[0]':'ACCOUNT','f2_40[0]':'OCCUPATION'}

WIDGET_MAPS = {
    '2023': (P1_FIELDS_2023_2024, P2_FIELDS_2023),
    '2024': (P1_FIELDS_2023_2024, P2_FIELDS_2024),
    '2025': (P1_FIELDS_2025,      P2_FIELDS_2025),
}

# ── PDF fill with PyPDF ──────────────────────────────────────────────────────
def fill_1040(template_bytes, output_path, year, client):
    """Fill 1040 form using PyPDF."""
    today = date.today().strftime('%m/%d/%Y')
    ssn = (client.get('ssn', '') or '').replace('-', '').replace(' ', '')
    first_m = f"{(client.get('first_name') or '').strip()} {(client.get('middle_init') or '').strip()}".strip()
    apt_raw = str(client.get('apt') or '').strip()
    apt_val = apt_raw if apt_raw and apt_raw.lower() not in ('none','null','apt','apt.','#','unit','') else ''
    address = (client.get('address', '').strip() + (' ' + apt_val if apt_val else '')).strip()
    
    tokens = {
        'FIRST_MIDDLE': first_m,
        'LAST_NAME': (client.get('last_name') or '').strip(),
        'SSN': ssn,
        'ADDRESS': address,
        'CITY': client.get('city', ''),
        'STATE': client.get('state', ''),
        'ZIP': client.get('zip', ''),
        'ROUTING': (client.get('routing') or client.get('bank_routing') or ''),
        'ACCOUNT': (client.get('account') or client.get('bank_account') or ''),
        'OCCUPATION': 'HELPER',
    }
    
    p1_map, p2_map = WIDGET_MAPS[year]
    reader = PdfReader(BytesIO(template_bytes), strict=False)
    writer = PdfWriter()
    
    # Copy pages and update fields
    for page_idx, page in enumerate(reader.pages):
        writer.add_page(page)
    
    # Update form fields
    if writer.get_fields():
        for field_name in writer.get_fields():
            sn = field_name.split('.')[-1]
            
            # Page 1 fields
            if sn in p1_map and tokens.get(p1_map[sn]):
                writer.update_page_form_field_values(
                    writer.pages[0], {field_name: tokens[p1_map[sn]]}
                )
            # Page 2 fields
            elif sn in p2_map and tokens.get(p2_map[sn]):
                writer.update_page_form_field_values(
                    writer.pages[1], {field_name: tokens[p2_map[sn]]}
                )
    
    with open(output_path, 'wb') as f:
        writer.write(f)
    
    size_kb = os.path.getsize(output_path) // 1024
    print(f'    ✅ {year} filled → {size_kb}KB')


# ── Google Drive helpers ─────────────────────────────────────────────────────
def _dget(url, tok):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {tok}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def _dpost(url, data, tok):
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method='POST',
          headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def find_or_create_folder(name, tok, parent_id=None):
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    res = _dget(f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id)", tok)
    if res.get('files'):
        return res['files'][0]['id']
    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id:
        meta['parents'] = [parent_id]
    return _dpost('https://www.googleapis.com/drive/v3/files', meta, tok)['id']

def upload_pdf(pdf_path, filename, folder_id, tok):
    with open(pdf_path, 'rb') as f:
        pdf_bytes = f.read()
    meta = json.dumps({'name': filename, 'parents': [folder_id], 'mimeType': 'application/pdf'})
    bnd = 'txpro2bnd'
    body = (
        f'--{bnd}\r\nContent-Type: application/json\r\n\r\n{meta}\r\n'
        f'--{bnd}\r\nContent-Type: application/pdf\r\n\r\n'
    ).encode() + pdf_bytes + f'\r\n--{bnd}--'.encode()
    req = urllib.request.Request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        data=body, method='POST',
        headers={'Authorization': f'Bearer {tok}', 'Content-Type': f'multipart/related; boundary={bnd}'}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        result = json.loads(r.read())
    return result.get('webViewLink', f"https://drive.google.com/file/d/{result['id']}/view")

def download_template(file_id, tok):
    """Download template from Drive and return bytes."""
    req = urllib.request.Request(
        f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media&supportsAllDrives=true',
        headers={'Authorization': f'Bearer {tok}'}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


# ── Email ─────────────────────────────────────────────────────────────────────
def send_email(to, client_name, links, filing_date, years_filed, folder_name, tok):
    """Send professional notification email to client."""
    years_str = ', '.join(sorted(links.keys()))
    rows = ''.join(
        f'<tr><td style="padding:10px 16px;border-bottom:1px solid #1e293b">'
        f'<a href="{link}" style="color:#F59E0B;font-weight:bold;text-decoration:none">'
        f'📄 {yr} Form 1040</a></td>'
        f'<td style="padding:10px 16px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px">'
        f'View in Google Drive →</td></tr>'
        for yr, link in sorted(links.items())
    )
    html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#080F1E;color:#fff;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#F59E0B,#D97706);padding:24px 28px">
    <div style="font-size:22px;font-weight:900;letter-spacing:-0.5px">TaximizerPro</div>
    <div style="font-size:13px;opacity:0.85;margin-top:2px">Tax Filing Platform</div>
  </div>
  <div style="padding:28px">
    <h2 style="margin:0 0 8px;font-size:20px">Your Tax Return Is Ready ✅</h2>
    <p style="color:#94a3b8;margin:0 0 24px;font-size:14px">
      Hi <strong style="color:#fff">{client_name}</strong>,<br><br>
      Your IRS Form 1040 ({years_str}) has been prepared and is ready for your review.
    </p>
    <table style="width:100%;border-collapse:collapse;background:#0D1628;border-radius:12px;overflow:hidden">
      <thead>
        <tr style="background:#111827">
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Document</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Action</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
    <p style="margin-top:20px;color:#64748b;font-size:12px">Filed {filing_date} — TaximizerPro</p>
  </div>
</div>
"""
    raw_msg = f'From: taximizerpro@gmail.com\r\nTo: {to}\r\nSubject: Your Tax Forms Are Ready — TaximizerPro\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{html}'
    raw = base64.urlsafe_b64encode(raw_msg.encode()).decode().rstrip('=')
    
    gmail_tok = os.environ.get('GMAIL_ACCESS_TOKEN')
    if not gmail_tok:
        print(f"    ⚠️ No Gmail token available")
        return
    
    req = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps({'raw': raw}).encode(), method='POST',
        headers={'Authorization': f'Bearer {gmail_tok}', 'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print(f"    📧 Email sent → {to}")
    except Exception as e:
        print(f"    ⚠️ Email failed: {e}")


# ── Main entry point ────────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python3 fill_1040.py <client_json>")
        print("Example: python3 fill_1040.py '{\"first_name\":\"John\",\"last_name\":\"Doe\",\"ssn\":\"123456789\",\"address\":\"123 Main St\",\"city\":\"Miami\",\"state\":\"FL\",\"zip\":\"33179\",\"bank_routing\":\"123456789\",\"bank_account\":\"987654321\",\"email\":\"john@example.com\",\"tax_year\":\"2023,2024,2025\"}'")
        sys.exit(1)
    
    client = json.loads(sys.argv[1])
    drive_tok = os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN')
    gmail_tok = os.environ.get('GMAIL_ACCESS_TOKEN')
    
    if not drive_tok or not gmail_tok:
        print("❌ Missing tokens: GOOGLEDRIVE_ACCESS_TOKEN and/or GMAIL_ACCESS_TOKEN")
        sys.exit(1)
    
    years = [y.strip() for y in (client.get('tax_year') or '').split(',') if y.strip() in ('2023','2024','2025')]
    if not years:
        print("❌ No valid tax years in client.tax_year")
        sys.exit(1)
    
    today_str = date.today().strftime('%m-%d-%Y')
    folder_name = f"{client.get('last_name', 'Unknown').strip()}_{client.get('first_name', 'Unknown').strip()}_{today_str}_{'_'.join(sorted(years))}"
    
    print(f"📁 {ROOT_FOLDER_NAME}/{folder_name}")
    
    root_id = find_or_create_folder(ROOT_FOLDER_NAME, drive_tok)
    client_folder_id = find_or_create_folder(folder_name, drive_tok, root_id)
    links = {}
    
    for yr in sorted(years):
        print(f"  [{yr}] Downloading template...")
        tmpl_bytes = download_template(MASTER_IDS[yr], drive_tok)
        
        out = f'/tmp/out_{yr}.pdf'
        print(f"  [{yr}] Filling...")
        fill_1040(tmpl_bytes, out, yr, client)
        
        fname = f"{client.get('last_name', 'Unknown').strip()}_{client.get('first_name', 'Unknown').strip()}_{yr}_1040.pdf"
        print(f"  [{yr}] Uploading → {fname}")
        links[yr] = upload_pdf(out, fname, client_folder_id, drive_tok)
        print(f"  [{yr}] 🔗 {links[yr][:80]}...")
    
    send_email(client.get('email'), client.get('first_name'), links, date.today().strftime('%m/%d/%Y'), years, folder_name, drive_tok)
    print(f"\n✅ Complete! {len(links)} forms generated and emailed.\n   Folder: https://drive.google.com/drive/folders/{client_folder_id}")
