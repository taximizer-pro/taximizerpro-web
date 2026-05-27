#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler
=====================================
Fills FILLABLE PDF form fields directly — no pixel overlays.
All existing financial data and checkboxes are preserved.
Forms remain fully fillable after generation.

Usage:
    python3 fill_1040.py \
        --first "Eugene" --middle "J" --last "Bisignano" \
        --ssn "333-33-3333" \
        --address "123 Main St" --apt "" --city "Miami" --state "FL" --zip "33101" \
        --routing "021000021" --account "123456789" \
        --years 2023 2024 2025 \
        --out-dir /tmp/output

Requires: pip install pymupdf
"""

import fitz
import os
import sys
import argparse
import json
import urllib.request
import urllib.parse
import base64
from datetime import date

# ─────────────────────────────────────────────────────────────────────────────
# FIELD MAPS — exact short field names from widget scan of each template
# Only the fields WE fill. All others (financial data, checkboxes) are untouched.
# ─────────────────────────────────────────────────────────────────────────────

# 2023 and 2024 share identical field layout
FIELDS_2023_2024 = {
    # PAGE 1 — Personal info
    'f1_04[0]': 'FIRST_MIDDLE',   # First name + middle initial
    'f1_05[0]': 'LAST_NAME',       # Last name
    'f1_06[0]': 'SSN',             # Social Security Number
    'f1_10[0]': 'ADDRESS',         # Street address
    'f1_11[0]': 'APT',             # Apt number
    'f1_12[0]': 'CITY',            # City
    'f1_13[0]': 'STATE',           # State
    'f1_14[0]': 'ZIP',             # Zip code
    # PAGE 2 — Banking + Signature row
    'f2_25[0]': 'ROUTING',         # Routing number  [rect top=324]
    'f2_26[0]': 'ACCOUNT',         # Account number  [rect top=336]
    'f2_30[0]': 'SIG_DATE',        # Date (your signature date) [rect top=420]
    'f2_31[0]': 'SIG_DATE',        # Date (backup slot same row) [rect top=420]
    'f2_33[0]': 'OCCUPATION',      # Your occupation → HELPER [rect top=472]
}

# 2025 has a different form layout
FIELDS_2025 = {
    # PAGE 1 — Personal info
    'f1_14[0]': 'FIRST_MIDDLE',   # First name + middle initial
    'f1_15[0]': 'LAST_NAME',       # Last name
    'f1_16[0]': 'SSN',             # SSN
    'f1_20[0]': 'ADDRESS',         # Street address
    'f1_21[0]': 'APT',             # Apt
    'f1_22[0]': 'CITY',            # City
    'f1_23[0]': 'STATE',           # State
    'f1_24[0]': 'ZIP',             # Zip
    # PAGE 2 — Banking + Signature row
    'f2_32[0]': 'ROUTING',         # Routing number [rect top=504]
    'f2_33[0]': 'ACCOUNT',         # Account number [rect top=516]
    'f2_37[0]': 'SIG_DATE',        # Your signature date [rect top=594]
    'f2_38[0]': 'SIG_DATE',        # Date field (same row) [rect top=594]
    'f2_40[0]': 'OCCUPATION',      # Your occupation → HELPER [rect top=646]
}

FIELD_MAPS = {
    '2023': FIELDS_2023_2024,
    '2024': FIELDS_2023_2024,
    '2025': FIELDS_2025,
}

# ─────────────────────────────────────────────────────────────────────────────
# CORE FILL FUNCTION
# ─────────────────────────────────────────────────────────────────────────────

def fill_1040(template_path: str, output_path: str, year: str, client: dict) -> None:
    """
    Fill a 1040 PDF using native form fields.
    - template_path: path to the FILLABLE template PDF
    - output_path: where to save the filled PDF
    - year: '2023', '2024', or '2025'
    - client: dict with keys: first_name, middle_init, last_name, ssn,
              address, apt, city, state, zip, routing, account
    """
    today = date.today().strftime('%m/%d/%Y')

    # Build token values
    tokens = {
        'FIRST_MIDDLE': f"{client['first_name']} {client.get('middle_init','')}".strip(),
        'LAST_NAME':    client['last_name'],
        'SSN':          _fmt_ssn(client.get('ssn','')),
        'ADDRESS':      client.get('address',''),
        'APT':          client.get('apt',''),
        'CITY':         client.get('city',''),
        'STATE':        client.get('state',''),
        'ZIP':          client.get('zip',''),
        'ROUTING':      client.get('routing',''),
        'ACCOUNT':      client.get('account',''),
        'SIG_DATE':     today,
        'OCCUPATION':   'HELPER',   # always hardcoded
    }

    field_map = FIELD_MAPS[year]

    doc = fitz.open(template_path)

    for page in doc:
        for widget in page.widgets():
            if widget.field_type_string != 'Text':
                continue
            short_name = widget.field_name.split('.')[-1]
            if short_name in field_map:
                token     = field_map[short_name]
                new_value = tokens.get(token, '')
                if new_value:  # don't overwrite with blank
                    widget.field_value = new_value
                    widget.update()

    # Save — keep incremental so existing form structure is preserved
    doc.save(output_path, garbage=4, deflate=True, incremental=False)
    doc.close()
    print(f'  ✅ {year} → {output_path} ({os.path.getsize(output_path)//1024}KB)')


def _fmt_ssn(ssn: str) -> str:
    d = ssn.replace('-','').replace(' ','')
    return f'{d[:3]}-{d[3:5]}-{d[5:]}' if len(d) == 9 else ssn


# ─────────────────────────────────────────────────────────────────────────────
# DRIVE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def drive_get(url, token):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    return json.loads(urllib.request.urlopen(req).read())

def drive_post(url, data, token):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(url, data=body,
           headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
           method='POST')
    return json.loads(urllib.request.urlopen(req).read())

def find_or_create_folder(name, token, parent_id=None):
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    res = drive_get(f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id)", token)
    if res.get('files'):
        return res['files'][0]['id']
    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id:
        meta['parents'] = [parent_id]
    return drive_post('https://www.googleapis.com/drive/v3/files', meta, token)['id']

def upload_pdf_to_drive(pdf_path, filename, folder_id, token):
    with open(pdf_path, 'rb') as f:
        pdf_bytes = f.read()
    meta_str = json.dumps({'name': filename, 'parents': [folder_id], 'mimeType': 'application/pdf'})
    bnd  = 'txboundary42'
    body = (
        f'--{bnd}\r\nContent-Type: application/json\r\n\r\n{meta_str}\r\n'
        f'--{bnd}\r\nContent-Type: application/pdf\r\n\r\n'
    ).encode() + pdf_bytes + f'\r\n--{bnd}--'.encode()
    req = urllib.request.Request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        data=body, method='POST',
        headers={'Authorization': f'Bearer {token}', 'Content-Type': f'multipart/related; boundary={bnd}'}
    )
    result = json.loads(urllib.request.urlopen(req).read())
    return result.get('webViewLink', f"https://drive.google.com/file/d/{result['id']}/view")

def download_from_drive(file_id, dest_path, token):
    url = f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as r, open(dest_path, 'wb') as f:
        f.write(r.read())

def send_email(to, subject, html_body, gmail_token):
    msg = '\r\n'.join([f'To: {to}', f'Subject: {subject}',
                       'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html_body])
    raw = base64.urlsafe_b64encode(msg.encode()).decode().rstrip('=')
    req = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps({'raw': raw}).encode(),
        headers={'Authorization': f'Bearer {gmail_token}', 'Content-Type': 'application/json'},
        method='POST'
    )
    urllib.request.urlopen(req)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN — full pipeline: download → fill → upload → email
# ─────────────────────────────────────────────────────────────────────────────

MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
}

def run_pipeline(client: dict, years=None, send_email_to=None,
                 drive_token=None, gmail_token=None, out_dir='/tmp'):
    """
    Full pipeline for one client.
    client keys: first_name, middle_init, last_name, ssn,
                 address, apt, city, state, zip, routing, account
    """
    if years is None:
        years = ['2023', '2024', '2025']

    drive_token = drive_token or os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN')
    gmail_token = gmail_token or os.environ.get('GMAIL_ACCESS_TOKEN')

    slug       = f"{client['first_name']}_{client.get('middle_init','')}_{client['last_name']}".replace(' ','_').strip('_')
    date_label = date.today().strftime('%m-%d-%Y')
    folder_name = f'{slug}_{date_label}'

    os.makedirs(out_dir, exist_ok=True)

    # Find/create single client folder in Drive
    root_id   = find_or_create_folder('Taximizer', drive_token)
    folder_id = find_or_create_folder(folder_name, drive_token, root_id)
    print(f'Drive folder: Taximizer/{folder_name}')

    links = {}
    for year in years:
        tpl_path = os.path.join(out_dir, f'tpl_{year}.pdf')
        out_path = os.path.join(out_dir, f'{slug}_{year}_1040.pdf')

        # Download template
        print(f'  Downloading {year} template...')
        download_from_drive(MASTER_IDS[year], tpl_path, drive_token)

        # Fill form fields
        fill_1040(tpl_path, out_path, year, client)

        # Upload to Drive
        filename = f'{slug}_{year}_1040.pdf'
        link = upload_pdf_to_drive(out_path, filename, folder_id, drive_token)
        links[year] = link
        print(f'  📤 {year} uploaded → {link}')

    # Send email
    if send_email_to and gmail_token:
        subj = f'✅ Form(s) 1040 Ready — {client["first_name"]} {client["last_name"]}'
        rows = ''.join(
            f'<li><a href="{links[y]}" style="color:#1a73e8">📄 {y} Form 1040</a></li>'
            for y in years
        )
        html = f'''<div style="font-family:Arial,sans-serif;max-width:600px;padding:20px">
  <h2 style="color:#F59E0B">Taximizer Pro</h2>
  <p>IRS Form(s) 1040 for <strong>{client["first_name"]} {client["last_name"]}</strong> are ready:</p>
  <ul style="line-height:2">{rows}</ul>
  <p style="font-size:11px;color:#888;margin-top:24px">Taximizer Pro — Tax Filing Platform</p>
</div>'''
        send_email(send_email_to, subj, html, gmail_token)
        print(f'  📧 Email sent → {send_email_to}')

    return {'folder': f'Taximizer/{folder_name}', 'links': links}


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    client = {
        'first_name':  'Eugene',
        'middle_init': 'J',
        'last_name':   'Bisignano',
        'ssn':         '333-33-3333',
        'address':     '123 Main St',
        'apt':         '',
        'city':        'Miami',
        'state':       'FL',
        'zip':         '33101',
        'routing':     '021000021',
        'account':     '123456789',
    }

    result = run_pipeline(
        client=client,
        years=['2023', '2024', '2025'],
        send_email_to='taximizerpro@gmail.com',
        out_dir='/tmp/taximizer_out'
    )
    print('\n✅ DONE')
    print(json.dumps(result, indent=2))
