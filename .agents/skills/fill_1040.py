#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (DEFINITIVE v4)
=====================================================
Fills EXACTLY the right field for each piece of data.
ONE field per purpose — no duplicates, no overflow.

Signature row (2023/2024):
  f2_30 [x=144-295, y=420-438] = Your signature
  f2_31 [x=331-425, y=420-438] = Date  ← one box left of HELPER
  f2_33 [x=325-460, y=472-492] = Occupation = HELPER

Signature row (2025):
  f2_37 [x=130-295, y=594-612] = Your signature
  f2_38 [x=324-425, y=594-612] = Date  ← one box left of HELPER
  f2_40 [x=325-460, y=646-666] = Occupation = HELPER

Banking (2023/2024):
  f2_25 [x=173-302, y=324-336] = first banking field (labeled ACCOUNT# in 2023, ROUTING# in 2024)
  f2_26 [x=173-418, y=337-348] = second banking field

Banking (2025):
  f2_32 [x=180-310, y=504-515] = ROUTING#
  f2_33 [x=180-425, y=516-527] = ACCOUNT#

SSN: no dashes (333333333)
"""

import fitz
import os
import json
import urllib.request
import urllib.parse
import base64
from datetime import date

# ── Master template Google Drive file IDs ─────────────────────────────────────
MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
}

# ── Field maps: short_name → token ────────────────────────────────────────────
# Only ONE entry per purpose. No duplicates.

FIELDS_2023 = {
    # Page 1 — personal info
    'f1_04[0]': 'FIRST_MIDDLE',  # [x=36-237,  y=88-102]
    'f1_05[0]': 'LAST_NAME',     # [x=239-467, y=88-102]
    'f1_06[0]': 'SSN',           # [x=469-576, y=88-102]
    'f1_10[0]': 'ADDRESS',       # [x=36-417,  y=136-150]
    'f1_11[0]': 'APT',           # [x=419-467, y=136-150]
    'f1_12[0]': 'CITY',          # [x=36-337,  y=160-174]
    'f1_13[0]': 'STATE',         # [x=339-402, y=160-174]
    'f1_14[0]': 'ZIP',           # [x=404-467, y=160-174]
    # Page 2 — banking
    # NOTE: 2023 template has labels swapped vs 2024 — f2_25=ACCOUNT, f2_26=ROUTING
    # We fill routing into f2_25 and account into f2_26 to match the visual label positions
    'f2_25[0]': 'ROUTING',       # [x=173-302, y=324-336] labeled "ACCOUNT#" but routing goes here
    'f2_26[0]': 'ACCOUNT',       # [x=173-418, y=337-348] labeled "ROUTING#" but account goes here
    # Page 2 — signature row (ONE field each, no duplicates)
    'f2_30[0]': 'SIGNATURE',     # [x=144-295, y=420-438] Your signature
    'f2_31[0]': 'SIG_DATE',      # [x=331-425, y=420-438] Date — left of HELPER
    'f2_33[0]': 'OCCUPATION',    # [x=325-460, y=472-492] Occupation = HELPER
}

FIELDS_2024 = {
    # Page 1 — personal info (same positions as 2023)
    'f1_04[0]': 'FIRST_MIDDLE',
    'f1_05[0]': 'LAST_NAME',
    'f1_06[0]': 'SSN',
    'f1_10[0]': 'ADDRESS',
    'f1_11[0]': 'APT',
    'f1_12[0]': 'CITY',
    'f1_13[0]': 'STATE',
    'f1_14[0]': 'ZIP',
    # Page 2 — banking
    # 2024: f2_25=ROUTING#, f2_26=ACCOUNT# (correct labels)
    'f2_25[0]': 'ROUTING',       # [x=173-302, y=324-336] ROUTING#
    'f2_26[0]': 'ACCOUNT',       # [x=173-418, y=337-348] ACCOUNT#
    # Page 2 — signature row
    'f2_30[0]': 'SIGNATURE',     # [x=144-295, y=420-438] Your signature
    'f2_31[0]': 'SIG_DATE',      # [x=331-425, y=420-438] Date — left of HELPER
    'f2_33[0]': 'OCCUPATION',    # [x=325-460, y=472-492] Occupation = HELPER
}

FIELDS_2025 = {
    # Page 1 — personal info (different field numbers in 2025)
    'f1_14[0]': 'FIRST_MIDDLE',  # [x=36-251,  y=94-108]
    'f1_15[0]': 'LAST_NAME',     # [x=253-467, y=94-108]
    'f1_16[0]': 'SSN',           # [x=469-576, y=94-108]
    'f1_20[0]': 'ADDRESS',       # [x=36-417,  y=142-156]
    'f1_21[0]': 'APT',           # [x=419-467, y=142-156]
    'f1_22[0]': 'CITY',          # [x=36-331,  y=166-180]
    'f1_23[0]': 'STATE',         # [x=332-395, y=166-180]
    'f1_24[0]': 'ZIP',           # [x=397-467, y=166-180]
    # Page 2 — banking
    'f2_32[0]': 'ROUTING',       # [x=180-310, y=504-515] ROUTING#
    'f2_33[0]': 'ACCOUNT',       # [x=180-425, y=516-527] ACCOUNT#
    # Page 2 — signature row
    'f2_37[0]': 'SIGNATURE',     # [x=130-295, y=594-612] Your signature
    'f2_38[0]': 'SIG_DATE',      # [x=324-425, y=594-612] Date — left of HELPER
    'f2_40[0]': 'OCCUPATION',    # [x=325-460, y=646-666] Occupation = HELPER
}

FIELD_MAPS = {
    '2023': FIELDS_2023,
    '2024': FIELDS_2024,
    '2025': FIELDS_2025,
}


# ── Core fill function ─────────────────────────────────────────────────────────

def fill_1040(template_path: str, output_path: str, year: str,
              client: dict, signature_text: str = None) -> None:
    today = date.today().strftime('%m/%d/%Y')
    ssn_clean = client.get('ssn', '').replace('-', '').replace(' ', '')

    tokens = {
        'FIRST_MIDDLE': (client['first_name'] + ' ' + client.get('middle_init', '')).strip(),
        'LAST_NAME':    client['last_name'],
        'SSN':          ssn_clean,           # no dashes — fits the field
        'ADDRESS':      client.get('address', ''),
        'APT':          client.get('apt', ''),
        'CITY':         client.get('city', ''),
        'STATE':        client.get('state', ''),
        'ZIP':          client.get('zip', ''),
        'ROUTING':      client.get('routing', ''),
        'ACCOUNT':      client.get('account', ''),
        'SIGNATURE':    signature_text or '',  # blank if no pad — don't type name in sig field
        'SIG_DATE':     today,               # ONE date, ONE field
        'OCCUPATION':   'HELPER',
    }

    doc = fitz.open(template_path)
    for page in doc:
        for widget in page.widgets():
            if widget.field_type_string != 'Text':
                continue
            sn = widget.field_name.split('.')[-1]
            if sn in FIELD_MAPS[year]:
                val = tokens[FIELD_MAPS[year][sn]]
                if val:
                    widget.field_value = val
                    widget.update()

    doc.save(output_path, garbage=4, deflate=True, incremental=False)
    doc.close()
    print(f'  ✅ {year} → {os.path.getsize(output_path)//1024}KB')


# ── Drive / Gmail helpers ──────────────────────────────────────────────────────

def _get(url, tok):
    return json.loads(urllib.request.urlopen(
        urllib.request.Request(url, headers={'Authorization': f'Bearer {tok}'})).read())

def _post(url, data, tok):
    return json.loads(urllib.request.urlopen(urllib.request.Request(
        url, data=json.dumps(data).encode(),
        headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'},
        method='POST')).read())

def find_or_create_folder(name, tok, parent_id=None):
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id: q += f" and '{parent_id}' in parents"
    res = _get(f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id)", tok)
    if res.get('files'): return res['files'][0]['id']
    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id: meta['parents'] = [parent_id]
    return _post('https://www.googleapis.com/drive/v3/files', meta, tok)['id']

def upload_pdf(pdf_path, filename, folder_id, tok):
    with open(pdf_path, 'rb') as f: b = f.read()
    meta = json.dumps({'name': filename, 'parents': [folder_id], 'mimeType': 'application/pdf'})
    bnd  = 'tx42bnd'
    body = (f'--{bnd}\r\nContent-Type: application/json\r\n\r\n{meta}\r\n'
            f'--{bnd}\r\nContent-Type: application/pdf\r\n\r\n').encode() + b + f'\r\n--{bnd}--'.encode()
    r = json.loads(urllib.request.urlopen(urllib.request.Request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        data=body, method='POST',
        headers={'Authorization': f'Bearer {tok}',
                 'Content-Type': f'multipart/related; boundary={bnd}'})).read())
    return r.get('webViewLink', f"https://drive.google.com/file/d/{r['id']}/view")

def download_template(file_id, dest, tok):
    req = urllib.request.Request(
        f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media',
        headers={'Authorization': f'Bearer {tok}'})
    with urllib.request.urlopen(req) as r, open(dest, 'wb') as f: f.write(r.read())

def send_email(to, client_name, links, gmail_tok):
    rows = ''.join(f'<li><a href="{l}" style="color:#1a73e8">📄 {y} Form 1040</a></li>'
                   for y, l in links.items())
    html = (f'<div style="font-family:Arial,sans-serif;max-width:600px;padding:20px">'
            f'<h2 style="color:#F59E0B">Taximizer Pro</h2>'
            f'<p>Forms ready for <strong>{client_name}</strong>:</p>'
            f'<ul style="line-height:2">{rows}</ul></div>')
    msg = '\r\n'.join([f'To: {to}', f'Subject: ✅ Form 1040 Ready — {client_name}',
                       'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html])
    raw = base64.urlsafe_b64encode(msg.encode()).decode().rstrip('=')
    urllib.request.urlopen(urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps({'raw': raw}).encode(),
        headers={'Authorization': f'Bearer {gmail_tok}', 'Content-Type': 'application/json'},
        method='POST'))


# ── Main pipeline ──────────────────────────────────────────────────────────────

def run_pipeline(client, years=None, send_email_to=None,
                 drive_token=None, gmail_token=None,
                 out_dir='/tmp/taximizer_out', signature_text=None):
    years       = years or ['2023', '2024', '2025']
    drive_token = drive_token or os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN')
    gmail_token = gmail_token or os.environ.get('GMAIL_ACCESS_TOKEN')

    mid  = client.get('middle_init', '')
    slug = '_'.join(filter(None, [client['first_name'], mid, client['last_name']])).replace(' ', '_')
    folder_name = f"{slug}_{date.today().strftime('%m-%d-%Y')}"

    os.makedirs(out_dir, exist_ok=True)
    root_id   = find_or_create_folder('Taximizer', drive_token)
    folder_id = find_or_create_folder(folder_name, drive_token, root_id)
    print(f'📁 Taximizer/{folder_name}')

    links = {}
    for yr in years:
        tpl = os.path.join(out_dir, f'tpl_{yr}.pdf')
        out = os.path.join(out_dir, f'{slug}_{yr}_1040.pdf')
        print(f'\n  [{yr}] downloading...')
        download_template(MASTER_IDS[yr], tpl, drive_token)
        fill_1040(tpl, out, yr, client, signature_text=signature_text)
        links[yr] = upload_pdf(out, f'{slug}_{yr}_1040.pdf', folder_id, drive_token)
        print(f'  [{yr}] → {links[yr]}')

    client_name = f"{client['first_name']} {client['last_name']}"
    if send_email_to and gmail_token:
        send_email(send_email_to, client_name, links, gmail_token)
        print(f'\n  📧 → {send_email_to}')

    return {'folder': f'Taximizer/{folder_name}', 'links': links}


# ── CLI test ───────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    result = run_pipeline(
        client={
            'first_name':  'Eugene',
            'middle_init': 'J',
            'last_name':   'Bisignano',
            'ssn':         '333333333',
            'address':     '123 Main St',
            'apt':         '',
            'city':        'Miami',
            'state':       'FL',
            'zip':         '33101',
            'routing':     '021000021',
            'account':     '123456789',
        },
        years=['2023', '2024', '2025'],
        send_email_to='taximizerpro@gmail.com',
        out_dir='/tmp/taximizer_out'
    )
    print('\n✅ DONE')
    print(json.dumps(result, indent=2))
