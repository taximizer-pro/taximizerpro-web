#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (v16 — FINAL LOCKED COORDINATES)
======================================================================
New templates (uploaded 2026-05-27T12:03):
  2023: 1X6LIFErOXnEx9nzOKW-8rBDUN2bfhq4D
  2024: 110bBcABuvofSYrQXLjw3N5DPH1y2Vjan
  2025: 1kQQlQXXTyXjGYtARAP_U5WJ6hWT2Fmc3

SIGN ROW — CONFIRMED BOX BOUNDARIES (from get_drawings()):

  2023 & 2024:
    Box 1 Signature: x=91.6–273.6, y=462–492
    Box 2 Date:      x=273.6–324.0, y=462–492
    Box 3 Occupation (f2_33[0]): x=324.0–460.8, y=472–492
    → sig underline at y=488 (y1-4), x=95–270
    → date text     at y=488 (y1-4), x=275

  2025:
    Box 1 Signature: x=91.6–273.6, y=636–666
    Box 2 Date:      x=273.6–324.0, y=636–666
    Box 3 Occupation (f2_40[0]): x=324.0–460.8, y=646–666
    → sig underline at y=662 (y1-4), x=95–270
    → date text     at y=662 (y1-4), x=275

PAGE 1 FIELDS:
  2023 & 2024:
    f1_04  First+MI, f1_05  Last, f1_06  SSN
    f1_10  Street,   f1_11  Apt (clear always),  f1_12  City
    f1_13  State,    f1_14  ZIP,  c1_3[1]  Single

  2025:
    f1_14  First+MI, f1_15  Last, f1_16  SSN
    f1_20  Street,   f1_21  Apt (clear always),  f1_22  City
    f1_23  State,    f1_24  ZIP,  c1_3[1]  Single

PAGE 2 BANK:
  2023 & 2024:  f2_25 Routing, c2_5[0] Checking, f2_26 Account
  2025:         f2_32 Routing (clear "routing #"), c2_16[0] Checking,
                f2_33 Account (clear "account #")
"""

import fitz
import os, json, re, urllib.request, urllib.parse, tempfile
from datetime import date

MASTER_IDS = {
    '2023': '1iLxjqGceVwVcLtb8w5UW1-FHTQRR8hyy',
    '2024': '1JiPyLqgPC0yZg70BuJz9WeW1zauCxdp3',
    '2025': '1Q2CIM4rnIjQ4TVAlhpoZc5iUFdamAClM',
}
YEARS = ['2023', '2024', '2025']
ROOT_FOLDER = 'TaximizerPro V 2.0 Clients'
BAD_APT = {'', 'none', 'null', 'apt', 'apt.', '#', 'unit', 'n/a', 'na', 'apt no', 'apt no.'}


def clean_apt(raw):
    v = str(raw or '').strip()
    return '' if v.lower() in BAD_APT else v

def clean_ssn(raw):
    return re.sub(r'\D', '', str(raw or ''))

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
    for w in doc[pg].widgets():
        if w.field_name.split('.')[-1] == sn and w.field_type_string == 'Text':
            w.field_value = str(val)
            w.update()
            return True
    return False

def _clear(doc, pg, sn):
    for w in doc[pg].widgets():
        if w.field_name.split('.')[-1] == sn and w.field_type_string == 'Text':
            w.field_value = ''
            w.update()
            return True
    return False

def _check(doc, pg, sn):
    for w in doc[pg].widgets():
        if w.field_name.split('.')[-1] == sn and w.field_type_string == 'CheckBox':
            w.field_value = True
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

    # Repair xrefs
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tf:
        tmp = tf.name
    doc = fitz.open(template_path)
    doc.save(tmp, garbage=4, deflate=True, incremental=False)
    doc.close()
    doc = fitz.open(tmp)

    if year in ('2023', '2024'):
        # ── PAGE 1 ─────────────────────────────────────────────
        _set(doc, 0, 'f1_04[0]', first_m)
        _set(doc, 0, 'f1_05[0]', last)
        _set(doc, 0, 'f1_06[0]', ssn)
        _set(doc, 0, 'f1_10[0]', street)
        _clear(doc, 0, 'f1_11[0]')           # always clear apt watermark
        if apt:
            _set(doc, 0, 'f1_11[0]', apt)
        _set(doc, 0, 'f1_12[0]', city)
        _set(doc, 0, 'f1_13[0]', state)
        _set(doc, 0, 'f1_14[0]', zip_)
        _check(doc, 0, 'c1_3[1]')            # Single

        # ── PAGE 2 — Bank ──────────────────────────────────────
        _set(doc, 1, 'f2_25[0]', routing)
        _check(doc, 1, 'c2_5[0]')            # Checking
        _set(doc, 1, 'f2_26[0]', account)

        # ── PAGE 2 — Sign Row ──────────────────────────────────
        # Box 1 (Signature): x=91.6–273.6, y=462–492  → underline at y=488
        # Box 2 (Date):      x=273.6–324.0, y=462–492 → text at y=488, x=275
        # Box 3 (Occupation): widget f2_33[0]          → set to HELPER
        doc[1].draw_line((95, 488), (270, 488), color=(0, 0, 0), width=0.5)
        doc[1].insert_text((275, 488), today, fontname='helv', fontsize=7, color=(0, 0, 0))
        _clear(doc, 1, 'f2_33[0]')
        _set(doc, 1, 'f2_33[0]', 'HELPER')

    else:  # 2025
        # ── PAGE 1 (different layout) ──────────────────────────
        _clear(doc, 0, 'f1_14[0]')
        _set(doc, 0, 'f1_14[0]', first_m)
        _clear(doc, 0, 'f1_15[0]')
        _set(doc, 0, 'f1_15[0]', last)
        _clear(doc, 0, 'f1_16[0]')
        _set(doc, 0, 'f1_16[0]', ssn)
        _clear(doc, 0, 'f1_20[0]')
        _set(doc, 0, 'f1_20[0]', street)
        _clear(doc, 0, 'f1_21[0]')           # always clear "Apt no" watermark
        if apt:
            _set(doc, 0, 'f1_21[0]', apt)
        _clear(doc, 0, 'f1_22[0]')
        _set(doc, 0, 'f1_22[0]', city)
        _clear(doc, 0, 'f1_23[0]')
        _set(doc, 0, 'f1_23[0]', state)
        _clear(doc, 0, 'f1_24[0]')
        _set(doc, 0, 'f1_24[0]', zip_)
        _check(doc, 0, 'c1_3[1]')            # Single

        # ── PAGE 2 — Bank ──────────────────────────────────────
        _clear(doc, 1, 'f2_32[0]')           # clear "routing #" watermark
        _set(doc, 1, 'f2_32[0]', routing)
        _check(doc, 1, 'c2_16[0]')           # Checking
        _clear(doc, 1, 'f2_33[0]')           # clear "account #" watermark
        _set(doc, 1, 'f2_33[0]', account)

        # ── PAGE 2 — Sign Row ──────────────────────────────────
        # Box 1 (Signature): x=91.6–273.6, y=636–666  → underline at y=662
        # Box 2 (Date):      x=273.6–324.0, y=636–666 → text at y=662, x=275
        # Box 3 (Occupation): widget f2_40[0]          → set to HELPER
        doc[1].draw_line((95, 662), (270, 662), color=(0, 0, 0), width=0.5)
        doc[1].insert_text((275, 662), today, fontname='helv', fontsize=7, color=(0, 0, 0))
        _clear(doc, 1, 'f2_40[0]')
        _set(doc, 1, 'f2_40[0]', 'HELPER')

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
    folder_name = f"{last}_{first}_{today_str}_2023-2024-2025"

    print(f"\n📋 {first} {last}")

    root_id   = find_or_create_folder(ROOT_FOLDER, drive_tok)
    client_id = find_or_create_folder(folder_name, drive_tok, parent_id=root_id)

    links = {}
    for year in YEARS:
        fid           = MASTER_IDS[year]
        template_path = os.path.join(tmpdir, f'tpl_{year}.pdf')
        output_path   = os.path.join(tmpdir, f'{last}_{first}_{year}_1040.pdf')
        filename      = f'{last}_{first}_{year}_1040.pdf'

        print(f"  ↓ {year}...")
        download_file(fid, template_path, drive_tok)
        fill_form(template_path, output_path, year, client)

        print(f"  ↑ Uploading...")
        link = upload_pdf_to_drive(output_path, filename, client_id, drive_tok)
        print(f"    🔗 {link}")
        links[year] = link

        os.unlink(template_path)
        os.unlink(output_path)

    if gmail_tok and client.get('email'):
        try:
            send_email(client, links, gmail_tok)
            print(f"  📧 Sent to {client['email']}")
        except Exception as e:
            print(f"  ⚠️  Email failed: {e}")

    print(json.dumps(links, indent=2))
    return links


def send_email(client, links, gmail_tok):
    first = (client.get('first_name') or '').strip()
    last  = (client.get('last_name') or '').strip()
    to    = client.get('email', '')
    rows  = '\n'.join(f'  • {yr}: {url}' for yr, url in sorted(links.items()))
    body  = (
        f"Dear {first},\n\n"
        f"Your tax returns are ready for review:\n\n{rows}\n\n"
        f"Please review and sign at your earliest convenience.\n\n"
        f"— TaximizerPro Team"
    )
    msg = (
        f"From: taximizerpro@gmail.com\r\n"
        f"To: {to}\r\n"
        f"Subject: Your Tax Returns Are Ready — {first} {last}\r\n"
        f"\r\n{body}"
    )
    raw = __import__('base64').urlsafe_b64encode(msg.encode()).decode()
    req = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps({'raw': raw}).encode(), method='POST',
        headers={'Authorization': f'Bearer {gmail_tok}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


if __name__ == '__main__':
    import sys
    tok  = os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN', '')
    gtok = os.environ.get('GMAIL_ACCESS_TOKEN', '')
    if not tok:
        print("Set GOOGLEDRIVE_ACCESS_TOKEN"); sys.exit(1)
    test_client = {
        'first_name': 'MICHAEL', 'middle_init': 'A', 'last_name': 'JOHNSON',
        'ssn': '523886712', 'email': 'taximizerpro@gmail.com',
        'address': '4821 Brickell Ave', 'apt': '',
        'city': 'Miami', 'state': 'FL', 'zip': '33129',
        'bank_routing': '267084131', 'bank_account': '7743920156',
        'tax_year': '2023,2024,2025',
    }
    process_client(test_client, tok, gtok)
