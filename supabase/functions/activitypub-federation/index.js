/**
 * activitypub-federation — Outbound activity delivery
 *
 * Delivers ActivityPub activities (Follow, Create, Announce, Like, etc.)
 * to remote actor inboxes using HTTP Signatures.
 *
 * Called by: internal edge functions after local actions (follow, post, like)
 * Body: { activity: Object, targetInbox: string, actorUsername: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DOMAIN = Deno.env.get('GATEWAY_DOMAIN') ?? 'testagram.site';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Status check (GET)
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        status: 'ok',
        gateway: 'supabase-edge-federation',
        domain: DOMAIN,
        version: '2.0.0',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { activity, targetInbox, actorUsername } = await req.json();

    if (!activity || !targetInbox || !actorUsername) {
      return new Response(
        JSON.stringify({ error: 'activity, targetInbox, actorUsername are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get actor keys
    const { data: actorRow } = await db
      .from('activitypub_actors')
      .select('actor_id, user_id')
      .eq('username', actorUsername)
      .maybeSingle();

    if (!actorRow) {
      return new Response(
        JSON.stringify({ error: `Actor @${actorUsername} not found` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: keys } = await db
      .from('activitypub_keys')
      .select('private_key, key_id')
      .eq('user_id', actorRow.user_id)
      .maybeSingle();

    if (!keys?.private_key) {
      return new Response(
        JSON.stringify({ error: `No RSA key found for @${actorUsername}. Run keygen first.` }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Deliver the activity
    const result = await deliverActivity(activity, targetInbox, keys.key_id, keys.private_key);

    // Record in outbox
    await db.from('activitypub_outbox').upsert(
      {
        user_id: actorRow.user_id,
        activity_id: activity.id ?? `https://${DOMAIN}/activities/${crypto.randomUUID()}`,
        activity_type: activity.type ?? 'Activity',
        object_id: typeof activity.object === 'string' ? activity.object : activity.object?.id ?? null,
        raw_activity: activity,
        delivered: result.ok,
      },
      { onConflict: 'activity_id' },
    );

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[activitypub-federation] error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── HTTP Signature delivery ───────────────────────────────────────────────────

async function deliverActivity(
  activity: any,
  targetInbox: string,
  keyId: string,
  privateKeyPem: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = JSON.stringify(activity);
  const digest = await sha256Digest(body);
  const date = new Date().toUTCString();
  const inboxUrl = new URL(targetInbox);

  const signatureString = [
    `(request-target): post ${inboxUrl.pathname}`,
    `host: ${inboxUrl.host}`,
    `date: ${date}`,
    `digest: SHA-256=${digest}`,
  ].join('\n');

  const privateKey = await importPrivateKey(privateKeyPem);
  const signature = await signString(signatureString, privateKey);

  const sigHeader =
    `keyId="${keyId}",` +
    `algorithm="rsa-sha256",` +
    `headers="(request-target) host date digest",` +
    `signature="${signature}"`;

  try {
    const res = await fetch(targetInbox, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/activity+json',
        Accept: 'application/activity+json',
        Host: inboxUrl.host,
        Date: date,
        Digest: `SHA-256=${digest}`,
        Signature: sigHeader,
      },
      body,
    });

    console.log(`[federation] delivered to ${targetInbox} → ${res.status}`);
    return { ok: res.ok, status: res.status };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function sha256Digest(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signString(str: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
