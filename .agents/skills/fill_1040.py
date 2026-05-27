#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (DEFINITIVE v5)
=====================================================
The Sign Here section on page 2 has NO form widgets for signature or date —
they are drawn graphic boxes. We use insert_text overlay for date and 
signature. All other fields use native widget values.

Sign Here boxes (drawn, no widget):
  2023/2024: signature=[x=91.6-273.6, y=462-492]  date=[x=273.6-324.0, y=462-492]
  2025:      signature=[x=91.6-273.6, y=636-666]  date=[x=273.6-324.0, y=636-666]

Occupation widget (has a form field):
  2023/2024: f2_33 [x=325-460, y=472-492] = HELPER
  2025:      f2_40 [x=325-460, y=646-666] = HELPER

Designee fields (f2_30, f2_31, f2_32) = BLANK — do not touch.

SSN: no dashes.
"""

import fitz
import os
import json
import urllib.request
import urllib.parse
import base64
from datetime import date

MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
}

# ── Page 1 widget field maps ──────────────────────────────────────────────────
P1_FIELDS_2023_2024 = {
    'f1_04[0]': 'FIRST_MIDDLE',
    'f1_05[0]': 'LAST_NAME',
    'f1_06[0]': 'SSN',
    'f1_10[0]': 'ADDRESS',
    'f1_11[0]': 'APT',
    'f1_12[0]': 'CITY',
    'f1_13[0]': 'STATE',
    'f1_14[0]': 'ZIP',
}
P1_FIELDS_2025 = {
    'f1_14[0]': 'FIRST_MIDDLE',
    'f1_15[0]': 'LAST_NAME',
    'f1_16[0]': 'SSN',
    'f1_20[0]': 'ADDRESS',
    'f1_21[0]': 'APT',
    'f1_22[0]': 'CITY',
    'f1_23[0]': 'STATE',
    'f1_24[0]': 'ZIP',
}

# ── Page 2 widget field maps (banking + occupation only) ──────────────────────
P2_FIELDS_2023 = {
    'f2_25[0]': 'ROUTING',   # labeled ACCOUNT# in template but routing goes here
    'f2_26[0]': 'ACCOUNT',   # labeled ROUTING# in template but account goes here
    'f2_33[0]': 'OCCUPATION', # Your occupation = HELPER
}
P2_FIELDS_2024 = {
    'f2_25[0]': 'ROUTING',
    'f2_26[0]': 'ACCOUNT',
    'f2_33[0]': 'OCCUPATION',
}
P2_FIELDS_2025 = {
    'f2_32[0]': 'ROUTING',
    'f2_33[0]': 'ACCOUNT',
    'f2_40[0]': 'OCCUPATION',
}

WIDGET_MAPS = {
    '2023': (P1_FIELDS_2023_2024, P2_FIELDS_2023),
    '2024': (P1_FIELDS_2023_2024, P2_FIELDS_2024),
    '2025': (P1_FIELDS_2025,      P2_FIELDS_2025),
}

# ── Sign Here pixel overlay coordinates (drawn boxes, no widgets) ─────────────
# [x0, y0, x1, y1] of each drawn box
SIGN_HERE = {
    '2023': {
        'sig_box':  (91.6,  462.0, 273.6, 492.0),   # Your signature
        'date_box': (273.6, 462.0, 324.0, 492.0),   # Date
    },
    '2024': {
        'sig_box':  (91.6,  462.0, 273.6, 492.0),
        'date_box': (273.6, 462.0, 324.0, 492.0),
    },
    '2025': {
        'sig_box':  (91.6,  636.0, 273.6, 666.0),
        'date_box': (273.6, 636.0, 324.0, 666.0),
    },
}


def fill_1040(template_path, output_path, year, client, signature_image_path=None):
    today = date.today().strftime('%m/%d/%Y')
    ssn   = client.get('ssn','').replace('-','').replace(' ','')
    first_mid = (client['first_name'] + ' ' + client.get('middle_init','')).strip()

    tokens = {
        'FIRST_MIDDLE': first_mid,
        'LAST_NAME':    client['last_name'],
        'SSN':          ssn,
        'ADDRESS':      client.get('address',''),
        'APT':          client.get('apt',''),
        'CITY':         client.get('city',''),
        'STATE':        client.get('state',''),
        'ZIP':          client.get('zip',''),
        'ROUTING':      client.get('routing',''),
        'ACCOUNT':      client.get('account',''),
        'OCCUPATION':   'HELPER',
    }

    p1_map, p2_map = WIDGET_MAPS[year]
    doc = fitz.open(template_path)
    p1, p2 = doc[0], doc[1]

    # ── Page 1: fill widgets ──────────────────────────────────────────────────
    for w in p1.widgets():
        if w.field_type_string != 'Text': continue
        sn = w.field_name.split('.')[-1]
        if sn in p1_map and tokens.get(p1_map[sn]):
            w.field_value = tokens[p1_map[sn]]
            w.update()

    # ── Page 2: fill banking + occupation widgets ─────────────────────────────
    for w in p2.widgets():
        if w.field_type_string != 'Text': continue
        sn = w.field_name.split('.')[-1]
        if sn in p2_map and tokens.get(p2_map[sn]):
            w.field_value = tokens[p2_map[sn]]
            w.update()

    # ── Page 2: overlay date into the drawn date box ──────────────────────────
    coords = SIGN_HERE[year]
    db = coords['date_box']
    # Center text vertically in the box
    date_y = db[1] + (db[3] - db[1]) * 0.65
    date_x = db[0] + 2
    p2.insert_text((date_x, date_y), today, fontname='helv', fontsize=7, color=(0,0,0))

    # ── Page 2: overlay signature into drawn signature box ────────────────────
    sb = coords['sig_box']
    if signature_image_path and os.path.exists(signature_image_path):
        # Insert signature image inside the box with padding
        sig_rect = fitz.Rect(sb[0]+4, sb[1]+4, sb[2]-4, sb[3]-4)
        p2.insert_image(sig_rect, filename=signature_image_path, keep_proportion=True)
    # else: leave blank — client will sign on paper or via app later

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
    with open(pdf_path,'rb') as f: b = f.read()
    meta = json.dumps({'name': filename, 'parents': [folder_id], 'mimeType': 'application/pdf'})
    bnd  = 'tx42bnd'
    body = (f'--{bnd}\r\nContent-Type: application/json\r\n\r\n{meta}\r\n'
            f'--{bnd}\r\nContent-Type: application/pdf\r\n\r\n').encode() + b + f'\r\n--{bnd}--'.encode()
    r = json.loads(urllib.request.urlopen(urllib.request.Request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        data=body, method='POST',
        headers={'Authorization': f'Bearer {tok}', 'Content-Type': f'multipart/related; boundary={bnd}'})).read())
    return r.get('webViewLink', f"https://drive.google.com/file/d/{r['id']}/view")

def download_template(file_id, dest, tok):
    req = urllib.request.Request(
        f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media',
        headers={'Authorization': f'Bearer {tok}'})
    with urllib.request.urlopen(req) as r, open(dest,'wb') as f: f.write(r.read())

def send_email(to, client_name, links, tok):
    rows = ''.join(f'<li><a href="{l}" style="color:#1a73e8">📄 {y} Form 1040</a></li>' for y,l in links.items())
    html = (f'<div style="font-family:Arial,sans-serif;max-width:600px;padding:20px">'
            f'<h2 style="color:#F59E0B">Taximizer Pro</h2>'
            f'<p>Forms ready for <strong>{client_name}</strong>:</p>'
            f'<ul style="line-height:2">{rows}</ul></div>')
    msg = '\r\n'.join([f'To: {to}', f'Subject: ✅ Form 1040 Ready — {client_name}',
                       'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','',html])
    raw = base64.urlsafe_b64encode(msg.encode()).decode().rstrip('=')
    urllib.request.urlopen(urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps({'raw': raw}).encode(),
        headers={'Authorization': f'Bearer {tok}','Content-Type': 'application/json'},
        method='POST'))


def run_pipeline(client, years=None, send_email_to=None,
                 drive_token=None, gmail_token=None,
                 out_dir='/tmp/taximizer_out', signature_image_path=None):
    years       = years or ['2023','2024','2025']
    drive_token = drive_token or os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN')
    gmail_token = gmail_token or os.environ.get('GMAIL_ACCESS_TOKEN')

    mid  = client.get('middle_init','')
    slug = '_'.join(filter(None,[client['first_name'],mid,client['last_name']])).replace(' ','_')
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
        fill_1040(tpl, out, yr, client, signature_image_path=signature_image_path)
        links[yr] = upload_pdf(out, f'{slug}_{yr}_1040.pdf', folder_id, drive_token)
        print(f'  [{yr}] → {links[yr]}')

    client_name = f"{client['first_name']} {client['last_name']}"
    if send_email_to and gmail_token:
        send_email(send_email_to, client_name, links, gmail_token)
        print(f'\n  📧 → {send_email_to}')

    return {'folder': f'Taximizer/{folder_name}', 'links': links}


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
        years=['2023','2024','2025'],
        send_email_to='taximizerpro@gmail.com',
        out_dir='/tmp/taximizer_out'
    )
    print('\n✅ DONE')
    print(json.dumps(result, indent=2))
