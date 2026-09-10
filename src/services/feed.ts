import { supabase } from '@/lib/supabase';

export type FeedMode = 'home' | 'following' | 'explore';

export type Post = {
  id: string;
  content: string;
  created_at: string;
  author: any;
  origin: 'local' | 'federated';
  federation_id?: string;
  visibility?: string;
  [k: string]: any;
};

function normalizeLocal(row: any): Post {
  return {
    ...row,
    // Native database UUIDs must remain unchanged. PostThreadPage, reactions,
    // replies and every direct posts-table query use this exact identifier.
    id: String(row.id),
    content: row.body ?? row.content ?? '',
    created_at: row.created_at,
    author: row.author ?? row.user_profiles ?? row.profiles ?? null,
    origin: 'local',
  };
}

function normalizeFederated(item: any): Post {
  const actor = item.actor ?? item.attributedTo ?? item.author ?? null;
  const remoteId = item.id ?? item.uri ?? item.federation_id;
  return {
    ...item,
    // Remote IDs are URLs/URIs and are kept distinct from native UUIDs.
    id: `fed:${remoteId}`,
    content: item.content ?? item.html ?? '',
    created_at: item.created_at ?? item.published ?? item.published_at ?? new Date().toISOString(),
    author: actor,
    origin: 'federated',
    federation_id: item.uri ?? item.id ?? item.federation_id,
  };
}

function normalizeEdgeItem(item: any): Post {
  if (item?.source === 'fediverse' || item?.origin === 'federated' || item?._is_federated) {
    const object = item.object && typeof item.object === 'object' ? item.object : {};
    return normalizeFederated({
      ...item,
      ...object,
      id: item.object_url ?? item.uri ?? item.id ?? object.id,
      federation_id: item.object_url ?? item.uri ?? object.id ?? item.id,
      object_url: item.object_url ?? item.uri ?? object.id,
    });
  }
  return normalizeLocal(item);
}

async function nativePublicFallback(mode: FeedMode, limit: number, before?: string): Promise<Post[]> {
  try {
    let authorIds: string[] | null = null;
    if (mode === 'following') {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return [];
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', uid)
        .limit(500);
      authorIds = [uid, ...((follows ?? []).map((f: any) => String(f.following_id)).filter(Boolean))];
    }

    let query = supabase
      .from('posts')
      .select('*, user_profiles:profiles!posts_author_id_fkey(*)')
      .eq('visibility', 'public')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (authorIds?.length) query = query.in('author_id', [...new Set(authorIds)]);
    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(normalizeLocal);
  } catch (error) {
    console.error('[feed] native public fallback failed:', error);
    return [];
  }
}

export async function getUnifiedFeed({ mode = 'home', limit = 20, before }: { mode?: FeedMode; limit?: number; before?: string } = {}) {
  const safeLimit = Math.min(100, Math.max(10, Number(limit) || 20));
  const { data, error } = await supabase.functions.invoke('feed-fast', {
    body: { mode, limit: safeLimit, before: before || undefined },
  });

  if (!error && data?.ok && Array.isArray(data.items)) {
    const posts = data.items.map(normalizeEdgeItem);
    if (posts.length > 0 || mode === 'explore') {
      return {
        posts,
        next_cursor: data.meta?.next_cursor ?? posts.at(-1)?.created_at ?? null,
        meta: data.meta ?? { mode, count: posts.length },
      };
    }
  }

  const fallback = await nativePublicFallback(mode, safeLimit, before);
  if (fallback.length > 0 || mode !== 'explore') {
    return {
      posts: fallback,
      next_cursor: fallback.at(-1)?.created_at ?? null,
      meta: { mode, count: fallback.length, ranking: 'native-public-fallback', degraded: true },
    };
  }

  throw error ?? new Error(data?.error || `Unified ${mode} feed returned an invalid response`);
}

export async function getMergedHomeTimeline({ limit = 20, before }: { limit?: number; before?: string } = {}) {
  return getUnifiedFeed({ mode: 'home', limit, before });
}

export async function getFollowingTimeline({ limit = 20, before }: { limit?: number; before?: string } = {}) {
  return getUnifiedFeed({ mode: 'following', limit, before });
}

export async function getExploreTimeline({ limit = 20, before }: { limit?: number; before?: string } = {}) {
  return getUnifiedFeed({ mode: 'explore', limit, before });
}