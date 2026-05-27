#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (PRODUCTION v8)
======================================================
PyMuPDF backend — handles corrupted xref, generates 2023/2024/2025 forms.
All hard rules enforced:
  - OCCUPATION = "HELPER" (hardcoded, never from client data)
  - SSN = raw digits only, no dashes
  - APT = only appended if real (not none/null/apt/apt./unit)
  - Address = street + (apt if valid)
  - Templates repaired via garbage=4 before filling
  - Designee fields always blank
"""

import fitz
import os, json, urllib.request, urllib.parse, base64, sys
from datetime import date
from pathlib import Path

# ── Google Drive ──────────────────────────────────────────────────────────
ROOT_FOLDER_NAME = 'TaximizerPro V 2.0 Clients'

MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
}

# ── Field maps ────────────────────────────────────────────────────────────
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

SIGN_HERE = {
    '2023': {'sig_box':(91.6,462.0,273.6,492.0), 'date_box':(273.6,462.0,324.0,492.0)},
    '2024': {'sig_box':(91.6,462.0,273.6,492.0), 'date_box':(273.6,462.0,324.0,492.0)},
    '2025': {'sig_box':(91.6,636.0,273.6,666.0), 'date_box':(273.6,636.0,324.0,666.0)},
}

# ── Drive helpers ─────────────────────────────────────────────────────────
def _dget(url, tok):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {tok}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def _dpost(url, data, tok, extra_headers={}):
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', **extra_headers})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def find_or_create_folder(name, tok, parent_id=None):
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    try:
        res = _dget(f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id)", tok)
        if res.get('files'):
            return res['files'][0]['id']
    except:
        pass
    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id:
        meta['parents'] = [parent_id]
    return _dpost('https://www.googleapis.com/drive/v3/files', meta, tok)['id']

def download_template(file_id, dest, tok):
    req = urllib.request.Request(
        f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media',
        headers={'Authorization': f'Bearer {tok}'}
    )
    with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
        f.write(r.read())

def upload_pdf(pdf_path, filename, folder_id, tok):
    with open(pdf_path, 'rb') as f:
        pdf_bytes = f.read()
    meta = json.dumps({'name': filename, 'parents': [folder_id], 'mimeType': 'application/pdf'})
    bnd  = 'txpro2bnd'
    body = (
        f'--{bnd}\r\nContent-Type: application/json\r\n\r\n{meta}\r\n'
        f'--{bnd}\r\nContent-Type: application/pdf\r\n\r\n'
    ).encode() + pdf_bytes + f'\r\n--{bnd}--'.encode()
    req = urllib.request.Request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        data=body, method='POST',
        headers={'Authorization': f'Bearer {tok}', 'Content-Type': f'multipart/related; boundary={bnd}'}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        result = json.loads(r.read())
    return result.get('webViewLink', f"https://drive.google.com/file/d/{result['id']}/view")

# ── PDF fill ──────────────────────────────────────────────────────────────
def fill_1040(template_path, output_path, year, client, signature_image_path=None):
    today   = date.today().strftime('%m/%d/%Y')
    ssn     = client.get('ssn','').replace('-','').replace(' ','')
    first_m = (client['first_name'] + ' ' + client.get('middle_init','')).strip()
    apt_raw = str(client.get("apt") or "").strip()
    apt_val = apt_raw if apt_raw and apt_raw.lower() not in ("none","null","apt","apt.","#","unit","") else ""
    address = (client.get('address','') + (' ' + apt_val if apt_val else '')).strip()

    tokens = {
        'FIRST_MIDDLE': first_m,
        'LAST_NAME':    client['last_name'],
        'SSN':          ssn,
        'ADDRESS':      address,
        'CITY':         client.get('city',''),
        'STATE':        client.get('state',''),
        'ZIP':          client.get('zip',''),
        'ROUTING':      client.get('routing','') or client.get('bank_routing',''),
        'ACCOUNT':      client.get('account','') or client.get('bank_account',''),
        'OCCUPATION':   'HELPER',
    }

    p1_map, p2_map = WIDGET_MAPS[year]
    doc = fitz.open(template_path)
    p1, p2 = doc[0], doc[1]

    # Page 1 widgets
    for w in p1.widgets():
        if w.field_type_string != 'Text': continue
        sn = w.field_name.split('.')[-1]
        if sn in p1_map and tokens.get(p1_map[sn]):
            w.field_value = tokens[p1_map[sn]]
            w.update()

    # Page 2 widgets (bank + occupation)
    for w in p2.widgets():
        if w.field_type_string != 'Text': continue
        sn = w.field_name.split('.')[-1]
        if sn in p2_map and tokens.get(p2_map[sn]):
            w.field_value = tokens[p2_map[sn]]
            w.update()

    # Date overlay into drawn date box
    coords = SIGN_HERE[year]
    db = coords['date_box']
    date_y = db[1] + (db[3] - db[1]) * 0.65
    p2.insert_text((db[0] + 2, date_y), today, fontname='helv', fontsize=7, color=(0,0,0))

    # Signature image into drawn signature box
    sb = coords['sig_box']
    if signature_image_path and os.path.exists(signature_image_path):
        sig_rect = fitz.Rect(sb[0]+4, sb[1]+4, sb[2]-4, sb[3]-4)
        p2.insert_image(sig_rect, filename=signature_image_path, keep_proportion=True)

    doc.save(output_path, garbage=4, deflate=True, incremental=False)
    doc.close()
    size_kb = os.path.getsize(output_path) // 1024
    print(f'    ✅ {year} filled → {size_kb}KB')


# ── Email ─────────────────────────────────────────────────────────────────
def send_email(to, client_name, links, filing_date, years_filed, folder_name, tok):
    """Send professional notification email to client with Drive links."""
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
      All files are securely stored in your private Drive folder.
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
    <div style="margin-top:20px;background:#0D1628;border-radius:12px;padding:16px;font-size:13px">
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b">
        <span style="color:#64748b">Client</span>
        <span style="font-weight:600">{client_name}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b">
        <span style="color:#64748b">Tax Years Filed</span>
        <span style="font-weight:600;color:#F59E0B">{years_str}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0">
        <span style="color:#64748b">Filed Date</span>
        <span style="font-weight:600">{filing_date}</span>
      </div>
    </div>
    <div style="margin-top:20px;padding:16px;background:#0D1628;border-left:3px solid #F59E0B;border-radius:8px;font-size:12px;color:#cbd5e1">
      <strong>Next Steps:</strong> Review your forms carefully. If any information needs correction, please reply to this email immediately. Once approved, we will file your returns with the IRS.
    </div>
  </div>
  <div style="padding:16px 28px;background:#111827;color:#64748b;font-size:11px;text-align:center">
    © 2026 TaximizerPro. All rights reserved. | Questions? Contact support.
  </div>
</div>
"""
    
    msg = {
        'raw': base64.urlsafe_b64encode(
            f"From: taximizerpro@gmail.com\r\n"
            f"To: {to}\r\n"
            f"Subject: Your IRS Form 1040 is Ready — {years_str}\r\n"
            f"MIME-Version: 1.0\r\n"
            f"Content-Type: text/html; charset=\"utf-8\"\r\n"
            f"\r\n{html}".encode()
        ).decode()
    }
    
    req = urllib.request.Request(
        'https://www.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps(msg).encode(),
        method='POST',
        headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


# ── Main ──────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: fill_1040.py <client_json>")
        sys.exit(1)
    
    try:
        client = json.loads(sys.argv[1])
    except:
        print("Error: Invalid JSON")
        sys.exit(1)

    drive_tok = os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN', '')
    gmail_tok = os.environ.get('GMAIL_ACCESS_TOKEN', '')
    
    if not drive_tok or not gmail_tok:
        print("Error: Missing GOOGLEDRIVE_ACCESS_TOKEN or GMAIL_ACCESS_TOKEN")
        sys.exit(1)

    years = client.get('tax_year', '2023,2024,2025').split(',')
    filing_date_str = date.today().strftime('%m/%d/%Y')
    folder_date = date.today().strftime('%m-%d-%Y')
    folder_name = f"{client.get('last_name', 'Unknown')}_{client.get('first_name', 'Unknown')}_{folder_date}_" + '-'.join(years)

    print(f"\n📋 {client.get('first_name')} {client.get('last_name')} ({', '.join(years)})")
    
    root_id = find_or_create_folder(ROOT_FOLDER_NAME, drive_tok)
    client_folder_id = find_or_create_folder(folder_name, drive_tok, root_id)
    links = {}
    
    for yr in sorted(years):
        template_id = MASTER_IDS.get(yr)
        if not template_id:
            print(f"    ⚠️  No template for {yr}")
            continue
        
        tmpl_path = f'/tmp/template_{yr}.pdf'
        try:
            download_template(template_id, tmpl_path, drive_tok)
        except Exception as e:
            print(f"    ❌ Download failed: {e}")
            continue
        
        out = f'/tmp/out_{yr}.pdf'
        try:
            fill_1040(tmpl_path, out, yr, client)
        except Exception as e:
            print(f"    ❌ Fill failed: {e}")
            continue
        
        fname = f"{client.get('last_name', 'Unknown').strip()}_{client.get('first_name', 'Unknown').strip()}_{yr}_1040.pdf"
        try:
            links[yr] = upload_pdf(out, fname, client_folder_id, drive_tok)
            print(f"    📤 Uploaded to Drive")
        except Exception as e:
            print(f"    ❌ Upload failed: {e}")
    
    if links:
        try:
            send_email(client.get('email'), client.get('first_name'), links, filing_date_str, years, folder_name, gmail_tok)
            print(f"    📧 Email sent\n")
        except Exception as e:
            print(f"    ⚠️  Email failed: {e}\n")
    else:
        print(f"    ❌ No forms generated\n")
