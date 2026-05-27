#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (v11 — DEFINITIVE)
=========================================================
ALWAYS generates 3 PDFs per client: 2023, 2024, 2025. No exceptions.

MASTER TEMPLATES (Drive):
  2023: 11EliCV6RXer1bA_eqnFLB5esDZsJefiu  (160KB clean)
  2024: 1jeO8jBbrjHg7IkTfQyv7eJiTPuP-3d_W  (163KB clean)
  2025: 1YrqK6Y3p-QgxzlIi0b7ph3XNAfmDX6mc  (220KB clean)

VERIFIED FIELD MAPS (extracted via direct widget inspection 2026-05-27):

2023 & 2024 — Page 1:
  f1_04[0] → First name + Middle initial  (x=36,  y=88)
  f1_05[0] → Last name                    (x=239, y=88)
  f1_06[0] → SSN (raw digits)             (x=469, y=88)
  f1_10[0] → Street address               (x=36,  y=136)
  f1_11[0] → Apt number                   (x=419, y=136)
  f1_12[0] → City                         (x=36,  y=160)
  f1_13[0] → State                        (x=339, y=160)
  f1_14[0] → ZIP                          (x=404, y=160)
  c1_3[0]  → Single filing status checkbox

2023 & 2024 — Page 2:
  f2_25[0] → Routing number               (x=173, y=324)
  c2_5[0]  → Checking checkbox            (x=377, y=327)
  f2_26[0] → Account number               (x=173, y=337)
  f2_34[0] → Date signed                  (x=504, y=480)
  f2_39[0] → Occupation (HELPER)          (x=92,  y=544)

2025 — Page 1:
  f1_04[0] → First name + Middle initial  (x=210, y=61)
  f1_11[0] → Last name                    (x=68,  y=72)
  f1_05[0] → SSN group 1 (3 digits)       (x=418, y=61)
  f1_06[0] → SSN group 2 (2 digits)       (x=439, y=61)
  f1_07[0] → SSN group 3 (4 digits)       (x=461, y=61)
  f1_20[0] → Street address               (x=36,  y=142)
  f1_21[0] → Apt number                   (x=419, y=142)
  f1_22[0] → City                         (x=36,  y=166)
  f1_23[0] → State                        (x=332, y=166)
  f1_24[0] → ZIP                          (x=397, y=166)

2025 — Page 2:
  f2_32[0] → Routing number               (x=180, y=504)
  c2_16[0] → Checking checkbox            (x=377, y=506)
  f2_33[0] → Account number               (x=180, y=516)
  f2_41[0] → Date signed                  (x=504, y=654)
  f2_46[0] → Occupation (HELPER)          (x=92,  y=718)

HARD RULES (NEVER BREAK):
  - Occupation ALWAYS = "HELPER"
  - SSN = raw digits only, no dashes
  - Apt: blank if empty / None / null / Apt / apt. / # / unit
  - Always generate ALL 3 years (2023, 2024, 2025) per client
"""

import fitz
import os, json, re, urllib.request, urllib.parse, tempfile
from datetime import date

MASTER_IDS = {
    '2023': '11EliCV6RXer1bA_eqnFLB5esDZsJefiu',
    '2024': '1jeO8jBbrjHg7IkTfQyv7eJiTPuP-3d_W',
    '2025': '1YrqK6Y3p-QgxzlIi0b7ph3XNAfmDX6mc',
}
YEARS = ['2023', '2024', '2025']
ROOT_FOLDER = 'TaximizerPro V 2.0 Clients'
BAD_APT = {'', 'none', 'null', 'apt', 'apt.', '#', 'unit', 'n/a', 'na'}


# ── Helpers ───────────────────────────────────────────────────────────────────
def clean_apt(raw):
    v = str(raw or '').strip()
    return '' if v.lower() in BAD_APT else v

def clean_ssn(raw):
    return re.sub(r'\D', '', str(raw or ''))

def _dget(url, tok):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {tok}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def _dpost(url, data, tok, method='POST'):
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method=method, headers={
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
        headers={
            'Authorization': f'Bearer {tok}',
            'Content-Type': f'multipart/related; boundary={bnd}'
        }
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read())
    return res.get('webViewLink', f"https://drive.google.com/file/d/{res['id']}/view")


# ── PDF Fill ──────────────────────────────────────────────────────────────────
def fill_form(template_path, output_path, year, client):
    """Fill one IRS 1040 form. Returns output_path."""
    today = date.today().strftime('%m/%d/%Y')
    ssn = clean_ssn(client.get('ssn', ''))
    apt = clean_apt(client.get('apt', ''))
    first_m = f"{(client.get('first_name') or '').strip()} {(client.get('middle_init') or '').strip()}".strip()
    last = (client.get('last_name') or '').strip()
    street = (client.get('address') or '').strip()
    city = (client.get('city') or '').strip()
    state = (client.get('state') or '').strip()
    zip_ = (client.get('zip') or '').strip()
    routing = (client.get('bank_routing') or '').strip()
    account = (client.get('bank_account') or '').strip()

    # Repair PDF first
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tf:
        tmp = tf.name
    doc = fitz.open(template_path)
    doc.save(tmp, garbage=4, deflate=True, incremental=False)
    doc.close()
    doc = fitz.open(tmp)

    if year in ('2023', '2024'):
        _fill_2023_2024(doc, first_m, last, ssn, street, apt, city, state, zip_, routing, account, today)
    else:
        _fill_2025(doc, first_m, last, ssn, street, apt, city, state, zip_, routing, account, today)

    doc.save(output_path, garbage=4, deflate=True, incremental=False)
    doc.close()
    os.unlink(tmp)
    kb = os.path.getsize(output_path) // 1024
    print(f'    ✅ {year}: {kb}KB → {os.path.basename(output_path)}')
    return output_path


def _set(doc, pg, field_short_name, value):
    """Set a field by its short name (e.g. 'f1_04[0]')."""
    for w in doc[pg].widgets():
        if w.field_name.split('.')[-1] == field_short_name:
            if w.field_type_string == 'Text':
                w.field_value = value
                w.update()
                return True
    return False

def _check(doc, pg, field_short_name):
    """Check a checkbox by short name."""
    for w in doc[pg].widgets():
        if w.field_name.split('.')[-1] == field_short_name:
            if w.field_type_string == 'CheckBox':
                w.field_value = True
                w.update()
                return True
    return False


def _fill_2023_2024(doc, first_m, last, ssn, street, apt, city, state, zip_, routing, account, today):
    # Page 1
    _set(doc, 0, 'f1_04[0]', first_m)   # First + MI
    _set(doc, 0, 'f1_05[0]', last)       # Last name
    _set(doc, 0, 'f1_06[0]', ssn)        # SSN (full, no dashes)
    _set(doc, 0, 'f1_10[0]', street)     # Street address
    if apt:
        _set(doc, 0, 'f1_11[0]', apt)    # Apt (only if valid)
    _set(doc, 0, 'f1_12[0]', city)       # City
    _set(doc, 0, 'f1_13[0]', state)      # State
    _set(doc, 0, 'f1_14[0]', zip_)       # ZIP
    _check(doc, 0, 'c1_3[0]')            # Single filing status

    # Page 2
    _set(doc, 1, 'f2_25[0]', routing)    # Routing number
    _check(doc, 1, 'c2_5[0]')            # Checking
    _set(doc, 1, 'f2_26[0]', account)    # Account number
    _set(doc, 1, 'f2_34[0]', today)      # Date signed
    _set(doc, 1, 'f2_39[0]', 'HELPER')   # Occupation


def _fill_2025(doc, first_m, last, ssn, street, apt, city, state, zip_, routing, account, today):
    # Page 1 — 2025 has split SSN boxes and different name layout
    _set(doc, 0, 'f1_04[0]', first_m)    # First + MI
    _set(doc, 0, 'f1_11[0]', last)        # Last name
    _set(doc, 0, 'f1_05[0]', ssn[0:3])   # SSN part 1
    _set(doc, 0, 'f1_06[0]', ssn[3:5])   # SSN part 2
    _set(doc, 0, 'f1_07[0]', ssn[5:])    # SSN part 3
    _set(doc, 0, 'f1_20[0]', street)      # Street address
    if apt:
        _set(doc, 0, 'f1_21[0]', apt)     # Apt (only if valid)
    _set(doc, 0, 'f1_22[0]', city)        # City
    _set(doc, 0, 'f1_23[0]', state)       # State
    _set(doc, 0, 'f1_24[0]', zip_)        # ZIP
    _check(doc, 0, 'c1_1[0]')             # Single filing status

    # Page 2
    _set(doc, 1, 'f2_32[0]', routing)    # Routing number
    _check(doc, 1, 'c2_16[0]')           # Checking
    _set(doc, 1, 'f2_33[0]', account)    # Account number
    _set(doc, 1, 'f2_41[0]', today)      # Date signed
    _set(doc, 1, 'f2_46[0]', 'HELPER')   # Occupation


# ── Main: process one client ──────────────────────────────────────────────────
def process_client(client, drive_tok, gmail_tok=None, tmpdir='/tmp'):
    """
    Generate 2023, 2024, 2025 forms for one client.
    Upload to Drive under TaximizerPro V 2.0 Clients/LastName_FirstName_DATE_2023-2024-2025/
    Returns dict of {year: drive_link}
    """
    first = (client.get('first_name') or '').strip()
    last  = (client.get('last_name') or '').strip()
    today_str = date.today().strftime('%m-%d-%Y')
    folder_name = f"{last}_{first}_{today_str}_2023-2024-2025"

    print(f"\n📋 Processing: {first} {last}")
    print(f"   Folder: {folder_name}")

    # Find/create Drive folders
    root_id   = find_or_create_folder(ROOT_FOLDER, drive_tok)
    client_id = find_or_create_folder(folder_name, drive_tok, parent_id=root_id)

    links = {}

    for year in YEARS:
        fid = MASTER_IDS[year]
        template_path = os.path.join(tmpdir, f'template_{year}.pdf')
        output_path   = os.path.join(tmpdir, f'{last}_{first}_{year}_1040.pdf')
        filename      = f'{last}_{first}_{year}_1040.pdf'

        print(f"  ↓ Downloading {year} template...")
        download_file(fid, template_path, drive_tok)

        fill_form(template_path, output_path, year, client)

        print(f"  ↑ Uploading {filename} to Drive...")
        link = upload_pdf_to_drive(output_path, filename, client_id, drive_tok)
        links[year] = link
        print(f"    🔗 {link}")

        # Cleanup
        for p in [template_path, output_path]:
            try: os.unlink(p)
            except: pass

    return links


# ── Email ─────────────────────────────────────────────────────────────────────
def send_completion_email(client, links, gmail_tok):
    """Send client their Drive links."""
    to_email = (client.get('email') or '').strip()
    if not to_email:
        print("  ⚠️  No email address — skipping email")
        return

    first = (client.get('first_name') or '').strip()
    last  = (client.get('last_name') or '').strip()
    name  = f"{first} {last}".strip()

    rows = ''.join(
        f'<tr><td style="padding:10px 16px;border-bottom:1px solid #1e293b">'
        f'<a href="{link}" style="color:#F59E0B;font-weight:bold;text-decoration:none">'
        f'📄 {yr} Form 1040</a></td></tr>'
        for yr, link in sorted(links.items())
    )

    html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#080F1E;color:#fff;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#F59E0B,#D97706);padding:24px 28px">
    <div style="font-size:22px;font-weight:900">TaximizerPro</div>
    <div style="font-size:13px;opacity:0.85">Tax Filing Platform</div>
  </div>
  <div style="padding:28px">
    <h2 style="margin:0 0 8px;font-size:20px">Your Tax Returns Are Ready ✅</h2>
    <p style="color:#94a3b8;margin:0 0 24px;font-size:14px">
      Hi <strong style="color:#fff">{name}</strong>,<br><br>
      Your IRS Form 1040 for 2023, 2024, and 2025 has been prepared and is ready for your review.
    </p>
    <table style="width:100%;border-collapse:collapse;background:#0D1628;border-radius:12px;overflow:hidden">
      {rows}
    </table>
    <p style="color:#64748b;font-size:12px;margin-top:24px">
      Questions? Reply to this email or contact us at taximizerpro@gmail.com
    </p>
  </div>
</div>"""

    import base64
    msg_raw = f"To: {to_email}\r\nSubject: Your Tax Returns Are Ready — TaximizerPro\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{html}"
    encoded = base64.urlsafe_b64encode(msg_raw.encode()).decode()
    body = json.dumps({'raw': encoded}).encode()
    req = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=body, method='POST',
        headers={'Authorization': f'Bearer {gmail_tok}', 'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"  📧 Email sent to {to_email}")
    except Exception as e:
        print(f"  ⚠️  Email failed: {e}")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys
    client_json = sys.argv[1] if len(sys.argv) > 1 else '{}'
    client = json.loads(client_json)
    drive_tok = os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN', '')
    gmail_tok = os.environ.get('GMAIL_ACCESS_TOKEN', '')
    links = process_client(client, drive_tok)
    if gmail_tok:
        send_completion_email(client, links, gmail_tok)
    print(json.dumps(links))
