import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createFederation } from 'npm:@fedify/fedify@2.4.0';

const ORIGIN = 'https://federation.testagram.site';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const federation = createFederation({ origin: ORIGIN });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, accept',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, ...extra, 'Content-Type': 'application/json; charset=utf-8' } });

const actorUrl = (username: string) => `${ORIGIN}/users/${encodeURIComponent(username)}`;
const inboxUrl = (username: string) => `${actorUrl(username)}/inbox`;

async function findProfile(username: string) {
  const { data, error } = await db.from('profiles').select('id,username,display_name,full_name,bio,avatar_url,website').eq('username', username).maybeSingle();
  if (error) throw error;
  return data;
}

function actorDocument(profile: any) {
  const username = profile.username;
  const id = actorUrl(username);
  return {
    '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
    id,
    type: 'Person',
    preferredUsername: username,
    name: profile.display_name || profile.full_name || username,
    summary: profile.bio || '',
    url: `https://testagram.site/profile/${encodeURIComponent(username)}`,
    inbox: inboxUrl(username),
    outbox: `${id}/outbox`,
    followers: `${id}/followers`,
    following: `${id}/following`,
    publicKey: {
      id: `${id}#main-key`,
      owner: id,
      publicKeyPem: undefined,
    },
    icon: profile.avatar_url ? { type: 'Image', mediaType: 'image/*', url: profile.avatar_url } : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$|^\/+/, '');
  try {
    if (req.method === 'GET' && (path.endsWith('health') || path === '')) {
      return json({ ok: true, service: 'fedify-federation', framework: 'Fedify', version: '2.4.0', mode: 'testagram-adapter', federationInitialized: Boolean(federation) });
    }
    if (req.method === 'GET' && path.endsWith('capabilities')) {
      return json({ ok: true, protocol: 'activitypub', capabilities: ['actor-resolution', 'webfinger'], implementation: 'database-backed-adapter' });
    }
    if (req.method === 'GET' && path.includes('.well-known/webfinger')) {
      const resource = url.searchParams.get('resource') ?? '';
      const match = resource.match(/^acct:([^@]+)@([^:]+)$/i);
      if (!match || match[2].toLowerCase() !== new URL(ORIGIN).hostname.toLowerCase()) return json({ error: 'Resource not found' }, 404);
      const profile = await findProfile(match[1]);
      if (!profile) return json({ error: 'Resource not found' }, 404);
      const id = actorUrl(profile.username);
      return json({ subject: `acct:${profile.username}@${new URL(ORIGIN).hostname}`, aliases: [id], links: [{ rel: 'self', type: 'application/activity+json', href: id }] });
    }
    const actorMatch = path.match(/(?:^|\/)users\/([^/]+)$/);
    if (req.method === 'GET' && actorMatch) {
      const profile = await findProfile(decodeURIComponent(actorMatch[1]));
      if (!profile) return json({ error: 'Actor not found' }, 404);
      return json(actorDocument(profile), 200, { 'Content-Type': 'application/activity+json; profile="https://www.w3.org/ns/activitystreams"' });
    }
    return json({ error: 'Fedify route not found' }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
