#!/usr/bin/env python3
"""
Taximizer Pro — IRS 1040 Form Filler (v12 — DEFINITIVE, ALL 3 YEARS)
=====================================================================
Always generates 3 PDFs per client: 2023, 2024, 2025. No exceptions.

MASTER TEMPLATES (Drive — the FILLABLE_(1) versions that work):
  2023: 12oZacU01PFs-GjmTnBeeARCWB8IKiRb0  (369KB)
  2024: 1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC  (377KB)
  2025: 13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz  (486KB)

VERIFIED FIELD MAPS (from direct widget inspection):

2023 & 2024 — Page 1:
  f1_04[0] → First name + Middle initial
  f1_05[0] → Last name
  f1_06[0] → SSN (raw digits, no dashes)
  f1_10[0] → Street address
  f1_11[0] → Apt number (only if valid)
  f1_12[0] → City
  f1_13[0] → State
  f1_14[0] → ZIP
  c1_3[0]  → Single filing status checkbox

2023 & 2024 — Page 2:
  f2_25[0]     → Routing number
  c2_5[0]      → Checking checkbox
  f2_26[0]     → Account number
  f2_33[0]     → Date signed (x=325, y=472)
  insert_text  → HELPER at (347, 478) — occupation has no widget

2025 — Page 1 (fat template — same field names, different y):
  f1_14[0] → First name + Middle initial  (y=94)
  f1_15[0] → Last name                    (y=94)
  f1_16[0] → SSN (raw digits)             (y=94)
  f1_20[0] → Street address               (y=142)
  f1_21[0] → Apt number (only if valid)   (y=142)
  f1_22[0] → City                         (y=166)
  f1_23[0] → State                        (y=166)
  f1_24[0] → ZIP                          (y=166)
  c1_8[0]  → Single filing status checkbox (x=350, y=206)

2025 — Page 2:
  f2_34[0]     → Routing number  (x=410, y=528)
  c2_16[0]     → Checking checkbox
  f2_33[0]     → Account number  (x=180, y=516)  ← NOTE: f2_33 is account in 2025
  f2_40[0]     → Date signed     (x=325, y=646)
  insert_text  → HELPER at (347, 654) — occupation has no widget

HARD RULES:
  - Occupation ALWAYS = "HELPER" (text overlay, not a form field)
  - SSN = raw digits only, no dashes
  - Apt: blank if empty / None / null / Apt / apt. / # / unit
  - Always generate ALL 3 years per client
"""

import fitz
import os, json, re, urllib.request, urllib.parse, tempfile, base64
from datetime import date

# Use the bigger (1) versions — these are the ones that work
MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
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


# ── Field setters ─────────────────────────────────────────────────────────────
def _set(doc, pg, sn, val):
    """Set a text field by its short name."""
    for w in doc[pg].widgets():
        if w.field_name.split('.')[-1] == sn and w.field_type_string == 'Text':
            w.field_value = str(val)
            w.update()
            return True
    return False

def _check(doc, pg, sn):
    """Check a checkbox by its short name."""
    for w in doc[pg].widgets():
        if w.field_name.split('.')[-1] == sn and w.field_type_string == 'CheckBox':
            w.field_value = True
            w.update()
            return True
    return False


# ── PDF fill ──────────────────────────────────────────────────────────────────
def fill_form(template_path, output_path, year, client):
    today = date.today().strftime('%m/%d/%Y')
    ssn   = clean_ssn(client.get('ssn', ''))
    apt   = clean_apt(client.get('apt', ''))
    first_m = f"{(client.get('first_name') or '').strip()} {(client.get('middle_init') or '').strip()}".strip()
    last    = (client.get('last_name') or '').strip()
    street  = (client.get('address') or '').strip()
    city    = (client.get('city') or '').strip()
    state   = (client.get('state') or '').strip()
    zip_    = (client.get('zip') or '').strip()
    routing = (client.get('bank_routing') or '').strip()
    account = (client.get('bank_account') or '').strip()

    # Repair PDF xrefs first
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tf:
        tmp = tf.name
    doc = fitz.open(template_path)
    doc.save(tmp, garbage=4, deflate=True, incremental=False)
    doc.close()
    doc = fitz.open(tmp)

    if year in ('2023', '2024'):
        # ── PAGE 1 ──
        _set(doc, 0, 'f1_04[0]', first_m)   # First + MI
        _set(doc, 0, 'f1_05[0]', last)       # Last name
        _set(doc, 0, 'f1_06[0]', ssn)        # SSN
        _set(doc, 0, 'f1_10[0]', street)     # Street
        if apt:
            _set(doc, 0, 'f1_11[0]', apt)    # Apt
        _set(doc, 0, 'f1_12[0]', city)       # City
        _set(doc, 0, 'f1_13[0]', state)      # State
        _set(doc, 0, 'f1_14[0]', zip_)       # ZIP
        _check(doc, 0, 'c1_3[0]')            # Single

        # ── PAGE 2 ──
        _set(doc, 1, 'f2_25[0]', routing)    # Routing
        _check(doc, 1, 'c2_5[0]')            # Checking
        _set(doc, 1, 'f2_26[0]', account)    # Account
        _set(doc, 1, 'f2_33[0]', today)      # Date (x=325, y=472)
        doc[1].insert_text(                   # Occupation — text overlay
            (347, 478), 'HELPER', fontname='helv', fontsize=9, color=(0, 0, 0))

    else:  # 2025 — fat template, same names, different positions
        # ── PAGE 1 ──
        _set(doc, 0, 'f1_14[0]', first_m)   # First + MI
        _set(doc, 0, 'f1_15[0]', last)       # Last name
        _set(doc, 0, 'f1_16[0]', ssn)        # SSN
        _set(doc, 0, 'f1_20[0]', street)     # Street
        if apt:
            _set(doc, 0, 'f1_21[0]', apt)    # Apt
        _set(doc, 0, 'f1_22[0]', city)       # City
        _set(doc, 0, 'f1_23[0]', state)      # State
        _set(doc, 0, 'f1_24[0]', zip_)       # ZIP
        _check(doc, 0, 'c1_8[0]')            # Single (x=350, y=206)

        # ── PAGE 2 ──
        _set(doc, 1, 'f2_34[0]', routing)    # Routing (x=410, y=528)
        _check(doc, 1, 'c2_16[0]')           # Checking
        _set(doc, 1, 'f2_33[0]', account)    # Account (x=180, y=516)
        _set(doc, 1, 'f2_40[0]', today)      # Date (x=325, y=646)
        doc[1].insert_text(                   # Occupation — text overlay
            (347, 654), 'HELPER', fontname='helv', fontsize=9, color=(0, 0, 0))

    doc.save(output_path, garbage=4, deflate=True, incremental=False)
    doc.close()
    os.unlink(tmp)
    kb = os.path.getsize(output_path) // 1024
    print(f'    ✅ {year}: {kb}KB → {os.path.basename(output_path)}')
    return output_path


# ── Main: process one client ──────────────────────────────────────────────────
def process_client(client, drive_tok, gmail_tok=None, tmpdir='/tmp'):
    first = (client.get('first_name') or '').strip()
    last  = (client.get('last_name') or '').strip()
    today_str = date.today().strftime('%m-%d-%Y')
    folder_name = f"{last}_{first}_{today_str}_2023-2024-2025"

    print(f"\n📋 {first} {last}")
    print(f"   Folder: {folder_name}")

    root_id   = find_or_create_folder(ROOT_FOLDER, drive_tok)
    client_id = find_or_create_folder(folder_name, drive_tok, parent_id=root_id)

    links = {}
    for year in YEARS:
        fid           = MASTER_IDS[year]
        template_path = os.path.join(tmpdir, f'tpl_{year}.pdf')
        output_path   = os.path.join(tmpdir, f'{last}_{first}_{year}_1040.pdf')
        filename      = f'{last}_{first}_{year}_1040.pdf'

        print(f"  ↓ {year} template...")
        download_file(fid, template_path, drive_tok)

        fill_form(template_path, output_path, year, client)

        print(f"  ↑ Uploading {filename}...")
        link = upload_pdf_to_drive(output_path, filename, client_id, drive_tok)
        links[year] = link
        print(f"    🔗 {link}")

        for p in [template_path, output_path]:
            try: os.unlink(p)
            except: pass

    if gmail_tok:
        send_completion_email(client, links, gmail_tok)

    return links


# ── Email ─────────────────────────────────────────────────────────────────────
def send_completion_email(client, links, gmail_tok):
    to_email = (client.get('email') or '').strip()
    if not to_email:
        print("  ⚠️  No email — skipping")
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

    html = f"""<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#080F1E;color:#fff;border-radius:16px;overflow:hidden">
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
    <p style="color:#64748b;font-size:12px;margin-top:24px">Questions? Email us at taximizerpro@gmail.com</p>
  </div>
</div>"""

    msg_raw = f"To: {to_email}\r\nSubject: Your Tax Returns Are Ready — TaximizerPro\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{html}"
    encoded = base64.urlsafe_b64encode(msg_raw.encode()).decode()
    body = json.dumps({'raw': encoded}).encode()
    req = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=body, method='POST',
        headers={'Authorization': f'Bearer {gmail_tok}', 'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=30):
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
    links = process_client(client, drive_tok, gmail_tok or None)
    print(json.dumps(links))
