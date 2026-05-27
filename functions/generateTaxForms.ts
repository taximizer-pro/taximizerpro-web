import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

/**
 * Taximizer Pro — IRS 1040 Form Generator
 * Pure Deno/TypeScript using pdf-lib overlay strategy.
 * Preserves all existing financial data and checkboxes.
 * Fills: Name, SSN, Address, City, State, ZIP, Routing, Account, Occupation, Date.
 * Sign Here row uses pixel overlay (drawn boxes, no widgets).
 */

const MASTER_IDS: Record<string, string> = {
  '2023': '12oZacU01PFs-GjmTnBeeARCWB8IKiRb0',
  '2024': '1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC',
  '2025': '13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz',
};

// pdf-lib uses bottom-left origin. PDF page height = 792pt.
// Formulas: pdfY = pageHeight - topY (where topY is measured from top)
// For a field box [x0, y0, x1, y1] in top-left coords:
//   pdf-lib insert point = (x0 + 2, pageHeight - y1 + 2)  [bottom of box + small padding]

const PH = 792; // page height

interface FieldDef {
  page: number;   // 0 or 1
  x: number;      // left edge (top-left origin)
  y: number;      // bottom of text baseline (top-left origin = y1 of box)
  size: number;   // font size
}

// Field definitions per year [page, x, y_topLeft_of_box_bottom, fontSize]
// y values are the y1 (bottom) of the widget rect in top-left coords
const FIELDS: Record<string, Record<string, FieldDef>> = {
  '2023': {
    FIRST_MID: { page: 0, x: 38,   y: 102,  size: 10 },
    LAST:      { page: 0, x: 240,  y: 102,  size: 10 },
    SSN:       { page: 0, x: 471,  y: 102,  size: 10 },
    ADDRESS:   { page: 0, x: 38,   y: 150,  size: 9  },
    CITY:      { page: 0, x: 38,   y: 174,  size: 9  },
    STATE:     { page: 0, x: 341,  y: 174,  size: 9  },
    ZIP:       { page: 0, x: 406,  y: 174,  size: 9  },
    ROUTING:   { page: 1, x: 174,  y: 335.5,size: 8  },
    ACCOUNT:   { page: 1, x: 174,  y: 347.5,size: 8  },
    HELPER:    { page: 1, x: 327,  y: 492,  size: 9  },  // occupation widget bottom
    DATE:      { page: 1, x: 275,  y: 492,  size: 7  },  // date drawn box [273.6-324, y=462-492]
  },
  '2024': {
    FIRST_MID: { page: 0, x: 38,   y: 102,  size: 10 },
    LAST:      { page: 0, x: 240,  y: 102,  size: 10 },
    SSN:       { page: 0, x: 471,  y: 102,  size: 10 },
    ADDRESS:   { page: 0, x: 38,   y: 150,  size: 9  },
    CITY:      { page: 0, x: 38,   y: 174,  size: 9  },
    STATE:     { page: 0, x: 341,  y: 174,  size: 9  },
    ZIP:       { page: 0, x: 406,  y: 174,  size: 9  },
    ROUTING:   { page: 1, x: 174,  y: 335.5,size: 8  },
    ACCOUNT:   { page: 1, x: 174,  y: 347.5,size: 8  },
    HELPER:    { page: 1, x: 327,  y: 492,  size: 9  },
    DATE:      { page: 1, x: 275,  y: 492,  size: 7  },
  },
  '2025': {
    FIRST_MID: { page: 0, x: 38,   y: 108,  size: 10 },
    LAST:      { page: 0, x: 255,  y: 108,  size: 10 },
    SSN:       { page: 0, x: 471,  y: 108,  size: 10 },
    ADDRESS:   { page: 0, x: 38,   y: 156,  size: 9  },
    CITY:      { page: 0, x: 38,   y: 180,  size: 9  },
    STATE:     { page: 0, x: 334,  y: 180,  size: 9  },
    ZIP:       { page: 0, x: 399,  y: 180,  size: 9  },
    ROUTING:   { page: 1, x: 182,  y: 515,  size: 8  },
    ACCOUNT:   { page: 1, x: 182,  y: 527,  size: 8  },
    HELPER:    { page: 1, x: 327,  y: 666,  size: 9  },  // f2_40 bottom
    DATE:      { page: 1, x: 275,  y: 666,  size: 7  },  // date drawn box [273.6-324, y=636-666]
  },
};

async function downloadTemplate(fileId: string, driveToken: string): Promise<Uint8Array> {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${driveToken}` }
  });
  if (!resp.ok) throw new Error(`Drive download failed: ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

async function fillForm(templateBytes: Uint8Array, year: string, client: Record<string, string>, today: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages  = pdfDoc.getPages();
  const fields = FIELDS[year];

  function draw(key: string, text: string) {
    if (!text || !fields[key]) return;
    const f = fields[key];
    const page = pages[f.page];
    const pdfY = PH - f.y + 1; // convert top-left y1 → pdf-lib bottom-left
    page.drawText(text, {
      x: f.x,
      y: pdfY,
      size: f.size,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const firstMid = [client.first_name, client.middle_init].filter(Boolean).join(' ');
  const ssn = (client.ssn || '').replace(/\D/g, ''); // raw digits only, no formatting in PDF

  draw('FIRST_MID', firstMid);
  draw('LAST',      client.last_name || '');
  draw('SSN',       ssn);
  draw('ADDRESS',   client.address || '');
  draw('CITY',      client.city || '');
  draw('STATE',     client.state || '');
  draw('ZIP',       client.zip || '');
  if (client.routing) draw('ROUTING', client.routing);
  if (client.account) draw('ACCOUNT', client.account);
  draw('HELPER',    'HELPER');
  draw('DATE',      today);

  return pdfDoc.save();
}

async function findOrCreateFolder(name: string, parentId: string | null, driveToken: string): Promise<string> {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
  const searchResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${driveToken}` }
  });
  const searchData = await searchResp.json();
  if (searchData.files?.length > 0) return searchData.files[0].id;

  const meta: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];
  const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  const created = await createResp.json();
  return created.id;
}

async function uploadPdf(pdfBytes: Uint8Array, filename: string, folderId: string, driveToken: string): Promise<string> {
  const boundary = 'txbnd42';
  const metaJson = JSON.stringify({ name: filename, parents: [folderId], mimeType: 'application/pdf' });
  const metaPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metaJson}\r\n`;
  const dataPart = `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
  const endPart  = `\r\n--${boundary}--`;

  const encoder = new TextEncoder();
  const parts = [encoder.encode(metaPart), encoder.encode(dataPart), pdfBytes, encoder.encode(endPart)];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { body.set(p, offset); offset += p.length; }

  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await resp.json();
  return data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`;
}

async function sendEmail(to: string, clientName: string, links: Record<string, string>, gmailToken: string) {
  const rows = Object.entries(links).map(([yr, url]) =>
    `<li style="margin:8px 0"><a href="${url}" style="color:#F59E0B;font-weight:600">📄 ${yr} Form 1040</a></li>`
  ).join('');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;padding:24px;background:#080F1E;color:#fff;border-radius:12px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="width:32px;height:32px;background:linear-gradient(135deg,#F59E0B,#F97316);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#080F1E;font-weight:900;font-size:14px">T</div>
        <span style="font-size:20px;font-weight:900">Taximizer<span style="color:#F59E0B">Pro</span></span>
      </div>
      <p style="color:#94A3B8;margin-bottom:12px">Forms are ready for <strong style="color:#fff">${clientName}</strong>:</p>
      <ul style="list-style:none;padding:0;margin:0">${rows}</ul>
      <p style="color:#475569;font-size:12px;margin-top:20px">Generated by TaximizerPro · ${new Date().toLocaleDateString()}</p>
    </div>`;
  const msg = ['To: ' + to, 'Subject: ✅ Forms Ready — ' + clientName, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html].join('\r\n');
  const raw = btoa(unescape(encodeURIComponent(msg))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${gmailToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { client, years = ['2023','2024','2025'], driveToken, gmailToken } = body;

    if (!client) return Response.json({ error: 'Missing client data' }, { status: 400 });
    if (!driveToken) return Response.json({ error: 'Missing driveToken' }, { status: 400 });

    const today = new Date().toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
    const nameParts = [client.first_name, client.middle_init, client.last_name].filter(Boolean);
    const slug = nameParts.join('_').replace(/\s+/g,'_');
    const dateSlug = today.replace(/\//g,'-');
    const folderName = `${slug}_${dateSlug}`;

    // Create Drive folder
    const rootId  = await findOrCreateFolder('Taximizer', null, driveToken);
    const folderId = await findOrCreateFolder(folderName, rootId, driveToken);

    const links: Record<string, string> = {};

    for (const yr of years) {
      const masterBytes = await downloadTemplate(MASTER_IDS[yr], driveToken);
      const filled = await fillForm(masterBytes, yr, client, today);
      const filename = `${slug}_${yr}_1040.pdf`;
      const link = await uploadPdf(filled, filename, folderId, driveToken);
      links[yr] = link;
    }

    const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ');
    if (gmailToken) {
      await sendEmail('taximizerpro@gmail.com', clientName, links, gmailToken).catch(e => console.warn('Email failed:', e.message));
    }

    return Response.json({
      ok: true,
      folder: `Taximizer/${folderName}`,
      links,
    });

  } catch (error) {
    console.error('generateTaxForms error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
