#!/usr/bin/env python3
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
from werkzeug.security import generate_password_hash, check_password_hash
import os, json, urllib.request, urllib.parse, fitz, base64
from datetime import date

app = Flask(__name__)
app.secret_key = "taximizerpro-2026-italy"

ADMINS = {
    "taximizerpro@gmail.com": {"pw": generate_password_hash("Italy2026!"),  "name": "Italy",        "role": "superadmin"},
    "mike.hennigan44@gmail.com": {"pw": generate_password_hash("Admin2026!"), "name": "Mike Hennigan", "role": "admin"},
}

MASTER_IDS = {
    '2022': '1iLxjqGceVwVcLtb8w5UW1-FHTQRR8hyy',
    '2023': '1JiPyLqgPC0yZg70BuJz9WeW1zauCxdp3',
    '2024': '1PO0Mh-Mo8f9M_FVPfxLq2h8AKWw_L4fl',
    '2025': '1Q2CIM4rnIjQ4TVAlhpoZc5iUFdamAClM',
}
ROOT_FOLDER = "TaximizerPro V 2.0 Clients"
APP_ID = "6a13ae4b43ea85cec629af77"

P1 = {
    '2023': {'f1_04[0]':'FIRST_MIDDLE','f1_05[0]':'LAST_NAME','f1_06[0]':'SSN','f1_10[0]':'ADDRESS','f1_12[0]':'CITY','f1_13[0]':'STATE','f1_14[0]':'ZIP'},
    '2024': {'f1_04[0]':'FIRST_MIDDLE','f1_05[0]':'LAST_NAME','f1_06[0]':'SSN','f1_10[0]':'ADDRESS','f1_12[0]':'CITY','f1_13[0]':'STATE','f1_14[0]':'ZIP'},
    '2025': {'f1_04[0]':'FIRST_MIDDLE','f1_05[0]':'LAST_NAME','f1_06[0]':'SSN','f1_11[0]':'ADDRESS','f1_14[0]':'CITY','f1_15[0]':'STATE','f1_16[0]':'ZIP'},
    '2022': {'f1_04[0]':'FIRST_MIDDLE','f1_05[0]':'LAST_NAME','f1_06[0]':'SSN','f1_11[0]':'ADDRESS','f1_14[0]':'CITY','f1_15[0]':'STATE','f1_16[0]':'ZIP'},
}
P2 = {
    '2023': {'f2_33[0]':'ROUTING','f2_35[0]':'ACCOUNT','f2_39[0]':'OCCUPATION'},
    '2024': {'f2_33[0]':'ROUTING','f2_35[0]':'ACCOUNT','f2_39[0]':'OCCUPATION'},
    '2025': {'f2_32[0]':'ROUTING','f2_33[0]':'ACCOUNT','f2_40[0]':'OCCUPATION'},
    '2022': {'f2_32[0]':'ROUTING','f2_33[0]':'ACCOUNT','f2_40[0]':'OCCUPATION'},
}
DATE_XY = {'2022':(250,651),'2023':(250,551),'2024':(250,551),'2025':(250,651)}

def dtok():
    return os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN","")
def gtok():
    return os.environ.get("GMAIL_ACCESS_TOKEN","")

def drive_get(url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {dtok()}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

def get_or_create_folder(name, parent=None):
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent: q += f" and '{parent}' in parents"
    r = drive_get(f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id)")
    if r.get("files"): return r["files"][0]["id"]
    meta = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent: meta["parents"] = [parent]
    req = urllib.request.Request("https://www.googleapis.com/drive/v3/files",
        data=json.dumps(meta).encode(), method="POST",
        headers={"Authorization": f"Bearer {dtok()}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())["id"]

def dl_template(fid, dest):
    req = urllib.request.Request(f"https://www.googleapis.com/drive/v3/files/{fid}?alt=media",
        headers={"Authorization": f"Bearer {dtok()}"})
    with urllib.request.urlopen(req, timeout=30) as r, open(dest, "wb") as f:
        f.write(r.read())

def upload_pdf(path, name, folder_id):
    with open(path, "rb") as f: data = f.read()
    meta = json.dumps({"name": name, "parents": [folder_id], "mimeType": "application/pdf"})
    bnd = "txbnd26"
    body = (f"--{bnd}\r\nContent-Type: application/json\r\n\r\n{meta}\r\n"
            f"--{bnd}\r\nContent-Type: application/pdf\r\n\r\n").encode() + data + f"\r\n--{bnd}--".encode()
    req = urllib.request.Request(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
        data=body, method="POST",
        headers={"Authorization": f"Bearer {dtok()}", "Content-Type": f"multipart/related; boundary={bnd}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())
    return d.get("webViewLink", f"https://drive.google.com/file/d/{d['id']}/view")

def fill_form(tmpl, out, yr, c):
    today = date.today().strftime("%m/%d/%Y")
    ssn = (c.get("ssn") or "").replace("-","").replace(" ","")
    fm = (c.get("first_name","") + " " + (c.get("middle_init") or "")).strip()
    apt = str(c.get("apt") or "").strip()
    apt = apt if apt and apt.lower() not in ("none","null","apt","apt.","#","unit","") else ""
    addr = (c.get("address","").strip() + (" " + apt if apt else "")).strip()
    tokens = {"FIRST_MIDDLE":fm,"LAST_NAME":c.get("last_name",""),"SSN":ssn,
              "ADDRESS":addr,"CITY":c.get("city",""),"STATE":c.get("state",""),"ZIP":c.get("zip",""),
              "ROUTING":c.get("bank_routing",""),"ACCOUNT":c.get("bank_account",""),"OCCUPATION":"HELPER"}
    tmp = out + ".tmp.pdf"
    doc = fitz.open(tmpl)
    doc.save(tmp, garbage=4, deflate=True, incremental=False)
    doc.close()
    doc = fitz.open(tmp)
    for w in doc[0].widgets():
        sn = w.field_name.split(".")[-1]
        if w.field_type_string == "Text" and sn in P1.get(yr,{}) and tokens.get(P1[yr][sn]):
            w.field_value = tokens[P1[yr][sn]]; w.update()
    for w in doc[1].widgets():
        sn = w.field_name.split(".")[-1]
        if w.field_type_string == "Text" and sn in P2.get(yr,{}) and tokens.get(P2[yr][sn]):
            w.field_value = tokens[P2[yr][sn]]; w.update()
    dx, dy = DATE_XY[yr]
    doc[1].insert_text((dx, dy), today, fontname="helv", fontsize=7, color=(0,0,0))
    if c.get("signature_url"):
        try:
            sig_path = f"/tmp/sig_{c['id'][:8]}.png"
            req = urllib.request.Request(c["signature_url"])
            with urllib.request.urlopen(req, timeout=10) as r, open(sig_path,"wb") as f: f.write(r.read())
            if yr in ("2023","2024"): sr = fitz.Rect(91.6,536.0,240.0,556.0)
            else: sr = fitz.Rect(91.6,636.0,240.0,656.0)
            doc[1].insert_image(sr, filename=sig_path, keep_proportion=True)
            os.remove(sig_path)
        except: pass
    doc.save(out, garbage=4, deflate=True, incremental=False)
    doc.close()
    try: os.remove(tmp)
    except: pass

def send_notification(to, first_name, links):
    rows = "".join(f'<tr><td style="padding:10px 16px;border-bottom:1px solid #e2e8f0"><a href="{lnk}" style="color:#d97706;font-weight:bold">📄 {yr} Form 1040</a></td><td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;color:#64748b">View in Drive →</td></tr>' for yr,lnk in sorted(links.items()))
    html = (f'<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto">'
            f'<div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:20px 24px">'
            f'<span style="font-size:20px;font-weight:900;color:#fff">TaximizerPro</span></div>'
            f'<div style="padding:24px;background:#fff;border:1px solid #e2e8f0">'
            f'<h2 style="color:#1e293b">Your Tax Forms Are Ready ✅</h2>'
            f'<p style="color:#475569">Hi <strong>{first_name}</strong>, your IRS 1040 forms are ready.</p>'
            f'<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0"><thead>'
            f'<tr style="background:#f8fafc"><th style="padding:10px 16px;text-align:left;font-size:11px;color:#94a3b8">Document</th>'
            f'<th style="padding:10px 16px;text-align:left;font-size:11px;color:#94a3b8">Action</th></tr></thead>'
            f'<tbody>{rows}</tbody></table>'
            f'<p style="font-size:12px;color:#94a3b8;margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0">'
            f'Nobody controls the IRS — not even Italy, and that says a lot...<br><strong>TaximizerPro</strong></p>'
            f'</div></div>')
    msg = (f"From: taximizerpro@gmail.com\r\nTo: {to}\r\n"
           f"Subject: Your Tax Forms Are Ready — TaximizerPro\r\n"
           f"Content-Type: text/html; charset=utf-8\r\n\r\n{html}")
    raw = base64.urlsafe_b64encode(msg.encode()).decode().rstrip("=")
    req = urllib.request.Request("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=json.dumps({"raw":raw}).encode(), method="POST",
        headers={"Authorization": f"Bearer {gtok()}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r: return json.loads(r.read())

# ── AUTH ──────────────────────────────────────────────────────────────────────
def logged_in():
    return "user" in session

@app.route("/")
def index():
    return redirect(url_for("login") if not logged_in() else url_for("dashboard"))

@app.route("/login", methods=["GET","POST"])
def login():
    error = None
    if request.method == "POST":
        email = request.form.get("email","").strip().lower()
        pw    = request.form.get("password","")
        match = next((k for k in ADMINS if k.lower() == email), None)
        if match and check_password_hash(ADMINS[match]["pw"], pw):
            session["user"] = {"email": match, "name": ADMINS[match]["name"], "role": ADMINS[match]["role"]}
            return redirect(url_for("dashboard"))
        error = "Invalid email or password."
    return render_template("login.html", error=error)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# ── PAGES ─────────────────────────────────────────────────────────────────────
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
    if request.method == "POST":
        flash("Client added successfully!", "success")
        return redirect(url_for("clients"))
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
@app.route("/api/generate/<client_id>", methods=["POST"])
def api_generate(client_id):
    if not logged_in(): return jsonify({"error":"unauthorized"}), 401
    data = request.json or {}
    c = data.get("client", {})
    if not c: return jsonify({"error":"no client data"}), 400
    try:
        years = [y.strip() for y in c.get("tax_year","").split(",") if y.strip() in MASTER_IDS]
        today_str = date.today().strftime("%m-%d-%Y")
        folder_name = f"{c.get('last_name','').strip()}_{c.get('first_name','').strip()}_{today_str}_{'_'.join(sorted(years))}"
        root_id = get_or_create_folder(ROOT_FOLDER)
        cf = get_or_create_folder(folder_name, root_id)
        links = {}
        for yr in years:
            tmpl = f"/tmp/t_{yr}_{client_id[:8]}.pdf"
            out  = f"/tmp/o_{yr}_{client_id[:8]}.pdf"
            try:
                dl_template(MASTER_IDS[yr], tmpl)
                fill_form(tmpl, out, yr, c)
                fname = f"{c.get('last_name','').strip()}_{c.get('first_name','').strip()}_{yr}_1040.pdf"
                links[yr] = upload_pdf(out, fname, cf)
            finally:
                for p in [tmpl,out]:
                    try: os.remove(p)
                    except: pass
        if c.get("email") and "@" in c.get("email",""):
            try: send_notification(c["email"], c.get("first_name",""), links)
            except: pass
        return jsonify({"success":True, "links":links})
    except Exception as e:
        return jsonify({"error":str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    app.run(host="0.0.0.0", port=port)
