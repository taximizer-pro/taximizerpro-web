#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (DEFINITIVE)
===================================================
Fills FILLABLE PDF form fields natively.
- SSN: no dashes (333333333)
- Signature row: [Signature] [Date] [HELPER] — left to right
- Forms remain fully fillable after saving
- All pre-filled financial data preserved untouched

Requires: pip install pymupdf
"""

import fitz
import os
import json
import urllib.request
import urllib.parse
import base64
from datetime import date

# ─────────────────────────────────────────────────────────────────────────────
# VERIFIED FIELD MAPS  (from live widget scan of each template)
#
# Signature row layout confirmed:
#   2023/2024:  f2_30=[144,420→295,438]  f2_31=[331,420→425,438]  f2_33=[325,472→460,492]
#                     (Signature)               (Date)                   (Occupation=HELPER)
#   2025:       f2_37=[130,594→295,612]  f2_38=[324,594→425,612]  f2_40=[325,646→460,666]
#                     (Signature)               (Date)                   (Occupation=HELPER)
# ─────────────────────────────────────────────────────────────────────────────

FIELDS_2023_2024 = {
    # PAGE 1
    'f1_04[0]': 'FIRST_MIDDLE',   # First name + middle initial  [36,88→237,102]
    'f1_05[0]': 'LAST_NAME',      # Last name                    [239,88→467,102]
    'f1_06[0]': 'SSN',            # SSN (no dashes)              [469,88→576,102]
    'f1_10[0]': 'ADDRESS',        # Street address               [36,136→417,150]
    'f1_11[0]': 'APT',            # Apt                          [419,136→467,150]
    'f1_12[0]': 'CITY',           # City                         [36,160→337,174]
    'f1_13[0]': 'STATE',          # State                        [339,160→402,174]
    'f1_14[0]': 'ZIP',            # Zip                          [404,160→467,174]
    # PAGE 2 — Routing/Account
    'f2_25[0]': 'ROUTING',        # Routing number               [173,324→302,336]
    'f2_26[0]': 'ACCOUNT',        # Account number               [173,337→418,348]
    # PAGE 2 — Signature row
    'f2_30[0]': 'SIGNATURE',      # Your signature               [144,420→295,438]
    'f2_31[0]': 'SIG_DATE',       # Date (left of HELPER)        [331,420→425,438]
    'f2_33[0]': 'OCCUPATION',     # Occupation = HELPER          [325,472→460,492]
}

FIELDS_2025 = {
    # PAGE 1
    'f1_14[0]': 'FIRST_MIDDLE',   # First name + middle initial  [36,94→251,108]
    'f1_15[0]': 'LAST_NAME',      # Last name                    [253,94→467,108]
    'f1_16[0]': 'SSN',            # SSN (no dashes)              [469,94→576,108]
    'f1_20[0]': 'ADDRESS',        # Street address               [36,142→417,156]
    'f1_21[0]': 'APT',            # Apt                          [419,142→467,156]
    'f1_22[0]': 'CITY',           # City                         [36,166→331,180]
    'f1_23[0]': 'STATE',          # State                        [332,166→395,180]
    'f1_24[0]': 'ZIP',            # Zip                          [397,166→467,180]
    # PAGE 2 — Routing/Account
    'f2_32[0]': 'ROUTING',        # Routing number               [180,504→310,515]
    'f2_33[0]': 'ACCOUNT',        # Account number               [180,516→425,527]
    # PAGE 2 — Signature row
    'f2_37[0]': 'SIGNATURE',      # Your signature               [130,594→295,612]
    'f2_38[0]': 'SIG_DATE',       # Date (left of HELPER)        [324,594→425,612]
    'f2_40[0]': 'OCCUPATION',     # Occupation = HELPER          [325,646→460,666]
}

FIELD_MAPS = {
    '2023': FIELDS_2023_2024,
    '2024': FIELDS_2023_2024,
    '2025': FIELDS_2025,
}

MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def fmt_ssn_no_dashes(ssn: str) -> str:
    """Return bare 9 digits — no dashes, no spaces."""
    return ssn.replace('-', '').replace(' ', '')


def fill_1040(template_path: str, output_path: str, year: str, client: dict,
              signature_text: str = None) -> None:
    """
    Fill a 1040 PDF using native form field values.
    signature_text: optional text to put in the signature field (e.g. client full name)
    """
    today = date.today().strftime('%m/%d/%Y')
    first_mid = f"{client['first_name']} {client.get('middle_init', '')}".strip()

    tokens = {
        'FIRST_MIDDLE': first_mid,
        'LAST_NAME':    client['last_name'],
        'SSN':          fmt_ssn_no_dashes(client.get('ssn', '')),
        'ADDRESS':      client.get('address', ''),
        'APT':          client.get('apt', ''),
        'CITY':         client.get('city', ''),
        'STATE':        client.get('state', ''),
        'ZIP':          client.get('zip', ''),
        'ROUTING':      client.get('routing', ''),
        'ACCOUNT':      client.get('account', ''),
        # Signature field: use client full name if no drawn signature provided
        'SIGNATURE':    signature_text or f"{client['first_name']} {client['last_name']}",
        'SIG_DATE':     today,
        'OCCUPATION':   'HELPER',   # always hardcoded per Taximizer Pro rules
    }

    field_map = FIELD_MAPS[year]
    doc = fitz.open(template_path)

    for page in doc:
        for widget in page.widgets():
            if widget.field_type_string != 'Text':
                continue
            short_name = widget.field_name.split('.')[-1]
            if short_name in field_map:
                token = field_map[short_name]
                value = tokens.get(token, '')
                if value:
                    widget.field_value = value
                    widget.update()

    doc.save(output_path, garbage=4, deflate=True, incremental=False)
    doc.close()
    size_kb = os.path.getsize(output_path) // 1024
    print(f'  ✅ {year} → {output_path} ({size_kb}KB)')


# ─────────────────────────────────────────────────────────────────────────────
# DRIVE / GMAIL
# ─────────────────────────────────────────────────────────────────────────────

def _drive_get(url, token):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    return json.loads(urllib.request.urlopen(req).read())

def _drive_post(url, data, token):
    req = urllib.request.Request(url, data=json.dumps(data).encode(),
          headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
          method='POST')
    return json.loads(urllib.request.urlopen(req).read())

def find_or_create_folder(name, token, parent_id=None):
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    res = _drive_get(
        f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id)",
        token)
    if res.get('files'):
        return res['files'][0]['id']
    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id:
        meta['parents'] = [parent_id]
    return _drive_post('https://www.googleapis.com/drive/v3/files', meta, token)['id']

def upload_pdf(pdf_path, filename, folder_id, token):
    with open(pdf_path, 'rb') as f:
        pdf_bytes = f.read()
    meta = json.dumps({'name': filename, 'parents': [folder_id], 'mimeType': 'application/pdf'})
    bnd  = 'txbnd42'
    body = (f'--{bnd}\r\nContent-Type: application/json\r\n\r\n{meta}\r\n'
            f'--{bnd}\r\nContent-Type: application/pdf\r\n\r\n').encode() \
           + pdf_bytes + f'\r\n--{bnd}--'.encode()
    req = urllib.request.Request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        data=body, method='POST',
        headers={'Authorization': f'Bearer {token}',
                 'Content-Type': f'multipart/related; boundary={bnd}'}
    )
    result = json.loads(urllib.request.urlopen(req).read())
    return result.get('webViewLink', f"https://drive.google.com/file/d/{result['id']}/view")

def download_template(file_id, dest_path, token):
    url = f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as r, open(dest_path, 'wb') as f:
        f.write(r.read())

def send_notification_email(to, client_name, links, gmail_token):
    subj  = f'✅ Form(s) 1040 Ready — {client_name}'
    rows  = ''.join(
        f'<li><a href="{lnk}" style="color:#1a73e8">📄 {yr} Form 1040</a></li>'
        for yr, lnk in links.items()
    )
    html  = (f'<div style="font-family:Arial,sans-serif;max-width:600px;padding:20px">'
             f'<h2 style="color:#F59E0B">Taximizer Pro</h2>'
             f'<p>IRS Form(s) 1040 for <strong>{client_name}</strong> are ready:</p>'
             f'<ul style="line-height:2">{rows}</ul>'
             f'<p style="font-size:11px;color:#888;margin-top:24px">Taximizer Pro</p></div>')
    msg   = '\r\n'.join([f'To: {to}', f'Subject: {subj}',
                         'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html])
    raw   = base64.urlsafe_b64encode(msg.encode()).decode().rstrip('=')
    req   = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps({'raw': raw}).encode(),
        headers={'Authorization': f'Bearer {gmail_token}', 'Content-Type': 'application/json'},
        method='POST'
    )
    urllib.request.urlopen(req)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN PIPELINE
# ─────────────────────────────────────────────────────────────────────────────

def run_pipeline(client: dict, years=None, send_email_to=None,
                 drive_token=None, gmail_token=None, out_dir='/tmp/taximizer_out',
                 signature_text=None):
    """
    Full pipeline: download template → fill fields → upload to Drive → email.

    client keys required: first_name, last_name, ssn
    client keys optional: middle_init, address, apt, city, state, zip,
                          routing, account
    """
    years       = years or ['2023', '2024', '2025']
    drive_token = drive_token or os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN')
    gmail_token = gmail_token or os.environ.get('GMAIL_ACCESS_TOKEN')

    mid   = client.get('middle_init', '')
    slug  = '_'.join(filter(None, [client['first_name'], mid, client['last_name']])).replace(' ', '_')
    dlabel = date.today().strftime('%m-%d-%Y')
    folder_name = f'{slug}_{dlabel}'

    os.makedirs(out_dir, exist_ok=True)

    root_id   = find_or_create_folder('Taximizer', drive_token)
    folder_id = find_or_create_folder(folder_name, drive_token, root_id)
    print(f'📁 Drive folder: Taximizer/{folder_name}  (id={folder_id})')

    links = {}
    for yr in years:
        tpl_path = os.path.join(out_dir, f'tpl_{yr}.pdf')
        out_path = os.path.join(out_dir, f'{slug}_{yr}_1040.pdf')

        print(f'\n  [{yr}] Downloading template...')
        download_template(MASTER_IDS[yr], tpl_path, drive_token)

        fill_1040(tpl_path, out_path, yr, client, signature_text=signature_text)

        link = upload_pdf(out_path, f'{slug}_{yr}_1040.pdf', folder_id, drive_token)
        links[yr] = link
        print(f'  [{yr}] 📤 Uploaded → {link}')

    client_name = f"{client['first_name']} {client['last_name']}"
    if send_email_to and gmail_token:
        send_notification_email(send_email_to, client_name, links, gmail_token)
        print(f'\n  📧 Email → {send_email_to}')

    return {'folder': f'Taximizer/{folder_name}', 'links': links}


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    client = {
        'first_name':  'Eugene',
        'middle_init': 'J',
        'last_name':   'Bisignano',
        'ssn':         '333333333',   # no dashes — script strips them anyway
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
