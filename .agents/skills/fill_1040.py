#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (DEFINITIVE v6)
=====================================================
Root Drive folder : TaximizerPro V 2.0 Clients
Client sub-folder : LastName_FirstName_FilingDate_Years
                    e.g. Bisignano_Eugene_05-27-2026_2023-2024-2025
Files inside      : Bisignano_Eugene_2023_1040.pdf  (one per year)

Sign Here boxes (drawn, no widget):
  2023/2024: sig=[91.6-273.6, y=462-492]   date=[273.6-324.0, y=462-492]
  2025:      sig=[91.6-273.6, y=636-666]   date=[273.6-324.0, y=636-666]

Occupation widget: f2_33[0] (2023/2024)  f2_40[0] (2025) = HELPER
Designee fields (f2_30, f2_31, f2_32) = BLANK — never touch.
SSN: raw digits, no dashes.
"""

import fitz
import os, json, urllib.request, urllib.parse, base64
from datetime import date

# ── Google Drive root ─────────────────────────────────────────────────────────
ROOT_FOLDER_NAME = 'TaximizerPro V 2.0 Clients'

MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
}

# ── Widget field maps ─────────────────────────────────────────────────────────
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

# ── Sign-here drawn box coords ────────────────────────────────────────────────
SIGN_HERE = {
    '2023': {'sig_box':(91.6,462.0,273.6,492.0), 'date_box':(273.6,462.0,324.0,492.0)},
    '2024': {'sig_box':(91.6,462.0,273.6,492.0), 'date_box':(273.6,462.0,324.0,492.0)},
    '2025': {'sig_box':(91.6,636.0,273.6,666.0), 'date_box':(273.6,636.0,324.0,666.0)},
}


# ── PDF fill ──────────────────────────────────────────────────────────────────
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
        <span style="color:#64748b">Filing Date</span>
        <span style="font-weight:600">{filing_date}</span>
      </div>
    </div>
    <p style="color:#475569;font-size:12px;margin-top:20px">
      Questions? Contact your preparer directly. Do not reply to this email.<br>
      <em>TaximizerPro — Secure Tax Filing</em>
    </p>
  </div>
</div>"""

    msg = '\r\n'.join([
        f'To: {to}',
        f'Subject: ✅ Your {years_str} Tax Return Is Ready — {client_name}',
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        '',
        html
    ])
    raw = base64.urlsafe_b64encode(msg.encode()).decode().rstrip('=')
    urllib.request.urlopen(urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps({'raw': raw}).encode(),
        headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'},
        method='POST'
    ))


# ── Main pipeline ─────────────────────────────────────────────────────────────
def run_pipeline(client, years=None, send_email_to=None,
                 drive_token=None, gmail_token=None,
                 out_dir='/tmp/taximizer_out', signature_image_path=None):
    """
    client dict keys:
      first_name, middle_init, last_name, ssn, address, apt,
      city, state, zip, routing, account, email
    """
    years       = [str(y) for y in (years or ['2023','2024','2025'])]
    drive_token = drive_token or os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN')
    gmail_token = gmail_token or os.environ.get('GMAIL_ACCESS_TOKEN')

    first  = client['first_name'].strip()
    mid    = client.get('middle_init','').strip()
    last   = client['last_name'].strip()
    filing_date = date.today().strftime('%m-%d-%Y')
    years_tag   = '-'.join(sorted(years))

    # Folder: LastName_FirstName_FilingDate_Years
    # e.g.  Bisignano_Eugene_05-27-2026_2023-2024-2025
    folder_name = f"{last}_{first}_{filing_date}_{years_tag}"

    # File slug: LastName_FirstName[_MI]
    name_parts = [last, first] + ([mid] if mid else [])
    slug = '_'.join(name_parts).replace(' ', '_')

    os.makedirs(out_dir, exist_ok=True)

    # ── Drive folder structure ────────────────────────────────────────────────
    root_id   = find_or_create_folder(ROOT_FOLDER_NAME, drive_token)
    folder_id = find_or_create_folder(folder_name, drive_token, root_id)
    print(f'\n📁 {ROOT_FOLDER_NAME}/{folder_name}')

    # ── Generate + upload each year ───────────────────────────────────────────
    links = {}
    for yr in sorted(years):
        tpl_path = os.path.join(out_dir, f'tpl_{yr}.pdf')
        out_path = os.path.join(out_dir, f'{slug}_{yr}_1040.pdf')
        print(f'\n  [{yr}] downloading template...')
        download_template(MASTER_IDS[yr], tpl_path, drive_token)
        fill_1040(tpl_path, out_path, yr, client, signature_image_path=signature_image_path)
        file_name = f'{slug}_{yr}_1040.pdf'
        links[yr] = upload_pdf(out_path, file_name, folder_id, drive_token)
        print(f'  [{yr}] uploaded → {links[yr]}')

    # ── Email ─────────────────────────────────────────────────────────────────
    client_name  = f"{first}{(' ' + mid) if mid else ''} {last}"
    email_target = send_email_to or client.get('email')

    if email_target and gmail_token:
        send_email(email_target, client_name, links, filing_date, years_tag, folder_name, gmail_token)
        print(f'\n  📧 Email sent → {email_target}')
    else:
        print(f'\n  ⚠️  No email sent (no address or Gmail token)')

    return {
        'success':      True,
        'client':       client_name,
        'folder':       f'{ROOT_FOLDER_NAME}/{folder_name}',
        'folder_id':    folder_id,
        'filing_date':  filing_date,
        'years':        sorted(years),
        'links':        links,
        'email_sent':   bool(email_target and gmail_token),
        'email_to':     email_target,
    }


# ── CLI test ──────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys
    test_client = {
        'first_name':  'Eugene',
        'middle_init': 'J',
        'last_name':   'Bisignano',
        'ssn':         '333-33-3333',
        'address':     '123 Main St',
        'city':        'Miami',
        'state':       'FL',
        'zip':         '33101',
        'routing':     '021000021',
        'account':     '123456789',
        'email':       'taximizerpro@gmail.com',
    }
    result = run_pipeline(
        client=test_client,
        years=['2023','2024','2025'],
        send_email_to='taximizerpro@gmail.com',
        out_dir='/tmp/taximizer_test_v2'
    )
    print('\n' + json.dumps(result, indent=2))
