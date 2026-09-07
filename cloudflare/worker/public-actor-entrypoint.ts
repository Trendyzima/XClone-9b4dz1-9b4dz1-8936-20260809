import federation from './federation-entrypoint';

const ORIGIN = 'https://testagram-api.nahashonnyaga794.workers.dev';

async function actor(request: Request, env: any, username: string) {
  const encoded = encodeURIComponent(username);
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/federation_actors?username=eq.${encoded}&select=username,public_key_pem`, {
    headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` }
  });
  if (!response.ok) return new Response(JSON.stringify({ error: 'actor lookup failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  const rows = await response.json() as any[];
  const row = rows[0];
  if (!row) return new Response(JSON.stringify({ error: 'actor not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  const id = `${ORIGIN}/users/${encodeURIComponent(row.username)}`;
  const body = {
    '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
    id,
    type: 'Person',
    preferredUsername: row.username,
    name: row.username,
    url: id,
    inbox: `${id}/inbox`,
    outbox: `${id}/outbox`,
    followers: `${id}/followers`,
    following: `${id}/following`,
    publicKey: { id: `${id}#main-key`, owner: id, publicKeyPem: row.public_key_pem },
    discoverable: true,
    indexable: true
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/activity+json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Testagram-Actor-Source': 'direct' } });
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/users\/([^/]+)$/);
    if (request.method === 'GET' && match) return actor(request, env, decodeURIComponent(match[1]));
    return federation.fetch(request, env, ctx);
  }
};
