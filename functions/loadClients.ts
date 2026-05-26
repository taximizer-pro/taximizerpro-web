import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Bulk client loader for TaximizerPro app
// Called once to seed all 387 clients

export default async function handler(req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }

  const { clients, app_id } = body;
  if (!clients || !Array.isArray(clients)) {
    return new Response(JSON.stringify({ error: 'clients array required' }), { status: 400 });
  }

  // Use cross-app service role write
  const TARGET_APP = app_id || '6a13a616cfc1d1551a05523a';

  const results = { created: 0, errors: [] as string[] };

  for (const client of clients) {
    try {
      const resp = await fetch(
        `https://app.base44.com/api/apps/${TARGET_APP}/entities/Client`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-superagent-key': Deno.env.get('BASE44_SERVICE_TOKEN') || '',
          },
          body: JSON.stringify(client),
        }
      );
      if (resp.ok) {
        results.created++;
      } else {
        const err = await resp.text();
        results.errors.push(`${client.first_name} ${client.last_name}: ${err.slice(0,100)}`);
      }
    } catch (e: any) {
      results.errors.push(`${client.first_name}: ${e.message}`);
    }
  }

  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
}
