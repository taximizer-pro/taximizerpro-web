import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MASTER_IDS: Record<string, string> = {
  '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
  '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
  '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
};

const FIELDS_2023_2024 = {
  first_name:   { page: 0, field: 'f1_04[0]' },
  last_name:    { page: 0, field: 'f1_05[0]' },
  ssn:          { page: 0, field: 'f1_06[0]' },
  address:      { page: 0, field: 'f1_10[0]' },
  apt:          { page: 0, field: 'f1_11[0]' },
  city:         { page: 0, field: 'f1_12[0]' },
  state:        { page: 0, field: 'f1_13[0]' },
  zip:          { page: 0, field: 'f1_14[0]' },
  bank_routing: { page: 1, field: 'f2_25[0]' },
  bank_account: { page: 1, field: 'f2_26[0]' },
  date:         { page: 1, field: 'f2_39[0]' },
};

const FIELDS_2025 = {
  first_name:   { page: 0, field: 'f1_14[0]' },
  last_name:    { page: 0, field: 'f1_15[0]' },
  ssn:          { page: 0, field: 'f1_16[0]' },
  address:      { page: 0, field: 'f1_20[0]' },
  apt:          { page: 0, field: 'f1_21[0]' },
  city:         { page: 0, field: 'f1_22[0]' },
  state:        { page: 0, field: 'f1_23[0]' },
  zip:          { page: 0, field: 'f1_24[0]' },
  bank_routing: { page: 1, field: 'f2_32[0]' },
  bank_account: { page: 1, field: 'f2_33[0]' },
  date:         { page: 1, field: 'f2_46[0]' },
};

const SIG_RECTS: Record<string, number[]> = {
  '2023': [101, 460, 270, 490],
  '2024': [101, 460, 270, 490],
  '2025': [101, 634, 270, 666],
};

function formatSSN(ssn: string): string {
  const c = (ssn || '').replace(/\D/g, '');
  return c.length === 9 ? `${c.slice(0,3)}-${c.slice(3,5)}-${c.slice(5)}` : ssn;
}

function todayStr(): string {
  return new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

async function fillPDF(pdfBytes: Uint8Array, year: string, client: Record<string, string>, sigDataUrl?: string): Promise<Uint8Array> {
  const fields = year === '2025' ? FIELDS_2025 : FIELDS_2023_2024;
  const sigRect = SIG_RECTS[year];
  const fn_mi = [client.first_name, client.middle_init].filter(Boolean).join(' ');

  const assignments = [
    { ...fields.first_name,   value: fn_mi },
    { ...fields.last_name,    value: client.last_name || '' },
    { ...fields.ssn,          value: formatSSN(client.ssn || '') },
    { ...fields.address,      value: client.address || '' },
    { ...fields.apt,          value: client.apt || '' },
    { ...fields.city,         value: client.city || '' },
    { ...fields.state,        value: client.state || '' },
    { ...fields.zip,          value: client.zip || '' },
    { ...fields.bank_routing, value: client.bank_routing || '' },
    { ...fields.bank_account, value: client.bank_account || '' },
    { ...fields.date,         value: todayStr() },
  ];

  const sigB64 = sigDataUrl ? sigDataUrl.replace(/^data:[^;]+;base64,/, '') : '';
  const pdfB64 = btoa(String.fromCharCode(...pdfBytes));
  const payload = JSON.stringify({ pdf: pdfB64, assignments, sig_b64: sigB64, sig_rect: sigRect, year });

  const pyScript = `import sys,json,base64,fitz
data=json.loads(sys.stdin.read())
doc=fitz.open(stream=base64.b64decode(data['pdf']),filetype='pdf')
for a in data['assignments']:
  if not a['value']:continue
  for w in(doc[a['page']].widgets()or[]):
    if w.field_name.split('.')[-1]==a['field']:
      w.field_value=a['value'];w.update();break
if data['year']=='2025':
  for pnum in range(len(doc)):
    for w in(doc[pnum].widgets()or[]):
      v=w.field_value
      if v and 'XXX' in str(v):
        w.field_value=str(v).replace(' XXX','').replace('XXX','').rstrip('.');w.update()
p2=doc[1];r=fitz.Rect(*data['sig_rect'])
if data['sig_b64']:p2.insert_image(r,stream=base64.b64decode(data['sig_b64']))
else:
  p2.draw_rect(r,color=(0.7,0.7,0.7),width=0.5)
  p2.insert_text(fitz.Point(r.x0+5,r.y0+r.height*0.65),"[ Client Signature ]",fontname="helv",fontsize=7,color=(0.6,0.6,0.6))
sys.stdout.buffer.write(base64.b64encode(doc.tobytes(garbage=4,deflate=True)))`;

  const proc = new Deno.Command('python3', { args: ['-c', pyScript], stdin: 'piped', stdout: 'piped', stderr: 'piped' });
  const child = proc.spawn();
  const wr = child.stdin.getWriter();
  await wr.write(new TextEncoder().encode(payload));
  await wr.close();
  const { code, stdout, stderr } = await child.output();
  if (code !== 0) throw new Error(`PyMuPDF: ${new TextDecoder().decode(stderr).slice(0,400)}`);
  const bin = atob(new TextDecoder().decode(stdout));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function findOrCreateFolder(name: string, parentId: string | null, token: string): Promise<string> {
  let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json();
  if (d.files?.length) return d.files[0].id;
  const meta: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];
  const cr = await fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(meta) });
  if (!cr.ok) throw new Error(`Folder: ${await cr.text()}`);
  return (await cr.json()).id;
}

async function uploadPDF(name: string, bytes: Uint8Array, folderId: string, token: string): Promise<string> {
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: 'application/pdf' });
  const bnd = 'bnd' + Date.now();
  const mp = new TextEncoder().encode(`--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`);
  const fp = new TextEncoder().encode(`--${bnd}\r\nContent-Type: application/pdf\r\n\r\n`);
  const cp = new TextEncoder().encode(`\r\n--${bnd}--`);
  const body = new Uint8Array(mp.length + fp.length + bytes.length + cp.length);
  body.set(mp); body.set(fp, mp.length); body.set(bytes, mp.length + fp.length); body.set(cp, mp.length + fp.length + bytes.length);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${bnd}` }, body });
  if (!res.ok) throw new Error(`Upload: ${await res.text()}`);
  const d = await res.json();
  return d.webViewLink || `https://drive.google.com/file/d/${d.id}/view`;
}

async function sendEmail(to: string, subject: string, html: string, token: string) {
  const msg = [`To: ${to}`, `Subject: ${subject}`, `MIME-Version: 1.0`, `Content-Type: text/html; charset=UTF-8`, ``, html].join('\r\n');
  const raw = btoa(unescape(encodeURIComponent(msg))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
  if (!r.ok) throw new Error(`Gmail: ${await r.text()}`);
}

export default async function handler(req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { client, year, signature_data_url, taximizer_folder_id } = body;

  if (!client || !year) return Response.json({ error: 'Missing client or year' }, { status: 400 });
  if (!MASTER_IDS[year]) return Response.json({ error: `Year ${year} not supported` }, { status: 400 });

  const { accessToken: driveToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
  const { accessToken: gmailToken } = await base44.asServiceRole.connectors.getConnection('gmail');

  const tr = await fetch(`https://www.googleapis.com/drive/v3/files/${MASTER_IDS[year]}?alt=media`, { headers: { Authorization: `Bearer ${driveToken}` } });
  if (!tr.ok) throw new Error(`Template: ${tr.status}`);
  const templateBytes = new Uint8Array(await tr.arrayBuffer());

  const filledBytes = await fillPDF(templateBytes, year, client, signature_data_url);

  const dateStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const slug = `${client.first_name}${client.middle_init ? '_' + client.middle_init : ''}_${client.last_name}`;
  const folderName = `${slug}_${dateStr}_${year}`;
  const rootId = taximizer_folder_id || await findOrCreateFolder('Taximizer', null, driveToken);
  const clientFolderId = await findOrCreateFolder(folderName, rootId, driveToken);
  const fileUrl = await uploadPDF(`${slug}_${year}_1040.pdf`, filledBytes, clientFolderId, driveToken);

  const toEmail = `Taximizerpro+${client.first_name}${client.last_name}@gmail.com`;
  const subject = `✅ ${year} 1040 Ready — ${client.first_name} ${client.last_name}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
    <h2 style="color:#1a73e8">Taximizer Pro</h2>
    <p>The <strong>${year} IRS Form 1040</strong> for <strong>${client.first_name} ${client.last_name}</strong> has been completed.</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:8px;background:#f8f9fa;font-weight:bold">Client</td><td style="padding:8px">${client.first_name} ${client.last_name}</td></tr>
      <tr><td style="padding:8px;background:#f8f9fa;font-weight:bold">Tax Year</td><td style="padding:8px">${year}</td></tr>
      <tr><td style="padding:8px;background:#f8f9fa;font-weight:bold">Date Filed</td><td style="padding:8px">${dateStr}</td></tr>
      <tr><td style="padding:8px;background:#f8f9fa;font-weight:bold">Folder</td><td style="padding:8px">${folderName}</td></tr>
    </table>
    <a href="${fileUrl}" style="display:inline-block;padding:12px 24px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:4px">📄 View in Drive</a>
    <p style="margin-top:24px;color:#888;font-size:12px">Taximizer Pro — Automated Tax Filing System</p>
  </div>`;

  await sendEmail(toEmail, subject, html, gmailToken);
  return Response.json({ success: true, folder: folderName, file_url: fileUrl, emailed_to: toEmail });
}
