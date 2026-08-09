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

      // ── Backfill mode: generate keys for all users without them ────────────
      if (body.generate_all_missing === true) {
        const [{ data: allUsers }, { data: existingKeys }] = await Promise.all([
          supabaseAdmin.from('user_profiles').select('id, username').limit(500),
          supabaseAdmin.from('activitypub_keys').select('user_id'),
        ]);
        const existingSet = new Set((existingKeys ?? []).map((k: any) => k.user_id));
        const missing = (allUsers ?? []).filter((u: any) => !existingSet.has(u.id));
        // Process up to 50 per call to stay within timeout
        const batch = missing.slice(0, 50);
        let generated = 0;
        let failed = 0;
        for (const u of batch) {
          try {
            await generateAndStoreKeys(supabaseAdmin, u.id, u.username ?? u.id);
            generated++;
          } catch (e) {
            console.warn('[keygen] backfill failed for', u.id, e);
            failed++;
          }
        }
        console.log(`[keygen] Backfill: ${generated} generated, ${failed} failed`);
        return new Response(
          JSON.stringify({
            status: 'backfill_complete',
            total: allUsers?.length ?? 0,
            missing: missing.length,
            generated,
            failed,
            remaining: Math.max(0, missing.length - batch.length),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
    const result = await generateAndStoreKeys(supabaseAdmin, userId, username);
    console.log(`[activitypub-keygen] Keys generated for user ${userId} (${username})`);
    return new Response(JSON.stringify(result), {
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

/** Generate RSA-2048 keys and store them for a user, returning status */
async function generateAndStoreKeys(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  username: string
): Promise<{ status: string; key_id: string; actor_id: string }> {
  const actorId = `https://${DOMAIN}/users/${username}`;
  const keyId = `${actorId}#main-key`;

  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicKeyPem = toPem(await crypto.subtle.exportKey('spki', keyPair.publicKey), 'PUBLIC KEY');
  const privateKeyPem = toPem(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey), 'PRIVATE KEY');

  const { error: insertError } = await supabaseAdmin.from('activitypub_keys').insert({
    user_id: userId,
    public_key: publicKeyPem,
    private_key: privateKeyPem,
    key_id: keyId,
  });
  if (insertError) throw new Error(insertError.message);

  await supabaseAdmin.from('activitypub_actors').upsert(
    {
      user_id: userId,
      actor_id: actorId,
      inbox_url: `${actorId}/inbox`,
      outbox_url: `${actorId}/outbox`,
      followers_url: `${actorId}/followers`,
      following_url: `${actorId}/following`,
      username,
      domain: DOMAIN,
    },
    { onConflict: 'actor_id' }
  );

  return { status: 'created', key_id: keyId, actor_id: actorId };
}

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
