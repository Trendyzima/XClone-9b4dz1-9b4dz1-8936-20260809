import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });

const HALF_LIFE_HOURS = 12;
const MAX_AUTHOR_ITEMS = 3;

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

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function nativeEngagement(p: any) {
  const a = Array.isArray(p.post_analytics) ? p.post_analytics[0] : p.post_analytics;
  return num(a?.likes ?? p.likes_count ?? p.like_count) * 2 +
    num(a?.reposts ?? p.reposts_count ?? p.repost_count) * 3 +
    num(a?.replies ?? p.replies_count ?? p.reply_count) * 1.5 +
    num(a?.views ?? p.views_count ?? p.view_count) * 0.05;
}

function fedEngagement(uri: string, activities: any[]) {
  let likes = 0;
  let announces = 0;
  for (const activity of activities || []) {
    if (String(activity.object_uri || '').trim() !== uri) continue;
    if (activity.activity_type === 'Like') likes++;
    else if (activity.activity_type === 'Announce') announces++;
  }
  return likes * 2 + announces * 3;
}

function dateOf(item: any) {
  return Date.parse(String(item.created_at || item.published_at || item.published || '')) || 0;
}

function authorOf(item: any) {
  return String(item.author_id || item.user_id || item.author?.id || item.actor_uri || item.attributed_to || item.uri || item.id || 'unknown');
}

function tagsOf(item: any): string[] {
  const raw = item._hashtag_tags || item.hashtags || [];
  return Array.isArray(raw) ? raw.map((x: any) => String(x?.tag ?? x).toLowerCase()).filter(Boolean) : [];
}

function rankCandidate(item: any, signals: { followingIds: Set<string>; hiddenAuthors: Set<string>; interestTags: Set<string>; activities: any[] }) {
  const ageHours = Math.max(0, (Date.now() - dateOf(item)) / 3_600_000);
  const decay = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
  const engagement = item.source === 'fediverse' ? fedEngagement(String(item.uri || ''), signals.activities) : nativeEngagement(item);
  const normalizedEngagement = Math.log1p(engagement) * 10;
  const author = authorOf(item);
  const following = signals.followingIds.has(author) ? 20 : 0;
  const interest = tagsOf(item).some((tag) => signals.interestTags.has(tag)) ? 15 : 0;
  const verified = item.author?.verified_tier && item.author.verified_tier !== 'none' ? 5 : 0;
  const media = item.media_type === 'video' || item.video_url ? 8 : item.media_url ? 4 : 0;
  const sourceBalance = item.source === 'fediverse' ? 1 : 0;
  const score = normalizedEngagement * decay + following + interest + verified + media + sourceBalance;
  return { ...item, _rank_score: Number(score.toFixed(6)), _rank_time: dateOf(item), _rank_author: author };
}

function compare(a: any, b: any) {
  if (b._rank_score !== a._rank_score) return b._rank_score - a._rank_score;
  if (b._rank_time !== a._rank_time) return b._rank_time - a._rank_time;
  return String(a.uri || a.id || '').localeCompare(String(b.uri || b.id || ''));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const { mode, limit, before } = await input(req);
    const uid = mode === 'explore' ? null : await userId(req);
    if (mode !== 'explore' && !uid) return json({ error: 'Authentication required' }, 401);

    let nativeAuthorIds: string[] | null = null;
    let remoteActorUrls: string[] | null = null;
    const followingIds = new Set<string>();
    const hiddenAuthors = new Set<string>();
    const interestTags = new Set<string>();

    if (uid) {
      const [localFollows, remoteFollows, mutes, blocks, interests] = await Promise.all([
        admin.from('follows').select('following_id').eq('follower_id', uid).limit(500),
        admin.from('federation_relationships').select('remote_actor_url').eq('local_user_id', uid).eq('relationship', 'accepted').eq('state', 'accepted').limit(500),
        admin.from('mutes').select('muted_id').eq('muter_id', uid).limit(200),
        admin.from('user_blocks').select('blocked_id').eq('blocker_id', uid).limit(200),
        admin.from('user_interests').select('interest_score,hashtags:hashtag_id(tag)').eq('user_id', uid).order('interest_score', { ascending: false }).limit(50),
      ]);
      if (localFollows.error) throw new Error(`native follows: ${localFollows.error.message}`);
      if (remoteFollows.error) throw new Error(`federated follows: ${remoteFollows.error.message}`);
      if (mutes.error) throw new Error(`mutes: ${mutes.error.message}`);
      if (blocks.error) throw new Error(`blocks: ${blocks.error.message}`);
      if (interests.error) throw new Error(`interests: ${interests.error.message}`);

      nativeAuthorIds = [uid, ...(localFollows.data || []).map((x: any) => String(x.following_id)).filter(Boolean)];
      nativeAuthorIds.forEach((id) => followingIds.add(id));
      (mutes.data || []).forEach((x: any) => hiddenAuthors.add(String(x.muted_id)));
      (blocks.data || []).forEach((x: any) => hiddenAuthors.add(String(x.blocked_id)));
      (interests.data || []).forEach((x: any) => {
        const tag = x.hashtags?.tag;
        if (tag && num(x.interest_score) > 0) interestTags.add(String(tag).toLowerCase());
      });
      remoteActorUrls = (remoteFollows.data || []).map((x: any) => String(x.remote_actor_url)).filter(Boolean);
    }

    const candidateLimit = Math.min(100, Math.max(limit * 5, 50));
    const nativeQuery = admin.from('posts')
      .select('*,author:profiles!posts_author_id_fkey(*),post_analytics(likes,replies,reposts,views)')
      .is('deleted_at', null).eq('visibility', 'public')
      .order('created_at', { ascending: false }).limit(candidateLimit);
    if (nativeAuthorIds) nativeQuery.in('author_id', nativeAuthorIds);

    const fedQuery = admin.from('federated_objects')
      .select('*').is('deleted_at', null)
      .in('object_type', ['Note', 'Article', 'Question', 'Video'])
      .order('published_at', { ascending: false }).limit(candidateLimit);
    if (remoteActorUrls) {
      if (remoteActorUrls.length) fedQuery.in('actor_uri', remoteActorUrls);
      else fedQuery.eq('actor_uri', '__no_followed_remote_actor__');
    }
    if (before) { nativeQuery.lt('created_at', before); fedQuery.lt('published_at', before); }

    const activityQuery = admin.from('federated_activities').select('object_uri,activity_type').in('activity_type', ['Like', 'Announce']).limit(5000);
    const [native, fed, activities] = await Promise.all([nativeQuery, fedQuery, activityQuery]);
    if (native.error) throw new Error(`native feed: ${native.error.message}`);
    if (fed.error) throw new Error(`fediverse feed: ${fed.error.message}`);
    if (activities.error) throw new Error(`federated activity ranking: ${activities.error.message}`);

    const candidates = [
      ...(native.data || []).filter((p: any) => !hiddenAuthors.has(String(p.author_id))).map((p: any) => ({ ...p, source: 'xclone', origin: 'local' })),
      ...(fed.data || []).filter((p: any) => !p.sensitive).map((p: any) => ({ ...p, source: 'fediverse', origin: 'federated', fediv: true })),
    ];

    const seen = new Set<string>();
    const ranked = candidates
      .filter((p: any) => {
        const id = p.source === 'fediverse' ? String(p.uri || p.id || '') : String(p.id || '');
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((p: any) => rankCandidate(p, { followingIds, hiddenAuthors, interestTags, activities: activities.data || [] }))
      .sort(compare);

    const items: any[] = [];
    const authorCounts = new Map<string, number>();
    let localCount = 0;
    let fedCount = 0;
    for (const item of ranked) {
      const author = item._rank_author;
      const count = authorCounts.get(author) || 0;
      if (count >= MAX_AUTHOR_ITEMS) continue;
      // Explore benefits from source diversity; Following remains relationship-first.
      if (mode === 'explore' && items.length < limit && candidates.length > 1) {
        if (item.source === 'xclone' && localCount > Math.ceil(limit * 0.8)) continue;
        if (item.source === 'fediverse' && fedCount > Math.ceil(limit * 0.8)) continue;
      }
      authorCounts.set(author, count + 1);
      if (item.source === 'xclone') localCount++; else fedCount++;
      const { _rank_score, _rank_time, _rank_author, ...clean } = item;
      items.push(clean);
      if (items.length >= limit) break;
    }

    return json({ ok: true, mode, items, meta: {
      count: items.length,
      native: localCount,
      fediverse: fedCount,
      next_cursor: items.at(-1)?.created_at || items.at(-1)?.published_at || null,
      rankedAt: new Date().toISOString(),
      ranking: 'unified-v2',
      rankingSignals: ['recency_decay', 'log_engagement', 'relationship', 'interest', 'media', 'verified', 'author_diversity', 'source_balance', 'stable_tiebreak'],
      graph: mode === 'explore' ? 'public' : 'following+federated-following',
    } });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Feed failed' }, 500);
  }
});
