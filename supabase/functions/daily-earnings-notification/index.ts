/**
 * daily-earnings-notification
 *
 * Aggregates each creator's earnings from the past 24 hours
 * (ads + tips + subscriptions) and sends an FCM push notification
 * summarizing their daily income. Trigger via pg_cron or an external
 * scheduler once per day.
 *
 * curl -X POST \
 *   https://<project>.backend.onspace.ai/functions/v1/daily-earnings-notification \
 *   -H "Authorization: Bearer <service-role-key>"
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // ── 1. Aggregate ad revenue per creator (last 24h) ────────────────────────
    const { data: adRevenue } = await supabaseAdmin
      .from('creator_ad_revenue')
      .select('creator_user_id, creator_share')
      .gte('created_at', since);

    const adMap: Record<string, number> = {};
    for (const row of adRevenue ?? []) {
      adMap[row.creator_user_id] = (adMap[row.creator_user_id] ?? 0) + Number(row.creator_share);
    }

    // ── 2. Aggregate tips received per creator (last 24h) ─────────────────────
    const { data: tips } = await supabaseAdmin
      .from('tips')
      .select('to_user_id, amount')
      .gte('created_at', since);

    const tipMap: Record<string, number> = {};
    for (const row of tips ?? []) {
      tipMap[row.to_user_id] = (tipMap[row.to_user_id] ?? 0) + Number(row.amount);
    }

    // ── 3. Aggregate subscription revenue per creator (last 24h) ─────────────
    const { data: subs } = await supabaseAdmin
      .from('creator_subscriptions')
      .select('creator_id, price')
      .eq('status', 'active')
      .gte('started_at', since);

    const subMap: Record<string, number> = {};
    for (const row of subs ?? []) {
      subMap[row.creator_id] = (subMap[row.creator_id] ?? 0) + Number(row.price);
    }

    // ── 4. Merge all creator IDs ──────────────────────────────────────────────
    const allCreatorIds = new Set([
      ...Object.keys(adMap),
      ...Object.keys(tipMap),
      ...Object.keys(subMap),
    ]);

    if (allCreatorIds.size === 0) {
      console.log('[daily-earnings] No creators with earnings in last 24h');
      return new Response(
        JSON.stringify({ status: 'ok', notified: 0, message: 'No earnings to report' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 5. Get creator profiles ───────────────────────────────────────────────
    const { data: profiles } = await supabaseAdmin
      .from('user_profiles')
      .select('id, username')
      .in('id', [...allCreatorIds]);

    const profileMap: Record<string, string> = {};
    for (const p of profiles ?? []) {
      profileMap[p.id] = p.username;
    }

    // ── 6. Get FCM tokens for all creators ───────────────────────────────────
    const { data: tokens } = await supabaseAdmin
      .from('fcm_tokens')
      .select('user_id, token')
      .in('user_id', [...allCreatorIds]);

    const tokenMap: Record<string, string[]> = {};
    for (const t of tokens ?? []) {
      if (!tokenMap[t.user_id]) tokenMap[t.user_id] = [];
      tokenMap[t.user_id].push(t.token);
    }

    // ── 7. Send notifications ─────────────────────────────────────────────────
    let notified = 0;
    const errors: string[] = [];

    for (const creatorId of allCreatorIds) {
      const creatorTokens = tokenMap[creatorId];
      if (!creatorTokens?.length) continue; // No FCM tokens — skip

      const adEarnings  = adMap[creatorId]  ?? 0;
      const tipEarnings = tipMap[creatorId] ?? 0;
      const subEarnings = subMap[creatorId] ?? 0;
      const total       = adEarnings + tipEarnings + subEarnings;

      if (total < 0.01) continue; // Skip negligible amounts

      const username = profileMap[creatorId] ?? 'Creator';
      const parts: string[] = [];
      if (adEarnings  > 0) parts.push(`Ads: $${adEarnings.toFixed(2)}`);
      if (tipEarnings > 0) parts.push(`Tips: $${tipEarnings.toFixed(2)}`);
      if (subEarnings > 0) parts.push(`Subs: $${subEarnings.toFixed(2)}`);

      const body = parts.length
        ? `${parts.join(' · ')} — Total: $${total.toFixed(2)}`
        : `Total: $${total.toFixed(2)}`;

      // Call the send-push-notification edge function for each token
      for (const fcmToken of creatorTokens) {
        try {
          await supabaseAdmin.functions.invoke('send-push-notification', {
            body: {
              token: fcmToken,
              title: `Hi ${username}, your daily earnings are in!`,
              body,
              data: {
                type: 'daily_earnings',
                route: '/creator-studio',
                total: String(total.toFixed(2)),
              },
            },
          });
          notified++;
        } catch (pushErr: any) {
          const msg = `[daily-earnings] push failed for ${creatorId}: ${pushErr.message}`;
          console.error(msg);
          errors.push(msg);
        }
      }

      // Also insert a notification record so it shows in the app
      await supabaseAdmin.from('notifications').insert({
        user_id: creatorId,
        type: 'payment_success',
        metadata: {
          amount: total.toFixed(2),
          message: `Your earnings today: ${body}`,
          ad_earnings: adEarnings.toFixed(2),
          tip_earnings: tipEarnings.toFixed(2),
          sub_earnings: subEarnings.toFixed(2),
          purpose: 'daily_earnings_summary',
        },
      });
    }

    console.log(`[daily-earnings] Notified ${notified} creators`);

    return new Response(
      JSON.stringify({ status: 'ok', notified, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[daily-earnings] Fatal error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
