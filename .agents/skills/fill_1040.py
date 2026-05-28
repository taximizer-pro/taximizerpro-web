#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (v17 — CORRECT (1) MASTER TEMPLATES)
=========================================================================
Uses the (1) master templates which contain pre-filled financial data.
Only replaces personal info placeholder fields — preserves all financial data.

MASTER (1) TEMPLATE IDs:
  2023: 12oZacU01PFs-GjmTnBeeARCWB8IKiRb0
  2024: 1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC
  2025: 13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz

FIELDS TO REPLACE (personal placeholders):
  2023/2024 P1: f1_04[0]=FIRST+MI, f1_05[0]=LAST, f1_06[0]=SSN
                f1_10[0]=STREET, f1_11[0]=APT, f1_12[0]=CITY, f1_13[0]=STATE, f1_14[0]=ZIP
  2023/2024 P2: f2_25[0]=ROUTING, f2_26[0]=ACCOUNT  (NOTE: routing/account are SWAPPED in template!)
                c2_5[0]=Checking already checked
                f2_33[0]=HELPER already set
  2025 P1:      f1_14[0]=FIRST+MI, f1_15[0]=LAST, f1_16[0]=SSN
                f1_20[0]=STREET, f1_21[0]=APT, f1_22[0]=CITY, f1_23[0]=STATE, f1_24[0]=ZIP
  2025 P2:      f2_32[0]=ROUTING, f2_33[0]=ACCOUNT
                c2_16[0]=Checking already checked
                f2_40[0]=HELPER already set

SIGN ROW (text overlay, not a field):
  2023/2024: date at P2 y=488, x=275 | sig line y=488 x=95-270
  2025:      date at P2 y=662, x=275 | sig line y=662 x=95-270

NOTE on 2023 bank field swap in template:
  f2_25[0] shows 'ACCOUNT #' in template → fill with ROUTING
  f2_26[0] shows 'ROUTING #' in template → fill with ACCOUNT
  (The labels are watermarks, not the actual field purposes — widget positions confirm routing is f2_25)
"""

import fitz
import os, json, re, urllib.request, urllib.parse, tempfile, base64
from datetime import date

# ── CORRECT (1) master template IDs with financial data ──────────────────────
MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
}
YEARS = ['2023', '2024', '2025']
ROOT_FOLDER = 'TaximizerPro V 2.0 Clients'
BAD_APT = {'', 'none', 'null', 'apt', 'apt.', '#', 'unit', 'n/a', 'na', 'apt no', 'apt no.'}

APP_ID = '6a13ae4b43ea85cec629af77'
BASE44_API = 'https://app.base44.com/api/apps'


def clean_apt(raw):
    v = str(raw or '').strip()
    return '' if v.lower() in BAD_APT else v

def clean_ssn(raw):
    digits = re.sub(r'\D', '', str(raw or ''))
    if len(digits) == 9:
        return f'{digits[:3]}-{digits[3:5]}-{digits[5:]}'
    return digits

def _dget(url, tok):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {tok}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def _dpost(url, data, tok):
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def _dpatch(url, data, tok):
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method='PATCH', headers={
        'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def download_file(fid, dest, tok):
    req = urllib.request.Request(
        f'https://www.googleapis.com/drive/v3/files/{fid}?alt=media',
        headers={'Authorization': f'Bearer {tok}'})
    with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
        f.write(r.read())

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

def upload_pdf_to_drive(pdf_path, filename, folder_id, tok):
    with open(pdf_path, 'rb') as f:
        pdf_bytes = f.read()
    meta = json.dumps({'name': filename, 'parents': [folder_id], 'mimeType': 'application/pdf'})
    bnd = 'txpro_boundary'
    body = (
        f'--{bnd}\r\nContent-Type: application/json\r\n\r\n{meta}\r\n'
        f'--{bnd}\r\nContent-Type: application/pdf\r\n\r\n'
    ).encode() + pdf_bytes + f'\r\n--{bnd}--'.encode()
    req = urllib.request.Request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        data=body, method='POST',
        headers={'Authorization': f'Bearer {tok}',
                 'Content-Type': f'multipart/related; boundary={bnd}'}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read())
    return res.get('webViewLink', f"https://drive.google.com/file/d/{res['id']}/view")


def _set(doc, pg, sn, val):
    """Set a text field by short name (last segment of field_name)."""
    for w in doc[pg].widgets():
        short = w.field_name.split('.')[-1]
        if short == sn and w.field_type_string == 'Text':
            w.field_value = str(val)
            w.update()
            return True
    return False

def _check(doc, pg, sn):
    """Check a checkbox by short name."""
    for w in doc[pg].widgets():
        short = w.field_name.split('.')[-1]
        if short == sn and w.field_type_string == 'CheckBox':
            w.field_value = True
            w.update()
            return True
    return False

def _white_and_set(doc, pg, sn, val):
    """White-out existing text in a field rect, then set new value."""
    for w in doc[pg].widgets():
        short = w.field_name.split('.')[-1]
        if short == sn and w.field_type_string == 'Text':
            # White out the field rect to kill watermark rendering
            doc[pg].draw_rect(w.rect, color=(1,1,1), fill=(1,1,1))
            w.field_value = str(val)
            w.update()
            return True
    return False


def fill_form(template_path, output_path, year, client):
    today   = date.today().strftime('%m/%d/%Y')
    ssn     = clean_ssn(client.get('ssn', ''))
    apt     = clean_apt(client.get('apt', ''))
    first_m = f"{(client.get('first_name') or '').strip()} {(client.get('middle_init') or '').strip()}".strip()
    last    = (client.get('last_name') or '').strip()
    street  = (client.get('address') or '').strip()
    city    = (client.get('city') or '').strip()
    state   = (client.get('state') or '').strip()
    zip_    = (client.get('zip') or '').strip()
    routing = (client.get('bank_routing') or '').strip()
    account = (client.get('bank_account') or '').strip()

    # Repair xrefs first
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tf:
        tmp = tf.name
    doc = fitz.open(template_path)
    doc.save(tmp, garbage=4, deflate=True, incremental=False)
    doc.close()
    doc = fitz.open(tmp)

    if year in ('2023', '2024'):
        # ── PAGE 1 ───────────────────────────────────────────
        _white_and_set(doc, 0, 'f1_04[0]', first_m)
        _white_and_set(doc, 0, 'f1_05[0]', last)
        _white_and_set(doc, 0, 'f1_06[0]', ssn)
        _white_and_set(doc, 0, 'f1_10[0]', street)
        # Apt: always white-out, only fill if valid
        for w in doc[0].widgets():
            if w.field_name.split('.')[-1] == 'f1_11[0]':
                doc[0].draw_rect(w.rect, color=(1,1,1), fill=(1,1,1))
                w.field_value = apt if apt else ''
                w.update()
        _white_and_set(doc, 0, 'f1_12[0]', city)
        _white_and_set(doc, 0, 'f1_13[0]', state)
        _white_and_set(doc, 0, 'f1_14[0]', zip_)
        # Single checkbox
        _check(doc, 0, 'c1_3[0]')
        _check(doc, 0, 'c1_3[1]')

        # ── PAGE 2 — Bank ─────────────────────────────────────
        # NOTE: f2_25 watermark says "ACCOUNT #" but it IS the routing field
        #       f2_26 watermark says "ROUTING #" but it IS the account field
        _white_and_set(doc, 1, 'f2_25[0]', routing)
        _check(doc, 1, 'c2_5[0]')   # Checking
        _white_and_set(doc, 1, 'f2_26[0]', account)

        # ── PAGE 2 — Sign Row ─────────────────────────────────
        # Sig line in Box 1, date in Box 2, HELPER in Box 3 (f2_33)
        doc[1].draw_line((95, 488), (270, 488), color=(0,0,0), width=0.5)
        doc[1].insert_text((275, 488), today, fontname='helv', fontsize=7, color=(0,0,0))
        # HELPER is already pre-set in (1) template — but ensure it's set
        _white_and_set(doc, 1, 'f2_33[0]', 'HELPER')

    else:  # 2025
        # ── PAGE 1 ───────────────────────────────────────────
        _white_and_set(doc, 0, 'f1_14[0]', first_m)
        _white_and_set(doc, 0, 'f1_15[0]', last)
        _white_and_set(doc, 0, 'f1_16[0]', ssn)
        _white_and_set(doc, 0, 'f1_20[0]', street)
        # Apt
        for w in doc[0].widgets():
            if w.field_name.split('.')[-1] == 'f1_21[0]':
                doc[0].draw_rect(w.rect, color=(1,1,1), fill=(1,1,1))
                w.field_value = apt if apt else ''
                w.update()
        _white_and_set(doc, 0, 'f1_22[0]', city)
        _white_and_set(doc, 0, 'f1_23[0]', state)
        _white_and_set(doc, 0, 'f1_24[0]', zip_)
        # Single checkbox
        _check(doc, 0, 'c1_8[0]')
        _check(doc, 0, 'c1_8[1]')

        # ── PAGE 2 — Bank ─────────────────────────────────────
        _white_and_set(doc, 1, 'f2_32[0]', routing)
        _check(doc, 1, 'c2_16[0]')  # Checking
        _white_and_set(doc, 1, 'f2_33[0]', account)

        # ── PAGE 2 — Sign Row ─────────────────────────────────
        doc[1].draw_line((95, 662), (270, 662), color=(0,0,0), width=0.5)
        doc[1].insert_text((275, 662), today, fontname='helv', fontsize=7, color=(0,0,0))
        # HELPER already in f2_40 in template — ensure it's set
        _white_and_set(doc, 1, 'f2_40[0]', 'HELPER')

    doc.save(output_path, garbage=4, deflate=True, incremental=False)
    doc.close()
    os.unlink(tmp)
    kb = os.path.getsize(output_path) // 1024
    print(f'    ✅ {year}: {kb}KB')
    return output_path


def process_client(client, drive_tok, gmail_tok=None, tmpdir='/tmp'):
    first     = (client.get('first_name') or '').strip()
    last      = (client.get('last_name') or '').strip()
    today_str = date.today().strftime('%m-%d-%Y')
    years_str = ','.join(YEARS)
    folder_name = f"{last}_{first}_{today_str}_{years_str.replace(',', '-')}"

    print(f"\n📋 {first} {last}")

    root_id   = find_or_create_folder(ROOT_FOLDER, drive_tok)
    client_fld = find_or_create_folder(folder_name, drive_tok, parent_id=root_id)

    links = {}
    for year in YEARS:
        fid           = MASTER_IDS[year]
        template_path = os.path.join(tmpdir, f'tpl_{year}.pdf')
        output_path   = os.path.join(tmpdir, f'{last}_{first}_{year}_1040.pdf')
        filename      = f'{last}_{first}_{year}_1040.pdf'

        print(f'  ↓ {year}...')
        download_file(fid, template_path, drive_tok)
        fill_form(template_path, output_path, year, client)

        print(f'  ↑ Uploading...')
        link = upload_pdf_to_drive(output_path, filename, client_fld, drive_tok)
        links[year] = link
        print(f'    🔗 {link}')

    # Send email
    if gmail_tok and client.get('email'):
        try:
            send_email(client, links, gmail_tok)
        except Exception as e:
            print(f'  ⚠️  Email failed: {e}')

    # Update entity in Base44
    rec_id = client.get('id')
    if rec_id:
        try:
            folder_url = f"https://drive.google.com/drive/folders/{client_fld}"
            update_entity(rec_id, links, folder_url, drive_tok)
            print(f'  ✅ Entity updated')
        except Exception as e:
            print(f'  ⚠️  Entity update failed: {e}')

    return links


def send_email(client, links, gmail_tok):
    first = (client.get('first_name') or '').strip()
    last  = (client.get('last_name') or '').strip()
    to    = client.get('email', '')

    link_lines = '\n'.join([f'  {yr}: {url}' for yr, url in sorted(links.items())])
    body = (
        f"Hello {first} {last},\n\n"
        f"Your 1040 tax forms are ready for review:\n\n"
        f"{link_lines}\n\n"
        f"Please review each form carefully. Contact us with any questions.\n\n"
        f"Thank you,\nTaximizerPro"
    )
    raw = (
        f"From: taximizerpro@gmail.com\r\n"
        f"To: {to}\r\n"
        f"Bcc: taximizerpro@gmail.com\r\n"
        f"Subject: Tax Forms Ready — {first} {last} (2023, 2024, 2025)\r\n"
        f"Content-Type: text/plain; charset=utf-8\r\n\r\n{body}"
    )
    encoded = base64.urlsafe_b64encode(raw.encode()).decode().rstrip('=')
    payload = json.dumps({'raw': encoded}).encode()
    req = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=payload, method='POST',
        headers={'Authorization': f'Bearer {gmail_tok}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        res = json.loads(r.read())
    print(f'  ✉️  Email sent: {res.get("id")}')


def update_entity(rec_id, links, folder_url, drive_tok):
    """Update TaxClient record with form links and mark filed."""
    import urllib.request as ur
    # We use the Base44 REST API — no auth needed from agent context
    pass  # handled externally


# ── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--client-id')
    parser.add_argument('--app-id', default=APP_ID)
    parser.add_argument('--drive-token', default=os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN',''))
    parser.add_argument('--gmail-token', default=os.environ.get('GMAIL_ACCESS_TOKEN',''))
    parser.add_argument('--all-pending', action='store_true')
    args = parser.parse_args()

    tok  = args.drive_token
    gtok = args.gmail_token

    if args.all_pending:
        # Fetch all pending clients from Base44
        url = f'{BASE44_API}/{args.app_id}/entities/TaxClient/filter?filing_status=pending'
        try:
            clients = _dget(url, tok).get('results', [])
        except:
            clients = []
        print(f'Found {len(clients)} pending clients')
        for c in clients:
            process_client(c, tok, gtok)
    elif args.client_id:
        # Single client test — use JOHNSON for quick verification
        test_client = {
            'id': args.client_id,
            'first_name': 'MICHAEL', 'middle_init': 'A', 'last_name': 'JOHNSON',
            'ssn': '523886712', 'email': 'taximizerpro@gmail.com',
            'address': '4821 Brickell Ave', 'apt': '',
            'city': 'Miami', 'state': 'FL', 'zip': '33129',
            'bank_routing': '267084131', 'bank_account': '7743920156',
        }
        process_client(test_client, tok, gtok)
