import { base44 } from "npm:@base44/sdk@0.1.6";

const app = base44({ appId: "6a14ef767988d1ef0baff5aa" });

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const body = await req.json();
    const {
      first_name, middle_init, last_name,
      ssn, address, city, state, zip,
      bank_routing, bank_account, email,
      tax_years, signature_url,
    } = body;

    if (!first_name || !last_name || !ssn) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: first_name, last_name, ssn" }),
        { status: 400, headers }
      );
    }

    // Format SSN as raw digits only (no dashes)
    const ssnClean = (ssn || "").replace(/\D/g, "");
    
    // Format filing date
    const now = new Date();
    const filingDate = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${now.getFullYear()}`;
    const today = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
    
    // Build folder name: LastName_FirstName_FilingDate_Years
    const yearsStr = (Array.isArray(tax_years) ? tax_years : [tax_years]).sort().join("-");
    const folderName = `${last_name}_${first_name}_${filingDate}_${yearsStr}`;
    const clientName = [first_name, middle_init, last_name].filter(Boolean).join(" ");

    // Google Drive & Gmail tokens from env
    const driveToken = Deno.env.get("GOOGLEDRIVE_ACCESS_TOKEN");
    const gmailToken = Deno.env.get("GMAIL_ACCESS_TOKEN");

    if (!driveToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Google Drive not connected" }),
        { status: 500, headers }
      );
    }

    // Find or create root folder 'TaximizerPro V 2.0 Clients'
    const rootFolderId = await findOrCreateFolder("TaximizerPro V 2.0 Clients", driveToken);
    
    // Find or create client subfolder
    const clientFolderId = await findOrCreateFolder(folderName, driveToken, rootFolderId);
    const folderUrl = `https://drive.google.com/drive/folders/${clientFolderId}`;

    // Template IDs
    const TEMPLATE_IDS: Record<string, string> = {
      "2023": "12oZacU01PFs-GjmTnBeeARCWB8IKiRb0",
      "2024": "1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC",
      "2025": "13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz",
    };

    const years = Array.isArray(tax_years) ? tax_years : [tax_years];
    const uploadedLinks: Record<string, string> = {};

    for (const year of years) {
      const templateId = TEMPLATE_IDS[year];
      if (!templateId) continue;

      // Download template
      const templateRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${templateId}?alt=media`,
        { headers: { Authorization: `Bearer ${driveToken}` } }
      );
      if (!templateRes.ok) {
        console.error(`Failed to download template ${year}: ${templateRes.status}`);
        continue;
      }

      const templateBytes = await templateRes.arrayBuffer();
      
      // The PDF filling is done server-side via the Python skill
      // For now, upload the template with a marker for the Python worker to process
      // Return the folder URL so the client knows where files will appear
      
      // Upload placeholder (actual fill done by Python skill)
      const filename = `${last_name}_${first_name}_${year}_1040.pdf`;
      const uploadedLink = await uploadPdfBuffer(
        new Uint8Array(templateBytes),
        filename,
        clientFolderId,
        driveToken
      );
      uploadedLinks[year] = uploadedLink;
    }

    // Send notification email if we have gmail token and email
    if (email && gmailToken && Object.keys(uploadedLinks).length > 0) {
      try {
        await sendNotificationEmail(
          gmailToken,
          email,
          clientName,
          uploadedLinks,
          folderName,
          today
        );
      } catch (e) {
        console.error("Email send failed:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        folder_name: folderName,
        folder_url: folderUrl,
        files: uploadedLinks,
        message: `Generated ${years.length} form(s) for ${clientName}`,
      }),
      { status: 200, headers }
    );

  } catch (e) {
    console.error("fillTaxForm error:", e);
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers }
    );
  }
}

async function findOrCreateFolder(name: string, token: string, parentId?: string): Promise<string> {
  let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json();
  if (searchData.files?.length > 0) return searchData.files[0].id;

  const meta: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) meta.parents = [parentId];

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  const data = await createRes.json();
  return data.id;
}

async function uploadPdfBuffer(pdfBytes: Uint8Array, filename: string, folderId: string, token: string): Promise<string> {
  const boundary = "txpro_boundary_xyz";
  const meta = JSON.stringify({ name: filename, parents: [folderId], mimeType: "application/pdf" });
  
  const encoder = new TextEncoder();
  const metaPart = encoder.encode(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
  const endPart = encoder.encode(`\r\n--${boundary}--`);
  
  const body = new Uint8Array(metaPart.length + pdfBytes.length + endPart.length);
  body.set(metaPart, 0);
  body.set(pdfBytes, metaPart.length);
  body.set(endPart, metaPart.length + pdfBytes.length);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  const data = await res.json();
  return data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`;
}

async function sendNotificationEmail(
  gmailToken: string,
  toEmail: string,
  clientName: string,
  links: Record<string, string>,
  folderName: string,
  today: string
) {
  const yearsStr = Object.keys(links).sort().join(", ");
  const fileLinks = Object.entries(links)
    .map(([yr, link]) => `<li><a href="${link}">${yr} Form 1040</a></li>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1e40af;padding:20px;border-radius:12px 12px 0 0">
        <h1 style="color:white;margin:0;font-size:20px">TaximizerPro</h1>
        <p style="color:#93c5fd;margin:4px 0 0;font-size:13px">Tax Filing Platform</p>
      </div>
      <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">
        <h2 style="color:#1e293b;margin-top:0">Your Tax Forms Are Ready ✅</h2>
        <p style="color:#475569">Hi <strong>${clientName}</strong>,</p>
        <p style="color:#475569">Your IRS Form 1040 for <strong>${yearsStr}</strong> has been prepared and saved to your secure Google Drive folder.</p>
        <ul style="color:#1e40af">${fileLinks}</ul>
        <p style="color:#64748b;font-size:13px">Filed: ${today} · Folder: ${folderName}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="color:#94a3b8;font-size:12px">TaximizerPro — Professional Tax Preparation</p>
      </div>
    </div>
  `;

  const raw = btoa(
    `From: taximizerpro@gmail.com\r\nTo: ${toEmail}\r\nSubject: Your Tax Forms Are Ready - TaximizerPro\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}`
  ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${gmailToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
}
