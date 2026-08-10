/**
 * gateway-relay — Self-contained Testagram Federation Gateway
 *
 * This edge function is the authoritative gateway for all federation
 * API calls from the frontend. It serves data from the local Supabase DB
 * and optionally federates with remote ActivityPub instances.
 *
 * Routes handled:
 *   GET  /health
 *   GET  /timeline/home
 *   GET  /timeline/local
 *   GET  /timeline/federated
 *   GET  /webfinger/:acct
 *   GET  /users/:username
 *   GET  /users/:username/followers
 *   GET  /users/:username/following
 *   POST /posts
 *   DELETE /posts/:id
 *   POST /follow
 *   POST /unfollow
 *   POST /boost
 *   POST /unboost
 *   POST /favorite
 *   POST /unfavorite
 *   POST /reply
 *   GET  /notifications
 *   DELETE /notifications
 *   GET  /search
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DOMAIN = Deno.env.get('GATEWAY_DOMAIN') ?? 'testagram.site';

// ── Entry point ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const reqBody = await req.json().catch(() => ({}));
    const { path, method = 'GET', body: payload, params = {} } = reqBody;

    if (!path || typeof path !== 'string') {
      return json({ error: '`path` string is required' }, 400);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Authenticate caller
    let userId: string | null = null;
    const auth = req.headers.get('Authorization') ?? '';
    if (auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      userId = user?.id ?? null;
    }

    console.log(`[gateway] ${method.toUpperCase()} ${path} uid=${userId ?? 'anon'}`);

    const result = await routeRequest(
      path,
      method.toUpperCase(),
      payload,
      params as Record<string, string>,
      userId,
      supabaseAdmin,
    );

    return json(result);
  } catch (err: any) {
    const status = err.status ?? 500;
    console.error('[gateway] error:', err.message);
    return json({ error: err.message ?? 'Internal gateway error' }, status);
  }
});

// ── Router ────────────────────────────────────────────────────────────────────

async function routeRequest(
  path: string,
  method: string,
  body: any,
  params: Record<string, string>,
  userId: string | null,
  db: ReturnType<typeof createClient>,
) {
  const limit = Math.min(parseInt(params.limit ?? '30', 10), 100);
  const before = params.before;

  // ── Health ──
  if (path === '/health') {
    const { count } = await db.from('posts').select('*', { count: 'exact', head: true });
    return {
      status: 'ok',
      gateway: 'supabase-edge-v2',
      domain: DOMAIN,
      posts_total: count ?? 0,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Timelines ──
  if (path === '/timeline/federated' || path === '/timeline/global') {
    return getFederatedTimeline(db, limit, before);
  }
  if (path === '/timeline/local') {
    return getLocalTimeline(db, limit, before);
  }
  if (path === '/timeline/home') {
    if (!userId) return [];
    return getHomeTimeline(db, userId, limit, before);
  }

  // ── WebFinger ──
  if (path.startsWith('/webfinger/')) {
    const acct = decodeURIComponent(path.slice(11)).replace(/^@/, '');
    return webfingerLookup(db, acct);
  }

  // ── Users ──
  const followersMatch = path.match(/^\/users\/([^/]+)\/followers$/);
  const followingMatch = path.match(/^\/users\/([^/]+)\/following$/);
  const userMatch = path.match(/^\/users\/([^/]+)$/);

  if (followersMatch) return getUserFollowers(db, decodeURIComponent(followersMatch[1]), limit);
  if (followingMatch) return getUserFollowing(db, decodeURIComponent(followingMatch[1]), limit);
  if (userMatch) return getActorProfile(db, decodeURIComponent(userMatch[1]));

  // ── Posts ──
  if (path === '/posts' && method === 'POST') {
    requireAuth(userId);
    return createPost(db, userId!, body);
  }
  const postMatch = path.match(/^\/posts\/([^/]+)$/);
  if (postMatch && method === 'DELETE') {
    requireAuth(userId);
    return deletePost(db, userId!, postMatch[1]);
  }

  // ── Social ──
  if (method === 'POST') {
    requireAuth(userId);
    if (path === '/follow')     return followUser(db, userId!, body?.target);
    if (path === '/unfollow')   return unfollowUser(db, userId!, body?.target);
    if (path === '/boost')      return boostPost(db, userId!, body?.post_id);
    if (path === '/unboost')    return unboostPost(db, userId!, body?.post_id);
    if (path === '/favorite')   return favoritePost(db, userId!, body?.post_id);
    if (path === '/unfavorite') return unfavoritePost(db, userId!, body?.post_id);
    if (path === '/reply')      return replyToPost(db, userId!, body?.post_id, body?.content);
  }

  // ── Notifications ──
  if (path === '/notifications') {
    if (method === 'GET')    return getNotifications(db, userId, limit);
    if (method === 'DELETE') { requireAuth(userId); return clearNotifications(db, userId!); }
  }

  // ── Search ──
  if (path === '/search') {
    return searchContent(db, params.q ?? '', params.type ?? 'users', limit);
  }

  throw err404(`Unknown gateway endpoint: ${path}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function requireAuth(userId: string | null): asserts userId is string {
  if (!userId) throw Object.assign(new Error('Authentication required'), { status: 401 });
}

function err404(msg: string) {
  return Object.assign(new Error(msg), { status: 404 });
}

// ── Timeline handlers ─────────────────────────────────────────────────────────

async function getFederatedTimeline(
  db: ReturnType<typeof createClient>,
  limit: number,
  before?: string,
) {
  let q = db
    .from('remote_posts')
    .select(
      '*, remote_accounts(username, domain, display_name, avatar_url, actor_url)',
    )
    .order('published_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('published_at', before);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getLocalTimeline(
  db: ReturnType<typeof createClient>,
  limit: number,
  before?: string,
) {
  let q = db
    .from('posts')
    .select(
      '*, user_profiles!posts_user_id_fkey(id, username, avatar_url, verified, is_creator)',
    )
    .is('community_id', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getHomeTimeline(
  db: ReturnType<typeof createClient>,
  userId: string,
  limit: number,
  before?: string,
) {
  const { data: following } = await db
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  const ids: string[] = [...((following ?? []).map((f: any) => f.following_id)), userId];

  let q = db
    .from('posts')
    .select(
      '*, user_profiles!posts_user_id_fkey(id, username, avatar_url, verified, is_creator)',
    )
    .in('user_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── ActivityPub / WebFinger ───────────────────────────────────────────────────

async function webfingerLookup(db: ReturnType<typeof createClient>, acct: string) {
  const [username, acctDomain] = acct.includes('@') ? acct.split('@') : [acct, DOMAIN];

  // Remote actor — proxy the WebFinger lookup
  if (acctDomain && acctDomain !== DOMAIN) {
    try {
      const url = `https://${acctDomain}/.well-known/webfinger?resource=acct:${username}@${acctDomain}`;
      const res = await fetch(url, { headers: { Accept: 'application/jrd+json' } });
      if (res.ok) {
        const data = await res.json();
        // Cache remote actor in DB for future lookups
        cacheRemoteActorFromWebfinger(db, data, acctDomain).catch(() => {});
        return data;
      }
    } catch {}
    return { error: `Remote WebFinger lookup failed for ${acct}` };
  }

  // Local actor
  const { data: actor } = await db
    .from('activitypub_actors')
    .select('actor_id, username')
    .eq('username', username)
    .maybeSingle();

  const actorId = actor?.actor_id ?? `https://${DOMAIN}/users/${username}`;

  return {
    subject: `acct:${username}@${DOMAIN}`,
    aliases: [actorId, `https://${DOMAIN}/@${username}`],
    links: [
      { rel: 'self', type: 'application/activity+json', href: actorId },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: `https://${DOMAIN}/@${username}`,
      },
    ],
  };
}

async function getActorProfile(db: ReturnType<typeof createClient>, username: string) {
  // Check if it's a remote actor (username@domain)
  if (username.includes('@')) {
    const [uname, domain] = username.split('@');
    const { data: remote } = await db
      .from('remote_accounts')
      .select('*')
      .eq('username', uname)
      .eq('domain', domain)
      .maybeSingle();
    if (remote?.raw_actor) return remote.raw_actor;
    // Try to fetch remotely
    try {
      const wf = await webfingerLookup(db, username);
      const selfLink = (wf as any)?.links?.find((l: any) => l.rel === 'self');
      if (selfLink?.href) {
        const res = await fetch(selfLink.href, { headers: { Accept: 'application/activity+json' } });
        if (res.ok) return res.json();
      }
    } catch {}
    return { error: 'Remote actor not found' };
  }

  const { data: actor } = await db
    .from('activitypub_actors')
    .select('*, user_profiles!activitypub_actors_user_id_fkey(username, bio, avatar_url, verified, followers_count, following_count)')
    .eq('username', username)
    .maybeSingle();

  if (actor) {
    const profile: any = actor.user_profiles ?? {};
    return buildLocalActor(actor.actor_id, actor.username, actor.inbox_url, actor.outbox_url, actor.followers_url, actor.following_url, profile.bio ?? '', profile.avatar_url ?? '');
  }

  // Fallback: build from user_profiles
  const { data: profile } = await db
    .from('user_profiles')
    .select('id, username, bio, avatar_url, verified, followers_count, following_count')
    .eq('username', username)
    .maybeSingle();

  if (!profile) return { error: `User @${username} not found` };

  const actorId = `https://${DOMAIN}/users/${profile.username}`;
  return buildLocalActor(
    actorId,
    profile.username,
    `${actorId}/inbox`,
    `${actorId}/outbox`,
    `${actorId}/followers`,
    `${actorId}/following`,
    profile.bio ?? '',
    profile.avatar_url ?? '',
  );
}

function buildLocalActor(
  actorId: string,
  username: string,
  inbox: string,
  outbox: string,
  followers: string,
  following: string,
  bio: string,
  avatarUrl: string,
) {
  return {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
    ],
    id: actorId,
    type: 'Person',
    preferredUsername: username,
    name: username,
    summary: bio,
    inbox,
    outbox,
    followers,
    following,
    url: `https://${DOMAIN}/@${username}`,
    manuallyApprovesFollowers: false,
    ...(avatarUrl
      ? { icon: { type: 'Image', mediaType: 'image/jpeg', url: avatarUrl } }
      : {}),
    endpoints: { sharedInbox: `https://${DOMAIN}/inbox` },
  };
}

async function getUserFollowers(db: ReturnType<typeof createClient>, username: string, limit: number) {
  const { data: profile } = await db
    .from('user_profiles')
    .select('id, followers_count')
    .eq('username', username)
    .maybeSingle();
  if (!profile) return { type: 'OrderedCollection', totalItems: 0, orderedItems: [] };

  const { data } = await db
    .from('follows')
    .select('user_profiles!follows_follower_id_fkey(id, username, avatar_url)')
    .eq('following_id', profile.id)
    .limit(limit);

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollection',
    totalItems: profile.followers_count ?? (data?.length ?? 0),
    orderedItems: (data ?? []).map((d: any) => d['user_profiles!follows_follower_id_fkey']),
  };
}

async function getUserFollowing(db: ReturnType<typeof createClient>, username: string, limit: number) {
  const { data: profile } = await db
    .from('user_profiles')
    .select('id, following_count')
    .eq('username', username)
    .maybeSingle();
  if (!profile) return { type: 'OrderedCollection', totalItems: 0, orderedItems: [] };

  const { data } = await db
    .from('follows')
    .select('user_profiles!follows_following_id_fkey(id, username, avatar_url)')
    .eq('follower_id', profile.id)
    .limit(limit);

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollection',
    totalItems: profile.following_count ?? (data?.length ?? 0),
    orderedItems: (data ?? []).map((d: any) => d['user_profiles!follows_following_id_fkey']),
  };
}

// ── Post handlers ─────────────────────────────────────────────────────────────

async function createPost(db: ReturnType<typeof createClient>, userId: string, body: any) {
  const { data, error } = await db
    .from('posts')
    .insert({
      user_id: userId,
      content: body?.content ?? '',
      image_url: Array.isArray(body?.mediaIds) ? body.mediaIds[0] ?? null : null,
    })
    .select('*, user_profiles!posts_user_id_fkey(id, username, avatar_url, verified)')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function deletePost(db: ReturnType<typeof createClient>, userId: string, postId: string) {
  const { error } = await db
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return { deleted: true, id: postId };
}

// ── Social handlers ───────────────────────────────────────────────────────────

async function followUser(db: ReturnType<typeof createClient>, userId: string, target: string) {
  if (!target) throw new Error('target is required');
  const isRemote =
    target.includes('@') &&
    !target.toLowerCase().endsWith(`@${DOMAIN}`) &&
    !target.toLowerCase().endsWith('@testagram.site');

  if (isRemote) {
    const clean = target.replace(/^@/, '');
    const [uname, domain] = clean.split('@');
    let remoteActorUrl = `https://${domain}/users/${uname}`;
    let remoteInboxUrl = '';

    try {
      const wf = await fetch(
        `https://${domain}/.well-known/webfinger?resource=acct:${clean}`,
        { headers: { Accept: 'application/jrd+json' } },
      );
      if (wf.ok) {
        const wfData = await wf.json();
        const selfLink = wfData.links?.find((l: any) => l.rel === 'self');
        if (selfLink?.href) {
          const actorRes = await fetch(selfLink.href, {
            headers: { Accept: 'application/activity+json' },
          });
          if (actorRes.ok) {
            const ap: any = await actorRes.json();
            remoteActorUrl = ap.id ?? selfLink.href;
            remoteInboxUrl = ap.inbox ?? '';
          }
        }
      }
    } catch {}

    const { error } = await db.from('federated_following').upsert(
      {
        local_user_id: userId,
        remote_actor_url: remoteActorUrl,
        remote_username: uname,
        remote_domain: domain,
        remote_inbox_url: remoteInboxUrl,
        accepted: false,
      },
      { onConflict: 'local_user_id,remote_actor_url' },
    );
    if (error) throw new Error(error.message);
    return { following: true, remote: true, target };
  }

  // Local follow
  const uname = target.replace(/^@/, '');
  const { data: targetUser } = await db
    .from('user_profiles')
    .select('id')
    .eq('username', uname)
    .maybeSingle();
  if (!targetUser) throw new Error(`User @${uname} not found`);

  const { error } = await db
    .from('follows')
    .upsert({ follower_id: userId, following_id: targetUser.id }, { onConflict: 'follower_id,following_id' });
  if (error) throw new Error(error.message);
  return { following: true, remote: false, target };
}

async function unfollowUser(db: ReturnType<typeof createClient>, userId: string, target: string) {
  if (!target) throw new Error('target is required');
  const isRemote =
    target.includes('@') &&
    !target.toLowerCase().endsWith(`@${DOMAIN}`) &&
    !target.toLowerCase().endsWith('@testagram.site');

  if (isRemote) {
    await db
      .from('federated_following')
      .delete()
      .eq('local_user_id', userId)
      .eq('remote_username', target.replace(/^@/, '').split('@')[0]);
    return { following: false };
  }

  const uname = target.replace(/^@/, '');
  const { data: targetUser } = await db
    .from('user_profiles')
    .select('id')
    .eq('username', uname)
    .maybeSingle();
  if (targetUser) {
    await db.from('follows').delete().eq('follower_id', userId).eq('following_id', targetUser.id);
  }
  return { following: false };
}

async function boostPost(db: ReturnType<typeof createClient>, userId: string, postId: string) {
  if (!postId) throw new Error('post_id is required');
  const { error } = await db
    .from('reposts')
    .upsert({ user_id: userId, post_id: postId }, { onConflict: 'user_id,post_id' });
  if (error) throw new Error(error.message);
  return { boosted: true, post_id: postId };
}

async function unboostPost(db: ReturnType<typeof createClient>, userId: string, postId: string) {
  await db.from('reposts').delete().eq('user_id', userId).eq('post_id', postId);
  return { boosted: false, post_id: postId };
}

async function favoritePost(db: ReturnType<typeof createClient>, userId: string, postId: string) {
  if (!postId) throw new Error('post_id is required');
  const { error } = await db
    .from('likes')
    .upsert({ user_id: userId, post_id: postId }, { onConflict: 'user_id,post_id' });
  if (error) throw new Error(error.message);
  return { favorited: true, post_id: postId };
}

async function unfavoritePost(db: ReturnType<typeof createClient>, userId: string, postId: string) {
  await db.from('likes').delete().eq('user_id', userId).eq('post_id', postId);
  return { favorited: false, post_id: postId };
}

async function replyToPost(
  db: ReturnType<typeof createClient>,
  userId: string,
  postId: string,
  content: string,
) {
  if (!postId || !content) throw new Error('post_id and content are required');
  const { data, error } = await db
    .from('replies')
    .insert({ user_id: userId, post_id: postId, content })
    .select('*, user_profiles!replies_user_id_fkey(id, username, avatar_url, verified)')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Notifications ─────────────────────────────────────────────────────────────

async function getNotifications(
  db: ReturnType<typeof createClient>,
  userId: string | null,
  limit: number,
) {
  if (!userId) return [];
  const { data, error } = await db
    .from('notifications')
    .select(
      '*, from_user:user_profiles!notifications_from_user_id_fkey(id, username, avatar_url, verified)',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function clearNotifications(db: ReturnType<typeof createClient>, userId: string) {
  const { error } = await db
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw new Error(error.message);
  return { cleared: true };
}

// ── Search ────────────────────────────────────────────────────────────────────

async function searchContent(
  db: ReturnType<typeof createClient>,
  q: string,
  type: string,
  limit: number,
) {
  if (!q.trim()) return [];

  if (type === 'users') {
    const { data } = await db
      .from('user_profiles')
      .select('id, username, bio, avatar_url, verified, followers_count, is_creator')
      .or(`username.ilike.%${q}%,bio.ilike.%${q}%`)
      .limit(limit);
    return data ?? [];
  }

  if (type === 'posts') {
    const { data } = await db
      .from('posts')
      .select('*, user_profiles!posts_user_id_fkey(id, username, avatar_url, verified)')
      .ilike('content', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  }

  if (type === 'hashtags') {
    const { data } = await db
      .from('hashtags')
      .select('id, tag, usage_count')
      .ilike('tag', `%${q}%`)
      .order('usage_count', { ascending: false })
      .limit(limit);
    return data ?? [];
  }

  if (type === 'instances') {
    const { data } = await db
      .from('remote_accounts')
      .select('domain')
      .ilike('domain', `%${q}%`)
      .limit(limit * 2);
    const domains = [...new Set((data ?? []).map((r: any) => r.domain))].slice(0, limit);
    return domains.map((d: string) => ({ domain: d }));
  }

  return [];
}

// ── Remote actor cache helper ─────────────────────────────────────────────────

async function cacheRemoteActorFromWebfinger(
  db: ReturnType<typeof createClient>,
  wfData: any,
  domain: string,
) {
  const selfLink = wfData.links?.find((l: any) => l.rel === 'self' && l.type?.includes('activity+json'));
  if (!selfLink?.href) return;
  try {
    const res = await fetch(selfLink.href, { headers: { Accept: 'application/activity+json' } });
    if (!res.ok) return;
    const actor: any = await res.json();
    await db.from('remote_accounts').upsert(
      {
        actor_url: actor.id ?? selfLink.href,
        username: actor.preferredUsername ?? '',
        domain,
        display_name: actor.name ?? actor.preferredUsername ?? '',
        bio: actor.summary ?? '',
        avatar_url: actor.icon?.url ?? null,
        inbox_url: actor.inbox ?? '',
        public_key: actor.publicKey?.publicKeyPem ?? null,
        raw_actor: actor,
        last_fetched_at: new Date().toISOString(),
      },
      { onConflict: 'actor_url' },
    );
  } catch {}
}
