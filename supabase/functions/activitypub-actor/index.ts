import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * activitypub-actor
 * Moved to TestagramGateway. This stub redirects callers.
 */
serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const gateway = Deno.env.get('GATEWAY_URL') ?? '';
  if (gateway) {
    return Response.redirect(gateway + new URL(req.url).pathname, 301);
  }
  return new Response(
    JSON.stringify({ error: 'Actor endpoint lives in TestagramGateway. Configure GATEWAY_URL.' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
