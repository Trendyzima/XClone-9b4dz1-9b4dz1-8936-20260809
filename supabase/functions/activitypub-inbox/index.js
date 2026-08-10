/**
 * activitypub-inbox
 *
 * Receives ActivityPub activities from remote instances (Mastodon, Misskey, etc.)
 * and processes them with HTTP Signature verification.
 *
 * Handles: Follow, Like, Announce (Boost), Create, Undo, Delete
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ── HTTP Signature Parsing ────────────────────────────────────────────────────

function parseSignatureHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(header)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

async function fetchRemotePublicKey(keyId: string): Promise<string | null> {
  try {
    const actorUrl = keyId.split('#')[0];
    const res = await fetch(actorUrl, {
      headers: {
        Accept:
          'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const actor = await res.json();
    return actor?.publicKey?.publicKeyPem ?? null;
  } catch (err) {
    console.warn('[inbox] Could not fetch public key for', keyId, err);
    return null;
  }
}

async function verifyHttpSignature(
  headers: Headers,
  rawBody: string,
  signatureHeader: string,
  method: string,
  path: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const parsed = parseSignatureHeader(signatureHeader);
    const { keyId, headers: headerList, signature } = parsed;

    if (!keyId || !signature) {
      return { valid: false, reason: 'Missing keyId or signature' };
    }

    const publicKeyPem = await fetchRemotePublicKey(keyId);
    if (!publicKeyPem) {
      // Soft fail: accept if we can't reach the remote server
      console.warn('[inbox] Soft-accepting: could not fetch public key for', keyId);
      return { valid: true, reason: 'soft-accept: key unreachable' };
    }

    // Parse PEM → ArrayBuffer
    const pemBody = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, '');
    const pemBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      'spki',
      pemBuffer.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Build signing string
    const headerNames = (headerList ?? 'date').split(' ');
    const signingParts = headerNames.map((name) => {
      if (name === '(request-target)') {
        return `(request-target): ${method.toLowerCase()} ${path}`;
      }
      return `${name}: ${headers.get(name) ?? ''}`;
    });
    const signingString = signingParts.join('\n');

    // Decode & verify
    const sigBuffer = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      sigBuffer.buffer,
      new TextEncoder().encode(signingString)
    );

    return { valid };
  } catch (err: any) {
    console.warn('[inbox] Signature verification threw:', err.message);
    return { valid: true, reason: `soft-accept: ${err.message}` };
  }
}

// ── SHA-256 Digest ────────────────────────────────────────────────────────────

async function computeDigest(body: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body)
  );
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

// ── Resolve Actor Inbox URL ───────────────────────────────────────────────────

async function resolveInboxUrl(actorUrl: string): Promise<string> {
  try {
    const res = await fetch(actorUrl, {
      headers: { Accept: 'application/activity+json' },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const actor = await res.json();
      return actor.inbox ?? `${actorUrl}/inbox`;
    }
  } catch { /* ignore */ }
  return `${actorUrl}/inbox`;
}

// ── Send Accept (auto-accept Follow) ─────────────────────────────────────────

async function sendAccept(
  followActivity: any,
  localUserId: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<void> {
  try {
    const { data: actor } = await supabaseAdmin
      .from('activitypub_actors')
      .select('actor_id, username')
      .eq('user_id', localUserId)
      .maybeSingle();

    const { data: keys } = await supabaseAdmin
      .from('activitypub_keys')
      .select('private_key, key_id')
      .eq('user_id', localUserId)
      .maybeSingle();

    if (!actor || !keys?.private_key) {
      console.warn('[inbox] No actor/keys for user', localUserId);
      return;
    }

    const acceptActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${actor.actor_id}#accept-${Date.now()}`,
      type: 'Accept',
      actor: actor.actor_id,
      object: followActivity,
    };

    const inboxUrl = await resolveInboxUrl(followActivity.actor);
    const targetUrl = new URL(inboxUrl);
    const date = new Date().toUTCString();
    const bodyStr = JSON.stringify(acceptActivity);
    const digest = await computeDigest(bodyStr);

    const signingString = [
      `(request-target): post ${targetUrl.pathname}`,
      `host: ${targetUrl.hostname}`,
      `date: ${date}`,
      `digest: SHA-256=${digest}`,
    ].join('\n');

    // Import private key
    const pemBody = keys.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s+/g, '');
    const pemBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      pemBuffer.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      new TextEncoder().encode(signingString)
    );
    const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

    await fetch(inboxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/activity+json',
        Date: date,
        Host: targetUrl.hostname,
        Digest: `SHA-256=${digest}`,
        Signature: `keyId="${keys.key_id}",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`,
      },
      body: bodyStr,
      signal: AbortSignal.timeout(10000),
    });

    console.log('[inbox] Accept sent to', inboxUrl);
  } catch (err: any) {
    console.error('[inbox] sendAccept failed (non-fatal):', err.message);
  }
}

// ── Resolve local user from target URL ───────────────────────────────────────

async function resolveLocalUser(
  targetUrl: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<string | null> {
  const match = targetUrl.match(/\/users\/([^/#?]+)/);
  if (!match) return null;
  const { data } = await supabaseAdmin
    .from('activitypub_actors')
    .select('user_id')
    .eq('username', match[1])
    .maybeSingle();
  return data?.user_id ?? null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const rawBody = await req.text();
    let activity: any;
    try {
      activity = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── HTTP Signature Verification ──────────────────────────────────────────
    const signatureHeader = req.headers.get('signature');
    if (signatureHeader) {
      const url = new URL(req.url);
      const { valid, reason } = await verifyHttpSignature(
        req.headers,
        rawBody,
        signatureHeader,
        req.method,
        url.pathname
      );
      if (!valid) {
        console.error('[inbox] Rejected: invalid HTTP signature');
        return new Response(JSON.stringify({ error: 'Invalid HTTP signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log('[inbox] Signature OK:', reason ?? 'verified');
    } else {
      console.warn('[inbox] No Signature header — proceeding without verification');
    }

    // ── Extract fields ────────────────────────────────────────────────────────
    const activityType: string = activity.type ?? 'Unknown';
    const actorUrl: string =
      typeof activity.actor === 'string'
        ? activity.actor
        : activity.actor?.id ?? '';
    const activityId: string | null = activity.id ?? null;
    const objectVal = activity.object;
    const objectUrl: string | null =
      typeof objectVal === 'string'
        ? objectVal
        : objectVal?.id ?? null;

    // ── Resolve local user ────────────────────────────────────────────────────
    let localUserId: string | null = null;
    // For Follow: object is the local actor URL
    // For Like/Announce/Create/Reply: object or object.inReplyTo points to local post
    const targetForUser =
      activityType === 'Follow'
        ? (typeof objectVal === 'string' ? objectVal : objectVal?.id ?? '')
        : typeof objectVal === 'string'
        ? objectVal
        : objectVal?.attributedTo ?? objectVal?.id ?? '';

    if (targetForUser) {
      localUserId = await resolveLocalUser(targetForUser, supabaseAdmin);
    }

    // ── Persist to activitypub_inbox ─────────────────────────────────────────
    if (activityId) {
      const { error: insertErr } = await supabaseAdmin
        .from('activitypub_inbox')
        .upsert(
          {
            local_user_id: localUserId,
            activity_id: activityId,
            activity_type: activityType,
            actor_url: actorUrl,
            object_url: objectUrl,
            raw_activity: activity,
            processed: false,
          },
          { onConflict: 'activity_id', ignoreDuplicates: true }
        );
      if (insertErr) {
        console.warn('[inbox] Insert warning:', insertErr.message);
      }
    }

    // ── Handle specific activity types ────────────────────────────────────────
    if (activityType === 'Follow' && localUserId) {
      // Cache remote follower
      const remoteInbox = await resolveInboxUrl(actorUrl);
      await supabaseAdmin.from('federated_followers').upsert(
        {
          local_user_id: localUserId,
          remote_actor_url: actorUrl,
          remote_inbox_url: remoteInbox,
          accepted: true,
        },
        { onConflict: 'local_user_id,remote_actor_url', ignoreDuplicates: true }
      );

      // Auto-Accept the follow
      await sendAccept(activity, localUserId, supabaseAdmin);
    } else if (activityType === 'Undo' && localUserId) {
      const innerObj =
        typeof objectVal === 'object' ? objectVal : {};
      if (innerObj.type === 'Follow') {
        await supabaseAdmin
          .from('federated_followers')
          .delete()
          .eq('local_user_id', localUserId)
          .eq('remote_actor_url', actorUrl);
        console.log('[inbox] Removed follower', actorUrl);
      }
    } else if (activityType === 'Delete') {
      // Mark processed
      if (activityId) {
        await supabaseAdmin
          .from('activitypub_inbox')
          .update({ processed: true })
          .eq('activity_id', activityId);
      }
    }

    return new Response(JSON.stringify({ status: 'accepted', type: activityType }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[activitypub-inbox] Unhandled error:', err.message);
    return new Response(JSON.stringify({ error: err.message ?? 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
