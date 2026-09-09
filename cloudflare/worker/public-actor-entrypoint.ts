import federation from './federation-entrypoint';

const ORIGIN = 'https://federation.testagram.site';
const GATEWAY = 'https://zcjtvykwwplnzyyslnop.supabase.co/functions/v1/gateway-relay';
const DISCOVERY = 'https://aepbqfrmheihfsauzcby.supabase.co/functions/v1/federation-discovery';
const AP = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/activity+json';

async function actor(username: string) {
  const response = await fetch(`${GATEWAY}/users/${encodeURIComponent(username)}`, { headers: { Accept: AP, 'User-Agent': 'Testagram-Federation/1.9' } });
  if (!response.ok) return new Response(JSON.stringify({ error: 'actor not found' }), { status: response.status === 404 ? 404 : 502, headers: { 'Content-Type': 'application/json' } });
  const source = await response.json() as any;
  const id = `${ORIGIN}/users/${encodeURIComponent(username)}`;
  const body = {
    '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
    id, type: 'Person', preferredUsername: username, name: username, url: id,
    webfinger: `acct:${username}@${new URL(ORIGIN).hostname}`,
    inbox: `${id}/inbox`, outbox: `${id}/outbox`, followers: `${id}/followers`, following: `${id}/following`,
    publicKey: { id: `${id}#main-key`, owner: id, publicKeyPem: source.publicKey?.publicKeyPem },
    discoverable: true, indexable: true, manuallyApprovesFollowers: false, attachment: []
  };
  if (!body.publicKey.publicKeyPem) return new Response(JSON.stringify({ error: 'actor public key unavailable' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/activity+json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept', 'X-Testagram-Actor-Source': 'gateway-relay' } });
}

async function webfinger(request: Request) {
  const url = new URL(request.url), resource = url.searchParams.get('resource') || '';
  const upstream = await fetch(`${GATEWAY}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`, { headers: { Accept: 'application/jrd+json, application/json', 'User-Agent': 'Testagram-Federation/1.9' } });
  return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/jrd+json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept' } });
}

async function inbox(request: Request, username: string) {
  const body = await request.arrayBuffer(), headers = new Headers(request.headers);
  headers.set('Content-Type', headers.get('Content-Type') || 'application/activity+json');
  const response = await fetch(`${GATEWAY}/users/${encodeURIComponent(username)}/inbox`, { method: 'POST', headers, body });
  return new Response(response.body, { status: response.status, headers: response.headers });
}

async function discovery(request: Request) {
  const url = new URL(request.url);
  const target = `${DISCOVERY}${url.pathname}${url.search}`;
  const response = await fetch(target, { headers: { Accept: AP, 'User-Agent': 'Testagram-Federation/1.9' } });
  return new Response(response.body, { status: response.status, headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/activity+json; charset=utf-8', 'Cache-Control': response.headers.get('Cache-Control') || 'public, max-age=30, s-maxage=60', Vary: 'Accept' } });
}

export default { async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url), actorMatch = url.pathname.match(/^\/users\/([^/]+)$/), inboxMatch = url.pathname.match(/^\/users\/([^/]+)\/inbox$/);
  if (request.method === 'GET' && url.pathname === '/.well-known/webfinger') return webfinger(request);
  if (request.method === 'GET' && actorMatch) return actor(decodeURIComponent(actorMatch[1]));
  if (request.method === 'POST' && inboxMatch) return inbox(request, decodeURIComponent(inboxMatch[1]));
  if (request.method === 'GET' && (/^\/users\/[^/]+\/outbox$/.test(url.pathname) || /^\/users\/[^/]+\/statuses\/[^/]+$/.test(url.pathname) || /^\/objects\/posts\/[^/]+$/.test(url.pathname) || /^\/tags\/[^/]+$/.test(url.pathname))) return discovery(request);
  return federation.fetch(request, env, ctx);
} };
