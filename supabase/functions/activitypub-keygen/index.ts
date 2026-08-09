/**
 * activitypub-keygen
 * Generates an RSA-2048 key pair for a user and stores it in activitypub_keys.
 * Also ensures an activitypub_actors row exists for the user.
 * Called from AuthProvider on first sign-in.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const DOMAIN = 'testagram.site';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Authenticate request
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get calling user OR use user_id from body (for backfill)
    let userId: string | null = null;

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      userId = body.user_id ?? null;
    }

    if (!userId) {
      // Try to get from JWT
      const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    // Check if keys already exist
    const { data: existing } = await supabaseAdmin
      .from('activitypub_keys')
      .select('id, key_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ status: 'exists', key_id: existing.key_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch profile to get username
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle();

    const username = profile?.username ?? userId;
    const actorId = `https://${DOMAIN}/users/${username}`;
    const keyId = `${actorId}#main-key`;

    // Generate RSA-2048 key pair using Web Crypto API
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true, // extractable
      ['sign', 'verify']
    );

    // Export keys as PEM
    const publicKeyDer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const privateKeyDer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    const publicKeyPem = toPem(publicKeyDer, 'PUBLIC KEY');
    const privateKeyPem = toPem(privateKeyDer, 'PRIVATE KEY');

    // Store keys
    const { error: insertError } = await supabaseAdmin.from('activitypub_keys').insert({
      user_id: userId,
      public_key: publicKeyPem,
      private_key: privateKeyPem,
      key_id: keyId,
    });

    if (insertError) {
      console.error('Insert keys error:', insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upsert actor record
    await supabaseAdmin.from('activitypub_actors').upsert({
      user_id: userId,
      actor_id: actorId,
      inbox_url: `${actorId}/inbox`,
      outbox_url: `${actorId}/outbox`,
      followers_url: `${actorId}/followers`,
      following_url: `${actorId}/following`,
      username,
      domain: DOMAIN,
    }, { onConflict: 'actor_id' });

    console.log(`[activitypub-keygen] Keys generated for user ${userId} (${username})`);

    return new Response(JSON.stringify({ status: 'created', key_id: keyId, actor_id: actorId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[activitypub-keygen] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/** Convert ArrayBuffer to Base64-encoded PEM string */
function toPem(buffer: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary);
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}
