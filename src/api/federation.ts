/**
 * federation.ts — TestagramGateway API client
 *
 * Gateway: https://testagramgateway-9bi61x-9bi61x-2984-lovat.vercel.app
 *
 * Environment override:
 *   VITE_GATEWAY_URL=https://testagramgateway-9bi61x-9bi61x-2984-lovat.vercel.app
 *   VITE_GATEWAY_API_KEY=optional-shared-secret
 */

import { supabase } from '@/lib/supabase';

// ── Gateway URL (hardcoded default, override via .env) ────────────────────────
const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://testagramgateway-9bi61x-9bi61x-2984-lovat.vercel.app';

const GATEWAY_API_KEY =
  import.meta.env.VITE_GATEWAY_API_KEY as string | undefined;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function gw<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(GATEWAY_API_KEY ? { 'x-gateway-api-key': GATEWAY_API_KEY } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers ?? {}) as Record<string, string>),
  };

  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers,
    credentials: 'omit',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GatewayError(res.status, text, path);
  }

  if (res.status === 204) return null as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json') || ct.includes('activity+json')) {
    return res.json() as Promise<T>;
  }
  return res.text() as unknown as T;
}

// ── Error classes ─────────────────────────────────────────────────────────────

export class GatewayError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string
  ) {
    super(`Gateway ${status} on ${path}: ${body}`);
    this.name = 'GatewayError';
  }
}

export class GatewayNotConfiguredError extends Error {
  constructor() {
    super('TestagramGateway URL is not configured.');
    this.name = 'GatewayNotConfiguredError';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isGatewayAvailable(): boolean {
  return Boolean(GATEWAY_URL);
}

export function getGatewayUrl(): string {
  return GATEWAY_URL;
}

function toQuery(params: Record<string, any>): string {
  const p = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null));
  const q = new URLSearchParams(p as any).toString();
  return q ? `?${q}` : '';
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export interface TimelineParams {
  limit?: number;
  before?: string;
  after?: string;
}

export async function getHomeTimeline(params: TimelineParams = {}): Promise<any> {
  return gw(`/timeline/home${toQuery(params)}`);
}

export async function getGlobalTimeline(params: TimelineParams = {}): Promise<any> {
  return gw(`/timeline/global${toQuery(params)}`);
}

export async function getLocalTimeline(params: TimelineParams = {}): Promise<any> {
  return gw(`/timeline/local${toQuery(params)}`);
}

export async function getFederatedTimeline(params: TimelineParams = {}): Promise<any> {
  return gw(`/timeline/federated${toQuery(params)}`);
}

// ── User / Actor ──────────────────────────────────────────────────────────────

export async function getUser(acct: string): Promise<any> {
  // Try gateway WebFinger lookup
  return gw(`/webfinger/${encodeURIComponent(acct)}`);
}

export async function webfinger(acct: string): Promise<any> {
  return gw(`/webfinger/${encodeURIComponent(acct)}`);
}

export async function getActor(username: string): Promise<any> {
  return gw(`/users/${encodeURIComponent(username)}`);
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
  return gw('/posts', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deletePost(postId: string): Promise<void> {
  return gw(`/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
}

// ── Social ────────────────────────────────────────────────────────────────────

export async function follow(acct: string): Promise<any> {
  return gw('/follow', { method: 'POST', body: JSON.stringify({ target: acct }) });
}

export async function unfollow(acct: string): Promise<any> {
  return gw('/unfollow', { method: 'POST', body: JSON.stringify({ target: acct }) });
}

export async function boost(postId: string): Promise<any> {
  return gw('/boost', { method: 'POST', body: JSON.stringify({ post_id: postId }) });
}

export async function unboost(postId: string): Promise<any> {
  return gw('/unboost', { method: 'POST', body: JSON.stringify({ post_id: postId }) });
}

export async function favorite(postId: string): Promise<any> {
  return gw('/favorite', { method: 'POST', body: JSON.stringify({ post_id: postId }) });
}

export async function unfavorite(postId: string): Promise<any> {
  return gw('/unfavorite', { method: 'POST', body: JSON.stringify({ post_id: postId }) });
}

export async function reply(payload: { postId: string; content: string }): Promise<any> {
  return gw('/reply', {
    method: 'POST',
    body: JSON.stringify({ post_id: payload.postId, content: payload.content }),
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getNotifications(params: TimelineParams = {}): Promise<any> {
  return gw(`/notifications${toQuery(params)}`);
}

export async function clearNotifications(): Promise<void> {
  return gw('/notifications', { method: 'DELETE' });
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function search(
  q: string,
  type: 'users' | 'posts' | 'hashtags' | 'instances' = 'users'
): Promise<any> {
  return gw(`/search?${new URLSearchParams({ q, type })}`);
}

// ── Followers / Following ─────────────────────────────────────────────────────

export async function getFollowers(acct: string, params: TimelineParams = {}): Promise<any> {
  return gw(`/users/${encodeURIComponent(acct)}/followers${toQuery(params)}`);
}

export async function getFollowing(acct: string, params: TimelineParams = {}): Promise<any> {
  return gw(`/users/${encodeURIComponent(acct)}/following${toQuery(params)}`);
}

// ── Instance ──────────────────────────────────────────────────────────────────

export async function getInstance(): Promise<any> {
  return gw('/health');
}

export async function getHealth(): Promise<any> {
  return gw('/health');
}

// ── Inbox polling (since realtime is not supported) ───────────────────────────

/**
 * Polls the gateway for new federated notifications.
 * Falls back to local activitypub_inbox table if gateway is unreachable.
 */
export async function pollFediverseInbox(userId: string): Promise<any[]> {
  try {
    const res: any = await getNotifications({ limit: 50 });
    return Array.isArray(res) ? res : res?.notifications ?? res?.data ?? [];
  } catch {
    // Fallback: local DB cache
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );
      const { data } = await client
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
