/**
 * fillTaxForm — routes single-client form generation to the Render Python backend.
 * Render runs PyMuPDF with v16 locked field maps. This just forwards + returns links.
 */

const RENDER_URL = "https://taximizerpro.onrender.com";
const SYNC_SECRET = "txpro-sync-2026-italy";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    const body = await req.json();
    const clientId = body.client_id || "inline";
    const clientData = body.client;

    if (!clientData) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing client data" }),
        { status: 400, headers }
      );
    }

    // Push fresh tokens to Render so it can access Drive/Gmail
    const driveToken = Deno.env.get("GOOGLEDRIVE_ACCESS_TOKEN") || "";
    const gmailToken = Deno.env.get("GMAIL_ACCESS_TOKEN") || "";

    if (driveToken) {
      await fetch(`${RENDER_URL}/api/refresh-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sync-Secret": SYNC_SECRET },
        body: JSON.stringify({ drive: driveToken, gmail: gmailToken }),
      }).catch(() => {});
    }

    // Call Render's generate endpoint
    const generateRes = await fetch(
      `${RENDER_URL}/api/generate/${clientId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sync-Secret": SYNC_SECRET },
        body: JSON.stringify({ client: clientData }),
      }
    );

    const result = await generateRes.json();

    if (!generateRes.ok || !result.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error || "Generation failed",
          render_status: generateRes.status,
        }),
        { status: 500, headers }
      );
    }

    return new Response(
      JSON.stringify({ success: true, links: result.links, folder_url: result.folder_url }),
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
