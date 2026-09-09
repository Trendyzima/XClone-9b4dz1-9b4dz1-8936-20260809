import federation from './federation-entrypoint';

const DOMAIN = 'federation.testagram.site';
const ORIGIN = `https://${DOMAIN}`;
const AP = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/activity+json';
const CTX = ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1', 'https://purl.archive.org/socialweb/webfinger'];

async function db(env: any, path: string) {
  const headers = new Headers({
    apikey: env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    Accept: 'application/json',
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`db ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

async function actor(env: any, username: string) {
  const rows = await db(env, `federation_actors?username=eq.${encodeURIComponent(username)}&select=*`) as any[];
  return rows[0] || null;
}

function apResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/activity+json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function webfinger(env: any, request: Request) {
  const resource = new URL(request.url).searchParams.get('resource') || '';
  const value = resource.replace(/^acct:/, '').replace(/^@/, '');
  const [username, domain] = value.split('@');
  if (!username || domain !== DOMAIN) {
    return new Response(JSON.stringify({ error: 'actor not found' }), { status: 404, headers: { 'Content-Type': 'application/jrd+json; charset=utf-8' } });
  }
  const row = await actor(env, username);
  if (!row) return new Response(JSON.stringify({ error: 'actor not found' }), { status: 404, headers: { 'Content-Type': 'application/jrd+json; charset=utf-8' } });
  const id = `${ORIGIN}/users/${encodeURIComponent(row.username)}`;
  return new Response(JSON.stringify({
    subject: `acct:${row.username}@${DOMAIN}`,
    aliases: [id],
    links: [{ rel: 'self', type: 'application/activity+json', href: id }],
  }), { status: 200, headers: { 'Content-Type': 'application/jrd+json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function actorGet(env: any, username: string) {
  const row = await actor(env, username);
  if (!row) return apResponse({ error: 'actor not found' }, 404);
  const id = `${ORIGIN}/users/${encodeURIComponent(row.username)}`;
  return apResponse({
    '@context': CTX,
    id,
    type: 'Person',
    preferredUsername: row.username,
    webfinger: `acct:${row.username}@${DOMAIN}`,
    name: row.username,
    url: id,
    inbox: `${id}/inbox`,
    outbox: `${id}/outbox`,
    followers: `${id}/followers`,
    following: `${id}/following`,
    manuallyApprovesFollowers: false,
    discoverable: true,
    indexable: true,
    publicKey: { id: `${id}#main-key`, owner: id, publicKeyPem: row.public_key_pem },
  });
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const actorMatch = url.pathname.match(/^\/users\/([^/]+)$/);
    if (request.method === 'GET' && url.pathname === '/.well-known/webfinger') return webfinger(env, request);
    if (request.method === 'GET' && actorMatch) return actorGet(env, decodeURIComponent(actorMatch[1]));
    return federation.fetch(request, env, ctx);
  },
};
