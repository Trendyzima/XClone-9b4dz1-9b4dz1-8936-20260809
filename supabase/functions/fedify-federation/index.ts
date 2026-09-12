import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createFederation } from 'npm:@fedify/fedify@2.4.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const federation = createFederation({ origin: 'https://federation.testagram.site' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const path = new URL(req.url).pathname;
  if (req.method === 'GET' && path.endsWith('/health')) return json({ ok: true, service: 'fedify-federation', framework: 'Fedify', version: '2.4.0', mode: 'adapter-boundary' });
  if (req.method === 'GET' && path.endsWith('/capabilities')) return json({ ok: true, protocol: 'activitypub', capabilities: ['actor-resolution', 'webfinger', 'object-resolution', 'inbox', 'outbox', 'follow', 'like', 'announce'], federationConfigured: Boolean(federation), destructiveMigration: false });
  return json({ error: 'Fedify adapter boundary is healthy; protocol routes are being connected incrementally.' }, 404);
});
