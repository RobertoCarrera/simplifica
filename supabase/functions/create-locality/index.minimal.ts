// Minimal Edge Function for create-locality (preflight + simple POST)
export default async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') {
    try { console.log('Minimal OPTIONS preflight received', { origin }); } catch (e) {}
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
        'Vary': 'Origin'
      }
    });
  }
  try {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    const body = await req.json().catch(() => ({}));
    console.log('Minimal POST invoked', { origin, received: body });
    return new Response(JSON.stringify({ ok: true, received: body }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (e) {
    console.error('Minimal function error', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
