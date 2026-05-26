import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Taximizer Pro — IRS 1040 Form Generator
// Uses a skill (PyMuPDF) invoked via the agent, called from the app.
// This function handles Drive upload + email. The app calls this after
// the agent skill generates the filled PDF bytes (base64-encoded).

const MASTER_IDS: Record<string, string> = {
  '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
  '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
  '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
};

function formatSSN(ssn: string): string {
  const c = (ssn || '').replace(/\D/g, '');
  return c.length === 9 ? `${c.slice(0,3)}-${c.slice(3,5)}-${c.slice(5)}` : ssn;
}

export default async function handler(req: Request): Promise<Response> {
  createClientFromRequest(req);

  let body: Record<string, any>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  // ping/health check
  if (body.ping) {
    return new Response(JSON.stringify({ ok: true, master_ids: MASTER_IDS }), { headers: { 'Content-Type': 'application/json' } });
  }

  const {
    year = '2024',
    first_name, last_name, ssn,
    address = '', apt = '', city = '', state = '', zip = '',
    middle_init = '', bank_routing = '', bank_account = '',
    // filled_pdf_base64: the already-filled PDF bytes (base64) produced by the agent skill
    filled_pdf_base64,
    drive_folder_name,
    send_email_to,
  } = body;

  if (!['2023','2024','2025'].includes(year))
    return new Response(JSON.stringify({ error: `Unsupported year: ${year}` }), { status: 400 });
  if (!first_name || !last_name || !ssn)
    return new Response(JSON.stringify({ error: 'first_name, last_name, ssn required' }), { status: 400 });
  if (!filled_pdf_base64)
    return new Response(JSON.stringify({ error: 'filled_pdf_base64 required' }), { status: 400 });

  const driveToken = Deno.env.get('GOOGLEDRIVE_ACCESS_TOKEN');
  const gmailToken = Deno.env.get('GMAIL_ACCESS_TOKEN');
  if (!driveToken)
    return new Response(JSON.stringify({ error: 'Google Drive not connected' }), { status: 500 });

  try {
    // Decode the filled PDF
    const pdfBytes = Uint8Array.from(atob(filled_pdf_base64), c => c.charCodeAt(0));

    // Drive helpers
    const dGet  = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${driveToken}` } }).then(r => r.json());
    const dPost = (url: string, p: any) => fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then(r => r.json());

    async function findOrCreate(name: string, parentId?: string): Promise<string> {
      let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      if (parentId) q += ` and '${parentId}' in parents`;
      const res = await dGet(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`);
      if (res.files?.length) return res.files[0].id;
      const meta: any = { name, mimeType: 'application/vnd.google-apps.folder' };
      if (parentId) meta.parents = [parentId];
      return (await dPost('https://www.googleapis.com/drive/v3/files', meta)).id;
    }

    // One folder per client (all years inside)
    const slug = `${first_name}_${middle_init ? middle_init+'_' : ''}${last_name}`.replace(/\s+/g,'_');
    const dateLabel = new Date().toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}).replace(/\//g,'-');
    const folderName = drive_folder_name || `${slug}_${dateLabel}`;

    const rootId   = await findOrCreate('Taximizer');
    const folderId = await findOrCreate(folderName, rootId);
    const fileName = `${slug}_${year}_1040.pdf`;
    const metaStr  = JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'application/pdf' });
    const bnd = 'bndtaximizer';
    const uploadBody = new Uint8Array([
      ...new TextEncoder().encode(`--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaStr}\r\n--${bnd}\r\nContent-Type: application/pdf\r\n\r\n`),
      ...pdfBytes,
      ...new TextEncoder().encode(`\r\n--${bnd}--`),
    ]);
    const upResp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary=${bnd}` },
      body: uploadBody,
    });
    const upData = await upResp.json();
    const driveLink = upData.webViewLink || `https://drive.google.com/file/d/${upData.id}/view`;

    // Email
    if (send_email_to && gmailToken) {
      const subj = `✅ ${year} Form 1040 Ready — ${first_name} ${last_name}`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px">
        <h2 style="color:#1a73e8">Taximizer Pro</h2>
        <p>IRS Form 1040 (${year}) for <strong>${first_name} ${last_name}</strong> is ready.</p>
        <p><a href="${driveLink}" style="background:#1a73e8;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block">📄 View ${year} Form 1040</a></p>
        <p style="color:#888;font-size:11px;margin-top:24px">Taximizer Pro — Automated Tax Filing</p>
      </div>`;
      const msg = [`To: ${send_email_to}`,`Subject: ${subj}`,'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','',html].join('\r\n');
      const raw = btoa(unescape(encodeURIComponent(msg))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${gmailToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
    }

    return new Response(JSON.stringify({
      success: true, year,
      client: `${first_name} ${last_name}`,
      ssn_formatted: formatSSN(ssn),
      drive_link: driveLink,
      folder: `Taximizer/${folderName}`,
      email_sent: !!(send_email_to && gmailToken),
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
