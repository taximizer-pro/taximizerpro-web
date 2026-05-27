import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Taximizer Pro — IRS 1040 Form Generator
// Downloads FILLABLE template from Drive, stamps client data as pixel overlay,
// preserves all pre-filled financial data and checkboxes.

const MASTER_IDS: Record<string, string> = {
  '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
  '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
  '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
};

function formatSSN(ssn: string): string {
  const c = (ssn || '').replace(/\D/g, '');
  return c.length === 9 ? `${c.slice(0,3)}-${c.slice(3,5)}-${c.slice(5)}` : ssn;
}

function today(): string {
  return new Date().toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
}

export default async function handler(req: Request): Promise<Response> {
  createClientFromRequest(req);

  let body: Record<string, any>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (body.ping) {
    return new Response(JSON.stringify({ ok: true, master_ids: MASTER_IDS }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const {
    year = '2024',
    first_name, last_name, ssn,
    address = '', apt = '', city = '', state = '', zip = '',
    middle_init = '',
    bank_routing = '', bank_account = '',
    signature_base64 = null,
    send_email_to = null,
    all_years = false, // if true, generate 2023+2024+2025 into one folder
  } = body;

  if (!['2023','2024','2025'].includes(year))
    return new Response(JSON.stringify({ error: `Unsupported year: ${year}` }), { status: 400 });
  if (!first_name || !last_name || !ssn)
    return new Response(JSON.stringify({ error: 'first_name, last_name, ssn required' }), { status: 400 });

  const driveToken = Deno.env.get('GOOGLEDRIVE_ACCESS_TOKEN');
  const gmailToken = Deno.env.get('GMAIL_ACCESS_TOKEN');
  if (!driveToken)
    return new Response(JSON.stringify({ error: 'Google Drive not connected' }), { status: 500 });

  const ssn_fmt  = formatSSN(ssn);
  const full_name = `${first_name}${middle_init ? ' '+middle_init : ''} ${last_name}`;
  const slug      = `${first_name}_${middle_init ? middle_init+'_' : ''}${last_name}`.replace(/\s+/g,'_');
  const dateLabel = new Date().toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}).replace(/\//g,'-');
  const folderName = `${slug}_${dateLabel}`;

  // Drive helpers
  const dHeaders = { Authorization: `Bearer ${driveToken}` };
  const dGet = (url: string) => fetch(url, { headers: dHeaders }).then(r => r.json());
  const dPost = (url: string, p: any) => fetch(url, {
    method:'POST', headers:{...dHeaders,'Content-Type':'application/json'}, body:JSON.stringify(p)
  }).then(r => r.json());

  async function findOrCreate(name: string, parentId?: string): Promise<string> {
    let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) q += ` and '${parentId}' in parents`;
    const res = await dGet(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`);
    if (res.files?.length) return res.files[0].id;
    const meta: any = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) meta.parents = [parentId];
    return (await dPost('https://www.googleapis.com/drive/v3/files', meta)).id;
  }

  async function uploadPDF(pdfBytes: Uint8Array, fileName: string, folderId: string): Promise<{id:string, webViewLink:string}> {
    const metaStr = JSON.stringify({ name: fileName, parents:[folderId], mimeType:'application/pdf' });
    const bnd = 'txbnd';
    const body = new Uint8Array([
      ...new TextEncoder().encode(`--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaStr}\r\n--${bnd}\r\nContent-Type: application/pdf\r\n\r\n`),
      ...pdfBytes,
      ...new TextEncoder().encode(`\r\n--${bnd}--`),
    ]);
    const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: { Authorization:`Bearer ${driveToken}`, 'Content-Type':`multipart/related; boundary=${bnd}` },
      body,
    });
    return await resp.json();
  }

  // ── Python PDF fill via Deno subprocess ──────────────────────────
  async function fillPDF(templateId: string, yr: string): Promise<Uint8Array> {
    // Download template
    const tplResp = await fetch(`https://www.googleapis.com/drive/v3/files/${templateId}?alt=media`, { headers: dHeaders });
    const tplBytes = new Uint8Array(await tplResp.arrayBuffer());
    const tplB64 = btoa(String.fromCharCode(...tplBytes));

    const sigB64 = signature_base64 || '';
    const todayStr = today();

    const pyScript = `
import fitz, base64, sys, os

tpl_bytes = base64.b64decode("""${tplB64}""")
doc = fitz.open(stream=tpl_bytes, filetype='pdf')

p0 = doc[0]
p1 = doc[1]
BLACK = (0,0,0)
F = 'helv'

def w(page, x, y, text, sz=9):
    page.insert_text((x,y), str(text), fontname=F, fontsize=sz, color=BLACK)

# Page 1 — client info
w(p0, 37,  100, """${full_name}""")
w(p0, 450, 100, """${ssn_fmt}""")
w(p0, 37,  148, """${address}${apt ? ' '+apt : ''}""".strip())
w(p0, 37,  172, """${city} ${state}  ${zip}""")

# Page 2 — banking + signature row
w(p1, 178, 330, """${bank_routing}""", sz=8)
w(p1, 178, 350, """${bank_account}""", sz=8)
# Date directly below Date label, left of HELPER
w(p1, 245, 478, """${todayStr}""", sz=9)
# Occupation hardcoded HELPER
w(p1, 326, 478, 'HELPER', sz=9)

${sigB64 ? `
# Signature image overlay
sig_bytes = base64.b64decode("""${sigB64}""")
sig_rect = fitz.Rect(101, 465, 235, 480)
p1.insert_image(sig_rect, stream=sig_bytes)
` : ''}

out = doc.tobytes(garbage=4, deflate=True)
sys.stdout.buffer.write(base64.b64encode(out))
`;

    const cmd = new Deno.Command('python3', { args:['-c', pyScript], stdout:'piped', stderr:'piped' });
    const { code, stdout, stderr } = await cmd.output();
    if (code !== 0) {
      const errTxt = new TextDecoder().decode(stderr);
      // Filter out known harmless xref warnings
      const realErrors = errTxt.split('\n').filter(l => l.includes('Error') && !l.includes('xref'));
      if (realErrors.length > 0) throw new Error(`PDF fill failed: ${realErrors.join(' ')}`);
    }
    const b64out = new TextDecoder().decode(stdout).trim();
    return Uint8Array.from(atob(b64out), c => c.charCodeAt(0));
  }

  try {
    const rootId   = await findOrCreate('Taximizer');
    const folderId = await findOrCreate(folderName, rootId);

    const yearsToGen = all_years ? ['2023','2024','2025'] : [year];
    const links: Record<string,string> = {};

    for (const yr of yearsToGen) {
      const pdfBytes = await fillPDF(MASTER_IDS[yr], yr);
      const fileName = `${slug}_${yr}_1040.pdf`;
      const upData   = await uploadPDF(pdfBytes, fileName, folderId);
      links[yr] = upData.webViewLink || `https://drive.google.com/file/d/${upData.id}/view`;
    }

    // Email notification
    if (send_email_to && gmailToken) {
      const subj = `✅ Form 1040 Ready — ${first_name} ${last_name}`;
      const linksHtml = Object.entries(links).map(([yr,link]) =>
        `<li><a href="${link}" style="color:#1a73e8">📄 ${yr} Form 1040</a></li>`
      ).join('');
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;padding:20px">
        <h2 style="color:#F59E0B">Taximizer Pro</h2>
        <p>IRS Form(s) 1040 for <strong>${first_name} ${last_name}</strong> are ready.</p>
        <ul>${linksHtml}</ul>
        <p style="color:#888;font-size:11px;margin-top:24px">Taximizer Pro — Tax Filing Platform</p>
      </div>`;
      const msg = [`To: ${send_email_to}`,`Subject: ${subj}`,'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','',html].join('\r\n');
      const raw = btoa(unescape(encodeURIComponent(msg))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
        method:'POST', headers:{Authorization:`Bearer ${gmailToken}`,'Content-Type':'application/json'},
        body: JSON.stringify({ raw }),
      });
    }

    return new Response(JSON.stringify({
      success: true,
      years: yearsToGen,
      client: `${first_name} ${last_name}`,
      ssn_formatted: ssn_fmt,
      drive_links: links,
      drive_link: links[year], // for single-year compat
      folder: `Taximizer/${folderName}`,
      email_sent: !!(send_email_to && gmailToken),
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
