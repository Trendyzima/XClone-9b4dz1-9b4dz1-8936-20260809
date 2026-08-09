/**
 * activitypub-webfinger — WebFinger discovery endpoint
 *
 * Handles /.well-known/webfinger requests from the Fediverse.
 * Serves local user actor URLs and caches remote lookups.
 *
 * Called by: Remote ActivityPub servers discovering our users.
 * Path: /functions/v1/activitypub-webfinger?resource=acct:user@testagram.site
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DOMAIN = Deno.env.get('GATEWAY_DOMAIN') ?? 'testagram.site';

const jrdHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/jrd+json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const resource = url.searchParams.get('resource') ?? '';

  if (!resource) {
    return new Response(
      JSON.stringify({ error: 'resource query param is required (acct:user@domain)' }),
      { status: 400, headers: jrdHeaders },
    );
  }

  // Parse acct: URI
  const acct = resource.startsWith('acct:') ? resource.slice(5) : resource;
  const [username, acctDomain] = acct.includes('@') ? acct.split('@') : [acct, DOMAIN];

  // Only serve our domain
  if (acctDomain !== DOMAIN) {
    return new Response(JSON.stringify({ error: `This server handles ${DOMAIN} only` }), {
      status: 404,
      headers: jrdHeaders,
    });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Look up actor
  const { data: actor } = await db
    .from('activitypub_actors')
    .select('actor_id, username')
    .eq('username', username)
    .maybeSingle();

  // Fallback to user_profiles
  if (!actor) {
    const { data: profile } = await db
      .from('user_profiles')
      .select('id, username')
      .eq('username', username)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: `User @${username} not found` }), {
        status: 404,
        headers: jrdHeaders,
      });
    }
  }

  const actorId = actor?.actor_id ?? `https://${DOMAIN}/users/${username}`;

  const response = {
    subject: `acct:${username}@${DOMAIN}`,
    aliases: [actorId, `https://${DOMAIN}/@${username}`],
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: actorId,
      },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: `https://${DOMAIN}/@${username}`,
      },
    ],
  };

  return new Response(JSON.stringify(response), { headers: jrdHeaders });
});
