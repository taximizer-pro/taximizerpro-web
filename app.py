#!/usr/bin/env python3
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import os, json, urllib.request, urllib.parse, fitz, base64, io, tempfile
from datetime import date

app = Flask(__name__)
app.secret_key = "taximizerpro-2026-italy"

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
    with open(out_path,"rb") as f: result = f.read()
    for p in [tmpl_path, tmp_path, out_path]:
        try: os.unlink(p)
        except: pass
    return result

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
        email = request.form.get("email","").strip().lower()
        pw    = request.form.get("password","")
        match = next((k for k in ADMINS if k.lower() == email), None)
        if match and check_password_hash(ADMINS[match]["pw"], pw):
            session["user"] = {"email":match,"name":ADMINS[match]["name"],"role":ADMINS[match]["role"]}
            return redirect(url_for("dashboard"))
        error = "Invalid email or password."
    return render_template("login.html", error=error)

@app.route("/logout")
def logout(): session.clear(); return redirect(url_for("login"))

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
BASE44_HEADERS = {"app-id": APP_ID, "Content-Type": "application/json"}

@app.route("/api/clients")
def api_clients():
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    try:
        limit = request.args.get("limit", 500)
        url = f"https://appapi.base44.com/api/apps/{APP_ID}/entities/TaxClient?limit={limit}"
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
        url = f"https://appapi.base44.com/api/apps/{APP_ID}/entities/TaxClient?limit=500"
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
            try: send_notification(c["email"], c.get("first_name",""), links)
            except: pass
        return jsonify({"success":True,"links":links})
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
    # Strip empty strings to avoid polluting the entity
    payload = {k: v for k, v in data.items() if v not in (None, "", [])}
    payload["filing_status"] = "prospect"
    payload["irs_status"]    = "prospect"
    payload["current_step"]  = 0
    try:
        url = f"https://appapi.base44.com/api/apps/{APP_ID}/entities/TaxClient"
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
        url = f"https://appapi.base44.com/api/apps/{APP_ID}/entities/TaxClient/{prospect_id}"
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
        url = f"https://appapi.base44.com/api/apps/{APP_ID}/entities/TaxClient/{prospect_id}"
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
        url = f"https://appapi.base44.com/api/apps/{APP_ID}/entities/TaxClient?limit=500"
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
