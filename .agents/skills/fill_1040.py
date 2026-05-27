#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (v14 — NEW TEMPLATES 2026-05-27)
======================================================================
New templates uploaded by user today (12:03 UTC) — full re-map performed.

MASTER TEMPLATES (new, uploaded 2026-05-27T12:03):
  2023: 1X6LIFErOXnEx9nzOKW-8rBDUN2bfhq4D  (371KB)
  2024: 110bBcABuvofSYrQXLjw3N5DPH1y2Vjan  (371KB)
  2025: 1kQQlQXXTyXjGYtARAP_U5WJ6hWT2Fmc3  (new fat template)

VERIFIED FIELD MAPS (widget inspection of new templates):

── 2023 & 2024 (identical layout) ──────────────────────────────

Page 1:
  f1_04[0]  → First name + Middle initial    (y=88  x=36)
  f1_05[0]  → Last name                      (y=88  x=239)
  f1_06[0]  → SSN                            (y=88  x=469)
  f1_10[0]  → Street address                 (y=136 x=36)
  f1_11[0]  → Apt                            (y=136 x=419)
  f1_12[0]  → City                           (y=160 x=36)
  f1_13[0]  → State                          (y=160 x=339)
  f1_14[0]  → ZIP                            (y=160 x=404)
  c1_3[1]   → Single checkbox                (y=200 x=355)

Page 2 — Bank/Sign row:
  f2_25[0]  → Routing number                 (y=324 x=173)
  c2_5[0]   → Checking checkbox              (y=327 x=377)
  f2_26[0]  → Account number                 (y=337 x=173)
  
  SIGN ROW (y≈463 label line: "Your signature | Date | Your occupation"):
  f2_33[0]  → Occupation field — has HELPER watermark (y=472 x=325)
               Label above it at y=463 says "Your occupation"
               → Fill with today's DATE (the date col is left of occupation)
  Text overlay HELPER at x=347, y=478  → occupation col

  Wait — re-reading labels:
    y=463 x=101  "Your signature"
    y=463 x=278  "Date"        ← date is at x=278
    y=463 x=328  "Your occupation"  ← occupation is at x=328
    
  Widgets in that zone:
    f2_33[0] y=472 x=325  val=[HELPER] ← x=325 aligns with occupation (x=328 label)
    f2_34[0] y=480 x=504  ← this is far right, NOT the date field for sign row
    
  The date for "Your signature" row sits between x=278-325.
  There is NO widget between x=101-325 on that row → date must be text overlay.
  f2_33[0] at x=325 = occupation col → keep HELPER there (it's a real field).
  Date overlay goes at approximately x=205, y=472 (between "Date" label x=278 and sig).

── 2025 (fat template — different layout) ──────────────────────

Page 1:
  f1_04[0]  → First name + Middle initial    (y=88  x=36)
  f1_05[0]  → Last name                      (y=88  x=239)
  f1_06[0]  → SSN                            (y=88  x=469)
  f1_10[0]  → Street address                 (y=136 x=36)
  f1_11[0]  → Apt                            (y=136 x=419)
  f1_12[0]  → City                           (y=160 x=36)
  f1_13[0]  → State                          (y=160 x=339)
  f1_14[0]  → ZIP                            (y=160 x=404)
  c1_3[1]   → Single checkbox                (y=200 x=355)

Page 2 — Bank/Sign row:
  f2_32[0]  → Routing number (watermark "routing #")  (y=504 x=180)
  c2_16[0]  → Checking checkbox                        (y=506 x=377)
  f2_33[0]  → Account number (watermark "account #")  (y=516 x=180)

  SIGN ROW labels at y=637:
    y=637 x=92   "Your signature"
    y=637 x=278  "Date"
    y=637 x=328  "Your occupation"
    
  Widgets in sign zone:
    f2_40[0] y=646 x=325  val=[HELPER] ← occupation col (x=325 ~ label x=328)
    f2_41[0] y=654 x=504  ← far right, NOT the date field for this row
    
  Same as 2023/2024: no date widget between sig and occupation.
  f2_40[0] = occupation → keep HELPER there (real field).
  Date overlay at x=205, y=646 (between "Date" label x=278 and sig area).
"""

import fitz
import os, json, re, urllib.request, urllib.parse, tempfile
from datetime import date

MASTER_IDS = {
    '2023': '1X6LIFErOXnEx9nzOKW-8rBDUN2bfhq4D',
    '2024': '110bBcABuvofSYrQXLjw3N5DPH1y2Vjan',
    '2025': '1kQQlQXXTyXjGYtARAP_U5WJ6hWT2Fmc3',
}
YEARS = ['2023', '2024', '2025']
ROOT_FOLDER = 'TaximizerPro V 2.0 Clients'
BAD_APT = {'', 'none', 'null', 'apt', 'apt.', '#', 'unit', 'n/a', 'na'}


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
    """Set a text widget by short name."""
    for w in doc[pg].widgets():
        if w.field_name.split('.')[-1] == sn and w.field_type_string == 'Text':
            w.field_value = str(val)
            w.update()
            return True
    return False

def _clear(doc, pg, sn):
    """Clear a text widget (remove watermark default value)."""
    for w in doc[pg].widgets():
        if w.field_name.split('.')[-1] == sn and w.field_type_string == 'Text':
            w.field_value = ''
            w.update()
            return True
    return False

def _check(doc, pg, sn):
    """Check a checkbox widget by short name."""
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

    # Repair xrefs first
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
        if apt:
            _set(doc, 0, 'f1_11[0]', apt)
        _set(doc, 0, 'f1_12[0]', city)
        _set(doc, 0, 'f1_13[0]', state)
        _set(doc, 0, 'f1_14[0]', zip_)
        _check(doc, 0, 'c1_3[1]')             # Single filing status

        # ── PAGE 2 — Bank ──────────────────────────────────────
        _set(doc, 1, 'f2_25[0]', routing)     # Routing number
        _check(doc, 1, 'c2_5[0]')             # Checking
        _set(doc, 1, 'f2_26[0]', account)     # Account number

        # ── PAGE 2 — Sign Row ──────────────────────────────────
        # Layout (confirmed from new template widget inspection):
        #   "Your signature" col (x=101) | "Date" label (x=278) | "Your occupation" label (x=328)
        #   Widget f2_33[0] at x=325 y=472 has HELPER watermark → it IS the occupation field
        #   No date widget exists → insert date as text overlay in the Date column
        #
        # f2_33[0] = occupation → set to HELPER (clear watermark first, then set)
        _set(doc, 1, 'f2_33[0]', 'HELPER')
        # Date = text overlay between sig col and occupation col
        doc[1].insert_text((205, 472), today, fontname='helv', fontsize=9, color=(0, 0, 0))

    else:  # 2025
        # ── PAGE 1 — same layout as 2023/2024 for this new template ──
        _set(doc, 0, 'f1_04[0]', first_m)
        _set(doc, 0, 'f1_05[0]', last)
        _set(doc, 0, 'f1_06[0]', ssn)
        _set(doc, 0, 'f1_10[0]', street)
        if apt:
            _set(doc, 0, 'f1_11[0]', apt)
        _set(doc, 0, 'f1_12[0]', city)
        _set(doc, 0, 'f1_13[0]', state)
        _set(doc, 0, 'f1_14[0]', zip_)
        _check(doc, 0, 'c1_3[1]')             # Single filing status

        # ── PAGE 2 — Bank ──────────────────────────────────────
        # Clear watermark defaults first to prevent double-text
        _clear(doc, 1, 'f2_32[0]')
        _set(doc, 1, 'f2_32[0]', routing)     # Routing (watermark "routing #")
        _check(doc, 1, 'c2_16[0]')            # Checking
        _clear(doc, 1, 'f2_33[0]')
        _set(doc, 1, 'f2_33[0]', account)     # Account (watermark "account #")

        # ── PAGE 2 — Sign Row ──────────────────────────────────
        # Layout (confirmed from new 2025 template widget inspection):
        #   "Your signature" (x=92) | "Date" label (x=278) | "Your occupation" label (x=328)
        #   Widget f2_40[0] at x=325 y=646 has HELPER watermark → occupation field
        #   No date widget in this row → insert date as text overlay
        #
        # f2_40[0] = occupation → set to HELPER
        _set(doc, 1, 'f2_40[0]', 'HELPER')
        # Date overlay in the Date column
        doc[1].insert_text((205, 646), today, fontname='helv', fontsize=9, color=(0, 0, 0))

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

    # Send email if we have a gmail token and client email
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

    rows = '\n'.join(
        f'  • {yr}: {url}' for yr, url in sorted(links.items())
    )
    body = (
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
        data=json.dumps({'raw': raw}).encode(),
        method='POST',
        headers={
            'Authorization': f'Bearer {gmail_tok}',
            'Content-Type': 'application/json',
        }
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


if __name__ == '__main__':
    import sys
    tok = os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN', '')
    gtok = os.environ.get('GMAIL_ACCESS_TOKEN', '')
    if not tok:
        print("Set GOOGLEDRIVE_ACCESS_TOKEN")
        sys.exit(1)

    test_client = {
        'first_name': 'MICHAEL', 'middle_init': 'A', 'last_name': 'JOHNSON',
        'ssn': '523886712', 'email': 'taximizerpro@gmail.com',
        'address': '4821 Brickell Ave', 'apt': '',
        'city': 'Miami', 'state': 'FL', 'zip': '33129',
        'bank_routing': '267084131', 'bank_account': '7743920156',
        'tax_year': '2023,2024,2025',
    }
    process_client(test_client, tok, gtok)
