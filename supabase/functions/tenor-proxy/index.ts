/**
 * Tenor GIF proxy — avoids CORS + exposes a stable API.
 * Uses Tenor v2 with server-side key so it never leaks to the browser.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

// Server-side Tenor API key — safe here (not exposed to client)
const TENOR_KEY = 'AIzaSyC4Mj8ztaAXsKDmFHbQEWw0JWdwT7LVBLY';
const TENOR_BASE = 'https://tenor.googleapis.com/v2';
const CLIENT_KEY = 'testagram_app';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';
  const limit = url.searchParams.get('limit') || '30';
  const pos = url.searchParams.get('pos') || '';

  let tenorUrl: string;
  if (q.trim()) {
    tenorUrl = `${TENOR_BASE}/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&client_key=${CLIENT_KEY}&limit=${limit}&media_filter=gif,tinygif,nanogif${pos ? `&pos=${pos}` : ''}`;
  } else {
    tenorUrl = `${TENOR_BASE}/featured?key=${TENOR_KEY}&client_key=${CLIENT_KEY}&limit=${limit}&media_filter=gif,tinygif,nanogif${pos ? `&pos=${pos}` : ''}`;
  }

  try {
    const res = await fetch(tenorUrl);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Tenor error: ${res.status} — ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[tenor-proxy]', err);
    return new Response(JSON.stringify({ error: err.message, results: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
