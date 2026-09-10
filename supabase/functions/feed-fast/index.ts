import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });

async function input(req: Request) {
  const u = new URL(req.url);
  let body: any = {};
  if (req.method !== 'GET') { try { body = await req.json(); } catch {} }
  const mode = String(body.mode ?? u.searchParams.get('mode') ?? 'explore').toLowerCase();
  return {
    mode: ['home', 'following', 'explore'].includes(mode) ? mode : 'explore',
    limit: Math.min(100, Math.max(10, Number(body.limit ?? u.searchParams.get('limit') ?? 20))),
    before: String(body.before ?? u.searchParams.get('before') ?? '').trim() || null,
  };
}

async function userId(req: Request): Promise<string | null> {
  const authorization = req.headers.get('Authorization');
  if (!authorization || !ANON) return null;
  const response = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: authorization } });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id || null;
}

function nativeFrequency(p: any) {
  const a = Array.isArray(p.post_analytics) ? p.post_analytics[0] : p.post_analytics;
  return Number(a?.likes ?? p.likes_count ?? p.like_count ?? 0) + Number(a?.replies ?? p.replies_count ?? p.reply_count ?? 0) + Number(a?.reposts ?? p.reposts_count ?? p.repost_count ?? 0);
}

function fedFrequency(uri: string, activities: any[]) {
  return (activities || []).reduce((n, a) => n + (String(a.object_uri || '').trim() === uri ? 1 : 0), 0);
}

function dateOf(item: any) { return Date.parse(String(item.created_at || item.published_at || item.published || '')) || 0; }
function compare(a: any, b: any) {
  if (b.frequency !== a.frequency) return b.frequency - a.frequency;
  return dateOf(b) - dateOf(a);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const { mode, limit, before } = await input(req);
    const uid = mode === 'explore' ? null : await userId(req);
    if (mode !== 'explore' && !uid) return json({ error: 'Authentication required' }, 401);

    let nativeAuthorIds: string[] | null = null;
    let remoteActorUrls: string[] | null = null;
    if (uid) {
      const [localFollows, remoteFollows] = await Promise.all([
        admin.from('follows').select('following_id').eq('follower_id', uid),
        admin.from('federation_relationships').select('remote_actor_url').eq('local_user_id', uid).eq('relationship', 'accepted').eq('state', 'accepted'),
      ]);
      if (localFollows.error) throw new Error(`native follows: ${localFollows.error.message}`);
      if (remoteFollows.error) throw new Error(`federated follows: ${remoteFollows.error.message}`);
      nativeAuthorIds = [uid, ...(localFollows.data || []).map((x: any) => String(x.following_id)).filter(Boolean)];
      remoteActorUrls = (remoteFollows.data || []).map((x: any) => String(x.remote_actor_url)).filter(Boolean);
    }

    const nativeQuery = admin.from('posts')
      .select('*,author:profiles!posts_author_id_fkey(*),post_analytics(likes,replies,reposts)')
      .is('deleted_at', null).eq('visibility', 'public')
      .order('created_at', { ascending: false }).limit(Math.min(100, limit * 4));
    if (nativeAuthorIds) {
      nativeQuery.in('author_id', nativeAuthorIds);
      if (!nativeAuthorIds.length) nativeQuery.eq('author_id', '00000000-0000-0000-0000-000000000000');
    }
    const fedQuery = admin.from('federated_objects')
      .select('*').is('deleted_at', null)
      .in('object_type', ['Note', 'Article', 'Question', 'Video'])
      .order('published_at', { ascending: false }).limit(Math.min(100, limit * 4));
    if (remoteActorUrls) {
      if (remoteActorUrls.length) fedQuery.in('actor_uri', remoteActorUrls);
      else fedQuery.eq('actor_uri', '__no_followed_remote_actor__');
    }
    if (before) { nativeQuery.lt('created_at', before); fedQuery.lt('published_at', before); }

    const activityQuery = admin.from('federated_activities').select('object_uri,activity_type').in('activity_type', ['Like', 'Announce']);
    const [native, fed, activities] = await Promise.all([nativeQuery, fedQuery, activityQuery]);
    if (native.error) throw new Error(`native feed: ${native.error.message}`);
    if (fed.error) throw new Error(`fediverse feed: ${fed.error.message}`);
    if (activities.error) throw new Error(`federated activity ranking: ${activities.error.message}`);

    const candidates = [
      ...(native.data || []).map((p: any) => ({ ...p, source: 'xclone', origin: 'local', frequency: nativeFrequency(p) })),
      ...(fed.data || []).filter((p: any) => !p.sensitive).map((p: any) => ({ ...p, source: 'fediverse', origin: 'federated', fediv: true, frequency: fedFrequency(String(p.uri), activities.data || []) })),
    ];

    const seen = new Set<string>();
    const items = candidates.filter(p => {
      const id = p.source === 'fediverse' ? (p.uri || p.id) : p.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).sort(compare).slice(0, limit).map(({ frequency, ...item }) => item);

    return json({ ok: true, mode, items, meta: {
      count: items.length,
      native: items.filter(x => x.source === 'xclone').length,
      fediverse: items.filter(x => x.source === 'fediverse').length,
      next_cursor: items.at(-1)?.created_at || items.at(-1)?.published_at || null,
      rankedAt: new Date().toISOString(),
      ranking: 'frequency_first',
      graph: mode === 'explore' ? 'public' : 'following+federated-following',
    } });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Feed failed' }, 500);
  }
});
