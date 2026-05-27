import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Taximizer Pro — IRS 1040 Form Generator
// Pure TypeScript/Deno — no subprocess. Uses pdf-lib to overlay client data
// onto FILLABLE templates stored in Google Drive.
// All existing financial data and checkboxes are preserved (we never flatten
// or rewrite the original — we add a new content stream on top).

import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

const MASTER_IDS: Record<string, string> = {
  '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
  '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
  '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
};

// Page height is 792pt. pdf-lib uses bottom-left origin so we flip y.
// All coordinates below are in top-left origin (as measured from the PDF)
// and converted with: pdf_y = pageH - top_y
const PAGE_H = 792;
function fy(topY: number) { return PAGE_H - topY; }

// Field positions (top-left origin, measured from template)
const FIELDS = {
  // Page 1
  name_x:    37,  name_y:   98,
  ssn_x:    450,  ssn_y:    98,
  addr_x:    37,  addr_y:  146,
  city_x:    37,  city_y:  170,

  // Page 2
  routing_x: 178, routing_y: 328,
  account_x: 178, account_y: 348,
  // Date directly below "Date" label, left of HELPER
  date_x:    245, date_y:   476,
  // Occupation — hardcoded HELPER
  occ_x:     326, occ_y:    476,
  // Signature image rect (top-left origin)
  sig_x1: 101, sig_y1: 463, sig_x2: 235, sig_y2: 480,
};

function formatSSN(ssn: string): string {
  const c = (ssn || '').replace(/\D/g, '');
  return c.length === 9 ? `${c.slice(0,3)}-${c.slice(3,5)}-${c.slice(5)}` : ssn;
}

function todayStr(): string {
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
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    year         = '2024',
    first_name, last_name, ssn,
    address      = '', apt        = '',
    city         = '', state      = '', zip         = '',
    middle_init  = '',
    bank_routing = '', bank_account = '',
    signature_base64 = null,
    send_email_to    = null,
    all_years        = false,
  } = body;

  if (!['2023','2024','2025'].includes(year))
    return new Response(JSON.stringify({ error: `Unsupported year: ${year}` }), { status: 400 });
  if (!first_name || !last_name || !ssn)
    return new Response(JSON.stringify({ error: 'first_name, last_name, ssn required' }), { status: 400 });

  const driveToken = Deno.env.get('GOOGLEDRIVE_ACCESS_TOKEN');
  const gmailToken = Deno.env.get('GMAIL_ACCESS_TOKEN');
  if (!driveToken)
    return new Response(JSON.stringify({ error: 'Google Drive not connected' }), { status: 500 });

  const ssn_fmt   = formatSSN(ssn);
  const full_name = `${first_name}${middle_init ? ' '+middle_init : ''} ${last_name}`;
  const addr_line = `${address}${apt ? ' '+apt : ''}`.trim();
  const city_line = `${city} ${state}  ${zip}`;
  const slug      = `${first_name}_${middle_init ? middle_init+'_' : ''}${last_name}`.replace(/\s+/g,'_');
  const dateLabel = new Date().toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}).replace(/\//g,'-');
  const folderName = `${slug}_${dateLabel}`;
  const dateValue = todayStr();

  // ── Drive helpers ──────────────────────────────────────────────
  const dH = { Authorization: `Bearer ${driveToken}` };
  const dGet  = (url: string) => fetch(url, { headers: dH }).then(r => r.json());
  const dPost = (url: string, p: any) => fetch(url, {
    method:'POST', headers:{...dH,'Content-Type':'application/json'}, body:JSON.stringify(p),
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

  async function uploadPDF(pdfBytes: Uint8Array, fileName: string, folderId: string) {
    const metaStr = JSON.stringify({ name: fileName, parents:[folderId], mimeType:'application/pdf' });
    const bnd = 'txbnd99';
    const enc = new TextEncoder();
    const body = new Uint8Array([
      ...enc.encode(`--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaStr}\r\n--${bnd}\r\nContent-Type: application/pdf\r\n\r\n`),
      ...pdfBytes,
      ...enc.encode(`\r\n--${bnd}--`),
    ]);
    const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method:'POST',
      headers:{ Authorization:`Bearer ${driveToken}`, 'Content-Type':`multipart/related; boundary=${bnd}` },
      body,
    });
    return await resp.json();
  }

  // ── PDF fill using pdf-lib ─────────────────────────────────────
  async function fillPDF(templateId: string): Promise<Uint8Array> {
    // Download template
    const tplResp = await fetch(`https://www.googleapis.com/drive/v3/files/${templateId}?alt=media`, { headers: dH });
    const tplBytes = new Uint8Array(await tplResp.arrayBuffer());

    // Load with ignoreEncryption to handle any lock flags in the IRS PDF
    const pdfDoc = await PDFDocument.load(tplBytes, { ignoreEncryption: true });
    const pages  = pdfDoc.getPages();
    const p0     = pages[0];
    const p1     = pages[1];
    const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const sz     = 9;
    const black  = rgb(0, 0, 0);

    function draw(page: any, x: number, topY: number, text: string, fontSize = sz) {
      page.drawText(text, { x, y: fy(topY), font, size: fontSize, color: black });
    }

    // Page 1
    draw(p0, FIELDS.name_x,  FIELDS.name_y,  full_name);
    draw(p0, FIELDS.ssn_x,   FIELDS.ssn_y,   ssn_fmt);
    draw(p0, FIELDS.addr_x,  FIELDS.addr_y,  addr_line);
    draw(p0, FIELDS.city_x,  FIELDS.city_y,  city_line);

    // Page 2
    if (bank_routing) draw(p1, FIELDS.routing_x, FIELDS.routing_y, bank_routing, 8);
    if (bank_account) draw(p1, FIELDS.account_x, FIELDS.account_y, bank_account, 8);
    // Date — directly below "Date" label, left of HELPER
    draw(p1, FIELDS.date_x, FIELDS.date_y, dateValue);
    // Occupation — always HELPER
    draw(p1, FIELDS.occ_x, FIELDS.occ_y, 'HELPER');

    // Signature image if provided
    if (signature_base64) {
      try {
        const sigBytes = Uint8Array.from(atob(signature_base64), c => c.charCodeAt(0));
        const sigImg   = await pdfDoc.embedPng(sigBytes);
        const { sig_x1, sig_y1, sig_x2, sig_y2 } = FIELDS;
        p1.drawImage(sigImg, {
          x: sig_x1,
          y: fy(sig_y2),  // bottom of rect in pdf-lib coords
          width:  sig_x2 - sig_x1,
          height: sig_y2 - sig_y1,
        });
      } catch (_) { /* signature optional */ }
    }

    return await pdfDoc.save();
  }

  // ── Main ───────────────────────────────────────────────────────
  try {
    const rootId     = await findOrCreate('Taximizer');
    const folderId   = await findOrCreate(folderName, rootId);
    const yearsToGen = all_years ? ['2023','2024','2025'] : [year];
    const links: Record<string,string> = {};

    for (const yr of yearsToGen) {
      const pdfBytes = await fillPDF(MASTER_IDS[yr]);
      const fileName = `${slug}_${yr}_1040.pdf`;
      const upData   = await uploadPDF(pdfBytes, fileName, folderId);
      links[yr]      = upData.webViewLink || `https://drive.google.com/file/d/${upData.id}/view`;
    }

    // Email notification
    if (send_email_to && gmailToken) {
      const subj = `✅ Form 1040 Ready — ${first_name} ${last_name}`;
      const linksHtml = Object.entries(links)
        .map(([yr, link]) => `<li><a href="${link}" style="color:#1a73e8">📄 ${yr} Form 1040</a></li>`)
        .join('');
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;padding:20px">
        <h2 style="color:#F59E0B">&#9733; Taximizer Pro</h2>
        <p>IRS Form(s) 1040 for <strong>${first_name} ${last_name}</strong> are ready in Google Drive.</p>
        <ul>${linksHtml}</ul>
        <p style="color:#888;font-size:11px;margin-top:24px">Taximizer Pro &mdash; Tax Filing Platform</p>
      </div>`;
      const raw_msg = [
        `To: ${send_email_to}`,
        `Subject: ${subj}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        '',
        html,
      ].join('\r\n');
      const raw = btoa(unescape(encodeURIComponent(raw_msg)))
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method:'POST',
        headers:{ Authorization:`Bearer ${gmailToken}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ raw }),
      });
    }

    return new Response(JSON.stringify({
      success:       true,
      years:         yearsToGen,
      client:        `${first_name} ${last_name}`,
      ssn_formatted: ssn_fmt,
      drive_links:   links,
      drive_link:    links[year] ?? Object.values(links)[0],
      folder:        `Taximizer/${folderName}`,
      email_sent:    !!(send_email_to && gmailToken),
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
