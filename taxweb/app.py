#!/usr/bin/env python3
"""
TaximizerPro Admin Portal
"""
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
from werkzeug.security import check_password_hash, generate_password_hash
import os, json, urllib.request, urllib.parse, fitz
from datetime import date
import threading

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "taximizerpro-secret-2026")

# ── ADMIN CREDENTIALS ──────────────────────────────────────────────────────────
ADMINS = {
    "taximizerpro@gmail.com": {
        "password": generate_password_hash("Italy2026!"),
        "name": "Italy (Super Admin)",
        "role": "superadmin"
    },
    "Mike.hennigan44@gmail.com": {
        "password": generate_password_hash("Admin2026!"),
        "name": "Mike Hennigan",
        "role": "admin"
    }
}

# ── BASE44 API ─────────────────────────────────────────────────────────────────
BASE44_APP_ID = "6a13ae4b43ea85cec629af77"
BASE44_API    = f"https://api.base44.com/api/apps/{BASE44_APP_ID}/entities"

def b44_get(entity, query=None):
    url = f"{BASE44_API}/{entity}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    req = urllib.request.Request(url, headers={
        "app-id": BASE44_APP_ID,
        "Content-Type": "application/json"
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

# ── DRIVE & GMAIL ──────────────────────────────────────────────────────────────
DRIVE_TOKEN = os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", "")
GMAIL_TOKEN = os.environ.get("GMAIL_ACCESS_TOKEN", "")

MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
}
ROOT_FOLDER = "TaximizerPro V 2.0 Clients"

P1_23_24 = {'f1_04[0]':'FIRST_MIDDLE','f1_05[0]':'LAST_NAME','f1_06[0]':'SSN',
             'f1_10[0]':'ADDRESS','f1_12[0]':'CITY','f1_13[0]':'STATE','f1_14[0]':'ZIP'}
P1_25    = {'f1_14[0]':'FIRST_MIDDLE','f1_15[0]':'LAST_NAME','f1_16[0]':'SSN',
             'f1_20[0]':'ADDRESS','f1_22[0]':'CITY','f1_23[0]':'STATE','f1_24[0]':'ZIP'}
P2_23    = {'f2_25[0]':'ROUTING','f2_26[0]':'ACCOUNT','f2_33[0]':'OCCUPATION'}
P2_24    = {'f2_25[0]':'ROUTING','f2_26[0]':'ACCOUNT','f2_33[0]':'OCCUPATION'}
P2_25    = {'f2_32[0]':'ROUTING','f2_33[0]':'ACCOUNT','f2_40[0]':'OCCUPATION'}
WMAPS = {'2023':(P1_23_24,P2_23),'2024':(P1_23_24,P2_24),'2025':(P1_25,P2_25)}
SIGN  = {
    '2023':{'date_box':(273.6,462.0,324.0,492.0)},
    '2024':{'date_box':(273.6,462.0,324.0,492.0)},
    '2025':{'date_box':(273.6,636.0,324.0,666.0)},
}

def drive_req(url, method='GET', data=None, content_type='application/json'):
    tok = os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", DRIVE_TOKEN)
    headers = {'Authorization': f'Bearer {tok}'}
    if content_type: headers['Content-Type'] = content_type
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def get_or_create_folder(name, parent=None):
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent: q += f" and '{parent}' in parents"
    r = drive_req(f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id)")
    if r.get('files'): return r['files'][0]['id']
    m = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent: m['parents'] = [parent]
    return drive_req('https://www.googleapis.com/drive/v3/files', 'POST', m)['id']

def download_template(fid, dest):
    tok = os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", DRIVE_TOKEN)
    req = urllib.request.Request(
        f'https://www.googleapis.com/drive/v3/files/{fid}?alt=media',
        headers={'Authorization': f'Bearer {tok}'}
    )
    with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
        f.write(r.read())

def upload_pdf(path, name, folder_id):
    tok = os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", DRIVE_TOKEN)
    with open(path, 'rb') as f: data = f.read()
    meta = json.dumps({'name': name, 'parents': [folder_id], 'mimeType': 'application/pdf'})
    bnd = 'txbnd26'
    body = (f'--{bnd}\r\nContent-Type: application/json\r\n\r\n{meta}\r\n'
            f'--{bnd}\r\nContent-Type: application/pdf\r\n\r\n').encode() + data + f'\r\n--{bnd}--'.encode()
    req = urllib.request.Request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        data=body, method='POST',
        headers={'Authorization': f'Bearer {tok}',
                 'Content-Type': f'multipart/related; boundary={bnd}'}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())
    return d.get('webViewLink', f"https://drive.google.com/file/d/{d['id']}/view")

def fill_pdf(tmpl, out, yr, c):
    today = date.today().strftime('%m/%d/%Y')
    ssn = (c.get('ssn') or '').replace('-','').replace(' ','')
    first_m = f"{c['first_name'].strip()} {(c.get('middle_init') or '').strip()}".strip()
    apt_raw = str(c.get('apt') or '').strip()
    apt_val = apt_raw if apt_raw and apt_raw.lower() not in ('none','null','apt','apt.','#','unit','') else ''
    address = (c['address'].strip() + (' ' + apt_val if apt_val else '')).strip()
    tokens = {
        'FIRST_MIDDLE': first_m, 'LAST_NAME': c['last_name'].strip(),
        'SSN': ssn, 'ADDRESS': address, 'CITY': c['city'],
        'STATE': c['state'], 'ZIP': c['zip'],
        'ROUTING': c.get('bank_routing',''), 'ACCOUNT': c.get('bank_account',''),
        'OCCUPATION': 'HELPER'
    }
    tmp = out + '.tmp.pdf'
    doc = fitz.open(tmpl)
    doc.save(tmp, garbage=4, deflate=True, incremental=False)
    doc.close()
    doc = fitz.open(tmp)
    p1m, p2m = WMAPS[yr]
    for w in doc[0].widgets():
        if w.field_type_string != 'Text': continue
        sn = w.field_name.split('.')[-1]
        if sn in p1m and tokens.get(p1m[sn]):
            w.field_value = tokens[p1m[sn]]; w.update()
    for w in doc[1].widgets():
        if w.field_type_string != 'Text': continue
        sn = w.field_name.split('.')[-1]
        if sn in p2m and tokens.get(p2m[sn]):
            w.field_value = tokens[p2m[sn]]; w.update()
    db = SIGN[yr]['date_box']
    doc[1].insert_text((db[0]+2, db[1]+(db[3]-db[1])*0.65), today,
                        fontname='helv', fontsize=7, color=(0,0,0))
    doc.save(out, garbage=4, deflate=True, incremental=False)
    doc.close()
    os.remove(tmp)

def send_email(to, name, links, filing_date):
    tok = os.environ.get("GMAIL_ACCESS_TOKEN", GMAIL_TOKEN)
    rows = ''.join(f'<li><a href="{l}">{y} Form 1040</a></li>' for y,l in sorted(links.items()))
    html = (f'<p>Hi <b>{name}</b>,</p>'
            f'<p>Your IRS 1040 forms are ready. Click below to view them in Google Drive:</p>'
            f'<ul>{rows}</ul>'
            f'<p>Please review and sign when ready.</p>'
            f'<p style="color:#888;font-size:12px">Filed {filing_date} — TaximizerPro</p>')
    raw_msg = (f'From: taximizerpro@gmail.com\r\nTo: {to}\r\n'
               f'Subject: Your Tax Forms Are Ready — TaximizerPro\r\n'
               f'Content-Type: text/html; charset=utf-8\r\n\r\n{html}')
    import base64
    raw = base64.urlsafe_b64encode(raw_msg.encode()).decode().rstrip('=')
    req = urllib.request.Request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        data=json.dumps({'raw': raw}).encode(), method='POST',
        headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def generate_forms_for_client(c):
    years = [y.strip() for y in c.get('tax_year','').split(',') if y.strip() in ('2023','2024','2025')]
    today_str = date.today().strftime('%m-%d-%Y')
    years_str = '-'.join(sorted(years))
    folder_name = f"{c['last_name'].strip()}_{c['first_name'].strip()}_{today_str}_{years_str}"
    root_id = get_or_create_folder(ROOT_FOLDER)
    client_folder_id = get_or_create_folder(folder_name, root_id)
    links = {}
    for yr in years:
        tmpl = f'/tmp/tpl_{yr}_{c["id"]}.pdf'
        out  = f'/tmp/out_{yr}_{c["id"]}.pdf'
        download_template(MASTER_IDS[yr], tmpl)
        fill_pdf(tmpl, out, yr, c)
        fname = f"{c['last_name'].strip()}_{c['first_name'].strip()}_{yr}_1040.pdf"
        links[yr] = upload_pdf(out, fname, client_folder_id)
        try: os.remove(tmpl)
        except: pass
        try: os.remove(out)
        except: pass
    if c.get('email') and '@' in c.get('email',''):
        send_email(c['email'], c['first_name'], links, date.today().strftime('%m/%d/%Y'))
    return links, f"https://drive.google.com/drive/folders/{client_folder_id}"

# ── ROUTES ─────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    if 'user' not in session:
        return redirect(url_for('login'))
    return redirect(url_for('dashboard'))

@app.route('/login', methods=['GET','POST'])
def login():
    error = None
    if request.method == 'POST':
        email = request.form.get('email','').strip().lower()
        pw    = request.form.get('password','')
        # case-insensitive lookup
        match = next((k for k in ADMINS if k.lower() == email), None)
        if match and check_password_hash(ADMINS[match]['password'], pw):
            session['user'] = {'email': match, 'name': ADMINS[match]['name'], 'role': ADMINS[match]['role']}
            return redirect(url_for('dashboard'))
        error = "Invalid email or password."
    return render_template('login.html', error=error)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/dashboard')
def dashboard():
    if 'user' not in session: return redirect(url_for('login'))
    return render_template('dashboard.html', user=session['user'])

@app.route('/clients')
def clients():
    if 'user' not in session: return redirect(url_for('login'))
    return render_template('clients.html', user=session['user'])

@app.route('/new-client', methods=['GET','POST'])
def new_client():
    if 'user' not in session: return redirect(url_for('login'))
    if request.method == 'POST':
        return redirect(url_for('clients'))
    return render_template('new_client.html', user=session['user'])

# ── API ENDPOINTS ──────────────────────────────────────────────────────────────
@app.route('/api/clients')
def api_clients():
    if 'user' not in session: return jsonify({'error':'unauthorized'}), 401
    try:
        from base44_client import get_clients
        clients = get_clients()
        return jsonify(clients)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate/<client_id>', methods=['POST'])
def api_generate(client_id):
    if 'user' not in session: return jsonify({'error':'unauthorized'}), 401
    try:
        from base44_client import get_client, mark_filed
        c = get_client(client_id)
        if not c:
            return jsonify({'error': 'Client not found'}), 404
        links, folder_url = generate_forms_for_client(c)
        mark_filed(client_id)
        return jsonify({'success': True, 'links': links, 'folder': folder_url})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats')
def api_stats():
    if 'user' not in session: return jsonify({'error':'unauthorized'}), 401
    try:
        from base44_client import get_all_clients
        all_clients = get_all_clients()
        total = len(all_clients)
        filed = sum(1 for c in all_clients if c.get('filing_status') == 'filed')
        pending = sum(1 for c in all_clients if c.get('filing_status') == 'pending')
        refunds = sum(float(c.get('refund_amount') or 0) for c in all_clients)
        return jsonify({
            'total': total, 'filed': filed, 'pending': pending,
            'pipeline': f"${refunds:,.2f}"
        })
    except Exception as e:
        return jsonify({'error': str(e), 'total':0,'filed':0,'pending':0,'pipeline':'$0'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
