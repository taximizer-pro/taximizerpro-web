import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

/**
 * Taximizer Pro — IRS 1040 Form Generator (v19 — clears watermark fields before drawing)
 * NO Render. Fetches own OAuth tokens. Clears placeholder text before overlay.
 */

const TAXIMIZER_APP_ID = '6a13ae4b43ea85cec629af77';
const BASE44_API = 'https://app.base44.com/api/apps';

const MASTER_IDS: Record<string, string> = {
  '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
  '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
  '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
};

const PH = 792;
const BAD_APT = new Set(['', 'none', 'null', 'apt', 'apt.', '#', 'unit', 'n/a', 'na']);

interface FieldDef { page: number; x: number; y: number; size: number; }

const FIELDS: Record<string, Record<string, FieldDef>> = {
  '2023': {
    FIRST_MID: { page: 0, x: 38,  y: 102,   size: 10 },
    LAST:      { page: 0, x: 240, y: 102,   size: 10 },
    SSN:       { page: 0, x: 471, y: 102,   size: 10 },
    ADDRESS:   { page: 0, x: 38,  y: 150,   size: 9  },
    CITY:      { page: 0, x: 38,  y: 174,   size: 9  },
    STATE:     { page: 0, x: 341, y: 174,   size: 9  },
    ZIP:       { page: 0, x: 406, y: 174,   size: 9  },
    ROUTING:   { page: 1, x: 174, y: 335.5, size: 8  },
    ACCOUNT:   { page: 1, x: 174, y: 347.5, size: 8  },
    HELPER:    { page: 1, x: 327, y: 492,   size: 9  },
    DATE:      { page: 1, x: 275, y: 492,   size: 7  },
  },
  '2024': {
    FIRST_MID: { page: 0, x: 38,  y: 102,   size: 10 },
    LAST:      { page: 0, x: 240, y: 102,   size: 10 },
    SSN:       { page: 0, x: 471, y: 102,   size: 10 },
    ADDRESS:   { page: 0, x: 38,  y: 150,   size: 9  },
    CITY:      { page: 0, x: 38,  y: 174,   size: 9  },
    STATE:     { page: 0, x: 341, y: 174,   size: 9  },
    ZIP:       { page: 0, x: 406, y: 174,   size: 9  },
    ROUTING:   { page: 1, x: 174, y: 335.5, size: 8  },
    ACCOUNT:   { page: 1, x: 174, y: 347.5, size: 8  },
    HELPER:    { page: 1, x: 327, y: 492,   size: 9  },
    DATE:      { page: 1, x: 275, y: 492,   size: 7  },
  },
  '2025': {
    FIRST_MID: { page: 0, x: 38,  y: 108,  size: 10 },
    LAST:      { page: 0, x: 255, y: 108,  size: 10 },
    SSN:       { page: 0, x: 471, y: 108,  size: 10 },
    ADDRESS:   { page: 0, x: 38,  y: 156,  size: 9  },
    CITY:      { page: 0, x: 38,  y: 180,  size: 9  },
    STATE:     { page: 0, x: 334, y: 180,  size: 9  },
    ZIP:       { page: 0, x: 399, y: 180,  size: 9  },
    ROUTING:   { page: 1, x: 182, y: 515,  size: 8  },
    ACCOUNT:   { page: 1, x: 182, y: 527,  size: 8  },
    HELPER:    { page: 1, x: 327, y: 666,  size: 9  },
    DATE:      { page: 1, x: 275, y: 666,  size: 7  },
  },
};

// Fields to clear per year — these contain placeholder watermark text in the master template
// We blank them so our overlay text doesn't double-write
const FIELDS_TO_CLEAR: Record<string, string[]> = {
  '2023': [
    'topmostSubform[0].Page1[0].f1_04[0]',   // FIRST NAME, MIDDLE
    'topmostSubform[0].Page1[0].f1_05[0]',   // LAST
    'topmostSubform[0].Page1[0].f1_06[0]',   // SS#
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_10[0]', // STREET ADDRESS
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_11[0]', // APT
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_12[0]', // CITY
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_13[0]', // STATE
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_14[0]', // ZIP
    'topmostSubform[0].Page2[0].RoutingNo[0].f2_25[0]',         // ACCOUNT # (swapped label)
    'topmostSubform[0].Page2[0].AccountNo[0].f2_26[0]',         // ROUTING # (swapped label)
    'topmostSubform[0].Page2[0].f2_33[0]',                      // HELPER
  ],
  '2024': [
    'topmostSubform[0].Page1[0].f1_04[0]',
    'topmostSubform[0].Page1[0].f1_05[0]',
    'topmostSubform[0].Page1[0].f1_06[0]',
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_10[0]',
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_11[0]',
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_12[0]',
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_13[0]',
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_14[0]',
    'topmostSubform[0].Page2[0].RoutingNo[0].f2_25[0]',
    'topmostSubform[0].Page2[0].AccountNo[0].f2_26[0]',
    'topmostSubform[0].Page2[0].f2_33[0]',
  ],
  '2025': [
    'topmostSubform[0].Page1[0].f1_14[0]',   // FIRST+MI
    'topmostSubform[0].Page1[0].f1_15[0]',   // LAST
    'topmostSubform[0].Page1[0].f1_16[0]',   // SSN
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_20[0]', // STREET
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_21[0]', // APT
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_22[0]', // CITY
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_23[0]', // STATE
    'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_24[0]', // ZIP
    'topmostSubform[0].Page2[0].RoutingNo[0].f2_32[0]',
    'topmostSubform[0].Page2[0].AccountNo[0].f2_33[0]',
    'topmostSubform[0].Page2[0].f2_40[0]',
  ],
};

// ── Base44 REST helpers ───────────────────────────────────────────────────────

async function getClientFromTaximizer(clientId: string, token: string): Promise<Record<string, string>> {
  const r = await fetch(`${BASE44_API}/${TAXIMIZER_APP_ID}/entities/TaxClient/${clientId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error(`Client fetch failed: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function updateClientInTaximizer(clientId: string, data: Record<string, unknown>, token: string) {
  await fetch(`${BASE44_API}/${TAXIMIZER_APP_ID}/entities/TaxClient/${clientId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function downloadTemplate(fileId: string, token: string): Promise<Uint8Array> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error(`Drive download ${fileId} failed: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function findOrCreateFolder(name: string, parentId: string | null, token: string): Promise<string> {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    + (parentId ? ` and '${parentId}' in parents` : '');
  const s = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const sd = await s.json();
  if (sd.files?.length) return sd.files[0].id;
  const meta: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];
  const c = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  return (await c.json()).id;
}

async function uploadPdf(bytes: Uint8Array, filename: string, folderId: string, token: string): Promise<string> {
  const boundary = 'txbnd42';
  const metaJson = JSON.stringify({ name: filename, parents: [folderId], mimeType: 'application/pdf' });
  const enc = new TextEncoder();
  const parts = [
    enc.encode(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metaJson}\r\n`),
    enc.encode(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    bytes,
    enc.encode(`\r\n--${boundary}--`),
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const body = new Uint8Array(total);
  let off = 0; for (const p of parts) { body.set(p, off); off += p.length; }
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const d = await r.json();
  if (!d.id) throw new Error(`Upload failed: ${JSON.stringify(d)}`);
  return d.webViewLink || `https://drive.google.com/file/d/${d.id}/view`;
}

// ── PDF fill ──────────────────────────────────────────────────────────────────

async function fillForm(templateBytes: Uint8Array, year: string, client: Record<string, string>, today: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages  = pdfDoc.getPages();
  const fields = FIELDS[year];

  // ── Step 1: Clear placeholder watermark text in form fields ──────────────
  const form = pdfDoc.getForm();
  const toClear = FIELDS_TO_CLEAR[year] ?? [];
  for (const fieldName of toClear) {
    try {
      const field = form.getTextField(fieldName);
      field.setText('');
    } catch {
      // field may not exist in this template variant — skip silently
    }
  }

  // ── Step 2: Draw our values as text overlays ──────────────────────────────
  function draw(key: string, text: string) {
    if (!text || !fields[key]) return;
    const f = fields[key];
    pages[f.page].drawText(text, {
      x: f.x,
      y: PH - f.y + 1,
      size: f.size,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const apt = (client.apt || '').trim();
  const aptClean = BAD_APT.has(apt.toLowerCase()) ? '' : apt;
  const street = aptClean ? `${(client.address || '').trim()} Apt ${aptClean}` : (client.address || '').trim();

  draw('FIRST_MID', [client.first_name, client.middle_init].filter(Boolean).join(' '));
  draw('LAST',      client.last_name || '');
  draw('SSN',       (client.ssn || '').replace(/\D/g, ''));
  draw('ADDRESS',   street);
  draw('CITY',      client.city || '');
  draw('STATE',     client.state || '');
  draw('ZIP',       client.zip || '');
  if (client.bank_routing) draw('ROUTING', client.bank_routing);
  if (client.bank_account) draw('ACCOUNT', client.bank_account);
  draw('HELPER', 'HELPER');
  draw('DATE',   today);

  // ── Step 3: Flatten form so widgets don't render on top of our text ───────
  form.flatten();

  return pdfDoc.save();
}

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendEmail(to: string, bcc: string, clientName: string, links: Record<string, string>, token: string) {
  const rows = Object.entries(links).map(([yr, url]) =>
    `<li style="margin:8px 0"><a href="${url}" style="color:#F59E0B;font-weight:600">📄 ${yr} Form 1040</a></li>`
  ).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;padding:24px;background:#080F1E;color:#fff;border-radius:12px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="width:32px;height:32px;background:linear-gradient(135deg,#F59E0B,#F97316);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#080F1E;font-weight:900;font-size:14px">T</div>
      <span style="font-size:20px;font-weight:900">Taximizer<span style="color:#F59E0B">Pro</span></span>
    </div>
    <p style="color:#94A3B8;margin-bottom:12px">Your forms are ready, <strong style="color:#fff">${clientName}</strong>:</p>
    <ul style="list-style:none;padding:0;margin:0">${rows}</ul>
    <p style="color:#475569;font-size:12px;margin-top:20px">Generated by TaximizerPro · ${new Date().toLocaleDateString()}</p>
  </div>`;
  const msg = [`To: ${to}`, `Bcc: ${bcc}`,
    `Subject: ✅ Your Tax Forms Are Ready — ${clientName}`,
    'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html].join('\r\n');
  const raw = btoa(unescape(encodeURIComponent(msg))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole ?? base44;
    const serviceToken: string = (svc as any)._token ?? (base44 as any)._serviceToken ?? '';

    const body = await req.json().catch(() => ({}));
    const { clientId, years } = body as { clientId?: string; years?: string[] };
    if (!clientId) return Response.json({ error: 'clientId required' }, { status: 400 });

    const clientData = await getClientFromTaximizer(clientId, serviceToken);

    const { accessToken: driveToken } = await svc.connectors.getConnection('googledrive');
    const { accessToken: gmailToken }  = await svc.connectors.getConnection('gmail');

    const taxYearStr = clientData.tax_year || '';
    const clientYears = taxYearStr.split(',').map((y: string) => y.trim()).filter(Boolean);
    const yearsToGen: string[] = years ?? (clientYears.length ? clientYears : ['2023','2024','2025']);

    const today = new Date().toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
    const lastName  = (clientData.last_name  || '').replace(/\s+/g, '_');
    const firstName = (clientData.first_name || '').replace(/\s+/g, '_');
    const clientName = `${clientData.first_name} ${clientData.last_name}`.trim();
    const folderName = `${lastName}_${firstName}_${today.replace(/\//g,'-')}_${yearsToGen.join('-')}`;

    const rootId   = await findOrCreateFolder('TaximizerPro V 2.0 Clients', null, driveToken);
    const folderId = await findOrCreateFolder(folderName, rootId, driveToken);
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    const links: Record<string, string> = {};
    for (const year of yearsToGen) {
      const tplId = MASTER_IDS[year];
      if (!tplId) continue;
      const tplBytes = await downloadTemplate(tplId, driveToken);
      const filled   = await fillForm(tplBytes, year, clientData, today);
      links[year]    = await uploadPdf(filled, `${lastName}_${firstName}_${year}_1040.pdf`, folderId, driveToken);
    }

    if (clientData.email && Object.keys(links).length > 0) {
      await sendEmail(clientData.email, 'taximizerpro@gmail.com', clientName, links, gmailToken);
    }

    await updateClientInTaximizer(clientId, {
      irs_status: 'filed',
      drive_folder_url: folderUrl,
      form_links: Object.entries(links).map(([yr, url]) => `${yr}: ${url}`).join('\n'),
      current_step: 'complete',
    }, serviceToken);

    return Response.json({ ok: true, clientName, years: yearsToGen, folderUrl, links });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('generateTaxForms error:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
});
