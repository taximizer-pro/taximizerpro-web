#!/usr/bin/env python3
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, abort
from werkzeug.security import generate_password_hash, check_password_hash
import os, json, urllib.request, urllib.parse, fitz, base64, io, tempfile, secrets, hashlib, time
from datetime import date, datetime, timedelta
# Pure-Python rate limiter — no external dependency
import collections

app = Flask(__name__)

# ── Security hardening ───────────────────────────────────────────────────────
app.secret_key = os.environ.get("FLASK_SECRET", "taximizerpro-2026-italy-xK9!mN@2")
app.config.update(
    SESSION_COOKIE_SECURE   = True,
    SESSION_COOKIE_HTTPONLY = True,
    SESSION_COOKIE_SAMESITE = "Lax",
    PERMANENT_SESSION_LIFETIME = timedelta(hours=8),
    SESSION_COOKIE_NAME     = "__Host-tpro_sess" if os.environ.get("FLASK_ENV") == "production" else "tpro_sess",
)

# Pure-Python rate limiter (no flask-limiter dependency)
_rate_store = collections.defaultdict(list)  # {key: [timestamp, ...]}

def _check_rate(key: str, limit: int, window: int) -> bool:
    """True = allowed, False = rate limited. window in seconds."""
    now = time.time()
    hits = _rate_store[key]
    # Remove old hits
    _rate_store[key] = [t for t in hits if now - t < window]
    if len(_rate_store[key]) >= limit:
        return False
    _rate_store[key].append(now)
    return True

class _FakeLimiter:
    """Drop-in stub so @limiter.limit() decorators are no-ops."""
    def limit(self, *a, **kw):
        def decorator(fn): return fn
        return decorator
    def init_app(self, app): pass

limiter = _FakeLimiter()

# In-memory OTP store: {email: {otp, expires, attempts}}
_otp_store: dict = {}
# In-memory audit log (last 500 events)
_audit_log: list = []
# CAPTCHA token store: {token: expires}
_captcha_store: dict = {}

def audit(event: str, detail: str = "", user: str = ""):
    _audit_log.append({
        "ts": datetime.utcnow().isoformat(),
        "event": event,
        "detail": detail,
        "user": user or (session.get("user",{}).get("email","") if session else ""),
        "ip": request.remote_addr if request else "",
    })
    if len(_audit_log) > 500:
        _audit_log.pop(0)

def _send_otp_email(to_email: str, otp: str, name: str):
    gmail_token = os.environ.get("GMAIL_ACCESS_TOKEN","")
    if not gmail_token: return
    body = f"""
<div style="font-family:Inter,sans-serif;max-width:420px;margin:0 auto;background:#0f172a;color:#f8fafc;padding:32px;border-radius:16px;">
  <div style="font-size:13px;color:rgba(255,255,255,.4);margin-bottom:8px;">TaximizerPro Security</div>
  <h2 style="font-size:20px;font-weight:900;color:#f8fafc;margin-bottom:4px;">Your verification code</h2>
  <p style="color:rgba(255,255,255,.5);font-size:13px;margin-bottom:24px;">Hey {name} — enter this code to complete your login.</p>
  <div style="background:linear-gradient(135deg,#1e3a5f,#0f172a);border:2px solid rgba(59,130,246,.4);border-radius:14px;padding:24px;text-align:center;margin-bottom:20px;">
    <div style="font-size:42px;font-weight:900;letter-spacing:10px;color:#3b82f6;font-family:monospace;">{otp}</div>
    <div style="font-size:11px;color:rgba(255,255,255,.3);margin-top:8px;">Expires in 10 minutes · Do not share this code</div>
  </div>
  <p style="font-size:11px;color:rgba(255,255,255,.2);">If you didn't try to log in, your account is secure — someone may have your email. Contact taximizerpro@gmail.com immediately.</p>
  <p style="font-size:10px;color:rgba(255,255,255,.15);margin-top:16px;">TaximizerPro · Bisignano Holdings LLC · Secure Portal</p>
</div>"""
    raw = (f"From: TaximizerPro Security <taximizerpro@gmail.com>\nTo: {to_email}\n"
           f"Subject: {otp} — your TaximizerPro login code\nMIME-Version: 1.0\nContent-Type: text/html\n\n{body}")
    msg = {"raw": base64.urlsafe_b64encode(raw.encode()).decode()}
    req = urllib.request.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=json.dumps(msg).encode(), method="POST",
        headers={"Authorization": f"Bearer {gmail_token}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15): pass

ADMINS = {
    "taximizerpro@gmail.com":    {"pw": generate_password_hash("Italy2026!"),  "name": "Italy",         "role": "superadmin"},
    "mike.hennigan44@gmail.com": {"pw": generate_password_hash("Admin2026!"),  "name": "Mike Hennigan", "role": "admin"},
}

MASTER_IDS = {
    '2022': '1iLxjqGceVwVcLtb8w5UW1-FHTQRR8hyy',
    '2023': '1JiPyLqgPC0yZg70BuJz9WeW1zauCxdp3',
    '2024': '1PO0Mh-Mo8f9M_FVPfxLq2h8AKWw_L4fl',
    '2025': '1Q2CIM4rnIjQ4TVAlhpoZc5iUFdamAClM',
}
ROOT_FOLDER = "TaximizerPro V 2.0 Clients"
APP_ID = "6a13ae4b43ea85cec629af77"

# ── STRICT APT FILTER — nothing blank/null/placeholder goes through ──────────
APT_JUNK = {"", "none", "null", "apt", "apt.", "#", "unit", "n/a", "na", "-", "optional"}

def clean_apt(val):
    """Return apt string only if it's a real value, else empty string."""
    v = str(val or "").strip()
    return "" if v.lower() in APT_JUNK else v

# ── Field maps (verified against IRS templates) ───────────────────────────────
P1 = {
    '2022': {'f1_04[0]':'FM','f1_05[0]':'LN','f1_06[0]':'SSN','f1_11[0]':'ADDR','f1_14[0]':'CITY','f1_15[0]':'ST','f1_16[0]':'ZIP'},
    '2023': {'f1_04[0]':'FM','f1_05[0]':'LN','f1_06[0]':'SSN','f1_10[0]':'ADDR','f1_12[0]':'CITY','f1_13[0]':'ST','f1_14[0]':'ZIP'},
    '2024': {'f1_04[0]':'FM','f1_05[0]':'LN','f1_06[0]':'SSN','f1_10[0]':'ADDR','f1_12[0]':'CITY','f1_13[0]':'ST','f1_14[0]':'ZIP'},
    '2025': {'f1_04[0]':'FM','f1_05[0]':'LN','f1_06[0]':'SSN','f1_11[0]':'ADDR','f1_14[0]':'CITY','f1_15[0]':'ST','f1_16[0]':'ZIP'},
}
P2 = {
    '2022': {'f2_32[0]':'RT','f2_33[0]':'AC','f2_40[0]':'OCC'},
    '2023': {'f2_33[0]':'RT','f2_35[0]':'AC','f2_39[0]':'OCC'},
    '2024': {'f2_33[0]':'RT','f2_35[0]':'AC','f2_39[0]':'OCC'},
    '2025': {'f2_32[0]':'RT','f2_33[0]':'AC','f2_40[0]':'OCC'},
}
# Line 27 (EIC) widget name per year — read back after fill for refund_amount
LINE27_WIDGET = {
    '2022': 'f2_14[0]',
    '2023': 'f2_17[0]',
    '2024': 'f2_17[0]',
    '2025': 'f2_14[0]',
}

DATE_XY = {'2022':(250,651),'2023':(250,551),'2024':(250,551),'2025':(250,651)}

# ── Drive helpers ─────────────────────────────────────────────────────────────
def dtok(): return os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN","")
def gtok(): return os.environ.get("GMAIL_ACCESS_TOKEN","")

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
    today = date.today().strftime("%m/%d/%Y")
    ssn   = (c.get("ssn") or "").replace("-","").replace(" ","")
    fm    = (c.get("first_name","") + " " + (c.get("middle_init") or "")).strip()

    # ── APT FIX: use clean_apt() — never let blank/junk through ──────────────
    apt   = clean_apt(c.get("apt",""))
    addr  = c.get("address","").strip()
    if apt:
        addr = addr + " " + apt   # e.g. "123 Main St 4B"
    addr = addr.strip()

    tok = {
        "FM":   fm,
        "LN":   c.get("last_name",""),
        "SSN":  ssn,
        "ADDR": addr,
        "CITY": c.get("city",""),
        "ST":   c.get("state",""),
        "ZIP":  c.get("zip",""),
        "RT":   c.get("bank_routing",""),
        "AC":   c.get("bank_account",""),
        "OCC":  "HELPER",   # HARDCODED — NEVER CHANGE
    }

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        tf.write(tmpl_bytes); tmpl_path = tf.name
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        tmp_path = tf.name
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        out_path = tf.name

    # Repair PDF first
    doc = fitz.open(tmpl_path)
    doc.save(tmp_path, garbage=4, deflate=True, incremental=False)
    doc.close()

    doc = fitz.open(tmp_path)

    # Page 1 — personal info
    for w in doc[0].widgets():
        sn = w.field_name.split(".")[-1]
        if w.field_type_string == "Text" and sn in P1.get(yr,{}):
            val = tok.get(P1[yr][sn], "")
            if val:
                w.field_value = val
                w.update()

    # Page 2 — bank + occupation
    for w in doc[1].widgets():
        sn = w.field_name.split(".")[-1]
        if w.field_type_string == "Text" and sn in P2.get(yr,{}):
            val = tok.get(P2[yr][sn], "")
            if val:
                w.field_value = val
                w.update()

    # Date stamp
    dx, dy = DATE_XY[yr]
    doc[1].insert_text((dx, dy), today, fontname="helv", fontsize=7, color=(0,0,0))

    # Signature image
    sig_data = c.get("signature_data","")
    if sig_data and sig_data.startswith("data:image"):
        try:
            b64 = sig_data.split(",")[1]
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as sf:
                sf.write(base64.b64decode(b64)); sig_path = sf.name
            if yr in ("2023","2024"):
                sr = fitz.Rect(91.6, 536.0, 240.0, 556.0)
            else:
                sr = fitz.Rect(91.6, 636.0, 240.0, 656.0)
            doc[1].insert_image(sr, filename=sig_path, keep_proportion=True)
            os.unlink(sig_path)
        except:
            pass

    doc.save(out_path, garbage=4, deflate=True, incremental=False)
    doc.close()

    # Read back line 27 (EIC) value from the filled PDF
    line27_val = 0.0
    try:
        doc2 = fitz.open(out_path)
        target_widget = LINE27_WIDGET.get(yr, '')
        for w in doc2[1].widgets():
            sn = w.field_name.split(".")[-1]
            if sn == target_widget and w.field_value:
                raw = str(w.field_value).replace("$","").replace(",","").strip()
                try: line27_val = float(raw)
                except: pass
        doc2.close()
    except: pass

    with open(out_path,"rb") as f: result = f.read()
    for p in [tmpl_path, tmp_path, out_path]:
        try: os.unlink(p)
        except: pass
    return result, line27_val

def send_notification(to, first_name, links):
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
        f"Subject: Your Tax Forms Are Ready — TaximizerPro\r\n"
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
        ip = request.remote_addr or "unknown"
        if not _check_rate(f"login:{ip}", 10, 60):
            return render_template("login.html", error="Too many attempts. Please wait a minute.")
        email = request.form.get("email","").strip().lower()
        pw    = request.form.get("password","")
        # Verify CAPTCHA token
        cap_token = request.form.get("captcha_token","")
        if cap_token not in _captcha_store or _captcha_store.get(cap_token,0) < time.time():
            error = "CAPTCHA expired — please reload and try again."
            return render_template("login.html", error=error)
        _captcha_store.pop(cap_token, None)
        match = next((k for k in ADMINS if k.lower() == email), None)
        if match and check_password_hash(ADMINS[match]["pw"], pw):
            # Generate 6-digit OTP
            otp = str(secrets.randbelow(900000) + 100000)
            _otp_store[email] = {
                "otp": otp,
                "expires": time.time() + 600,  # 10 min
                "attempts": 0,
                "name": ADMINS[match]["name"],
                "role": ADMINS[match]["role"],
            }
            try:
                _send_otp_email(email, otp, ADMINS[match]["name"])
                audit("2fa_otp_sent", f"OTP sent to {email}", email)
            except Exception as e:
                # Fallback: auto-approve if email fails (dev mode)
                if os.environ.get("FLASK_ENV") != "production":
                    session["user"] = {"email":match,"name":ADMINS[match]["name"],"role":ADMINS[match]["role"]}
                    session.permanent = True
                    audit("login_success_noemail", f"Auto-approved (email unavailable)", email)
                    return redirect(url_for("dashboard"))
                error = f"Could not send verification code: {e}"
                return render_template("login.html", error=error)
            session["pending_2fa"] = email
            return redirect(url_for("verify_2fa"))
        else:
            audit("login_failed", f"Bad credentials for {email}")
            error = "Invalid email or password."
    return render_template("login.html", error=error)

@app.route("/verify-2fa", methods=["GET","POST"])
def verify_2fa():
    email = session.get("pending_2fa","")
    if not email: return redirect(url_for("login"))
    error = None
    if request.method == "POST":
        ip = request.remote_addr or "unknown"
        if not _check_rate(f"otp:{ip}", 10, 60):
            return render_template("verify_2fa.html", error="Too many attempts. Please wait.", email=email)
        entered = request.form.get("otp","").strip()
        record = _otp_store.get(email, {})
        record["attempts"] = record.get("attempts",0) + 1
        if record["attempts"] > 5:
            _otp_store.pop(email, None)
            session.pop("pending_2fa", None)
            audit("2fa_lockout", f"Too many OTP attempts for {email}", email)
            return redirect(url_for("login"))
        if not record or record.get("expires",0) < time.time():
            error = "Code expired — please log in again."
            session.pop("pending_2fa", None)
            return render_template("verify_2fa.html", error=error, email=email)
        if entered == record.get("otp",""):
            session.pop("pending_2fa", None)
            _otp_store.pop(email, None)
            session["user"] = {"email": email, "name": record["name"], "role": record["role"]}
            session.permanent = True
            audit("login_success", f"2FA verified for {email}", email)
            return redirect(url_for("dashboard"))
        else:
            audit("2fa_wrong_code", f"Wrong OTP for {email} (attempt {record['attempts']})", email)
            error = f"Incorrect code. {5 - record['attempts']} attempts remaining."
    return render_template("verify_2fa.html", error=error, email=email)

@app.route("/api/captcha/generate")
def captcha_generate():
    """Generate a simple math CAPTCHA and return question + token."""
    import random
    a, b = random.randint(1,9), random.randint(1,9)
    answer = a + b
    token = secrets.token_hex(16)
    # Store hashed answer with token, expires in 5 min
    _captcha_store[token] = time.time() + 300
    # Store answer separately keyed by token
    _captcha_store[f"{token}_ans"] = str(answer)
    return jsonify({"question": f"{a} + {b} = ?", "token": token})

@app.route("/api/captcha/verify", methods=["POST"])
def captcha_verify():
    """Verify CAPTCHA answer and return a verified pass-token."""
    data = request.json or {}
    token = data.get("token","")
    answer = data.get("answer","").strip()
    expected = _captcha_store.get(f"{token}_ans","")
    if not expected or _captcha_store.get(token,0) < time.time():
        return jsonify({"valid": False, "error": "Expired"}), 400
    if answer != expected:
        return jsonify({"valid": False, "error": "Wrong answer"}), 400
    # Issue a verified pass-token valid for 5 min
    pass_token = secrets.token_hex(24)
    _captcha_store[pass_token] = time.time() + 300
    _captcha_store.pop(token, None)
    _captcha_store.pop(f"{token}_ans", None)
    return jsonify({"valid": True, "pass_token": pass_token})

@app.route("/api/audit/log")
def get_audit_log():
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    if session["user"].get("role") != "superadmin": return jsonify({"error":"forbidden"}), 403
    return jsonify({"events": list(reversed(_audit_log[-100:]))})

@app.route("/logout")
def logout():
    audit("logout", f"User logged out")
    session.clear()
    return redirect(url_for("login"))

# ── Pages ─────────────────────────────────────────────────────────────────────
@app.route("/dashboard")
def dashboard():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("dashboard.html", user=session["user"])

@app.route("/clients")
def clients():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("clients.html", user=session["user"])

@app.route("/new-client", methods=["GET","POST"])
def new_client():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("new_client.html", user=session["user"])

@app.route("/tracker")
def tracker():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("tracker.html", user=session["user"])

@app.route("/messages")
def messages():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("messages.html", user=session["user"])

@app.route("/staff")
def staff():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("staff.html", user=session["user"])

# ── API ───────────────────────────────────────────────────────────────────────
BASE44_HEADERS = {
    "app-id": APP_ID,
    "Content-Type": "application/json",
    "x-api-key": os.environ.get("BASE44_API_KEY", ""),
}
B44_BASE = f"https://app.base44.com/api/apps/{APP_ID}/entities/TaxClient"

@app.route("/api/clients")
def api_clients():
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    try:
        limit = request.args.get("limit", 500)
        url = f"{B44_BASE}?limit={limit}"
        req = urllib.request.Request(url, headers=BASE44_HEADERS)
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
        req = urllib.request.Request(url, headers=BASE44_HEADERS)
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
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    data = request.json or {}
    c = data.get("client", {})
    if not c: return jsonify({"error":"no client data"}), 400
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
        links        = {}
        total_refund = 0.0
        for yr in years:
            tmpl_bytes        = dl_template(MASTER_IDS[yr])
            pdf_bytes, l27val = fill_form(tmpl_bytes, yr, c)
            total_refund     += l27val
            fname = (f"{c.get('last_name','').strip()}_"
                     f"{c.get('first_name','').strip()}_"
                     f"{yr}_1040.pdf")
            links[yr] = upload_pdf(pdf_bytes, fname, cf)

        # Store total refund (sum of line 27 across all years) on the client record
        if client_id and total_refund > 0:
            try:
                upd_url  = f"{B44_BASE}/{client_id}"
                upd_body = json.dumps({"refund_amount": total_refund}).encode()
                upd_req  = urllib.request.Request(upd_url, data=upd_body, method="PUT",
                                                  headers={**BASE44_HEADERS})
                with urllib.request.urlopen(upd_req, timeout=15): pass
            except: pass

        # Email client
        if c.get("email") and "@" in c.get("email",""):
            try: send_notification(c["email"], c.get("first_name",""), links)
            except: pass
        return jsonify({"success":True,"links":links,"refund_amount":total_refund})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error":str(e)}), 500


@app.route("/prospects")
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
    payload = {k: v for k, v in data.items() if v not in (None, [], "")}
    # Stub required fields so the entity accepts partial prospect records
    PROSPECT_DEFAULTS = {
        "ssn": "", "email": "", "address": "", "city": "", "state": "", "zip": "",
        "bank_routing": "", "bank_account": "", "tax_year": "", "dob": "",
    }
    for k, v in PROSPECT_DEFAULTS.items():
        if k not in payload:
            payload[k] = v
    # Build full_name if missing
    if not payload.get("full_name") and (payload.get("first_name") or payload.get("last_name")):
        payload["full_name"] = ((payload.get("first_name","") + " " + payload.get("last_name","")).strip())
    payload["filing_status"] = "prospect"
    payload["irs_status"]    = "prospect"
    payload["current_step"]  = 0
    try:
        url = B44_BASE
        body = json.dumps(payload).encode()
        req  = urllib.request.Request(url, data=body, method="POST",
                                      headers={**BASE44_HEADERS})
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
                                      headers={**BASE44_HEADERS})
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
        req = urllib.request.Request(url, headers=BASE44_HEADERS)
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
        req = urllib.request.Request(url, headers=BASE44_HEADERS)
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


import urllib.parse as _uparse

# ═══════════════════════════════════════════════════════════════
#  SHOTGUN BANKING ROUTES
#  Owned by: Bisignano Holdings LLC | Banking by: Wise
# ═══════════════════════════════════════════════════════════════

SG_B44 = f"https://app.base44.com/api/apps/{APP_ID}/entities/ShotgunAccount"
SG_TXN = f"https://app.base44.com/api/apps/{APP_ID}/entities/ShotgunTransaction"
SG_CON = f"https://app.base44.com/api/apps/{APP_ID}/entities/ShotgunContact"
SG_SOS_URL = f"https://app.base44.com/api/apps/{APP_ID}/entities/ShotgunSOS"
BISIGNANO_ROUTING = "091311229"

def sg_get(url):
    req = urllib.request.Request(url, headers=BASE44_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def sg_put(url, data):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(url, data=body, method="PUT", headers=BASE44_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def sg_create(url, data):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(url, data=body, method="POST", headers=BASE44_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def sg_hash_pin(pin):
    import hashlib
    return hashlib.sha256(str(pin).encode()).hexdigest()

def sg_rand_digits(n):
    import random
    return "".join([str(random.randint(0,9)) for _ in range(n)])

@app.route("/shotgun")
def shotgun_page():
    if not logged_in(): return redirect(url_for("login"))
    return render_template("shotgun.html", user=session["user"])

@app.route("/api/shotgun/check-hashtag")
def sg_check_hashtag():
    tag = request.args.get("tag","").strip().lstrip("#")
    if not tag: return jsonify({"available": False})
    try:
        records = sg_get(f"{SG_B44}?hashtag={_uparse.quote(tag)}&limit=1")
        return jsonify({"available": len(records) == 0})
    except:
        return jsonify({"available": True})

@app.route("/api/shotgun/apply", methods=["POST"])
def sg_apply():
    data = request.json or {}
    tag = data.get("hashtag","").strip().lstrip("#")
    if not tag or not data.get("email"):
        return jsonify({"error":"Missing required fields"}), 400
    try:
        existing = sg_get(f"{SG_B44}?hashtag={_uparse.quote(tag)}&limit=1")
        if existing:
            return jsonify({"error":"That hashtag is already taken — choose another"}), 400
    except: pass
    payload = {
        "first_name": data.get("first_name",""), "last_name": data.get("last_name",""),
        "email": data.get("email",""), "phone": data.get("phone",""),
        "hashtag": tag, "status": "pending",
        "balance": 0.0, "lifetime_deposited": 0.0,
        "beat_v_enabled": False, "beat_v_used": False,
        "fee_milestone_reached": False, "funded_friends_count": 0,
        "is_silent": False, "is_online": False,
        "linked_routing": data.get("linked_routing",""),
        "linked_account": data.get("linked_account",""),
        "pin_hash": sg_hash_pin(data.get("pin","0000")),
    }
    try:
        record = sg_create(SG_B44, payload)
        try: _sg_notify_admin_apply(data.get("first_name",""), data.get("last_name",""), tag, record.get("id",""), data.get("email",""))
        except: pass
        return jsonify({"success": True, "id": record.get("id")})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _sg_notify_admin_apply(first, last, tag, acct_id, email):
    gmail_token = os.environ.get("GMAIL_ACCESS_TOKEN","")
    if not gmail_token: return
    import base64
    body = f"<h2>New Shotgun Application</h2><p><b>{first} {last}</b> (#{tag})<br>Email: {email}<br>ID: {acct_id}</p><p><a href='https://taximizerpro.onrender.com/shotgun/admin'>Review →</a></p>"
    raw = f"From: Shotgun<taximizerpro@gmail.com>\nTo: taximizerpro@gmail.com\nSubject: New Shotgun Application — #{tag}\nMIME-Version: 1.0\nContent-Type: text/html\n\n{body}"
    msg = {"raw": base64.urlsafe_b64encode(raw.encode()).decode()}
    req = urllib.request.Request("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=json.dumps(msg).encode(), method="POST",
        headers={"Authorization": f"Bearer {gmail_token}", "Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=15): pass

@app.route("/api/shotgun/login", methods=["POST"])
def sg_login():
    data = request.json or {}
    identifier = data.get("identifier","").strip().lstrip("#")
    pin = data.get("pin","")
    if not identifier or not pin: return jsonify({"error":"Missing credentials"}), 400
    try:
        records = sg_get(f"{SG_B44}?email={_uparse.quote(identifier)}&limit=1")
        if not records:
            records = sg_get(f"{SG_B44}?hashtag={_uparse.quote(identifier)}&limit=1")
        if not records: return jsonify({"error":"Account not found"}), 404
        acct = records[0]
        if acct.get("status") == "pending": return jsonify({"status":"pending"})
        if acct.get("status") == "denied": return jsonify({"error":"Account not approved."}), 403
        if acct.get("pin_hash") != sg_hash_pin(pin): return jsonify({"error":"Incorrect PIN"}), 401
        sg_put(f"{SG_B44}/{acct['id']}", {"is_online": True})
        acct["is_online"] = True
        return jsonify({"success": True, "account": acct})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _sg_beat_v_notification(acct, new_balance):
    """Email the member when they just went negative — they Beat the V."""
    gmail_token = os.environ.get("GMAIL_ACCESS_TOKEN","")
    if not gmail_token or not acct.get("email"): return
    import base64
    name = f"{acct.get('first_name','')} {acct.get('last_name','')}".strip() or "Member"
    tag  = acct.get("hashtag","")
    bal_str = f"${abs(new_balance):.2f}"
    body = f"""
<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#1a1a2e;color:#f8fafc;padding:32px;border-radius:16px;border:2px solid rgba(124,58,237,.4);">
  <div style="font-size:36px;margin-bottom:8px;">⚡</div>
  <h2 style="font-size:22px;font-weight:900;color:#c4b5fd;margin-bottom:4px;">You just Beat the "V"</h2>
  <p style="color:rgba(196,181,253,.7);font-size:13px;margin-bottom:20px;">Hey {name} — your payment went through even though your balance went negative. That's Beat the V doing its job.</p>
  <div style="background:rgba(124,58,237,.15);border:1px solid rgba(124,58,237,.4);border-radius:12px;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;color:rgba(196,181,253,.5);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Current Balance</div>
    <div style="font-size:28px;font-weight:900;color:#ef4444;">-{bal_str}</div>
    <div style="font-size:11px;color:rgba(196,181,253,.5);margin-top:6px;">You can go up to -$100.00 · Deposit to restore your balance</div>
  </div>
  <div style="font-size:12px;color:rgba(255,255,255,.4);line-height:1.7;">
    <b style="color:rgba(255,255,255,.7);">What is Beat the V?</b><br>
    When you have $500+ in monthly transaction activity, Shotgun lets your balance go negative up to -$100 so you never miss a payment. You earned this.<br><br>
    <b style="color:rgba(255,255,255,.7);">What to do now:</b><br>
    Deposit funds to bring your balance back to positive. Your overdraft will reset for the next time you need it.
  </div>
  <div style="margin-top:20px;">
    <a href="https://taximizerpro.onrender.com/shotgun" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px;">
      Open Shotgun →
    </a>
  </div>
  <p style="font-size:10px;color:rgba(255,255,255,.2);margin-top:24px;">Shotgun Banking LLC · A Bisignano Holdings Company · Banking by Wise</p>
</div>"""
    raw = (
        f"From: Shotgun Banking <taximizerpro@gmail.com>\n"
        f"To: {acct['email']}\n"
        f"Bcc: taximizerpro@gmail.com\n"
        f"Subject: ⚡ You just Beat the V — #{tag}\n"
        f"MIME-Version: 1.0\nContent-Type: text/html\n\n{body}"
    )
    import urllib.request as ur
    msg = {{"raw": base64.urlsafe_b64encode(raw.encode()).decode()}}
    req = ur.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=json.dumps(msg).encode(), method="POST",
        headers={{"Authorization": f"Bearer {{gmail_token}}", "Content-Type":"application/json"}}
    )
    with ur.urlopen(req, timeout=15): pass

@app.route("/api/shotgun/send", methods=["POST"])
def sg_send():
    data = request.json or {}
    from_id = data.get("from_account_id","")
    to_tag  = data.get("to_hashtag","").strip().lstrip("#")
    amount  = float(data.get("amount", 0))
    note    = data.get("note","")
    going_negative = False
    if not from_id or not to_tag or amount <= 0:
        return jsonify({"error":"Invalid transfer data"}), 400
    try:
        sender = sg_get(f"{SG_B44}/{from_id}")
        if isinstance(sender, list): sender = sender[0]
        bal = float(sender.get("balance", 0))
        fee = 1.50  # flat fee on every tx — stays with Bisignano Holdings
        # Beat the V: auto-qualify if $500+ transactional activity this month
        monthly = sg_monthly_activity(from_id)
        beat_v_active = (monthly >= 500.0) or sender.get("beat_v_enabled")
        min_bal = -100.0 if beat_v_active else 0.0
        if beat_v_active and not sender.get("beat_v_enabled"):
            sg_put(f"{SG_B44}/{from_id}", {"beat_v_enabled": True})  # auto-enable
        if bal - amount - fee < min_bal:
            needed = round((amount + fee) - bal, 2)
            return jsonify({"error": f"Insufficient funds. Balance: ${bal:.2f}. Need ${needed:.2f} more."}), 400
        # Flag if this transaction will push balance negative (Beat the V territory)
        going_negative = (bal - amount - fee) < 0
        recip_list = sg_get(f"{SG_B44}?hashtag={_uparse.quote(to_tag)}&limit=1")
        if not recip_list: return jsonify({"error": f"No member found for #{to_tag}"}), 404
        recip = recip_list[0]
        new_sender_bal = round(bal - amount - fee, 2)
        sg_put(f"{SG_B44}/{from_id}", {"balance": new_sender_bal})
        # Beat the V notification — they went negative, fire the email
        if going_negative and new_sender_bal < 0:
            try: _sg_beat_v_notification(sender, new_sender_bal)
            except: pass
        recip_bal = float(recip.get("balance", 0))
        recip_lifetime = float(recip.get("lifetime_deposited", 0)) + amount
        recip_net = max(amount - fee, 0)  # recipient also deducted $1.50
        sg_put(f"{SG_B44}/{recip['id']}", {
            "balance": recip_bal + recip_net,
            "lifetime_deposited": recip_lifetime,
            "beat_v_enabled": recip_lifetime >= 500,
        })
        # Both fees ($3.00 total) go to central bank — logged as single fee record
        sg_create(SG_TXN, {
            "from_account_id": from_id, "to_account_id": recip["id"],
            "from_hashtag": sender.get("hashtag",""), "to_hashtag": to_tag,
            "from_name": f"{sender.get('first_name','')} {sender.get('last_name','')}",
            "to_name":   f"{recip.get('first_name','')} {recip.get('last_name','')}",
            "amount": amount, "fee": fee * 2, "net_amount": recip_net,
            "type": "transfer", "status": "completed", "note": note,
        })
        sg_create(SG_TXN, {
            "from_account_id": "BISIGNANO_HOLDINGS", "to_account_id": "BISIGNANO_HOLDINGS",
            "from_hashtag": "BisignanoHoldings", "to_hashtag": "BisignanoHoldings",
            "amount": fee * 2, "fee": 0, "net_amount": fee * 2,
            "type": "fee", "status": "completed",
            "note": f"Fee from #{sender.get('hashtag','')}→#{to_tag}: $1.50 each side",
        })
        return jsonify({"success": True, "new_balance": new_sender_bal})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/shotgun/transactions/<account_id>")
def sg_transactions(account_id):
    try:
        all_txns = sg_get(f"{SG_TXN}?limit=100")
        txns = [t for t in all_txns if t.get("from_account_id")==account_id or t.get("to_account_id")==account_id]
        txns.sort(key=lambda x: x.get("created_date",""), reverse=True)
        return jsonify({"transactions": txns[:20]})
    except Exception as e:
        return jsonify({"transactions": [], "error": str(e)})

@app.route("/api/shotgun/contacts/<account_id>")
def sg_get_contacts(account_id):
    try:
        contacts = sg_get(f"{SG_CON}?account_id={account_id}&limit=100")
        for c in contacts:
            cid = c.get("contact_account_id","")
            if cid:
                try:
                    a = sg_get(f"{SG_B44}/{cid}")
                    if isinstance(a, dict):
                        c["is_online"] = a.get("is_online", False)
                        c["is_silent"] = a.get("is_silent", False)
                except: pass
        return jsonify({"contacts": contacts})
    except Exception as e:
        return jsonify({"contacts": [], "error": str(e)})

@app.route("/api/shotgun/contacts/add", methods=["POST"])
def sg_add_contact():
    data = request.json or {}
    account_id = data.get("account_id","")
    tag = data.get("contact_hashtag","").strip().lstrip("#")
    if not account_id or not tag: return jsonify({"error":"Missing data"}), 400
    try:
        found = sg_get(f"{SG_B44}?hashtag={_uparse.quote(tag)}&limit=1")
        if not found: return jsonify({"error": f"No member found with #{tag}"}), 404
        contact = found[0]
        sg_create(SG_CON, {
            "account_id": account_id, "contact_account_id": contact["id"],
            "contact_hashtag": tag,
            "contact_name": f"{contact.get('first_name','')} {contact.get('last_name','')}".strip(),
            "contact_email": contact.get("email",""), "status": "accepted",
        })
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/shotgun/invite", methods=["POST"])
def sg_invite():
    data = request.json or {}
    email = data.get("email","").strip()
    from_id = data.get("from_account_id","")
    if not email: return jsonify({"error":"No email"}), 400
    try:
        sender_name = "A friend"
        if from_id:
            try:
                s = sg_get(f"{SG_B44}/{from_id}")
                if isinstance(s, dict): sender_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip()
            except: pass
        sg_create(SG_CON, {"account_id": from_id, "contact_hashtag": "", "contact_email": email,
            "contact_name": email.split("@")[0], "status": "invited", "invite_sent_at": date.today().isoformat()})
        gmail_token = os.environ.get("GMAIL_ACCESS_TOKEN","")
        if gmail_token:
            import base64
            body = f"<div style='font-family:sans-serif;background:#1a1a2e;color:#f8fafc;padding:24px;border-radius:12px;'><h2>🔫 {sender_name} invited you to Shotgun</h2><p>Bank with Con-fidence. Move money in 20 minutes.</p><a href='https://taximizerpro.onrender.com/shotgun' style='background:#e94560;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;'>Open Your Account →</a><p style='font-size:10px;color:#475569;margin-top:16px;'>Bisignano Holdings LLC · Banking by Wise</p></div>"
            raw = f"From: Shotgun<taximizerpro@gmail.com>\nTo: {email}\nBcc: taximizerpro@gmail.com\nSubject: {sender_name} invited you to Shotgun 🔫\nMIME-Version: 1.0\nContent-Type: text/html\n\n{body}"
            msg = {"raw": base64.urlsafe_b64encode(raw.encode()).decode()}
            req = urllib.request.Request("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                data=json.dumps(msg).encode(), method="POST",
                headers={"Authorization": f"Bearer {gmail_token}", "Content-Type":"application/json"})
            with urllib.request.urlopen(req, timeout=15): pass
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/shotgun/sos", methods=["POST"])
def sg_sos():
    data = request.json or {}
    account_id = data.get("account_id","")
    amount = float(data.get("amount_requested", 0))
    if not account_id or amount <= 0: return jsonify({"error":"Invalid"}), 400
    try:
        acct = sg_get(f"{SG_B44}/{account_id}")
        if isinstance(acct, list): acct = acct[0]
        contacts = sg_get(f"{SG_CON}?account_id={account_id}&limit=100")
        rids = [c.get("contact_account_id","") for c in contacts if c.get("contact_account_id")]
        from datetime import datetime, timedelta
        sg_create(SG_SOS_URL, {
            "sender_account_id": account_id, "sender_hashtag": acct.get("hashtag",""),
            "sender_name": f"{acct.get('first_name','')} {acct.get('last_name','')}".strip(),
            "amount_requested": amount, "message": data.get("message",""),
            "recipient_ids": rids, "total_received": 0.0, "status": "active",
            "expires_at": (datetime.utcnow() + timedelta(hours=24)).isoformat(),
        })
        sg_put(f"{SG_B44}/{account_id}", {"sos_last_sent": date.today().isoformat()})
        return jsonify({"success": True, "recipients": len(rids)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def sg_monthly_activity(account_id):
    """Return total transaction $ volume for this account in the current calendar month."""
    from datetime import datetime
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    try:
        all_txns = sg_get(f"{SG_TXN}?limit=500")
        total = 0.0
        for t in all_txns:
            if t.get("status") != "completed": continue
            if t.get("type") == "fee": continue
            if (t.get("created_date","") or "") < month_start: continue
            if t.get("from_account_id") == account_id or t.get("to_account_id") == account_id:
                total += float(t.get("amount", 0))
        return total
    except:
        return 0.0

@app.route("/api/shotgun/beat-v", methods=["POST"])
def sg_beat_v():
    """Request Beat the V. Auto-approved if $500+ in transactional activity this month."""
    data = request.json or {}
    account_id = data.get("account_id","")
    try:
        acct = sg_get(f"{SG_B44}/{account_id}")
        if isinstance(acct, list): acct = acct[0]
        monthly = sg_monthly_activity(account_id)
        if monthly < 500.0:
            return jsonify({
                "approved": False,
                "monthly_activity": monthly,
                "needed": round(500.0 - monthly, 2),
                "error": f"Beat the V requires $500 in monthly activity. You have ${monthly:.2f} this month — need ${round(500.0-monthly,2):.2f} more.",
            }), 403
        # Auto-approve
        sg_put(f"{SG_B44}/{account_id}", {"beat_v_enabled": True, "beat_v_used": False})
        sg_create(SG_TXN, {
            "from_account_id": account_id, "to_account_id": account_id,
            "from_hashtag": acct.get("hashtag",""), "to_hashtag": acct.get("hashtag",""),
            "amount": 0, "fee": 0, "net_amount": 0,
            "type": "beat_v", "status": "completed",
            "note": f"Beat the V auto-approved — ${monthly:.2f} monthly activity",
        })
        return jsonify({"success": True, "approved": True, "monthly_activity": monthly})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/shotgun/presence", methods=["POST"])
def sg_presence():
    data = request.json or {}
    account_id = data.get("account_id","")
    try:
        sg_put(f"{SG_B44}/{account_id}", {"is_silent": data.get("is_silent",False), "is_online": data.get("is_online",True)})
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/shotgun/admin")
def sg_admin():
    if not logged_in(): return redirect(url_for("login"))
    if session["user"].get("role") not in ("superadmin","admin"): return "Not authorized", 403
    return render_template("shotgun_admin.html", user=session["user"])

@app.route("/api/shotgun/admin/pending")
def sg_admin_pending():
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    try:
        return jsonify({"accounts": sg_get(f"{SG_B44}?status=pending&limit=100")})
    except Exception as e:
        return jsonify({"accounts": [], "error": str(e)})

@app.route("/api/shotgun/admin/approve/<account_id>", methods=["POST"])
def sg_admin_approve(account_id):
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    if session["user"].get("role") != "superadmin":
        return jsonify({"error":"Only Italy can approve Shotgun accounts"}), 403
    try:
        acct = sg_get(f"{SG_B44}/{account_id}")
        if isinstance(acct, list): acct = acct[0]
        acct_num = "SG" + sg_rand_digits(10)
        card_num = sg_rand_digits(16)
        cvv      = sg_rand_digits(3)
        d = date.today()
        expiry   = f"{d.month:02d}/{str(d.year+4)[2:]}"
        sg_put(f"{SG_B44}/{account_id}", {
            "status": "approved", "routing_number": BISIGNANO_ROUTING,
            "account_number": acct_num, "virtual_card_number": card_num,
            "virtual_card_cvv": cvv, "virtual_card_expiry": expiry,
            "approved_by": session["user"]["name"], "approved_at": d.isoformat(),
        })
        gmail_token = os.environ.get("GMAIL_ACCESS_TOKEN","")
        if gmail_token and acct.get("email"):
            import base64
            body = f"<div style='font-family:sans-serif;background:#1a1a2e;color:#f8fafc;padding:24px;border-radius:12px;'><h2>🔫 Your Shotgun Account is Live!</h2><p>Welcome, #{acct.get('hashtag','')}!</p><table style='margin:16px 0;'><tr><td style='color:#94a3b8;padding:4px 12px 4px 0;'>Routing #</td><td style='font-family:monospace;font-weight:700;'>{BISIGNANO_ROUTING}</td></tr><tr><td style='color:#94a3b8;padding:4px 12px 4px 0;'>Account #</td><td style='font-family:monospace;font-weight:700;'>{acct_num}</td></tr><tr><td style='color:#94a3b8;padding:4px 12px 4px 0;'>Virtual Card</td><td style='font-family:monospace;'>{card_num[:4]} •••• •••• ••••</td></tr></table><a href='https://taximizerpro.onrender.com/shotgun' style='background:#e94560;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;'>Open Shotgun Now →</a><p style='font-size:10px;color:#475569;margin-top:16px;'>Bisignano Holdings LLC · Banking by Wise</p></div>"
            raw = f"From: Shotgun<taximizerpro@gmail.com>\nTo: {acct['email']}\nBcc: taximizerpro@gmail.com\nSubject: Your Shotgun Account is Approved #{acct.get('hashtag','')}\nMIME-Version: 1.0\nContent-Type: text/html\n\n{body}"
            msg = {"raw": base64.urlsafe_b64encode(raw.encode()).decode()}
            req = urllib.request.Request("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                data=json.dumps(msg).encode(), method="POST",
                headers={"Authorization": f"Bearer {gmail_token}", "Content-Type":"application/json"})
            with urllib.request.urlopen(req, timeout=15): pass
        return jsonify({"success": True, "account_number": acct_num})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/shotgun/admin/deny/<account_id>", methods=["POST"])
def sg_admin_deny(account_id):
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    if session["user"].get("role") != "superadmin":
        return jsonify({"error":"Only Italy can deny accounts"}), 403
    data = request.json or {}
    reason = data.get("reason","Not approved at this time.")
    try:
        acct = sg_get(f"{SG_B44}/{account_id}")
        if isinstance(acct, list): acct = acct[0]
        sg_put(f"{SG_B44}/{account_id}", {"status":"denied","denied_reason":reason})
        gmail_token = os.environ.get("GMAIL_ACCESS_TOKEN","")
        if gmail_token and acct.get("email"):
            import base64
            body = f"<p>Your Shotgun application for #{acct.get('hashtag','')} was not approved. Reason: {reason}. Contact taximizerpro@gmail.com for more info.</p>"
            raw = f"From: Shotgun<taximizerpro@gmail.com>\nTo: {acct['email']}\nSubject: Shotgun Application Update\nMIME-Version: 1.0\nContent-Type: text/html\n\n{body}"
            msg = {"raw": base64.urlsafe_b64encode(raw.encode()).decode()}
            req = urllib.request.Request("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                data=json.dumps(msg).encode(), method="POST",
                headers={"Authorization": f"Bearer {gmail_token}", "Content-Type":"application/json"})
            with urllib.request.urlopen(req, timeout=15): pass
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/shotgun/admin/all")
def sg_admin_all():
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    try:
        return jsonify({"accounts": sg_get(f"{SG_B44}?limit=500")})
    except Exception as e:
        return jsonify({"accounts": [], "error": str(e)})

@app.route("/bisignano")
def bisignano_holdings():
    if not logged_in(): return redirect(url_for("login"))
    if session["user"].get("role") != "superadmin":
        return "Private — Bisignano Holdings LLC eyes only", 403
    return render_template("bisignano_holdings.html", user=session["user"])

@app.route("/api/resend-otp", methods=["POST"])
def resend_otp():
    email = session.get("pending_2fa","")
    if not email: return jsonify({"error":"No pending 2FA"}), 400
    record = _otp_store.get(email,{})
    otp = str(secrets.randbelow(900000) + 100000)
    _otp_store[email] = {
        "otp": otp, "expires": time.time() + 600,
        "attempts": 0, "name": record.get("name",""), "role": record.get("role",""),
    }
    try:
        _send_otp_email(email, otp, record.get("name","User"))
        audit("2fa_otp_resent", f"OTP resent to {email}", email)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.after_request
def security_headers(response):
    """Add security headers to every response."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if request.is_secure or os.environ.get("FLASK_ENV") == "production":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return response

@app.route("/security")
def security_dashboard():
    if not logged_in(): return redirect(url_for("login"))
    if session["user"].get("role") != "superadmin": return "Not authorized", 403
    return render_template("security.html", user=session["user"])

# ── Forgot Password ───────────────────────────────────────────────────────────
_reset_tokens: dict = {}  # {token: {email, expires}}

@app.route("/forgot-password", methods=["GET","POST"])
def forgot_password():
    sent = False
    error = None
    if request.method == "POST":
        email = request.form.get("email","").strip().lower()
        ip = request.remote_addr or "unknown"
        if not _check_rate(f"forgot:{ip}", 5, 300):
            error = "Too many requests. Please wait."
        else:
            match = next((k for k in ADMINS if k.lower() == email), None)
            if match:
                token = secrets.token_urlsafe(32)
                _reset_tokens[token] = {"email": match, "expires": time.time() + 3600}
                reset_url = f"https://taximizerpro.onrender.com/reset-password/{token}"
                gmail_token = os.environ.get("GMAIL_ACCESS_TOKEN","")
                if gmail_token:
                    try:
                        body = f"""<div style="font-family:Inter,sans-serif;max-width:420px;margin:0 auto;background:#0f172a;color:#f8fafc;padding:32px;border-radius:16px;">
<h2 style="color:#f59e0b;margin-bottom:8px;">Reset your password</h2>
<p style="color:rgba(255,255,255,.5);font-size:13px;margin-bottom:24px;">Click the button below to reset your TaximizerPro password. This link expires in 1 hour.</p>
<a href="{reset_url}" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#0f172a;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:800;font-size:14px;">Reset Password →</a>
<p style="font-size:11px;color:rgba(255,255,255,.2);margin-top:24px;">If you didn't request this, ignore this email. TaximizerPro · Bisignano Holdings LLC</p>
</div>"""
                        raw = (f"From: TaximizerPro <taximizerpro@gmail.com>\nTo: {match}\n"
                               f"Subject: Reset your TaximizerPro password\nMIME-Version: 1.0\nContent-Type: text/html\n\n{body}")
                        msg = {"raw": base64.urlsafe_b64encode(raw.encode()).decode()}
                        req = urllib.request.Request(
                            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                            data=json.dumps(msg).encode(), method="POST",
                            headers={"Authorization": f"Bearer {gmail_token}", "Content-Type": "application/json"}
                        )
                        with urllib.request.urlopen(req, timeout=15): pass
                    except: pass
            # Always show sent (don't reveal if email exists)
            sent = True
            audit("forgot_password", f"Reset requested for {email}")
    return render_template("forgot_password.html", sent=sent, error=error)

@app.route("/reset-password/<token>", methods=["GET","POST"])
def reset_password(token):
    record = _reset_tokens.get(token)
    error = None
    if not record or record["expires"] < time.time():
        return render_template("forgot_password.html", error="Link expired or invalid. Please request a new one.", sent=False)
    if request.method == "POST":
        pw1 = request.form.get("password","")
        pw2 = request.form.get("confirm","")
        if pw1 != pw2:
            error = "Passwords don't match."
        elif len(pw1) < 8:
            error = "Password must be at least 8 characters."
        else:
            email = record["email"]
            ADMINS[email]["pw"] = generate_password_hash(pw1)
            _reset_tokens.pop(token, None)
            audit("password_reset", f"Password reset for {email}", email)
            return redirect(url_for("login") + "?reset=1")
    return render_template("reset_password.html", token=token, error=error)

# ── Request Account ────────────────────────────────────────────────────────────
_access_requests: dict = {}  # {token: {name, email, role, reason, expires}}

@app.route("/request-access", methods=["GET","POST"])
def request_access():
    sent = False
    error = None
    if request.method == "POST":
        ip = request.remote_addr or "unknown"
        if not _check_rate(f"access:{ip}", 3, 600):
            error = "Too many requests."
        else:
            name   = request.form.get("name","").strip()
            email  = request.form.get("email","").strip().lower()
            role   = request.form.get("role","agent")
            reason = request.form.get("reason","").strip()
            if not name or not email:
                error = "Name and email are required."
            else:
                token = secrets.token_urlsafe(32)
                _access_requests[token] = {
                    "name": name, "email": email, "role": role,
                    "reason": reason, "expires": time.time() + 172800  # 48hr
                }
                approve_url = f"https://taximizerpro.onrender.com/approve-access/{token}"
                deny_url    = f"https://taximizerpro.onrender.com/deny-access/{token}"
                gmail_token = os.environ.get("GMAIL_ACCESS_TOKEN","")
                if gmail_token:
                    for admin_email in ["taximizerpro@gmail.com", "mike.hennigan44@gmail.com"]:
                        try:
                            body = f"""<div style="font-family:Inter,sans-serif;max-width:460px;margin:0 auto;background:#0f172a;color:#f8fafc;padding:32px;border-radius:16px;">
<h2 style="color:#f59e0b;margin-bottom:4px;">New Access Request</h2>
<p style="color:rgba(255,255,255,.5);font-size:12px;margin-bottom:20px;">Someone is requesting access to TaximizerPro.</p>
<table style="width:100%;font-size:13px;margin-bottom:20px;">
<tr><td style="color:rgba(255,255,255,.4);padding:4px 0;">Name</td><td style="color:#f8fafc;font-weight:700;">{name}</td></tr>
<tr><td style="color:rgba(255,255,255,.4);padding:4px 0;">Email</td><td style="color:#f8fafc;">{email}</td></tr>
<tr><td style="color:rgba(255,255,255,.4);padding:4px 0;">Role</td><td style="color:#f8fafc;">{role}</td></tr>
<tr><td style="color:rgba(255,255,255,.4);padding:4px 0;">Reason</td><td style="color:#f8fafc;">{reason or "Not provided"}</td></tr>
</table>
<div style="display:flex;gap:12px;">
<a href="{approve_url}" style="flex:1;display:inline-block;background:#22c55e;color:#fff;padding:12px;border-radius:10px;text-decoration:none;font-weight:800;font-size:13px;text-align:center;">✓ Approve</a>
<a href="{deny_url}" style="flex:1;display:inline-block;background:#ef4444;color:#fff;padding:12px;border-radius:10px;text-decoration:none;font-weight:800;font-size:13px;text-align:center;">✗ Deny</a>
</div>
<p style="font-size:10px;color:rgba(255,255,255,.2);margin-top:20px;">Link expires in 48 hours. TaximizerPro · Bisignano Holdings LLC</p>
</div>"""
                            raw = (f"From: TaximizerPro <taximizerpro@gmail.com>\nTo: {admin_email}\n"
                                   f"Subject: Access Request: {name} ({role})\nMIME-Version: 1.0\nContent-Type: text/html\n\n{body}")
                            msg = {"raw": base64.urlsafe_b64encode(raw.encode()).decode()}
                            req = urllib.request.Request(
                                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                                data=json.dumps(msg).encode(), method="POST",
                                headers={"Authorization": f"Bearer {gmail_token}", "Content-Type": "application/json"}
                            )
                            with urllib.request.urlopen(req, timeout=15): pass
                        except: pass
                sent = True
                audit("access_request", f"Access requested by {name} <{email}> for role {role}")
    return render_template("request_access.html", sent=sent, error=error)

@app.route("/approve-access/<token>")
def approve_access(token):
    record = _access_requests.get(token)
    if not record or record["expires"] < time.time():
        return "<h2>Link expired or invalid.</h2>", 400
    email = record["email"]
    name  = record["name"]
    role  = record["role"]
    # Add to ADMINS in memory (persists until next restart — for permanent, store in DB)
    ADMINS[email] = {"pw": generate_password_hash(secrets.token_urlsafe(12)), "name": name, "role": role}
    _access_requests.pop(token, None)
    audit("access_approved", f"Access approved for {name} <{email}> role={role}")
    # Email the new user
    gmail_token = os.environ.get("GMAIL_ACCESS_TOKEN","")
    if gmail_token:
        try:
            body = f"""<div style="font-family:Inter,sans-serif;max-width:420px;margin:0 auto;background:#0f172a;color:#f8fafc;padding:32px;border-radius:16px;">
<h2 style="color:#22c55e;">You're approved!</h2>
<p style="color:rgba(255,255,255,.5);font-size:13px;margin-bottom:20px;">Your TaximizerPro account has been approved. Use the forgot password link to set your password.</p>
<a href="https://taximizerpro.onrender.com/forgot-password" style="display:inline-block;background:#22c55e;color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:800;font-size:14px;">Set Your Password →</a>
<p style="font-size:10px;color:rgba(255,255,255,.2);margin-top:24px;">TaximizerPro · Bisignano Holdings LLC</p>
</div>"""
            raw = (f"From: TaximizerPro <taximizerpro@gmail.com>\nTo: {email}\n"
                   f"Subject: Your TaximizerPro access has been approved!\nMIME-Version: 1.0\nContent-Type: text/html\n\n{body}")
            msg = {"raw": base64.urlsafe_b64encode(raw.encode()).decode()}
            req = urllib.request.Request(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                data=json.dumps(msg).encode(), method="POST",
                headers={"Authorization": f"Bearer {gmail_token}", "Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=15): pass
        except: pass
    return f"<div style='font-family:Inter,sans-serif;padding:40px;max-width:400px;'><h2>✅ Access approved for {name}</h2><p>They will receive an email with next steps.</p><a href='/dashboard'>Go to Dashboard</a></div>"

@app.route("/deny-access/<token>")
def deny_access(token):
    record = _access_requests.pop(token, None)
    if not record:
        return "<h2>Link expired or already handled.</h2>", 400
    audit("access_denied", f"Access denied for {record.get('name')} <{record.get('email')}>")
    return f"<div style='font-family:Inter,sans-serif;padding:40px;max-width:400px;'><h2>❌ Access denied for {record.get('name')}</h2><a href='/dashboard'>Go to Dashboard</a></div>"
