import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

// Gate A rerun marker: keep the source path in the workflow trigger set while
// Mastodon gets its full asynchronous ActivityPub Accept processing window.
// Keep remote Fediverse objects inside Testagram. This guards legacy/secondary
// Fediverse links (including the Mastodon tab) that may still render as anchors.
// The remote URL remains an object identity; it is never used as the browser destination.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('click', event => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || event.defaultPrevented || !anchor.target) return;
    if (!window.location.pathname.startsWith('/fediverse')) return;
    if (anchor.target !== '_blank') return;
    let remoteUrl: URL;
    try { remoteUrl = new URL(anchor.href, window.location.origin); } catch { return; }
    if (!/^https?:$/.test(remoteUrl.protocol) || remoteUrl.origin === window.location.origin) return;
    event.preventDefault();
    event.stopPropagation();
    const inAppUrl = `/fediverse/post?url=${encodeURIComponent(remoteUrl.toString())}`;
    window.history.pushState({}, '', inAppUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, true);
}

async function getToken(): Promise<string | null> { try { const { data } = await supabase.auth.getSession(); return data.session?.access_token ?? null; } catch { return null; } }
async function relay<T = any>(path: string, method = 'GET', body?: unknown, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const token = await getToken();
  const cleanParams = params ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])) : undefined;
  const { data, error } = await supabase.functions.invoke('gateway-relay', { body: { path, method, body, params: cleanParams }, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (error) { let msg = error.message; if (error instanceof FunctionsHttpError) { try { const status = error.context?.status ?? 500; const text = await error.context?.text(); msg = `[${status}] ${text || error.message || 'Gateway error'}`; } catch {} } throw new GatewayError(0, msg, path); }
  return data as T;
}
export class GatewayError extends Error { constructor(public status: number, public body: string, public path: string) { super(`Gateway error on ${path}: ${body}`); this.name = 'GatewayError'; } }
export function isGatewayAvailable(): boolean { return true; }
export function getGatewayUrl(): string { return 'supabase://gateway-relay'; }
export interface TimelineParams { limit?: number; before?: string; after?: string; }
export async function getHomeTimeline(params: TimelineParams = {}): Promise<any[]> { return relay('/timeline/home', 'GET', undefined, params as any); }
export async function getGlobalTimeline(params: TimelineParams = {}): Promise<any[]> { return relay('/timeline/global', 'GET', undefined, params as any); }
export async function getLocalTimeline(params: TimelineParams = {}): Promise<any[]> { return relay('/timeline/local', 'GET', undefined, params as any); }
export async function getFederatedTimeline(params: TimelineParams = {}): Promise<any[]> { return relay('/timeline/federated', 'GET', undefined, params as any); }
export async function getUser(acct: string): Promise<any> { return relay(`/webfinger/${encodeURIComponent(acct)}`); }
export async function webfinger(acct: string): Promise<any> { return relay(`/webfinger/${encodeURIComponent(acct)}`); }
export async function getActor(username: string): Promise<any> { return relay(`/users/${encodeURIComponent(username)}`); }
export async function postStatus(payload: { content: string; mediaIds?: string[]; visibility?: 'public' | 'unlisted' | 'followers' | 'direct'; inReplyTo?: string; sensitive?: boolean; spoilerText?: string; }): Promise<any> { return relay('/posts', 'POST', payload); }
export async function deletePost(postId: string): Promise<void> { return relay(`/posts/${encodeURIComponent(postId)}`, 'DELETE'); }
export async function follow(target: string): Promise<any> { return relay('/follow', 'POST', { target }); }
export async function unfollow(target: string): Promise<any> { return relay('/unfollow', 'POST', { target }); }

// Federation mutations operate on the remote ActivityPub object identity, not
// the local remote_posts UUID. Resolve cached UUIDs to object_url defensively so
// every caller follows the same canonical identity contract.
async function canonicalPostId(postId: string): Promise<string> {
  const value = String(postId ?? '').trim();
  if (!value) throw new Error('Fediverse post identity is required');
  if (/^https?:\/\//i.test(value)) return value;
  const { data, error } = await supabase.from('remote_posts').select('object_url').eq('id', value).maybeSingle();
  if (error) throw error;
  const objectUrl = data?.object_url;
  if (!objectUrl) throw new Error('Fediverse post has no canonical object URL');
  return objectUrl;
}

export async function boost(postId: string): Promise<any> { return relay('/boost', 'POST', { post_id: await canonicalPostId(postId) }); }
export async function unboost(postId: string): Promise<any> { return relay('/unboost', 'POST', { post_id: await canonicalPostId(postId) }); }
export async function favorite(postId: string): Promise<any> { return relay('/favorite', 'POST', { post_id: await canonicalPostId(postId) }); }
export async function unfavorite(postId: string): Promise<any> { return relay('/unfavorite', 'POST', { post_id: await canonicalPostId(postId) }); }
export async function reply(payload: { postId: string; content: string }): Promise<any> { return relay('/reply', 'POST', { post_id: await canonicalPostId(payload.postId), content: payload.content }); }
export async function getNotifications(params: TimelineParams = {}): Promise<any[]> { return relay('/notifications', 'GET', undefined, params as any); }
export async function clearNotifications(): Promise<void> { return relay('/notifications', 'DELETE'); }
export async function search(q: string, type: 'users' | 'posts' | 'hashtags' | 'instances' = 'users'): Promise<any[]> { return relay('/search', 'GET', undefined, { q, type }); }
export async function getFollowers(acct: string, params: TimelineParams = {}): Promise<any> { return relay(`/users/${encodeURIComponent(acct)}/followers`, 'GET', undefined, params as any); }
export async function getFollowing(acct: string, params: TimelineParams = {}): Promise<any> { return relay(`/users/${encodeURIComponent(acct)}/following`, 'GET', undefined, params as any); }
export async function getInstance(): Promise<any> { return relay('/health'); }
export async function getHealth(): Promise<any> { return relay('/health'); }
export async function pollFediverseInbox(userId: string): Promise<any[]> {
  try { const res = await getNotifications({ limit: 50 }); return Array.isArray(res) ? res : []; }
  catch {
    try { const { data } = await supabase.from('federation_inbox').select('*').order('received_at', { ascending: false }).limit(50); return data ?? []; }
    catch { return []; }
  }
}
export async function gwRelay<T = any>(path: string, method = 'GET', body?: any, params?: Record<string, any>): Promise<T> { return relay<T>(path, method, body, params); }
