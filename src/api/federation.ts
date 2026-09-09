import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('click', event => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || event.defaultPrevented || !anchor.target) return;
    if (!window.location.pathname.startsWith('/fediverse') || anchor.target !== '_blank') return;
    let remoteUrl: URL; try { remoteUrl = new URL(anchor.href, window.location.origin); } catch { return; }
    if (!/^https?:$/.test(remoteUrl.protocol) || remoteUrl.origin === window.location.origin) return;
    event.preventDefault(); event.stopPropagation();
    window.history.pushState({}, '', `/fediverse/post?url=${encodeURIComponent(remoteUrl.toString())}`);
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
export async function postStatus(payload: { content: string; mediaIds?: string[]; visibility?: 'public' | 'unlisted' | 'followers' | 'direct'; inReplyTo?: string; sensitive?: boolean; spoilerText?: string; mentions?: Array<{ href: string; name: string; acct?: string }>; hashtags?: Array<{ href: string; name: string }>; }): Promise<any> { return relay('/posts', 'POST', payload); }
export async function deletePost(postId: string): Promise<void> { return relay(`/posts/${encodeURIComponent(postId)}`, 'DELETE'); }
export async function follow(target: string): Promise<any> { return relay('/follow', 'POST', { target }); }
export async function unfollow(target: string): Promise<any> { return relay('/unfollow', 'POST', { target }); }
async function canonicalPostId(postId: string): Promise<string> { const value = String(postId ?? '').trim(); if (!value) throw new Error('Fediverse post identity is required'); if (/^https?:\/\//i.test(value)) return value; const { data, error } = await supabase.from('remote_posts').select('object_url').eq('id', value).maybeSingle(); if (error) throw error; if (!data?.object_url) throw new Error('Fediverse post has no canonical object URL'); return data.object_url; }
export async function boost(postId: string): Promise<any> { return relay('/boost', 'POST', { post_id: await canonicalPostId(postId) }); }
export async function unboost(postId: string): Promise<any> { return relay('/unboost', 'POST', { post_id: await canonicalPostId(postId) }); }
export async function favorite(postId: string): Promise<any> { return relay('/favorite', 'POST', { post_id: await canonicalPostId(postId) }); }
export async function unfavorite(postId: string): Promise<any> { return relay('/unfavorite', 'POST', { post_id: await canonicalPostId(postId) }); }
export async function reply(payload: { postId: string; content: string }): Promise<any> { return relay('/reply', 'POST', { post_id: await canonicalPostId(payload.postId), content: payload.content }); }
export async function getNotifications(params: TimelineParams = {}): Promise<any> { return relay(`/notifications`, 'GET', undefined, params as any); }
export async function clearNotifications(): Promise<void> { return relay('/notifications', 'DELETE'); }

export type SearchKind = 'all' | 'users' | 'posts' | 'hashtags' | 'instances' | 'communities' | 'products' | 'fediverse_users' | 'fediverse_posts';
export async function search(q: string, type: SearchKind = 'all', limit = 40): Promise<any[]> {
  const token = await getToken();
  const { data, error } = await supabase.functions.invoke('search-everything', { body: { q, type, limit }, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (error) { let msg = error.message; if (error instanceof FunctionsHttpError) { try { const status = error.context?.status ?? 500; const text = await error.context?.text(); msg = `[${status}] ${text || error.message || 'Search error'}`; } catch {} } throw new GatewayError(0, msg, '/search'); }
  return Array.isArray(data) ? data : [];
}
export async function getUnifiedHashtagFeed(tag: string, limit = 40): Promise<any[]> {
  const token = await getToken();
  const { data, error } = await supabase.functions.invoke('search-everything', { body: { operation: 'hashtag_feed', tag, limit }, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (error) { let msg = error.message; if (error instanceof FunctionsHttpError) { try { const status = error.context?.status ?? 500; const text = await error.context?.text(); msg = `[${status}] ${text || error.message || 'Hashtag feed error'}`; } catch {} } throw new GatewayError(0, msg, '/hashtag-feed'); }
  return Array.isArray(data) ? data : [];
}
export async function getFollowers(acct: string, params: TimelineParams = {}): Promise<any> { return relay(`/users/${encodeURIComponent(acct)}/followers`, 'GET', undefined, params as any); }
export async function getFollowing(acct: string, params: TimelineParams = {}): Promise<any> { return relay(`/users/${encodeURIComponent(acct)}/following`, 'GET', undefined, params as any); }
export async function getInstance(): Promise<any> { return relay('/health'); }
export async function getHealth(): Promise<any> { return relay('/health'); }
export async function pollFediverseInbox(userId: string): Promise<any[]> { try { const res = await getNotifications({ limit: 50 }); return Array.isArray(res) ? res : []; } catch { try { const { data } = await supabase.from('federation_inbox').select('*').order('received_at', { ascending: false }).limit(50); return data ?? []; } catch { return []; } } }
export async function gwRelay<T = any>(path: string, method = 'GET', body?: any, params?: Record<string, any>): Promise<T> { return relay<T>(path, method, body, params); }
