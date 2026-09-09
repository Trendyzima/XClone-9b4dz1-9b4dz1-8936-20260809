import { supabase } from '@/lib/supabase';
import * as federation from '@/api/federation';

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
    id: `local:${row.id}`,
    content: row.body ?? row.content ?? '',
    created_at: row.created_at,
    author: row.author ?? row.profiles ?? null,
    origin: 'local',
    ...row,
  };
}

function normalizeFederated(item: any): Post {
  return {
    id: `fed:${item.id ?? item.federation_id}`,
    content: item.content ?? item.html ?? '',
    created_at: item.created_at ?? item.published ?? item.published_at ?? new Date().toISOString(),
    author: item.author,
    origin: 'federated',
    federation_id: item.id ?? item.federation_id,
    ...item,
  };
}

function normalizeEdgeItem(item: any): Post {
  if (item?.source === 'fediverse') {
    const object = item.object && typeof item.object === 'object' ? item.object : {};
    return normalizeFederated({
      ...item,
      ...object,
      id: item.object_url ?? item.id ?? object.id,
      federation_id: item.object_url ?? object.id ?? item.id,
      object_url: item.object_url ?? object.id,
    });
  }
  return normalizeLocal(item);
}

export async function getMergedHomeTimeline({ limit = 20, before }: { limit?: number; before?: string } = {}) {
  // One authenticated Edge Function request replaces the previous two browser
  // round trips and keeps native/Fediverse ranking and merging at the edge.
  try {
    const { data, error } = await supabase.functions.invoke('feed-fast', {
      body: { limit, before },
    });
    if (!error && data?.ok && Array.isArray(data.items)) {
      const posts = data.items.map(normalizeEdgeItem);
      return { posts, next_cursor: data.meta?.next_cursor ?? posts.at(-1)?.created_at };
    }
    if (error) throw error;
  } catch (err) {
    console.warn('[feed] feed-fast unavailable; using direct timeline fallback', err);
  }

  let localRes: any = { data: [], error: null };
  try {
    const query = supabase
      .from('posts')
      .select('*,author:profiles!posts_author_id_fkey(*)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) query.lt('created_at', before);
    localRes = await query;
  } catch (err) {
    console.warn('[feed] failed to fetch local posts', err);
  }

  let fedRes: any[] = [];
  try {
    fedRes = await federation.getHomeTimeline({ limit, before });
  } catch (err) {
    console.warn('[feed] failed to fetch federated timeline', err);
  }

  const localPosts = (localRes?.data ?? []).map(normalizeLocal);
  const fedPosts = (Array.isArray(fedRes) ? fedRes : fedRes?.posts ?? []).map(normalizeFederated);

  const map = new Map<string, Post>();
  [...localPosts, ...fedPosts].forEach((p) => {
    const key = p.federation_id ?? p.id;
    if (!map.has(key) || new Date(p.created_at) > new Date(map.get(key)!.created_at)) {
      map.set(key, p);
    }
  });

  const merged = Array.from(map.values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return { posts: merged, next_cursor: merged.at(-1)?.created_at };
}
