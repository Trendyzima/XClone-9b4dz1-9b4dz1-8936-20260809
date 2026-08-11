import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

// ── Gateway relay call ────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function relay<T = any>(
  path: string,
  method = 'GET',
  body?: unknown,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const token = await getToken();

  // Strip undefined params
  const cleanParams = params
    ? Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)]),
      )
    : undefined;

  const { data, error } = await supabase.functions.invoke('gateway-relay', {
    body: { path, method, body, params: cleanParams },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const status = error.context?.status ?? 500;
        const text = await error.context?.text();
        msg = `[${status}] ${text || error.message || 'Gateway error'}`;
      } catch {
        msg = error.message ?? 'Gateway error';
      }
    }
    throw new GatewayError(0, msg, path);
  }

  return data as T;
}

// ── Error classes ─────────────────────────────────────────────────────────────

export class GatewayError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string,
  ) {
    super(`Gateway error on ${path}: ${body}`);
    this.name = 'GatewayError';
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function isGatewayAvailable(): boolean {
  return true; // always available via edge function
}

export function getGatewayUrl(): string {
  return 'supabase://gateway-relay';
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export interface TimelineParams {
  limit?: number;
  before?: string;
  after?: string;
}

export async function getHomeTimeline(params: TimelineParams = {}): Promise<any[]> {
  return relay('/timeline/home', 'GET', undefined, params as any);
}

export async function getGlobalTimeline(params: TimelineParams = {}): Promise<any[]> {
  return relay('/timeline/global', 'GET', undefined, params as any);
}

export async function getLocalTimeline(params: TimelineParams = {}): Promise<any[]> {
  return relay('/timeline/local', 'GET', undefined, params as any);
}

export async function getFederatedTimeline(params: TimelineParams = {}): Promise<any[]> {
  return relay('/timeline/federated', 'GET', undefined, params as any);
}

// ── User / Actor ──────────────────────────────────────────────────────────────

export async function getUser(acct: string): Promise<any> {
  return relay(`/webfinger/${encodeURIComponent(acct)}`);
}

export async function webfinger(acct: string): Promise<any> {
  return relay(`/webfinger/${encodeURIComponent(acct)}`);
}

export async function getActor(username: string): Promise<any> {
  return relay(`/users/${encodeURIComponent(username)}`);
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function postStatus(payload: {
  content: string;
  mediaIds?: string[];
  visibility?: 'public' | 'unlisted' | 'followers' | 'direct';
  inReplyTo?: string;
  sensitive?: boolean;
  spoilerText?: string;
}): Promise<any> {
  return relay('/posts', 'POST', payload);
}

export async function deletePost(postId: string): Promise<void> {
  return relay(`/posts/${encodeURIComponent(postId)}`, 'DELETE');
}

// ── Social ────────────────────────────────────────────────────────────────────

export async function follow(target: string): Promise<any> {
  return relay('/follow', 'POST', { target });
}

export async function unfollow(target: string): Promise<any> {
  return relay('/unfollow', 'POST', { target });
}

export async function boost(postId: string): Promise<any> {
  return relay('/boost', 'POST', { post_id: postId });
}

export async function unboost(postId: string): Promise<any> {
  return relay('/unboost', 'POST', { post_id: postId });
}

export async function favorite(postId: string): Promise<any> {
  return relay('/favorite', 'POST', { post_id: postId });
}

export async function unfavorite(postId: string): Promise<any> {
  return relay('/unfavorite', 'POST', { post_id: postId });
}

export async function reply(payload: { postId: string; content: string }): Promise<any> {
  return relay('/reply', 'POST', { post_id: payload.postId, content: payload.content });
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getNotifications(params: TimelineParams = {}): Promise<any[]> {
  return relay('/notifications', 'GET', undefined, params as any);
}

export async function clearNotifications(): Promise<void> {
  return relay('/notifications', 'DELETE');
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function search(
  q: string,
  type: 'users' | 'posts' | 'hashtags' | 'instances' = 'users',
): Promise<any[]> {
  return relay('/search', 'GET', undefined, { q, type });
}

// ── Followers / Following ─────────────────────────────────────────────────────

export async function getFollowers(acct: string, params: TimelineParams = {}): Promise<any> {
  return relay(`/users/${encodeURIComponent(acct)}/followers`, 'GET', undefined, params as any);
}

export async function getFollowing(acct: string, params: TimelineParams = {}): Promise<any> {
  return relay(`/users/${encodeURIComponent(acct)}/following`, 'GET', undefined, params as any);
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function getInstance(): Promise<any> {
  return relay('/health');
}

export async function getHealth(): Promise<any> {
  return relay('/health');
}

// ── Inbox polling (since realtime is not supported) ───────────────────────────

/**
 * Polls the gateway for new federated notifications.
 * Falls back to local activitypub_inbox table if gateway is unreachable.
 */
export async function pollFediverseInbox(userId: string): Promise<any[]> {
  try {
    const res = await getNotifications({ limit: 50 });
    return Array.isArray(res) ? res : [];
  } catch {
    // Fallback: local activitypub_inbox table
    try {
      const { data } = await supabase
        .from('activitypub_inbox')
        .select('*')
        .eq('local_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      return data ?? [];
    } catch {
      return [];
    }
  }
}

/**
 * @deprecated Use the named exports above. gwRelay is kept for legacy callers.
 */
export async function gwRelay<T = any>(
  path: string,
  method = 'GET',
  body?: any,
  params?: Record<string, any>,
): Promise<T> {
  return relay<T>(path, method, body, params);
}
