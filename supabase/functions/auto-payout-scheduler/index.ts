import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * auto-payout-scheduler
 * Triggered periodically (e.g. via cron) to process scheduled creator payouts.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date().toISOString();

    // Fetch all active schedules due for payout
    const { data: schedules, error: schedError } = await supabaseAdmin
      .from('payout_schedules')
      .select('*')
      .eq('is_active', true)
      .lte('next_payout_at', now);

    if (schedError) throw new Error(schedError.message);
    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No payouts due' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;
    const results: any[] = [];

    for (const schedule of schedules) {
      try {
        // Check available balance
        const { data: mon } = await supabaseAdmin
          .from('user_monetization')
          .select('pending_user_payout')
          .eq('user_id', schedule.user_id)
          .single();

        const available = mon?.pending_user_payout || 0;
        const minAmount = schedule.minimum_amount || 5;

        if (available < minAmount) {
          results.push({ user_id: schedule.user_id, status: 'skipped', reason: 'Below minimum' });
          continue;
        }

        const amountToSend = available;
        const kesAmount = Math.floor(amountToSend * 130);

        let payoutStatus = 'pending';
        let payoutError = null;

        if (schedule.payout_method === 'mpesa') {
          // Trigger M-Pesa B2C
          const mpesaResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-b2c-payout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              phone: schedule.payout_destination,
              amount: kesAmount,
              purpose: 'auto_creator_payout',
            }),
          });
          if (!mpesaResp.ok) {
            payoutError = await mpesaResp.text();
            payoutStatus = 'failed';
          }
        } else {
          // PayPal — record pending (manual processing)
          payoutStatus = 'pending';
        }

        // Record scheduled payout
        await supabaseAdmin.from('scheduled_payouts').insert({
          user_id: schedule.user_id,
          amount: amountToSend,
          payment_method: schedule.payout_method,
          mpesa_phone: schedule.payout_method === 'mpesa' ? schedule.payout_destination : null,
          paypal_email: schedule.payout_method === 'paypal' ? schedule.payout_destination : null,
          status: payoutStatus,
          scheduled_for: schedule.next_payout_at,
          processed_at: payoutStatus !== 'failed' ? now : null,
          error_message: payoutError,
        });

        if (payoutStatus !== 'failed') {
          // Deduct from pending_user_payout
          await supabaseAdmin
            .from('user_monetization')
            .update({ pending_user_payout: 0 })
            .eq('user_id', schedule.user_id);
        }

        // Update next_payout_at
        const nextDate = computeNextDate(schedule.frequency);
        await supabaseAdmin
          .from('payout_schedules')
          .update({ last_payout_at: now, next_payout_at: nextDate })
          .eq('id', schedule.id);

        // Send push notification
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            user_id: schedule.user_id,
            title: payoutStatus === 'failed' ? '⚠️ Auto Payout Failed' : '💸 Auto Payout Sent!',
            body: payoutStatus === 'failed'
              ? 'Your scheduled payout could not be processed. Please retry manually.'
              : `$${amountToSend.toFixed(2)} has been sent via ${schedule.payout_method.toUpperCase()}`,
            data: { route: '/payouts' },
          }),
        });

        processed++;
        results.push({ user_id: schedule.user_id, status: payoutStatus, amount: amountToSend });
      } catch (err: any) {
        console.error(`[auto-payout] Error for user ${schedule.user_id}:`, err);
        results.push({ user_id: schedule.user_id, status: 'error', error: err.message });
      }
    }

    return new Response(JSON.stringify({ processed, total: schedules.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function computeNextDate(frequency: string): string {
  const now = new Date();
  if (frequency === 'weekly') {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  } else if (frequency === 'biweekly') {
    const d = new Date(now);
    d.setDate(d.getDate() + 14);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  } else {
    return new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0, 0).toISOString();
  }
}
