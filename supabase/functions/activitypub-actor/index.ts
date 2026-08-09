/**
 * activitypub-actor — ActivityPub Actor profile endpoint
 *
 * Serves ActivityPub Person objects for local users.
 * Called by remote Fediverse servers fetching actor profiles.
 *
 * Path: /functions/v1/activitypub-actor?username=:username
 *       OR POST with { username } body
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DOMAIN = Deno.env.get('GATEWAY_DOMAIN') ?? 'testagram.site';

const apHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/activity+json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  let username = url.searchParams.get('username') ?? '';

  if (!username && req.method === 'POST') {
    try {
      const body = await req.json();
      username = body.username ?? '';
    } catch {}
  }

  if (!username) {
    return new Response(JSON.stringify({ error: 'username is required' }), {
      status: 400,
      headers: apHeaders,
    });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Try activitypub_actors first
  const { data: actor } = await db
    .from('activitypub_actors')
    .select(
      '*, user_profiles!activitypub_actors_user_id_fkey(username, bio, avatar_url, cover_image, verified, followers_count, following_count)',
    )
    .eq('username', username)
    .maybeSingle();

  if (actor) {
    const profile: any = actor.user_profiles ?? {};
    const apObject = buildActor({
      actorId: actor.actor_id,
      username: actor.username,
      inboxUrl: actor.inbox_url,
      outboxUrl: actor.outbox_url,
      followersUrl: actor.followers_url,
      followingUrl: actor.following_url,
      bio: profile.bio ?? '',
      avatarUrl: profile.avatar_url ?? '',
      headerUrl: profile.cover_image ?? '',
    });
    return new Response(JSON.stringify(apObject), { headers: apHeaders });
  }

  // Fallback: build from user_profiles
  const { data: profile } = await db
    .from('user_profiles')
    .select('id, username, bio, avatar_url, cover_image, verified, followers_count, following_count')
    .eq('username', username)
    .maybeSingle();

  if (!profile) {
    return new Response(JSON.stringify({ error: `User @${username} not found` }), {
      status: 404,
      headers: apHeaders,
    });
  }

  const actorId = `https://${DOMAIN}/users/${profile.username}`;
  const apObject = buildActor({
    actorId,
    username: profile.username,
    inboxUrl: `${actorId}/inbox`,
    outboxUrl: `${actorId}/outbox`,
    followersUrl: `${actorId}/followers`,
    followingUrl: `${actorId}/following`,
    bio: profile.bio ?? '',
    avatarUrl: profile.avatar_url ?? '',
    headerUrl: profile.cover_image ?? '',
  });

  return new Response(JSON.stringify(apObject), { headers: apHeaders });
});

function buildActor(opts: {
  actorId: string;
  username: string;
  inboxUrl: string;
  outboxUrl: string;
  followersUrl: string;
  followingUrl: string;
  bio: string;
  avatarUrl: string;
  headerUrl: string;
}) {
  return {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
      { manuallyApprovesFollowers: 'as:manuallyApprovesFollowers', sensitive: 'as:sensitive' },
    ],
    id: opts.actorId,
    type: 'Person',
    preferredUsername: opts.username,
    name: opts.username,
    summary: opts.bio,
    url: `https://${DOMAIN}/@${opts.username}`,
    inbox: opts.inboxUrl,
    outbox: opts.outboxUrl,
    followers: opts.followersUrl,
    following: opts.followingUrl,
    manuallyApprovesFollowers: false,
    discoverable: true,
    ...(opts.avatarUrl
      ? {
          icon: {
            type: 'Image',
            mediaType: opts.avatarUrl.includes('.png') ? 'image/png' : 'image/jpeg',
            url: opts.avatarUrl,
          },
        }
      : {}),
    ...(opts.headerUrl
      ? {
          image: {
            type: 'Image',
            mediaType: opts.headerUrl.includes('.png') ? 'image/png' : 'image/jpeg',
            url: opts.headerUrl,
          },
        }
      : {}),
    endpoints: {
      sharedInbox: `https://${DOMAIN}/inbox`,
    },
  };
}
