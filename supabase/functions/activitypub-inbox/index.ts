import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * activitypub-inbox
 * Moved to TestagramGateway (with HTTP Signature verification).
 * This stub redirects callers.
 */
serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const gateway = Deno.env.get('GATEWAY_URL') ?? '';
  if (gateway) {
    return Response.redirect(gateway + '/inbox', 301);
  }
  return new Response(
    JSON.stringify({ error: 'Inbox endpoint lives in TestagramGateway. Configure GATEWAY_URL.' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
