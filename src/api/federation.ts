import { supabase } from '@/lib/supabase';

const GATEWAY_URL = 'https://api.testagram.site/api/gateway';
const GATEWAY_TIMEOUT_MS = 15000;
const GET_ATTEMPTS = 3;

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('click', event => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || event.defaultPrevented || !anchor.target) return;
    if (!window.location.pathname.startsWith('/fediverse') || anchor.target !== '_blank') return;
    let remoteUrl: URL;
    try { remoteUrl = new URL(anchor.href, window.location.origin); } catch { return; }
    if (!/^https?:$/.test(remoteUrl.protocol) || remoteUrl.origin === window.location.origin) return;
    event.preventDefault();
    event.stopPropagation();
    window.history.pushState({}, '', `/fediverse/post?url=${encodeURIComponent(remoteUrl.toString())}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, true);
}

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
  const cleanParams = params
    ? Object.fromEntries(
        Object.entries(params)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      )
    : undefined;
  const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const payload = JSON.stringify({ path, method, body, params: cleanParams, requestId });
  const attempts = method.toUpperCase() === 'GET' ? GET_ATTEMPTS : 1;
  let lastStatus = 503;
  let lastBody = 'Gateway temporarily unreachable';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
    try {
      const response = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Request-ID': requestId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: payload,
        signal: controller.signal,
      });
      const text = await response.text();
      lastStatus = response.status;
      lastBody = text || response.statusText || lastBody;
      if (response.ok || ![502, 503, 504].includes(response.status) || attempt === attempts) {
        let data: any;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        if (!response.ok) throw new GatewayError(response.status, text || response.statusText || 'Gateway error', path);
        return data as T;
      }
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      lastBody = error instanceof Error && error.name === 'AbortError' ? 'Gateway request timed out' : error instanceof Error ? error.message : lastBody;
      if (attempt === attempts) break;
    } finally {
      clearTimeout(timer);
    }
    await new Promise(resolve => setTimeout(resolve, 150 * attempt));
  }
  throw new GatewayError(lastStatus, lastBody, path);
}

export class GatewayError extends Error {
  constructor(public status: number, public body: string, public path: string) {
    super(`Gateway error on ${path}: ${body}`);
    this.name = 'GatewayError';
  }
}

export function isGatewayAvailable(): boolean { return true; }
export function getGatewayUrl(): string { return GATEWAY_URL; }
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
    const actor = raw.attributedTo && typeof raw.attributedTo === 'object'
      ? raw.attributedTo
      : { id: row.actor_uri ?? '', url: row.actor_uri ?? '' };
    const attachments = Array.isArray(row.attachments) ? row.attachments : [];
    return {
      ...raw,
      id: row.uri,
      uri: row.uri,
      url: row.url ?? row.uri,
      object_type: row.object_type,
      content: row.content ?? '',
      summary: row.summary,
      spoiler_text: row.summary,
      published: row.published_at,
      published_at: row.published_at,
      updated: row.updated_at,
      created_at: row.published_at,
      sensitive: !!row.sensitive,
      inReplyTo: row.in_reply_to_uri,
      quoteUri: row.quote_uri,
      actor,
      media_attachments: attachments,
      likes_count: row.like_count ?? 0,
      favourites_count: row.like_count ?? 0,
      boosts_count: row.announce_count ?? 0,
      reblogs_count: row.announce_count ?? 0,
      replies_count: row.reply_count ?? 0,
      quotes_count: row.quote_count ?? 0,
      views_count: row.view_count ?? 0,
      _canonical_federated_object_id: row.id,
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
  const values = [
    item?.likes_count, item?.favourites_count, item?.like_count,
    item?.boosts_count, item?.reblogs_count, item?.repost_count, item?.reposts_count,
    item?.replies_count, item?.reply_count, item?.quotes_count, item?.quote_count,
    item?.views_count, item?.view_count,
  ];
  return values.reduce(
    (sum, value) => sum + (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0),
    0,
  );
}

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
