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

async function getCanonicalFederatedTimeline(params: TimelineParams = {}): Promise<any[]> {
  const limit = Math.min(Math.max(Number(params.limit ?? 30), 1), 50);
  let query = supabase
    .from('federated_objects')
    .select('id,uri,object_type,actor_uri,url,content,summary,published_at,updated_at,sensitive,in_reply_to_uri,quote_uri,attachments,tags,raw_object,like_count,announce_count,reply_count,quote_count,view_count')
    .eq('object_type', 'Note')
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (params.before) query = query.lt('published_at', params.before);
  if (params.after) query = query.gt('published_at', params.after);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const raw = row.raw_object && typeof row.raw_object === 'object' ? row.raw_object : {};
    const actor = raw.attributedTo && typeof raw.attributedTo === 'object' ? raw.attributedTo : { id: row.actor_uri ?? '', url: row.actor_uri ?? '' };
    const attachments = Array.isArray(row.attachments) ? row.attachments : [];
    return {
      ...raw, id: row.uri, uri: row.uri, url: row.url ?? row.uri, object_type: row.object_type,
      content: row.content ?? '', summary: row.summary, spoiler_text: row.summary,
      published: row.published_at, published_at: row.published_at, updated: row.updated_at, created_at: row.published_at,
      sensitive: !!row.sensitive, inReplyTo: row.in_reply_to_uri, quoteUri: row.quote_uri, actor,
      media_attachments: attachments, likes_count: row.like_count ?? 0, favourites_count: row.like_count ?? 0,
      boosts_count: row.announce_count ?? 0, reblogs_count: row.announce_count ?? 0, replies_count: row.reply_count ?? 0,
      quotes_count: row.quote_count ?? 0, views_count: row.view_count ?? 0, _canonical_federated_object_id: row.id,
      _is_federated: true,
    };
  });
}

function timelineDate(item: any): number {
  const value = item?.published_at ?? item?.published ?? item?.created_at ?? item?.timestamp;
  const parsed = value ? Date.parse(String(value)) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function timelineEngagement(item: any): number {
  const values = [item?.likes_count, item?.favourites_count, item?.like_count, item?.boosts_count, item?.reblogs_count, item?.repost_count, item?.reposts_count, item?.replies_count, item?.reply_count, item?.quotes_count, item?.quote_count, item?.views_count, item?.view_count];
  return values.reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0), 0);
}

/**
 * Home/For You is a unified feed: local Testagram posts and canonical inbound
 * ActivityPub Notes enter one ranking pool. The gateway remains authoritative
 * for local timeline retrieval; federated_objects supplies durable remote Notes.
 */
function rankUnifiedHomeTimeline(local: any[], federated: any[], limit: number): any[] {
  const byIdentity = new Map<string, any>();
  for (const item of [...local, ...federated]) {
    const identity = String(item?.id ?? item?.uri ?? item?.url ?? `${timelineDate(item)}:${item?.content ?? ''}`);
    if (!byIdentity.has(identity)) byIdentity.set(identity, item);
  }
  const now = Date.now();
  return [...byIdentity.values()]
    .map((item, index) => {
      const ageHours = Math.max(0, (now - timelineDate(item)) / 3600000);
      const freshness = Math.exp(-ageHours / 30);
      const engagement = Math.log1p(timelineEngagement(item));
      const diversity = item?._is_federated ? 0.04 : 0;
      return { item, score: freshness + engagement * 0.08 + diversity, index };
    })
    .sort((a, b) => b.score - a.score || timelineDate(b.item) - timelineDate(a.item) || a.index - b.index)
    .slice(0, limit)
    .map(({ item }) => item);
}

export async function getHomeTimeline(params: TimelineParams = {}): Promise<any[]> {
  const limit = Math.min(Math.max(Number(params.limit ?? 30), 1), 50);
  const [localResult, federatedResult] = await Promise.allSettled([
    relay('/timeline/home', 'GET', undefined, { ...params, limit } as any),
    getCanonicalFederatedTimeline({ ...params, limit }),
  ]);
  const local = localResult.status === 'fulfilled' && Array.isArray(localResult.value) ? localResult.value : [];
  const federated = federatedResult.status === 'fulfilled' ? federatedResult.value : [];
  if (federatedResult.status === 'rejected') console.warn('[federation] canonical home feed unavailable:', federatedResult.reason);
  if (local.length || federated.length) return rankUnifiedHomeTimeline(local, federated, limit);
  if (localResult.status === 'rejected') throw localResult.reason;
  return [];
}
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
async function remoteInteract(interaction: 'like'|'repost'|'reply'|'quote'|'bookmark', objectUrl: string, enabled = true, content?: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke('federation-interact', { body: { interaction, objectUrl, enabled, ...(content !== undefined ? { content } : {}) } });
  if (error) { let msg = error.message; if (error instanceof FunctionsHttpError) { try { const status = error.context?.status ?? 500; const text = await error.context?.text(); msg = `[${status}] ${text || error.message || 'Fediverse interaction error'}`; } catch {} } throw new GatewayError(0, msg, `/federation-interact/${interaction}`); }
  if (data?.error) throw new GatewayError(0, String(data.error), `/federation-interact/${interaction}`);
  return data;
}
export async function boost(postId: string): Promise<any> { return remoteInteract('repost', await canonicalPostId(postId)); }
export async function unboost(postId: string): Promise<any> { return remoteInteract('repost', await canonicalPostId(postId), false); }
export async function favorite(postId: string): Promise<any> { return remoteInteract('like', await canonicalPostId(postId)); }
export async function unfavorite(postId: string): Promise<any> { return remoteInteract('like', await canonicalPostId(postId), false); }
export async function bookmark(postId: string): Promise<any> { return remoteInteract('bookmark', await canonicalPostId(postId)); }
export async function unbookmark(postId: string): Promise<any> { return remoteInteract('bookmark', await canonicalPostId(postId), false); }
export async function reply(payload: { postId: string; content: string }): Promise<any> { return remoteInteract('reply', await canonicalPostId(payload.postId), true, payload.content); }
export async function quote(payload: { postId: string; content: string }): Promise<any> { return remoteInteract('quote', await canonicalPostId(payload.postId), true, payload.content); }
export async function getNotifications(params: TimelineParams = {}): Promise<any> { return relay(`/notifications`, 'GET', undefined, params as any); }
export async function clearNotifications(): Promise<void> { return relay(`/notifications`, 'DELETE'); }
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
  if (error) { let msg = error.message; if (error instanceof FunctionsHttpError) { try { const status = error.context?.status ?? 500; const text = await error.context?.text(); msg = `[${status}] ${text || error.message || 'Hashtag feed error'}]`; } catch {} } throw new GatewayError(0, msg, '/hashtag-feed'); }
  return Array.isArray(data) ? data : [];
}
export async function getFollowers(acct: string, params: TimelineParams = {}): Promise<any> { return relay(`/users/${encodeURIComponent(acct)}/followers`, 'GET', undefined, params as any); }
export async function getFollowing(acct: string, params: TimelineParams = {}): Promise<any> { return relay(`/users/${encodeURIComponent(acct)}/following`, 'GET', undefined, params as any); }
export async function getInstance(): Promise<any> { return relay('/health'); }
export async function getHealth(): Promise<any> { return relay('/health'); }
export async function pollFediverseInbox(userId: string): Promise<any[]> { try { const res = await getNotifications({ limit: 50 }); return Array.isArray(res) ? res : []; } catch { try { const { data } = await supabase.from('federation_inbox').select('*').order('received_at', { ascending: false }).limit(50); return data ?? []; } catch { return []; } } }
export async function gwRelay<T = any>(path: string, method = 'GET', body?: any, params?: Record<string, any>): Promise<T> { return relay<T>(path, method, body, params); }
