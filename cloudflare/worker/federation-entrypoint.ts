import worker from './index';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_PROJECT_REF: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_JWKS_URL: string;
  APP_ORIGIN: string;
  MEDIA: R2Bucket;
}

const FEDERATION_ORIGIN = 'https://api.testagram.site';
const CTX = ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'];
const AP_ACCEPT = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/activity+json';

function json(body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
function ap(body: unknown, status = 200) { return json(body, status, { 'Content-Type': 'application/activity+json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); }
function b64(bytes: ArrayBuffer | Uint8Array) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function ub64(value: string) { const s = atob(value); return Uint8Array.from(s, c => c.charCodeAt(0)); }
function enc(v: string) { return encodeURIComponent(v); }

async function db(env: Env, path: string, init: RequestInit = {}) {
  const h = new Headers(init.headers);
  h.set('apikey', env.SUPABASE_SECRET_KEY);
  h.set('Authorization', `Bearer ${env.SUPABASE_SECRET_KEY}`);
  h.set('Content-Type', 'application/json');
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: h });
  if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 700)}`);
  return r;
}

async function actorRow(env: Env, username: string) {
  const r = await db(env, `federation_actors?username=eq.${enc(username)}&select=*`);
  const rows = await r.json() as any[];
  return rows[0] || null;
}

async function signGet(local: any, url: string) {
  const u = new URL(url);
  const date = new Date().toUTCString();
  const key = await crypto.subtle.importKey('jwk', local.private_key_jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const canonical = `(request-target): get ${u.pathname}${u.search}\nhost: ${u.host}\ndate: ${date}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(canonical));
  return fetch(url, { headers: { Host: u.host, Date: date, Accept: AP_ACCEPT, Signature: `keyId="${local.actor_url}#main-key",algorithm="rsa-sha256",headers="(request-target) host date",signature="${b64(sig)}"`, 'User-Agent': 'Testagram-Federation/1.4' } });
}

async function remoteActor(env: Env, local: any, actorUrl: string) {
  const r = await signGet(local, actorUrl);
  const text = await r.text();
  if (!r.ok) throw new Error(`remote actor ${r.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

function parseSignature(value: string) {
  const out: Record<string, string> = {};
  for (const part of value.split(/,(?=\w+=)/)) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim().replace(/^"|"$/g, ''); }
  return out;
}

async function verifyInbox(env: Env, request: Request, body: string, local: any) {
  const sigHeader = request.headers.get('Signature');
  const date = request.headers.get('Date');
  const digest = request.headers.get('Digest');
  if (!sigHeader || !date || !digest) throw new Error('Missing ActivityPub signature headers');
  const expected = `sha-256=${b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)))}`;
  if (digest !== expected && digest !== expected.replace('sha-256=', 'SHA-256=')) throw new Error('Digest mismatch');
  const sig = parseSignature(sigHeader);
  if (!sig.keyId || !sig.signature) throw new Error('Missing signature keyId/signature');
  const remoteUrl = sig.keyId.split('#')[0];
  const remote = await remoteActor(env, local, remoteUrl);
  const pem = remote.publicKey?.publicKeyPem;
  if (!pem) throw new Error('Remote actor has no public key');
  const key = await crypto.subtle.importKey('spki', ub64(pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const u = new URL(request.url);
  const headers = (sig.headers || '(request-target) host date digest').split(' ');
  const lines: string[] = [];
  for (const h of headers) {
    if (h === '(request-target)') lines.push(`(request-target): ${request.method.toLowerCase()} ${u.pathname}${u.search}`);
    else if (h === 'host') lines.push(`host: ${u.host}`);
    else if (h === 'date') lines.push(`date: ${date}`);
    else if (h === 'digest') lines.push(`digest: ${digest}`);
    else lines.push(`${h}: ${request.headers.get(h) || ''}`);
  }
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, ub64(sig.signature), new TextEncoder().encode(lines.join('\n')))) throw new Error('Invalid ActivityPub HTTP signature');
  return remoteUrl;
}

async function webfinger(env: Env, request: Request) {
  const resource = new URL(request.url).searchParams.get('resource') || '';
  const acct = resource.replace(/^acct:/, '').replace(/^@/, '');
  const [username, domain] = acct.split('@');
  if (!username || domain !== 'api.testagram.site') return json({ error: 'actor not found' }, 404);
  const row = await actorRow(env, username);
  if (!row) return json({ error: 'actor not found' }, 404);
  const actor = `${FEDERATION_ORIGIN}/users/${encodeURIComponent(row.username)}`;
  return json({ subject: `acct:${row.username}@api.testagram.site`, aliases: [actor], links: [{ rel: 'self', type: 'application/activity+json', href: actor }] });
}

async function publicActor(env: Env, username: string) {
  const row = await actorRow(env, username);
  if (!row) return ap({ error: 'actor not found' }, 404);
  const actor = `${FEDERATION_ORIGIN}/users/${encodeURIComponent(row.username)}`;
  return ap({ '@context': CTX, id: actor, type: 'Person', preferredUsername: row.username, name: row.username, url: actor, inbox: `${actor}/inbox`, outbox: `${actor}/outbox`, followers: `${actor}/followers`, following: `${actor}/following`, publicKey: { id: `${actor}#main-key`, owner: actor, publicKeyPem: row.public_key_pem }, discoverable: true, indexable: true });
}

async function inbox(env: Env, request: Request, username: string) {
  if (request.method !== 'POST') return ap({ error: 'ActivityPub inbox requires POST' }, 405);
  const row = await actorRow(env, username);
  if (!row) return ap({ error: 'actor not found' }, 404);
  const body = await request.text();
  try {
    const remote = await verifyInbox(env, request, body, row);
    const activity = JSON.parse(body);
    if (!activity.id) return ap({ error: 'activity id required' }, 400);
    let inserted = true;
    try { await db(env, 'federation_inbox', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ activity_id: activity.id, activity_type: activity.type || 'Unknown', actor_url: remote, payload: activity, processing_status: 'received', received_at: new Date().toISOString() }) }); }
    catch (error) { if (String(error).startsWith('Error: db 409')) inserted = false; else throw error; }
    if (activity.type === 'Accept' || activity.type === 'Reject' || activity.type === 'Undo') {
      const fid = typeof activity.object === 'string' ? activity.object : activity.object?.id;
      if (fid) {
        const rel = await db(env, `federation_relationships?activity_id=eq.${enc(fid)}&select=user_id,remote_actor_url`).then(r => r.json() as Promise<any[]>);
        if (rel[0]) {
          const relationship = activity.type === 'Accept' ? 'accepted' : activity.type === 'Reject' ? 'rejected' : 'unfollowed';
          await db(env, `federation_relationships?user_id=eq.${enc(rel[0].user_id)}&remote_actor_url=eq.${enc(rel[0].remote_actor_url)}`, { method: 'PATCH', body: JSON.stringify({ relationship, updated_at: new Date().toISOString(), last_error: null }) });
        }
      }
    }
    await db(env, `federation_inbox?activity_id=eq.${enc(activity.id)}`, { method: 'PATCH', body: JSON.stringify({ processing_status: 'processed', processed_at: new Date().toISOString() }) });
    return ap({ ok: true, duplicate: !inserted }, 202);
  } catch (error) { return ap({ error: error instanceof Error ? error.message : 'Inbox processing failed' }, 401); }
}

async function nodeInfo(env: Env) {
  const rows = await db(env, 'federation_actors?select=user_id').then(r => r.json() as Promise<any[]>).catch(() => []);
  return json({ version: '2.1', software: { name: 'Testagram', version: '1.0.0', repository: 'https://github.com/Trendyzima/XClone-9b4dz1-9b4dz1-8936-20260809' }, protocols: ['activitypub'], usage: { users: { total: rows.length }, localPosts: 0, localComments: 0 }, openRegistrations: true, metadata: { federation: true, domain: 'api.testagram.site' } });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'testagram-api', federation: true, federationDomain: 'api.testagram.site', database: 'supabase', supabaseProjectRef: env.SUPABASE_PROJECT_REF, edge: 'cloudflare' });
    if (url.pathname === '/.well-known/webfinger') return webfinger(env, request);
    if (url.pathname === '/.well-known/nodeinfo') return json({ links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1', href: `${FEDERATION_ORIGIN}/nodeinfo/2.1` }] });
    if (url.pathname === '/.well-known/host-meta') return new Response(`<?xml version="1.0"?><XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0"><Link rel="lrdd" type="application/xrd+xml" template="${FEDERATION_ORIGIN}/.well-known/webfinger?resource={uri}"/></XRD>`, { headers: { 'Content-Type': 'application/xrd+xml; charset=utf-8' } });
    if (url.pathname === '/nodeinfo/2.1') return nodeInfo(env);
    const m = url.pathname.match(/^\/users\/([^/]+)(?:\/(inbox|outbox|followers|following))?$/);
    if (m) {
      const username = decodeURIComponent(m[1]);
      if (m[2] === 'inbox') return inbox(env, request, username);
      if (m[2]) return ap({ '@context': 'https://www.w3.org/ns/activitystreams', id: `${FEDERATION_ORIGIN}/users/${encodeURIComponent(username)}/${m[2]}`, type: m[2] === 'outbox' ? 'OrderedCollection' : 'Collection', totalItems: 0, orderedItems: [] });
      return publicActor(env, username);
    }
    return worker.fetch(request, env, ctx);
  }
};
