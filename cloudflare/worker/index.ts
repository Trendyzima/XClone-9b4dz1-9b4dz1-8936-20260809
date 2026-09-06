interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  APP_ORIGIN: string;
}

const TABLES = new Set([
  'ai_usage', 'audio_spaces', 'blocks', 'bookmark_folder_items', 'bookmark_folders', 'bookmarks',
  'communities', 'community_members', 'content_events', 'conversation_members', 'conversations',
  'creator_earnings', 'creator_programs', 'follows', 'follow_requests', 'hashtags', 'list_followers',
  'list_members', 'lists', 'live_streams', 'message_attachments', 'message_pins', 'message_reactions',
  'message_requests', 'messages', 'mutes', 'notifications', 'pinned_posts', 'poll_options', 'poll_votes',
  'polls', 'post_analytics', 'post_drafts', 'post_hashtags', 'post_likes', 'post_media', 'post_products',
  'post_quotes', 'post_replies', 'post_reposts', 'post_translations', 'post_views', 'posts', 'products',
  'profile_analytics_daily', 'profiles', 'recommendation_feedback', 'reel_events', 'reel_sounds', 'reels',
  'reports', 'scheduled_posts', 'space_members', 'stream_chat', 'stream_viewers', 'subscriptions', 'tips',
  'user_blocks', 'user_devices', 'user_interests', 'user_settings', 'verification_requests', 'voice_notes',
  'wallet_transactions', 'wallets', 'media_assets', 'audit_events'
]);

const READ_ONLY_TABLES = new Set(['trending_posts', 'user_profiles']);
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;

function cors(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin');
  const allowedOrigins = new Set([
    env.APP_ORIGIN,
    'https://testagram.site',
    'https://www.testagram.site',
    'capacitor://localhost',
    'http://localhost'
  ]);
  const allowed = origin ? allowedOrigins.has(origin) : false;
  return {
    'Access-Control-Allow-Origin': allowed ? origin! : env.APP_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, range',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function response(request: Request, env: Env, body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...cors(request, env),
      ...extra
    }
  });
}

function supabaseHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  headers.set('apikey', env.SUPABASE_ANON_KEY);
  headers.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
  const authorization = request.headers.get('Authorization');
  if (authorization) headers.set('Authorization', authorization);
  const clientInfo = request.headers.get('X-Client-Info');
  if (clientInfo) headers.set('X-Client-Info', clientInfo);
  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);
  return headers;
}

function tableFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/db\/([A-Za-z_][A-Za-z0-9_]*)$/);
  return match?.[1] || null;
}

async function proxyDatabase(request: Request, env: Env, table: string) {
  const writable = !READ_ONLY_TABLES.has(table);
  if (MUTATING_METHODS.has(request.method) && !request.headers.get('Authorization')) {
    return response(request, env, { error: 'Authentication required' }, 401);
  }
  if (request.method !== 'GET' && !writable) {
    return response(request, env, { error: 'Read-only resource' }, 405);
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (MUTATING_METHODS.has(request.method) && contentLength > MAX_JSON_BODY_BYTES) {
    return response(request, env, { error: 'Request body too large' }, 413);
  }

  const url = new URL(request.url);
  const target = new URL(`/rest/v1/${table}`, env.SUPABASE_URL);
  target.search = url.search;

  const upstream = await fetch(target, {
    method: request.method,
    headers: supabaseHeaders(request, env),
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
  });

  const headers = new Headers(cors(request, env));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'no-store');
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) headers.set('content-range', contentRange);
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(request, env) });
    }

    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return response(request, env, {
        ok: true,
        service: 'testagram-api',
        database: 'supabase',
        edge: 'cloudflare'
      });
    }

    const table = tableFromPath(url.pathname);
    if (table && (TABLES.has(table) || READ_ONLY_TABLES.has(table))) {
      try {
        return await proxyDatabase(request, env, table);
      } catch (error) {
        return response(request, env, {
          error: error instanceof Error ? error.message : 'Upstream database request failed'
        }, 502);
      }
    }

    return response(request, env, { error: 'Not found' }, 404);
  }
};
