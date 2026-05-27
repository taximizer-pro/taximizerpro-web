#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (OFFICIAL IRS TEMPLATES v7)
================================================================
Using OFFICIAL fillable IRS 1040 forms from IRS.gov
New template IDs (2022-2025 in Drive):
  2022: 1WegC9pAqo41d7EnusgqiVENy_8F-lROT
  2023: 11EliCV6RXer1bA_eqnFLB5esDZsJefiu
  2024: 1jeO8jBbrjHg7IkTfQyv7eJiTPuP-3d_W
  2025: 1YrqK6Y3p-QgxzlIi0b7ph3XNAfmDX6mc

Root Drive folder: TaximizerPro V 2.0 Clients
Client sub-folder: LastName_FirstName_MM-DD-YYYY_YEARS
                   e.g. Bisignano_Eugene_05-27-2026_2023-2024-2025
Files inside: LastName_FirstName_YEAR_1040.pdf  (one per year)

FIELD MAPS (IRS Official Forms):

2023/2024 Page 1:
  f1_04[0] = First name + middle initial
  f1_05[0] = Last name
  f1_06[0] = SSN (raw digits, no dashes)
  f1_10[0] = Address
  f1_12[0] = City
  f1_13[0] = State
  f1_14[0] = ZIP

2023/2024 Page 2 (Bank + Occupation):
  f2_33[0] = Bank routing number
  f2_35[0] = Bank account number
  f2_39[0] = Your occupation (HELPER)

2025 Page 1:
  f1_04[0] = First name + middle initial
  f1_05[0] = Last name
  f1_06[0] = SSN
  f1_11[0] = Address
  f1_14[0] = City
  f1_15[0] = State
  f1_16[0] = ZIP

2025 Page 2:
  f2_32[0] = Bank routing number
  f2_33[0] = Bank account number
  f2_40[0] = Your occupation (HELPER)

HARD RULES:
- Occupation ALWAYS = "HELPER" — no exceptions
- SSN = raw digits only, no dashes (333333333 not 333-33-3333)
- Apt: only append if non-empty and not in (none, null, apt, apt., #, unit)
- Address = street + (apt if valid) — never separate fields
"""

import fitz
import os, json, urllib.request, urllib.parse, base64
from datetime import date

# ── Master Template IDs (OFFICIAL IRS.GOV FORMS) ──────────────────────────────
MASTER_IDS = {
    '2022': '1WegC9pAqo41d7EnusgqiVENy_8F-lROT',
    '2023': '11EliCV6RXer1bA_eqnFLB5esDZsJefiu',
    '2024': '1jeO8jBbrjHg7IkTfQyv7eJiTPuP-3d_W',
    '2025': '1YrqK6Y3p-QgxzlIi0b7ph3XNAfmDX6mc',
}

ROOT_FOLDER_NAME = 'TaximizerPro V 2.0 Clients'

# ── Widget field maps (OFFICIAL IRS templates) ────────────────────────────────
P1_FIELDS_2023_2024 = {
    'topmostSubform[0].Page1[0].f1_04[0]': 'FIRST_MIDDLE',
    'topmostSubform[0].Page1[0].f1_05[0]': 'LAST_NAME',
    'topmostSubform[0].Page1[0].f1_06[0]': 'SSN',
    'topmostSubform[0].Page1[0].f1_10[0]': 'ADDRESS',
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_10[0]': 'ADDRESS',  # Fallback for nested
    'topmostSubform[0].Page1[0].f1_12[0]': 'CITY',
    'topmostSubform[0].Page1[0].f1_13[0]': 'STATE',
    'topmostSubform[0].Page1[0].f1_14[0]': 'ZIP',
}

P1_FIELDS_2025 = {
    'topmostSubform[0].Page1[0].f1_04[0]': 'FIRST_MIDDLE',
    'topmostSubform[0].Page1[0].f1_05[0]': 'LAST_NAME',
    'topmostSubform[0].Page1[0].f1_06[0]': 'SSN',
    'topmostSubform[0].Page1[0].f1_11[0]': 'ADDRESS',
    'topmostSubform[0].Page1[0].f1_14[0]': 'CITY',
    'topmostSubform[0].Page1[0].f1_15[0]': 'STATE',
    'topmostSubform[0].Page1[0].f1_16[0]': 'ZIP',
}

P2_FIELDS_2023_2024 = {
    'topmostSubform[0].Page2[0].f2_33[0]': 'ROUTING',
    'topmostSubform[0].Page2[0].f2_35[0]': 'ACCOUNT',
    'topmostSubform[0].Page2[0].f2_39[0]': 'OCCUPATION',
}

P2_FIELDS_2025 = {
    'topmostSubform[0].Page2[0].f2_32[0]': 'ROUTING',
    'topmostSubform[0].Page2[0].f2_33[0]': 'ACCOUNT',
    'topmostSubform[0].Page2[0].f2_40[0]': 'OCCUPATION',
}

WIDGET_MAPS = {
    '2022': (P1_FIELDS_2023_2024, P2_FIELDS_2023_2024),  # 2022 same as 2023/2024
    '2023': (P1_FIELDS_2023_2024, P2_FIELDS_2023_2024),
    '2024': (P1_FIELDS_2023_2024, P2_FIELDS_2023_2024),
    '2025': (P1_FIELDS_2025,      P2_FIELDS_2025),
}

# ── PDF fill ──────────────────────────────────────────────────────────────────
def fill_1040(template_path, output_path, year, client, signature_image_path=None):
    """Fill official IRS 1040 form with client data."""
    today   = date.today().strftime('%m/%d/%Y')
    ssn     = (client.get('ssn','') or '').replace('-','').replace(' ','')
    first_m = f"{(client.get('first_name') or '').strip()} {(client.get('middle_init') or '').strip()}".strip()
    apt_raw = str(client.get('apt') or '').strip()
    apt_val = apt_raw if apt_raw and apt_raw.lower() not in ('none','null','apt','apt.','#','unit','') else ''
    address = ((client.get('address') or '').strip() + (' ' + apt_val if apt_val else '')).strip()

    tokens = {
        'FIRST_MIDDLE': first_m,
        'LAST_NAME':    (client.get('last_name') or '').strip(),
        'SSN':          ssn,
        'ADDRESS':      address,
        'CITY':         (client.get('city') or '').strip(),
        'STATE':        (client.get('state') or '').strip(),
        'ZIP':          (client.get('zip') or '').strip(),
        'ROUTING':      (client.get('bank_routing') or '').strip(),
        'ACCOUNT':      (client.get('bank_account') or '').strip(),
        'OCCUPATION':   'HELPER',
    }

    p1_map, p2_map = WIDGET_MAPS[year]
    doc = fitz.open(template_path)
    p1, p2 = doc[0], doc[1]

    # Page 1 widgets
    for w in p1.widgets():
        if w.field_type_string != 'Text': continue
        fn = w.field_name
        if fn in p1_map and tokens.get(p1_map[fn]):
            w.field_value = tokens[p1_map[fn]]
            w.update()

    # Page 2 widgets (bank + occupation)
    for w in p2.widgets():
        if w.field_type_string != 'Text': continue
        fn = w.field_name
        if fn in p2_map and tokens.get(p2_map[fn]):
            w.field_value = tokens[p2_map[fn]]
            w.update()

    # Save with repair (garbage=4 cleans xrefs)
    doc.save(output_path, garbage=4, deflate=True, incremental=False)
    doc.close()
    size_kb = os.path.getsize(output_path) // 1024
    print(f'    ✅ {year} filled → {size_kb}KB')


# ── Drive helpers ─────────────────────────────────────────────────────────────
def _dget(url, tok):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {tok}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def _dpost(url, data, tok, extra_headers={}):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(url, data=body, method='POST', headers={
        'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', **extra_headers})
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

def download_template(file_id, dest, tok):
    req = urllib.request.Request(
        f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media',
        headers={'Authorization': f'Bearer {tok}'}
    )
    with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
        f.write(r.read())


# ── Email ─────────────────────────────────────────────────────────────────────
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
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#F59E0B,#D97706);padding:24px 28px">
    <div style="font-size:22px;font-weight:900;letter-spacing:-0.5px">TaximizerPro</div>
    <div style="font-size:13px;opacity:0.85;margin-top:2px">Tax Filing Platform</div>
  </div>
  <!-- Body -->
  <div style="padding:28px">
    <h2 style="margin:0 0 8px;font-size:20px">Your Tax Return Is Ready ✅</h2>
    <p style="color:#94a3b8;margin:0 0 24px;font-size:14px">
      Hi <strong style="color:#fff">{client_name}</strong>,<br><br>
      Your IRS Form 1040 ({years_str}) has been prepared and is ready for your review.
      All files are securely stored in your private Drive folder.
    </p>
    <!-- File links -->
    <table style="width:100%;border-collapse:collapse;background:#0D1628;border-radius:12px;overflow:hidden">
      <thead>
        <tr style="background:#111827">
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Document</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Action</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
    <!-- Details -->
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
        <span style="color:#64748b">Filed</span>
        <span style="font-weight:600">{filing_date}</span>
      </div>
    </div>
    <p style="color:#64748b;margin-top:24px;font-size:12px;line-height:1.6">
      <strong style="color:#fff">Next Steps:</strong><br>
      1. Review your forms in the Drive folder<br>
      2. Download and sign them (or we can help)<br>
      3. Reply to confirm receipt
    </p>
  </div>
  <!-- Footer -->
  <div style="background:#0D1628;padding:16px 28px;text-align:center;font-size:11px;color:#64748b;border-top:1px solid #1e293b">
    <p style="margin:0">TaximizerPro — Professional Tax Preparation</p>
    <p style="margin:8px 0 0;opacity:0.7">Nobody controls the IRS — not even Italy, and that says a lot...</p>
  </div>
</div>
"""
    
    raw_msg = (f'From: taximizerpro@gmail.com\r\nTo: {to}\r\n'
               f'Subject: Your Tax Forms Are Ready — TaximizerPro\r\n'
               f'Content-Type: text/html; charset=utf-8\r\n\r\n{html}')
    raw = base64.urlsafe_b64encode(raw_msg.encode()).decode().rstrip('=')
    req = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps({'raw': raw}).encode(), method='POST',
        headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


# ── Main generation pipeline ──────────────────────────────────────────────────
def generate_forms_for_client(c):
    """Generate 1040 forms for a client, upload to Drive, email them, return links."""
    years = [y.strip() for y in (c.get('tax_year') or '').split(',') if y.strip() in ('2022','2023','2024','2025')]
    if not years:
        print(f"  ⚠️  {c['first_name']} {c['last_name']}: no valid tax_year specified")
        return {}, ''
    
    today_str = date.today().strftime('%m-%d-%Y')
    years_str = '-'.join(sorted(years))
    folder_name = f"{(c.get('last_name') or '').strip()}_{(c.get('first_name') or '').strip()}_{today_str}_{years_str}"
    
    # Get Drive tokens
    drive_tok = os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN', '')
    gmail_tok = os.environ.get('GMAIL_ACCESS_TOKEN', '')
    
    if not drive_tok:
        print(f"  ❌ Missing GOOGLEDRIVE_ACCESS_TOKEN")
        return {}, ''
    
    # Find/create Drive folders
    root_id = find_or_create_folder(ROOT_FOLDER_NAME, drive_tok)
    client_folder_id = find_or_create_folder(folder_name, drive_tok, root_id)
    
    # Generate and upload each form
    links = {}
    for yr in years:
        try:
            tmpl = f'/tmp/tpl_{yr}_{c["id"]}.pdf'
            out  = f'/tmp/out_{yr}_{c["id"]}.pdf'
            
            download_template(MASTER_IDS[yr], tmpl, drive_tok)
            fill_1040(tmpl, out, yr, c)
            
            fname = f"{(c.get('last_name') or '').strip()}_{(c.get('first_name') or '').strip()}_{yr}_1040.pdf"
            links[yr] = upload_pdf(out, fname, client_folder_id, drive_tok)
            
            # Cleanup
            try: os.remove(tmpl)
            except: pass
            try: os.remove(out)
            except: pass
        except Exception as e:
            print(f"  ❌ {yr}: {e}")
    
    # Email client if we have links and email
    if links and c.get('email') and '@' in c.get('email',''):
        try:
            send_email(c['email'], c.get('first_name','Client'), links, 
                      date.today().strftime('%m/%d/%Y'), ', '.join(sorted(links.keys())), 
                      folder_name, gmail_tok)
            print(f"  ✉️  Email sent to {c['email']}")
        except Exception as e:
            print(f"  ⚠️  Email failed: {e}")
    
    folder_url = f"https://drive.google.com/drive/folders/{client_folder_id}"
    return links, folder_url

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys
    
    # Read clients from stdin (JSON array)
    try:
        raw = sys.stdin.read().strip()
        if not raw:
            print("No input provided")
            sys.exit(0)
        clients = json.loads(raw)
        if not isinstance(clients, list):
            clients = [clients]
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON: {e}")
        sys.exit(1)
    
    print(f"Processing {len(clients)} client(s)...\n")
    for c in clients:
        name = f"{c.get('first_name','')} {c.get('last_name','')}"
        print(f"→ {name}")
        links, folder_url = generate_forms_for_client(c)
        if links:
            print(f"  📁 Folder: {folder_url}")
            for yr in sorted(links.keys()):
                print(f"    {yr}: {links[yr]}")
        print()
