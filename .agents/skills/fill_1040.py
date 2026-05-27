#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (v13 — VERIFIED FROM WATERMARKS)
======================================================================
Field mapping derived directly from watermark text INSIDE each widget box.

MASTER TEMPLATES (Drive — the FILLABLE_(1) versions):
  2023: 12oZacU01PFs-GjmTnBeeARCWB8IKiRb0  (369KB)
  2024: 1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC  (377KB)
  2025: 13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz  (486KB)

VERIFIED FIELD MAPS (watermarks confirm exactly):

2023 & 2024 — Page 1:
  f1_04[0] → "FIRST NAME, MIDDLE"    x=36  y=88
  f1_05[0] → "LAST"                  x=239 y=88
  f1_06[0] → "S S #" (SSN)           x=469 y=88
  f1_10[0] → "STREET ADDRESS"        x=36  y=136
  f1_11[0] → "APT"                   x=419 y=136
  f1_12[0] → "CITY"                  x=36  y=160
  f1_13[0] → "STATE"                 x=339 y=160
  f1_14[0] → "ZIP CODE"              x=404 y=160
  c1_3[1]  → Single checkbox         x=355 y=200

2023 & 2024 — Page 2:
  f2_25[0] → "A C C O U N T   #"    x=173 y=324  ← ACCOUNT (not routing!)
  c2_5[0]  → Checking checkbox       x=377 y=327
  f2_26[0] → "R O U T I N G   #"    x=173 y=337  ← ROUTING (not account!)
  f2_33[0] → "HELPER" watermark      x=325 y=472  ← This IS the date/sign row field
             (watermark says HELPER but label says "Date" — use for DATE)
  insert_text HELPER at (347, 478)   ← occupation goes right of date label

2025 — Page 1:
  f1_14[0] → "FIRST NAME, MIDDLE INITIAL"  x=36  y=94
  f1_15[0] → "LAST NAME"                   x=253 y=94
  f1_16[0] → "S S   #" (SSN)               x=469 y=94
  f1_20[0] → "STREET ADDRESS"              x=36  y=142
  f1_21[0] → "APT"                         x=419 y=142
  f1_22[0] → "CITY"                        x=36  y=166
  f1_23[0] → "STATE"                       x=332 y=166
  f1_24[0] → "ZIP CODE"                    x=397 y=166
  c1_8[0]  → Single checkbox               x=350 y=206

2025 — Page 2:
  f2_32[0] → "R O U T I N G   #"    x=180 y=504  ← ROUTING
  c2_16[0] → Checking checkbox       x=377 y=506
  f2_33[0] → "A C C O U N T   #"    x=180 y=516  ← ACCOUNT
  f2_40[0] → "HELPER" watermark      x=325 y=646  ← occupation/date row
  insert_text HELPER at (347, 654)   ← occupation overlay
  f2_41[0] → date field              x=504 y=654
"""

import fitz
import os, json, re, urllib.request, urllib.parse, tempfile, base64
from datetime import date

MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
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
    for w in doc[pg].widgets():
        if w.field_name.split('.')[-1] == sn and w.field_type_string == 'Text':
            w.field_value = str(val)
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
        # ── PAGE 1 ──────────────────────────────────────────────
        _set(doc, 0, 'f1_04[0]', first_m)    # FIRST NAME, MIDDLE
        _set(doc, 0, 'f1_05[0]', last)        # LAST
        _set(doc, 0, 'f1_06[0]', ssn)         # SSN
        _set(doc, 0, 'f1_10[0]', street)      # STREET ADDRESS
        if apt:
            _set(doc, 0, 'f1_11[0]', apt)     # APT
        _set(doc, 0, 'f1_12[0]', city)        # CITY
        _set(doc, 0, 'f1_13[0]', state)       # STATE
        _set(doc, 0, 'f1_14[0]', zip_)        # ZIP CODE
        _check(doc, 0, 'c1_3[1]')             # Single (x=355, y=200)

        # ── PAGE 2 ──────────────────────────────────────────────
        # Watermarks confirmed: f2_25=ACCOUNT, f2_26=ROUTING (counterintuitive but verified)
        _set(doc, 1, 'f2_25[0]', account)     # A C C O U N T   #
        _check(doc, 1, 'c2_5[0]')             # Checking
        _set(doc, 1, 'f2_26[0]', routing)     # R O U T I N G   #
        # f2_33 is in the sign row — use for date (watermark says HELPER but position is Date)
        _set(doc, 1, 'f2_33[0]', today)       # Date signed
        # Occupation = text overlay (no dedicated widget in sign row)
        doc[1].insert_text((347, 478), 'HELPER', fontname='helv', fontsize=9, color=(0, 0, 0))

    else:  # 2025
        # ── PAGE 1 ──────────────────────────────────────────────
        _set(doc, 0, 'f1_14[0]', first_m)    # FIRST NAME, MIDDLE INITIAL
        _set(doc, 0, 'f1_15[0]', last)        # LAST NAME
        _set(doc, 0, 'f1_16[0]', ssn)         # SSN
        _set(doc, 0, 'f1_20[0]', street)      # STREET ADDRESS
        if apt:
            _set(doc, 0, 'f1_21[0]', apt)     # APT
        _set(doc, 0, 'f1_22[0]', city)        # CITY
        _set(doc, 0, 'f1_23[0]', state)       # STATE
        _set(doc, 0, 'f1_24[0]', zip_)        # ZIP CODE
        _check(doc, 0, 'c1_8[0]')             # Single (x=350, y=206)

        # ── PAGE 2 ──────────────────────────────────────────────
        _set(doc, 1, 'f2_32[0]', routing)     # R O U T I N G   #
        _check(doc, 1, 'c2_16[0]')            # Checking
        _set(doc, 1, 'f2_33[0]', account)     # A C C O U N T   #
        _set(doc, 1, 'f2_40[0]', today)       # Date signed (x=325, y=646)
        doc[1].insert_text((347, 654), 'HELPER', fontname='helv', fontsize=9, color=(0, 0, 0))

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
        links[year] = link
        print(f"    🔗 {link}")

        for p in [template_path, output_path]:
            try: os.unlink(p)
            except: pass

    if gmail_tok:
        send_completion_email(client, links, gmail_tok)

    return links


def send_completion_email(client, links, gmail_tok):
    to_email = (client.get('email') or '').strip()
    if not to_email:
        return

    name = f"{(client.get('first_name') or '').strip()} {(client.get('last_name') or '').strip()}".strip()
    rows = ''.join(
        f'<tr><td style="padding:10px 16px;border-bottom:1px solid #1e293b">'
        f'<a href="{link}" style="color:#F59E0B;font-weight:bold;text-decoration:none">'
        f'📄 {yr} Form 1040</a></td></tr>'
        for yr, link in sorted(links.items())
    )
    html = f"""<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#080F1E;color:#fff;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#F59E0B,#D97706);padding:24px 28px">
    <div style="font-size:22px;font-weight:900">TaximizerPro</div>
    <div style="font-size:13px;opacity:0.85">Tax Filing Platform</div>
  </div>
  <div style="padding:28px">
    <h2 style="margin:0 0 8px;font-size:20px">Your Tax Returns Are Ready ✅</h2>
    <p style="color:#94a3b8;margin:0 0 24px;font-size:14px">
      Hi <strong style="color:#fff">{name}</strong>, your IRS Form 1040 for 2023, 2024, and 2025 is ready.
    </p>
    <table style="width:100%;border-collapse:collapse;background:#0D1628;border-radius:12px;overflow:hidden">{rows}</table>
    <p style="color:#64748b;font-size:12px;margin-top:24px">Questions? Email taximizerpro@gmail.com</p>
  </div>
</div>"""

    msg_raw = f"To: {to_email}\r\nSubject: Your Tax Returns Are Ready — TaximizerPro\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{html}"
    encoded = base64.urlsafe_b64encode(msg_raw.encode()).decode()
    req = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps({'raw': encoded}).encode(), method='POST',
        headers={'Authorization': f'Bearer {gmail_tok}', 'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=30):
            print(f"  📧 Sent to {to_email}")
    except Exception as e:
        print(f"  ⚠️  Email failed: {e}")


if __name__ == '__main__':
    import sys
    client = json.loads(sys.argv[1] if len(sys.argv) > 1 else '{}')
    drive_tok = os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN', '')
    gmail_tok = os.environ.get('GMAIL_ACCESS_TOKEN', '') or None
    links = process_client(client, drive_tok, gmail_tok)
    print(json.dumps(links))
