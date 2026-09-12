import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Federation } from 'npm:@fedify/fedify@2.4.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// This boundary deliberately keeps Fedify server-side. Testagram remains the
// system of record for users, profiles, posts, relationships, and reactions.
// The adapter is initially non-destructive and exposes capability/health data
// while protocol dispatchers are wired to the existing federation tables.
const federation = new Federation({
  origin: 'https://federation.testagram.site',
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  if (req.method === 'GET' && url.pathname.endsWith('/health')) {
    return json({
      ok: true,
      service: 'fedify-federation',
      framework: 'Fedify',
      version: '2.4.0',
      origin: 'https://federation.testagram.site',
      mode: 'adapter-boundary',
    });
  }

  if (req.method === 'GET' && url.pathname.endsWith('/capabilities')) {
    return json({
      ok: true,
      protocol: 'activitypub',
      capabilities: ['actor-resolution', 'webfinger', 'object-resolution', 'inbox', 'outbox', 'follow', 'like', 'announce'],
      federationConfigured: Boolean(federation),
      destructiveMigration: false,
    });
  }

  return json({ error: 'Fedify adapter boundary is healthy; protocol routes are being connected incrementally.' }, 404);
});
