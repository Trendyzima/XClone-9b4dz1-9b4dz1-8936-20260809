import { supabase } from '@/lib/supabase';
import * as federation from '@/api/federation';

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
    id: `local:${row.id}`,
    content: row.body ?? row.content ?? '',
    created_at: row.created_at,
    author: row.author ?? row.profiles ?? null,
    origin: 'local',
    ...row,
  };
}

function normalizeFederated(item: any): Post {
  const actor = item.actor ?? item.attributedTo ?? item.author ?? null;
  return {
    id: `fed:${item.id ?? item.uri ?? item.federation_id}`,
    content: item.content ?? item.html ?? '',
    created_at: item.created_at ?? item.published ?? item.published_at ?? new Date().toISOString(),
    author: actor,
    origin: 'federated',
    federation_id: item.uri ?? item.id ?? item.federation_id,
    ...item,
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

/**
 * Single client entry point for the unified native + Fediverse graph.
 * feed-fast owns graph membership, filtering and ranking at the edge.
 */
export async function getUnifiedFeed({ mode = 'home', limit = 20, before }: { mode?: FeedMode; limit?: number; before?: string } = {}) {
  const safeLimit = Math.min(100, Math.max(10, Number(limit) || 20));
  const { data, error } = await supabase.functions.invoke('feed-fast', {
    body: { mode, limit: safeLimit, before: before || undefined },
  });
  if (error) throw error;
  if (!data?.ok || !Array.isArray(data.items)) {
    throw new Error(data?.error || `Unified ${mode} feed returned an invalid response`);
  }
  const posts = data.items.map(normalizeEdgeItem);
  return {
    posts,
    next_cursor: data.meta?.next_cursor ?? posts.at(-1)?.created_at ?? null,
    meta: data.meta ?? { mode, count: posts.length },
  };
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
