# # v16-deployed-202605271909
#!/usr/bin/env python3
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import os, json, re, urllib.request, urllib.parse, fitz, base64, io, tempfile, secrets, time
from datetime import date

app = Flask(__name__)
app.secret_key = "taximizerpro-2026-italy"

ADMINS = {
    "taximizerpro@gmail.com":    {"pw": generate_password_hash("Italy2026!"),  "name": "Italy",         "role": "superadmin"},
    "mike.hennigan44@gmail.com": {"pw": generate_password_hash("Admin2026!"),  "name": "Mike Hennigan", "role": "admin"},
}

# In-memory reset tokens: {token: {email, expires}}
RESET_TOKENS = {}

# Pending account requests: {token: {email, name, password_hash, requested_at}}
PENDING_ACCOUNTS = {}

ADMIN_EMAILS = ["taximizerpro@gmail.com", "mike.hennigan44@gmail.com"]

MASTER_IDS = {
    '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
    '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
    '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
}
ROOT_FOLDER = "TaximizerPro V 2.0 Clients"
APP_ID = "6a13ae4b43ea85cec629af77"
_sync_secret  = "txpro-sync-2026-italy"

# ── STRICT APT FILTER — nothing blank/null/placeholder goes through ──────────
APT_JUNK = {"", "none", "null", "apt", "apt.", "#", "unit", "n/a", "na", "-", "optional"}

def clean_apt(val):
    """Return apt string only if it's a real value, else empty string."""
    v = str(val or "").strip()
    return "" if v.lower() in APT_JUNK else v

# ── Field maps (verified against IRS templates) ───────────────────────────────
# ── V16 LOCKED FIELD MAPS (verified 2026-05-27 from new templates) ─────────────
# Sign row boxes (from get_drawings()):
#   2023/2024: Box1 Sig x=91.6-273.6 y=462-492 | Box2 Date x=273.6-324 | Box3 Occ f2_33[0]
#   2025:      Box1 Sig x=91.6-273.6 y=636-666 | Box2 Date x=273.6-324 | Box3 Occ f2_40[0]
P1 = {
    '2023': {'f1_04[0]':'FM','f1_05[0]':'LN','f1_06[0]':'SSN','f1_10[0]':'ADDR','f1_12[0]':'CITY','f1_13[0]':'ST','f1_14[0]':'ZIP'},
    '2024': {'f1_04[0]':'FM','f1_05[0]':'LN','f1_06[0]':'SSN','f1_10[0]':'ADDR','f1_12[0]':'CITY','f1_13[0]':'ST','f1_14[0]':'ZIP'},
    '2025': {'f1_14[0]':'FM','f1_15[0]':'LN','f1_16[0]':'SSN','f1_20[0]':'ADDR','f1_22[0]':'CITY','f1_23[0]':'ST','f1_24[0]':'ZIP'},
}
APT_FIELD  = {'2023':'f1_11[0]','2024':'f1_11[0]','2025':'f1_21[0]'}
SINGLE_CHK = {'2023':'c1_3[1]', '2024':'c1_3[1]', '2025':'c1_3[1]'}
P2_BANK = {
    '2023': {'f2_25[0]':'RT','f2_26[0]':'AC'},
    '2024': {'f2_25[0]':'RT','f2_26[0]':'AC'},
    '2025': {'f2_32[0]':'RT','f2_33[0]':'AC'},
}
P2_BANK_CLEAR_2025 = ['f2_32[0]','f2_33[0]']   # clear "routing #"/"account #" watermarks
CHK2 = {'2023':'c2_5[0]','2024':'c2_5[0]','2025':'c2_16[0]'}
# Sign row — locked pixel coords
SIGN_CFG = {
    '2023': {'sig_y':488, 'sig_x0':95,  'sig_x1':270, 'date_x':275, 'occ_sn':'f2_33[0]'},
    '2024': {'sig_y':488, 'sig_x0':95,  'sig_x1':270, 'date_x':275, 'occ_sn':'f2_33[0]'},
    '2025': {'sig_y':662, 'sig_x0':95,  'sig_x1':270, 'date_x':275, 'occ_sn':'f2_40[0]'},
}
BAD_APT = {"","none","null","apt","apt.","#","unit","n/a","na","apt no","apt no.","-","optional"}

# ── Token store (refreshed by agent every ~45 min) ───────────────────────────
import threading as _threading
_tokens = {
    "drive": os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", ""),
    "gmail": os.environ.get("GMAIL_ACCESS_TOKEN", ""),
}
_tok_lock = _threading.Lock()

def dtok():
    with _tok_lock:
        t = _tokens.get("drive", "")
    return t or os.environ.get("DRIVE_ACCESS_TOKEN", "")
def gtok():
    with _tok_lock:
        t = _tokens.get("gmail", "")
    return t or os.environ.get("GMAIL_ACCESS_TOKEN_RENDER", "")

@app.route("/api/refresh-tokens", methods=["POST"])
def refresh_tokens():
    """Agent posts fresh OAuth tokens here. Protected by sync secret."""
    auth = request.headers.get("X-Sync-Secret", "")
    if auth != _sync_secret:
        return jsonify({"error": "forbidden"}), 403
    payload = request.json or {}
    with _tok_lock:
        if payload.get("drive"): _tokens["drive"] = payload["drive"]
        if payload.get("gmail"): _tokens["gmail"] = payload["gmail"]
    return jsonify({"ok": True})

def drive_get(url):
    req = urllib.request.Request(url, headers={"Authorization":f"Bearer {dtok()}"})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read())

def get_or_create_folder(name, parent=None):
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent: q += f" and '{parent}' in parents"
    r = drive_get(f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id)")
    if r.get("files"): return r["files"][0]["id"]
    meta = {"name":name,"mimeType":"application/vnd.google-apps.folder"}
    if parent: meta["parents"] = [parent]
    req = urllib.request.Request("https://www.googleapis.com/drive/v3/files",
        data=json.dumps(meta).encode(), method="POST",
        headers={"Authorization":f"Bearer {dtok()}","Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read())["id"]

def dl_template(fid):
    req = urllib.request.Request(f"https://www.googleapis.com/drive/v3/files/{fid}?alt=media",
        headers={"Authorization":f"Bearer {dtok()}"})
    with urllib.request.urlopen(req, timeout=30) as r: return r.read()

def upload_pdf(data, name, folder_id):
    meta = json.dumps({"name":name,"parents":[folder_id],"mimeType":"application/pdf"})
    bnd = "txbnd26"
    body = (f"--{bnd}\r\nContent-Type: application/json\r\n\r\n{meta}\r\n"
            f"--{bnd}\r\nContent-Type: application/pdf\r\n\r\n").encode() + data + f"\r\n--{bnd}--".encode()
    req = urllib.request.Request(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
        data=body, method="POST",
        headers={"Authorization":f"Bearer {dtok()}","Content-Type":f"multipart/related; boundary={bnd}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())
    return d.get("webViewLink", f"https://drive.google.com/file/d/{d['id']}/view")

def fill_form(tmpl_bytes, yr, c):
    """V16 — locked coordinates verified 2026-05-27."""
    today  = date.today().strftime("%m/%d/%Y")
    ssn    = re.sub(r"\D", "", str(c.get("ssn") or ""))
    fm     = (c.get("first_name","") + " " + (c.get("middle_init") or "")).strip()
    last   = (c.get("last_name") or "").strip()
    apt_raw = str(c.get("apt") or "").strip()
    apt    = "" if apt_raw.lower() in BAD_APT else apt_raw
    street = (c.get("address") or "").strip()
    city   = (c.get("city") or "").strip()
    state  = (c.get("state") or "").strip()
    zip_   = (c.get("zip") or "").strip()
    routing = (c.get("bank_routing") or "").strip()
    account = (c.get("bank_account") or "").strip()

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        tf.write(tmpl_bytes); tmpl_path = tf.name
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        tmp_path = tf.name
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        out_path = tf.name

    doc = fitz.open(tmpl_path)
    doc.save(tmp_path, garbage=4, deflate=True, incremental=False)
    doc.close()
    doc = fitz.open(tmp_path)

    def sf(pg, sn, val):
        for w in doc[pg].widgets():
            if w.field_name.split(".")[-1] == sn and w.field_type_string == "Text":
                w.field_value = str(val); w.update(); return True
        return False

    def clr(pg, sn):
        for w in doc[pg].widgets():
            if w.field_name.split(".")[-1] == sn and w.field_type_string == "Text":
                w.field_value = ""; w.update(); return True
        return False

    def chk(pg, sn):
        for w in doc[pg].widgets():
            if w.field_name.split(".")[-1] == sn and w.field_type_string == "CheckBox":
                w.field_value = True; w.update(); return True
        return False

    vals = {"FM":fm,"LN":last,"SSN":ssn,"ADDR":street,"CITY":city,"ST":state,"ZIP":zip_}

    # ── PAGE 1 ──────────────────────────────────────────────────
    if yr == "2025":
        # Clear watermarks first on 2025
        for sn in ["f1_14[0]","f1_15[0]","f1_16[0]","f1_20[0]","f1_21[0]","f1_22[0]","f1_23[0]","f1_24[0]"]:
            clr(0, sn)
    for sn, key in P1.get(yr, {}).items():
        if key == "SSN": continue  # SSN handled by two-pass text overlay below
        sf(0, sn, vals.get(key, ""))
    # Apt: always clear first, only write if real value
    apt_sn = APT_FIELD.get(yr)
    if apt_sn:
        clr(0, apt_sn)
        if apt:
            sf(0, apt_sn, apt)
    # Single checkbox
    single_sn = SINGLE_CHK.get(yr)
    if single_sn:
        chk(0, single_sn)

    # ── PAGE 2 — Bank ───────────────────────────────────────────
    # Clear 2025 watermarks
    if yr == "2025":
        for sn in P2_BANK_CLEAR_2025:
            clr(1, sn)
    for sn, key in P2_BANK.get(yr, {}).items():
        sf(1, sn, {"RT":routing,"AC":account}.get(key,""))
    chk2_sn = CHK2.get(yr)
    if chk2_sn:
        chk(1, chk2_sn)

    # ── PAGE 2 — Sign Row (v16 locked coords) ───────────────────
    cfg = SIGN_CFG.get(yr, {})
    sig_y   = cfg.get("sig_y", 488)
    sig_x0  = cfg.get("sig_x0", 95)
    sig_x1  = cfg.get("sig_x1", 270)
    date_x  = cfg.get("date_x", 275)
    occ_sn  = cfg.get("occ_sn", "f2_33[0]")

    # Signature: embed image if provided, else draw underline
    sig_data = c.get("signature_data","") or c.get("signature_url","")
    if sig_data and sig_data.startswith("data:image"):
        try:
            b64 = sig_data.split(",")[1]
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as sf2:
                sf2.write(base64.b64decode(b64)); sig_path = sf2.name
            sig_rect = fitz.Rect(sig_x0, sig_y - 16, sig_x1, sig_y + 2)
            doc[1].insert_image(sig_rect, filename=sig_path, keep_proportion=True)
            os.unlink(sig_path)
        except:
            doc[1].draw_line((sig_x0, sig_y), (sig_x1, sig_y), color=(0,0,0), width=0.5)
    else:
        doc[1].draw_line((sig_x0, sig_y), (sig_x1, sig_y), color=(0,0,0), width=0.5)

    # Date in Date column (Box 2)
    doc[1].insert_text((date_x, sig_y), today, fontname="helv", fontsize=7, color=(0,0,0))

    # Occupation: clear watermark, set HELPER
    clr(1, occ_sn)
    sf(1, occ_sn, "HELPER")

    # ── SSN: two-pass flatten approach ──
    # Clear the SSN widget (it was not filled in P1 loop, but clear anyway)
    # Then stamp as flat text in pass 2.
    p1 = doc[0]
    ssn_field_names = {'2023':'f1_06[0]', '2024':'f1_06[0]', '2025':'f1_16[0]'}
    ssn_fn = ssn_field_names.get(yr, 'f1_06[0]')
    ssn_rect_coords = None
    for w in p1.widgets():
        if w.field_name.split(".")[-1] == ssn_fn:
            r = w.rect
            ssn_rect_coords = (r.x0, r.y0, r.x1, r.y1)
            w.field_value = ""  # ensure widget is blank
            w.update()
            break

    # First save — writes all field data
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf2:
        pass1_path = tf2.name
    doc.save(pass1_path, garbage=4, deflate=True, incremental=False)
    doc.close()

    # Second pass — re-open, stamp SSN as flat text over blank comb area
    doc2 = fitz.open(pass1_path)
    if ssn and ssn_rect_coords:
        rx0, ry0, rx1, ry1 = ssn_rect_coords
        sr = fitz.Rect(rx0, ry0, rx1, ry1)
        doc2[0].draw_rect(sr, color=(1,1,1), fill=(1,1,1))
        formatted_ssn = ssn  # raw digits only — comb field has no room for dashes
        doc2[0].insert_text((rx0+3, ry1-2), formatted_ssn, fontname="helv", fontsize=8, color=(0,0,0))
    doc2.save(out_path, garbage=4, deflate=True, incremental=False)
    doc2.close()
    try: os.unlink(pass1_path)
    except: pass
    with open(out_path,"rb") as f2: result = f2.read()
    for p in [tmpl_path, tmp_path, out_path]:
        try: os.unlink(p)
        except: pass
    return result

def send_notification(to, first_name, links, last_name=""):
    rows = "".join(
        f'<tr><td style="padding:10px 16px;border-bottom:1px solid #e2e8f0">'
        f'<a href="{lnk}" style="color:#d97706;font-weight:bold">📄 {yr} Form 1040</a></td>'
        f'<td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px">View →</td></tr>'
        for yr,lnk in sorted(links.items())
    )
    html = (
        f'<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto">'
        f'<div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:20px 24px">'
        f'<span style="font-size:20px;font-weight:900;color:#fff">TaximizerPro</span>'
        f'<div style="color:rgba(255,255,255,.8);font-size:11px;margin-top:2px;">WE MOVE MONEY. YOU MOVE ON.™</div></div>'
        f'<div style="padding:24px;background:#fff;border:1px solid #e2e8f0">'
        f'<h2 style="color:#1e293b">Your Tax Forms Are Ready ✅</h2>'
        f'<p style="color:#475569">Hi <strong>{first_name}</strong>, your IRS 1040 forms have been prepared.</p>'
        f'<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">'
        f'<thead><tr style="background:#f8fafc">'
        f'<th style="padding:10px 16px;text-align:left;font-size:11px;color:#94a3b8">Document</th>'
        f'<th style="padding:10px 16px;text-align:left;font-size:11px;color:#94a3b8">Action</th></tr></thead>'
        f'<tbody>{rows}</tbody></table>'
        f'<p style="font-size:12px;color:#94a3b8;margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0">'
        f'Nobody controls the IRS — not even Italy, and that says a lot...<br>'
        f'<strong>TaximizerPro</strong></p></div></div>'
    )
    msg = (
        f"From: taximizerpro@gmail.com\r\nTo: {to}\r\n"
        f"Bcc: taximizerpro@gmail.com\r\n"
        f"Subject: ✅ {first_name} {last_name} — Tax Forms Ready — TaximizerPro\r\n"
        f"MIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{html}"
    )
    raw = base64.urlsafe_b64encode(msg.encode()).decode().rstrip("=")
    req = urllib.request.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=json.dumps({"raw":raw}).encode(), method="POST",
        headers={"Authorization":f"Bearer {gtok()}","Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=15) as r: return json.loads(r.read())

# ── Auth ──────────────────────────────────────────────────────────────────────
def logged_in(): return "user" in session

@app.route("/")
def index(): return redirect(url_for("login") if not logged_in() else url_for("dashboard"))

@app.route("/login", methods=["GET","POST"])
def login():
    error = None
    if request.method == "POST":
        email = request.form.get("email","").strip().lower()
        pw    = request.form.get("password","")
        match = next((k for k in ADMINS if k.lower() == email), None)
        if match and check_password_hash(ADMINS[match]["pw"], pw):
            session["user"] = {"email":match,"name":ADMINS[match]["name"],"role":ADMINS[match]["role"]}
            return redirect(url_for("dashboard"))
        error = "Invalid email or password."
    return render_template("login.html", error=error)

@app.route("/forgot-password", methods=["GET","POST"])
def forgot_password():
    sent = False
    error = None
    if request.method == "POST":
        email = request.form.get("email","").strip().lower()
        match = next((k for k in ADMINS if k.lower() == email), None)
        if match:
            token = secrets.token_urlsafe(32)
            RESET_TOKENS[token] = {"email": match, "expires": time.time() + 3600}
            reset_url = request.host_url.rstrip("/") + f"/reset-password/{token}"
            # Send email via Gmail API using stored token
            gmail_token = _tokens.get("gmail","")
            if gmail_token:
                html_body = f"""<div style="font-family:Arial,sans-serif;max-width:500px;padding:32px;background:#080F1E;color:#fff;border-radius:16px">
                  <div style="font-size:22px;font-weight:900;margin-bottom:16px">Taximizer<span style="color:#F59E0B">Pro</span></div>
                  <p style="color:#94A3B8;">A password reset was requested for your account.</p>
                  <p style="margin:24px 0;"><a href="{reset_url}" style="background:#F59E0B;color:#080F1E;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px">Reset My Password</a></p>
                  <p style="color:#475569;font-size:12px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
                </div>"""
                msg_parts = [
                    f"To: {match}",
                    "Subject: TaximizerPro — Password Reset",
                    "MIME-Version: 1.0",
                    "Content-Type: text/html; charset=UTF-8",
                    "",
                    html_body
                ]
                raw = base64.urlsafe_b64encode("\r\n".join(msg_parts).encode()).decode()
                import urllib.request as ur
                req = ur.Request(
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                    data=json.dumps({"raw": raw}).encode(),
                    headers={"Authorization": f"Bearer {gmail_token}", "Content-Type": "application/json"},
                    method="POST"
                )
                try: ur.urlopen(req)
                except: pass
            sent = True
        else:
            # Don't reveal if email exists — always show sent message
            sent = True
    return render_template("forgot_password.html", sent=sent, error=error)

@app.route("/reset-password/<token>", methods=["GET","POST"])
def reset_password(token):
    entry = RESET_TOKENS.get(token)
    if not entry or time.time() > entry["expires"]:
        return render_template("reset_password.html", expired=True, token=token)
    error = None
    success = False
    if request.method == "POST":
        pw1 = request.form.get("password","")
        pw2 = request.form.get("confirm","")
        if len(pw1) < 6:
            error = "Password must be at least 6 characters."
        elif pw1 != pw2:
            error = "Passwords do not match."
        else:
            email = entry["email"]
            ADMINS[email]["pw"] = generate_password_hash(pw1)
            del RESET_TOKENS[token]
            success = True
    return render_template("reset_password.html", expired=False, token=token, error=error, success=success)

@app.route("/request-account", methods=["GET","POST"])
def request_account():
    submitted = False
    error = None
    if request.method == "POST":
        name  = request.form.get("name","").strip()
        email = request.form.get("email","").strip().lower()
        pw    = request.form.get("password","")
        pw2   = request.form.get("confirm","")
        if not name or not email or not pw:
            error = "All fields are required."
        elif pw != pw2:
            error = "Passwords do not match."
        elif len(pw) < 6:
            error = "Password must be at least 6 characters."
        elif email in [k.lower() for k in ADMINS]:
            error = "An account with that email already exists."
        else:
            token = secrets.token_urlsafe(32)
            PENDING_ACCOUNTS[token] = {
                "email": email,
                "name": name,
                "pw_hash": generate_password_hash(pw),
                "requested_at": time.time()
            }
            # Email both admins
            gmail_token = _tokens.get("gmail","")
            if gmail_token:
                approve_url = request.host_url.rstrip("/") + f"/approve-account/{token}/approve"
                reject_url  = request.host_url.rstrip("/") + f"/approve-account/{token}/reject"
                html_body = f"""<div style="font-family:Arial,sans-serif;max-width:520px;padding:32px;background:#080F1E;color:#fff;border-radius:16px;">
                  <div style="font-size:22px;font-weight:900;margin-bottom:4px;">Taximizer<span style="color:#F59E0B">Pro</span></div>
                  <div style="color:#F59E0B;font-size:10px;font-weight:600;letter-spacing:2px;margin-bottom:24px;">NEW ACCOUNT REQUEST</div>
                  <p style="color:#94A3B8;margin:0 0 8px;">A new user is requesting access to TaximizerPro:</p>
                  <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:16px;margin:16px 0;">
                    <div style="color:#fff;font-weight:700;font-size:15px;">{name}</div>
                    <div style="color:#94A3B8;font-size:13px;">{email}</div>
                  </div>
                  <p style="color:#64748B;font-size:12px;margin-bottom:24px;">You must also assign their role after approving (Agent or Admin).</p>
                  <table style="width:100%;"><tr>
                    <td style="padding-right:8px;"><a href="{approve_url}" style="display:block;text-align:center;background:#22c55e;color:#fff;padding:12px;border-radius:8px;font-weight:700;text-decoration:none;font-size:13px;">✅ Approve</a></td>
                    <td style="padding-left:8px;"><a href="{reject_url}" style="display:block;text-align:center;background:#ef4444;color:#fff;padding:12px;border-radius:8px;font-weight:700;text-decoration:none;font-size:13px;">❌ Reject</a></td>
                  </tr></table>
                  <p style="color:#475569;font-size:11px;margin-top:24px;">This request will expire in 48 hours.</p>
                </div>"""
                import urllib.request as ur
                for admin_email in ADMIN_EMAILS:
                    msg_parts = [
                        f"To: {admin_email}",
                        "Subject: TaximizerPro — New Account Request",
                        "MIME-Version: 1.0",
                        "Content-Type: text/html; charset=UTF-8",
                        "",
                        html_body
                    ]
                    raw = base64.urlsafe_b64encode("\r\n".join(msg_parts).encode()).decode()
                    req = ur.Request(
                        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                        data=json.dumps({"raw": raw}).encode(),
                        headers={"Authorization": f"Bearer {gmail_token}", "Content-Type": "application/json"},
                        method="POST"
                    )
                    try: ur.urlopen(req)
                    except: pass
            submitted = True
    return render_template("request_account.html", submitted=submitted, error=error)

@app.route("/approve-account/<token>/<action>", methods=["GET","POST"])
def approve_account(token, action):
    entry = PENDING_ACCOUNTS.get(token)
    if not entry:
        return render_template("approve_account.html", status="expired")
    if time.time() - entry["requested_at"] > 172800:  # 48 hours
        del PENDING_ACCOUNTS[token]
        return render_template("approve_account.html", status="expired")

    if action == "reject":
        del PENDING_ACCOUNTS[token]
        return render_template("approve_account.html", status="rejected", name=entry["name"], email=entry["email"])

    # action == "approve" — show role picker on GET, process on POST
    if request.method == "POST":
        role = request.form.get("role","agent")
        email = entry["email"]
        ADMINS[email] = {"pw": entry["pw_hash"], "name": entry["name"], "role": role}
        del PENDING_ACCOUNTS[token]
        # Notify the new user
        gmail_token = _tokens.get("gmail","")
        if gmail_token:
            import urllib.request as ur
            html_body = f"""<div style="font-family:Arial,sans-serif;max-width:500px;padding:32px;background:#080F1E;color:#fff;border-radius:16px;">
              <div style="font-size:22px;font-weight:900;margin-bottom:16px;">Taximizer<span style="color:#F59E0B">Pro</span></div>
              <p style="color:#94A3B8;">Hi {entry['name']}, your account has been approved!</p>
              <p style="color:#94A3B8;">Your role: <strong style="color:#F59E0B;">{role.title()}</strong></p>
              <p style="margin:24px 0;"><a href="{request.host_url.rstrip('/')}/login" style="background:#F59E0B;color:#080F1E;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">Log In Now →</a></p>
            </div>"""
            msg_parts = [
                f"To: {email}",
                "Subject: TaximizerPro — Your Account is Approved",
                "MIME-Version: 1.0",
                "Content-Type: text/html; charset=UTF-8",
                "",
                html_body
            ]
            raw = base64.urlsafe_b64encode("\r\n".join(msg_parts).encode()).decode()
            req = ur.Request(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                data=json.dumps({"raw": raw}).encode(),
                headers={"Authorization": f"Bearer {gmail_token}", "Content-Type": "application/json"},
                method="POST"
            )
            try: ur.urlopen(req)
            except: pass
        return render_template("approve_account.html", status="approved", name=entry["name"], email=entry["email"], role=role)

    return render_template("approve_account.html", status="pending", token=token, name=entry["name"], email=entry["email"])

@app.route("/logout")
def logout(): session.clear(); return redirect(url_for("login"))

# ── Pages ─────────────────────────────────────────────────────────────────────
@app.route("/dashboard", methods=["GET","POST"])
def dashboard():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("dashboard.html", user=session["user"])

@app.route("/clients", methods=["GET","POST"])
def clients():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("clients.html", user=session["user"])

@app.route("/new-client", methods=["GET","POST"])
def new_client():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("new_client.html", user=session["user"])

@app.route("/tracker", methods=["GET","POST"])
def tracker():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("tracker.html", user=session["user"])

@app.route("/messages", methods=["GET","POST"])
def messages():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("messages.html", user=session["user"])

@app.route("/staff", methods=["GET","POST"])
def staff():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("staff.html", user=session["user"])

# ── API ───────────────────────────────────────────────────────────────────────
def b44_headers():
    key = os.environ.get("BASE44_API_KEY", "")
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

BASE44_HEADERS = b44_headers()  # static fallback — routes use b44_headers()
B44_BASE = f"https://app.base44.com/api/apps/{APP_ID}/entities/TaxClient"

@app.route("/api/clients")
def api_clients():
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    try:
        limit = request.args.get("limit", 500)
        url = f"{B44_BASE}?limit={limit}"
        req = urllib.request.Request(url, headers=b44_headers())
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        records = data if isinstance(data, list) else data.get("records", [])
        # Add full_name convenience field
        for r in records:
            if not r.get("full_name"):
                r["full_name"] = ((r.get("first_name") or "") + " " + (r.get("last_name") or "")).strip()
        return jsonify(records)
    except Exception as e:
        return jsonify([])

@app.route("/api/stats")
def api_stats():
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    try:
        url = f"{B44_BASE}?limit=500"
        req = urllib.request.Request(url, headers=b44_headers())
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        records = data if isinstance(data, list) else data.get("records", [])
        total     = len(records)
        filed     = sum(1 for c in records if c.get("filing_status") == "filed")
        prospects = sum(1 for c in records if c.get("filing_status") == "prospect")
        pending   = sum(1 for c in records if c.get("filing_status") in ("pending", None, ""))
        pipeline  = sum(float(c.get("refund_amount") or 0) for c in records)
        return jsonify({"total":total,"filed":filed,"pending":pending,"prospects":prospects,"pipeline":f"${pipeline:,.0f}"})
    except Exception as e:
        return jsonify({"total":"—","filed":"—","pending":"—","pipeline":"—"})

@app.route("/api/generate/<client_id>", methods=["POST"])
def api_generate(client_id):
    # Allow agent/backend calls via sync secret header (no session needed)
    api_auth = request.headers.get("X-Sync-Secret","")
    if not logged_in() and api_auth != _sync_secret:
        return jsonify({"error":"unauthorized"}), 401
    data = request.json or {}
    c = data.get("client", {})

    # If no client data but we have a real client_id, try to fetch from Base44
    if not c and client_id and client_id not in ("inline","test_v16"):
        try:
            base44_url = f"https://app.base44.com/api/apps/{APP_ID}/entities/TaxClient/{client_id}"
            b44_req = urllib.request.Request(base44_url,
                headers={"Authorization": f"Bearer {os.environ.get('BASE44_API_KEY','')}"})
            with urllib.request.urlopen(b44_req, timeout=10) as r:
                c = json.loads(r.read())
        except:
            pass

    if not c:
        return jsonify({"error":"no client data"}), 400

    try:
        years = [y.strip() for y in c.get("tax_year","").split(",") if y.strip() in MASTER_IDS]
        if not years: return jsonify({"error":"no valid tax years"}), 400
        today_str   = date.today().strftime("%m-%d-%Y")
        folder_name = (f"{c.get('last_name','').strip()}_"
                       f"{c.get('first_name','').strip()}_"
                       f"{today_str}_"
                       f"{'_'.join(sorted(years))}")
        root_id = get_or_create_folder(ROOT_FOLDER)
        cf      = get_or_create_folder(folder_name, root_id)
        folder_url = f"https://drive.google.com/drive/folders/{cf}"
        links   = {}
        for yr in years:
            tmpl_bytes = dl_template(MASTER_IDS[yr])
            pdf_bytes  = fill_form(tmpl_bytes, yr, c)
            fname = (f"{c.get('last_name','').strip()}_"
                     f"{c.get('first_name','').strip()}_"
                     f"{yr}_1040.pdf")
            links[yr] = upload_pdf(pdf_bytes, fname, cf)
        # Email client
        if c.get("email") and "@" in c.get("email",""):
            try: send_notification(c["email"], c.get("first_name",""), links, c.get("last_name",""))
            except: pass
        return jsonify({"success":True,"links":links,"folder_url":folder_url})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error":str(e)}), 500


@app.route("/prospects", methods=["GET","POST"])
def prospects():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("prospects.html", user=session["user"])

@app.route("/prospect/<prospect_id>")
def edit_prospect(prospect_id):
    if not logged_in(): return redirect(url_for("login"))
    return render_template("edit_prospect.html", user=session["user"], prospect_id=prospect_id)

@app.route("/api/prospect/save", methods=["POST"])
def api_prospect_save():
    """Save a new prospect (partial data, no tax generation)."""
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    data = request.json or {}
    # Strip empty strings to avoid polluting the entity
    payload = {k: v for k, v in data.items() if v not in (None, "", [])}
    payload["filing_status"] = "prospect"
    payload["irs_status"]    = "prospect"
    payload["current_step"]  = 0
    # Stub required schema fields so Base44 validation passes
    payload.setdefault("city",         payload.get("city",""))
    payload.setdefault("state",        payload.get("state",""))
    payload.setdefault("zip",          payload.get("zip",""))
    payload.setdefault("address",      payload.get("address",""))
    payload.setdefault("bank_routing", payload.get("bank_routing",""))
    payload.setdefault("bank_account", payload.get("bank_account",""))
    payload.setdefault("tax_year",     payload.get("tax_year","2025"))
    payload.setdefault("dob",          payload.get("dob","01/01/1900"))
    try:
        body = json.dumps(payload).encode()
        req  = urllib.request.Request(B44_BASE, data=body, method="POST",
                                      headers=b44_headers())
        with urllib.request.urlopen(req, timeout=15) as r:
            result = json.loads(r.read())
        return jsonify({"success": True, "id": result.get("id")})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/prospect/update/<prospect_id>", methods=["POST"])
def api_prospect_update(prospect_id):
    """Update an existing prospect record."""
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    data = request.json or {}
    payload = {k: v for k, v in data.items() if v not in (None, [], "")}
    try:
        url = f"{B44_BASE}/{prospect_id}"
        body = json.dumps(payload).encode()
        req  = urllib.request.Request(url, data=body, method="PUT",
                                      headers=b44_headers())
        with urllib.request.urlopen(req, timeout=15) as r:
            result = json.loads(r.read())
        return jsonify({"success": True, "record": result})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/prospect/<prospect_id>", methods=["GET"])
def api_prospect_get(prospect_id):
    """Fetch a single prospect record."""
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    try:
        url = f"{B44_BASE}/{prospect_id}"
        req = urllib.request.Request(url, headers=b44_headers())
        with urllib.request.urlopen(req, timeout=15) as r:
            return jsonify(json.loads(r.read()))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/prospects")
def api_prospects():
    """List all prospects."""
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    try:
        url = f"{B44_BASE}?limit=500"
        req = urllib.request.Request(url, headers=b44_headers())
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        records = data if isinstance(data, list) else data.get("records", [])
        prospects = [c for c in records if c.get("filing_status") == "prospect" or c.get("irs_status") == "prospect"]
        for p in prospects:
            if not p.get("full_name"):
                p["full_name"] = ((p.get("first_name") or "") + " " + (p.get("last_name") or "")).strip()
        return jsonify(prospects)
    except Exception as e:
        return jsonify([])

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    app.run(host="0.0.0.0", port=port, debug=False)

# ── In-memory client cache (synced by agent automation) ───────────────────────
import threading
_client_cache = []
_cache_lock   = threading.Lock()
_sync_secret  = "txpro-sync-2026-italy"

@app.route("/api/sync", methods=["POST"])
def api_sync():
    """Agent pushes fresh client data here every few minutes."""
    auth = request.headers.get("X-Sync-Secret","")
    if auth != _sync_secret:
        return jsonify({"error":"forbidden"}), 403
    payload = request.json or {}
    clients = payload.get("clients", [])
    with _cache_lock:
        global _client_cache
        _client_cache = clients
    return jsonify({"ok": True, "count": len(clients)})

@app.route("/api/cache-stats")
def api_cache_stats():
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    with _cache_lock:
        records = list(_client_cache)
    total    = len(records)
    filed    = sum(1 for c in records if c.get("filing_status") == "filed")
    pending  = sum(1 for c in records if c.get("filing_status") in ("pending", None, ""))
    pipeline = sum(float(c.get("refund_amount") or 0) for c in records)
    recent   = sorted(records, key=lambda x: x.get("created_date",""), reverse=True)[:5]
    return jsonify({"total":total,"filed":filed,"pending":pending,
                    "pipeline":f"${pipeline:,.0f}","recent":recent})

@app.route("/api/cache-clients")
def api_cache_clients():
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    with _cache_lock:
        records = list(_client_cache)
    for r in records:
        if not r.get("full_name"):
            r["full_name"] = ((r.get("first_name") or "") + " " + (r.get("last_name") or "")).strip()
    return jsonify(records)

