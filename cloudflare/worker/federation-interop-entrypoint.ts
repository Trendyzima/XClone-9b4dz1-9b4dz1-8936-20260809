import federation from './federation-entrypoint';
import { handleFederationInteraction } from './federation-interaction-entrypoint';

const DOMAIN = 'federation.testagram.site';
const ORIGIN = `https://${DOMAIN}`;
const AP = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/activity+json';
const CTX = ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'];

async function db(env: any, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('apikey', env.SUPABASE_SECRET_KEY);
  headers.set('Authorization', `Bearer ${env.SUPABASE_SECRET_KEY}`);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`db ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}
function actorName(row: any, fallback: string) { return String(row.username || row.preferred_username || fallback || '').trim(); }
async function actor(env: any, username: string) {
  const encodedUsername = encodeURIComponent(username);
  const canonicalActorUrl = `${ORIGIN}/users/${encodedUsername}`;
  const canonical = await db(env, `federation_actors?actor_url=eq.${encodeURIComponent(canonicalActorUrl)}&select=*`) as any[];
  if (canonical[0]) return canonical[0];
  const byUsername = await db(env, `federation_actors?username=eq.${encodedUsername}&select=*`) as any[];
  return byUsername[0] || null;
}
function apResponse(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/activity+json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } }); }
async function webfinger(env: any, request: Request) {
  const resource = new URL(request.url).searchParams.get('resource') || '';
  const value = resource.replace(/^acct:/, '').replace(/^@/, '');
  const [username, domain] = value.split('@');
  if (!username || domain !== DOMAIN) return new Response(JSON.stringify({ error: 'actor not found' }), { status: 404, headers: { 'Content-Type': 'application/jrd+json; charset=utf-8' } });
  const row = await actor(env, username);
  if (!row) return new Response(JSON.stringify({ error: 'actor not found' }), { status: 404, headers: { 'Content-Type': 'application/jrd+json; charset=utf-8' } });
  const name = actorName(row, username), id = `${ORIGIN}/users/${encodeURIComponent(name)}`;
  return new Response(JSON.stringify({ subject: `acct:${name}@${DOMAIN}`, aliases: [id], links: [{ rel: 'self', type: 'application/activity+json', href: id }] }), { status: 200, headers: { 'Content-Type': 'application/jrd+json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
async function actorGet(env: any, username: string) {
  const row = await actor(env, username);
  if (!row) return apResponse({ error: 'actor not found' }, 404);
  const name = actorName(row, username), id = `${ORIGIN}/users/${encodeURIComponent(name)}`;
  return apResponse({ '@context': CTX, id, type: 'Person', preferredUsername: name, webfinger: `acct:${name}@${DOMAIN}`, name, url: id, inbox: `${id}/inbox`, outbox: `${id}/outbox`, followers: `${id}/followers`, following: `${id}/following`, manuallyApprovesFollowers: false, discoverable: true, indexable: true, publicKey: { id: `${id}#main-key`, owner: id, publicKeyPem: row.public_key_pem } });
}
async function remoteInteractionObject(env: any, request: Request, username: string, interactionId: string) {
  if (request.method !== 'GET') return null;
  const local = await actor(env, username);
  if (!local) return apResponse({ error: 'actor not found' }, 404);
  const rows = await db(env, `federation_remote_interactions?id=eq.${encodeURIComponent(interactionId)}&local_user_id=eq.${encodeURIComponent(local.user_id)}&select=id,interaction_type,status,payload,object_url,activity_uri`) as any[];
  const row = rows[0];
  if (!row || !['reply', 'quote'].includes(String(row.interaction_type))) return apResponse({ error: 'object not found' }, 404);
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : null;
  const object = payload?.object && typeof payload.object === 'object' ? payload.object : null;
  if (!object || typeof object.id !== 'string') return apResponse({ error: 'object not found' }, 404);
  const expectedId = `${ORIGIN}/users/${encodeURIComponent(actorName(local, username))}/remote-interactions/${interactionId}`;
  if (object.id !== expectedId) return apResponse({ error: 'object identity mismatch' }, 409);
  return apResponse({ '@context': Array.isArray(payload['@context']) ? payload['@context'] : CTX, ...object });
}
export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const actorMatch = url.pathname.match(/^\/users\/([^/]+)$/);
    const inboxMatch = url.pathname.match(/^\/users\/([^/]+)\/inbox$/);
    const interactionObjectMatch = url.pathname.match(/^\/users\/([^/]+)\/remote-interactions\/([0-9a-f-]+)$/i);
    if (request.method === 'GET' && url.pathname === '/.well-known/webfinger') return webfinger(env, request);
    if (request.method === 'GET' && actorMatch) return actorGet(env, decodeURIComponent(actorMatch[1]));
    if (request.method === 'GET' && interactionObjectMatch) return remoteInteractionObject(env, request, decodeURIComponent(interactionObjectMatch[1]), interactionObjectMatch[2]);
    if (request.method === 'POST' && inboxMatch) { const handled = await handleFederationInteraction(request, env, decodeURIComponent(inboxMatch[1])); if (handled) return handled; }
    return federation.fetch(request, env, ctx);
  },
};

// Public federation surface is intentionally handled before authenticated API routing.
// Remote Create/Like/Announce/Undo activities are persisted by the isolated interaction handler.
// Reply/quote objects emitted by Testagram are also dereferenceable at their canonical IDs.
// Interaction hardening is intentionally bundled here so the canonical Worker deploy path includes the inbox verifier.
