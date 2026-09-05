import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function client(req: Request) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

async function requireUser(req: Request) {
  const sb = client(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error('Unauthorized');
  return { sb, user: data.user };
}

async function timeline(sb: any, limit: number, before?: string) {
  let q = sb.from('posts').select('*,author:profiles(id,username,display_name,avatar_url,verified_tier)').is('deleted_at', null).order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return { posts: data ?? [], next_cursor: data?.length ? data[data.length - 1].created_at : undefined };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    const rawPath = url.pathname.replace(/^\/gateway-relay/, '').replace(/^\/+/, '');
    let envelope: any = null;
    if (req.method === 'POST') {
      try { envelope = await req.clone().json(); } catch { envelope = null; }
    }
    const effectivePath = String(envelope?.path ?? rawPath).replace(/^\/+/, '');
    const parts = effectivePath.split('/').filter(Boolean).map(decodeURIComponent);
    const effectiveMethod = String(envelope?.method ?? req.method).toUpperCase();
    const params = envelope?.params ?? {};
    const getParam = (name: string) => url.searchParams.get(name) ?? (params[name] != null ? String(params[name]) : null);
    const sb = client(req);
    const limit = Math.min(Math.max(Number(getParam('limit') ?? '20') || 20, 1), 100);
    const before = getParam('before') ?? undefined;
    const requestBody = envelope?.body ?? (envelope && !envelope.path ? envelope : null);

    if (effectivePath === '' || effectivePath === 'health') return json({ ok: true, service: 'testagram-gateway-relay', backend: 'supabase' });
    if (parts[0] === 'timeline') return json(await timeline(sb, limit, before));

    if (parts[0] === 'notifications' && effectiveMethod === 'GET') {
      const { user } = await requireUser(req);
      const { data, error } = await sb.from('notifications').select('*').eq('recipient_id', user.id).order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return json(data ?? []);
    }
    if (parts[0] === 'notifications' && effectiveMethod === 'DELETE') {
      const { sb: authSb, user } = await requireUser(req);
      const { error } = await authSb.from('notifications').delete().eq('recipient_id', user.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (parts[0] === 'search' && effectiveMethod === 'GET') {
      const q = (getParam('q') ?? '').trim();
      const type = getParam('type') ?? 'users';
      if (!q) return json([]);
      if (type === 'users') {
        const { data, error } = await sb.from('profiles').select('*').ilike('username', `%${q}%`).limit(limit);
        if (error) throw error;
        return json(data ?? []);
      }
      const { data, error } = await sb.from('posts').select('*,author:profiles(id,username,display_name,avatar_url)').ilike('body', `%${q}%`).is('deleted_at', null).order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return json(data ?? []);
    }

    if (parts[0] === 'posts' && effectiveMethod === 'POST') {
      const { sb: authSb, user } = await requireUser(req);
      const body = requestBody ?? {};
      const { data, error } = await authSb.from('posts').insert({ author_id: user.id, body: body.content ?? body.body ?? '', media_url: body.mediaUrl ?? null, media_type: body.mediaType ?? null, reply_to_post_id: body.inReplyTo ?? null }).select('*,author:profiles(id,username,display_name,avatar_url,verified_tier)').single();
      if (error) throw error;
      return json(data, 201);
    }
    if (parts[0] === 'posts' && parts[1] && effectiveMethod === 'DELETE') {
      const { sb: authSb } = await requireUser(req);
      const { error } = await authSb.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', parts[1]);
      if (error) throw error;
      return json({ ok: true });
    }

    if (parts[0] === 'follow' && effectiveMethod === 'POST') {
      const { sb: authSb, user } = await requireUser(req);
      const body = requestBody ?? {};
      const { data: profile, error: pe } = await authSb.from('profiles').select('id').eq('username', body.target).single();
      if (pe) throw pe;
      const { data, error } = await authSb.from('follows').insert({ follower_id: user.id, following_id: profile.id }).select().single();
      if (error) throw error;
      return json(data, 201);
    }
    if (parts[0] === 'unfollow' && effectiveMethod === 'POST') {
      const { sb: authSb, user } = await requireUser(req);
      const body = requestBody ?? {};
      const { data: profile, error: pe } = await authSb.from('profiles').select('id').eq('username', body.target).single();
      if (pe) throw pe;
      const { error } = await authSb.from('follows').delete().eq('follower_id', user.id).eq('following_id', profile.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (['favorite','unfavorite','boost','unboost'].includes(parts[0]) && effectiveMethod === 'POST') {
      const { sb: authSb, user } = await requireUser(req);
      const body = requestBody ?? {};
      const table = parts[0].startsWith('favorite') ? 'post_likes' : 'post_reposts';
      const add = parts[0] === 'favorite' || parts[0] === 'boost';
      if (add) {
        const { data, error } = await authSb.from(table).insert({ post_id: body.post_id, user_id: user.id }).select().single();
        if (error) throw error;
        return json(data, 201);
      }
      const { error } = await authSb.from(table).delete().eq('post_id', body.post_id).eq('user_id', user.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (parts[0] === 'reply' && effectiveMethod === 'POST') {
      const { sb: authSb, user } = await requireUser(req);
      const body = requestBody ?? {};
      const { data, error } = await authSb.from('post_replies').insert({ post_id: body.post_id, author_id: user.id, body: body.content ?? '' }).select().single();
      if (error) throw error;
      return json(data, 201);
    }

    if (parts[0] === 'webfinger' && parts[1]) {
      const { data, error } = await sb.from('profiles').select('*').eq('username', parts[1]).single();
      if (error) throw error;
      return json(data);
    }
    if (parts[0] === 'users' && parts[1]) {
      if (parts[2] === 'followers' || parts[2] === 'following') {
        const { data: profile, error: pe } = await sb.from('profiles').select('id').eq('username', parts[1]).single();
        if (pe) throw pe;
        const column = parts[2] === 'followers' ? 'following_id' : 'follower_id';
        const { data, error } = await sb.from('follows').select('*,follower:profiles!follower_id(*),following:profiles!following_id(*)').eq(column, profile.id).limit(limit);
        if (error) throw error;
        return json(data ?? []);
      }
      const { data, error } = await sb.from('profiles').select('*').eq('username', parts[1]).single();
      if (error) throw error;
      return json(data);
    }

    return json({ error: 'route_not_found', path: effectivePath }, 404);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return json({ error: message }, message === 'Unauthorized' ? 401 : 400);
  }
});
