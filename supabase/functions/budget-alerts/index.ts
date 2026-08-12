import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Fetch all wallets that have budget_settings configured
    const { data: wallets, error: walletsError } = await supabaseAdmin
      .from('user_wallets')
      .select('user_id, budget_settings')
      .not('budget_settings', 'is', null);

    if (walletsError) throw walletsError;

    const since = new Date();
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
    const sinceIso = since.toISOString();

    let alertsSent = 0;
    let usersChecked = 0;

    for (const wallet of (wallets ?? [])) {
      if (!wallet.budget_settings || typeof wallet.budget_settings !== 'object') continue;
      usersChecked++;

      const { data: txns } = await supabaseAdmin
        .from('wallet_transactions')
        .select('type, amount, description')
        .eq('user_id', wallet.user_id)
        .gte('created_at', sinceIso);

      // Aggregate spending by category
      const spending: Record<string, number> = {
        deposits: 0, withdrawals: 0, transfers: 0, boosts: 0, other: 0,
      };

      for (const t of (txns ?? [])) {
        const amt = Number(t.amount);
        if      (t.type === 'deposit')                                             spending.deposits    += amt;
        else if (t.type === 'withdrawal')                                          spending.withdrawals += amt;
        else if (t.type === 'transfer')                                            spending.transfers   += amt;
        else if (((t.description as string) ?? '').toLowerCase().includes('boost')) spending.boosts    += amt;
        else                                                                       spending.other       += amt;
      }

      const budgets = wallet.budget_settings as Record<string, number>;

      for (const cat of Object.keys(budgets)) {
        const limit = Number(budgets[cat]);
        if (!limit || limit <= 0) continue;

        const spent = spending[cat] ?? 0;
        const pct   = (spent / limit) * 100;
        if (pct < 90) continue;

        // Check if we already sent an alert for this category this month
        const { data: existing } = await supabaseAdmin
          .from('platform_inbox')
          .select('id')
          .eq('user_id', wallet.user_id)
          .ilike('subject', `%Budget Alert%${cat}%`)
          .gte('sent_at', sinceIso)
          .limit(1)
          .maybeSingle();

        if (existing) continue;

        const isOver    = pct >= 100;
        const pctRound  = Math.round(pct);
        const emoji     = isOver ? '🚨' : '⚠️';

        await supabaseAdmin.from('platform_inbox').insert({
          user_id:    wallet.user_id,
          subject:    `Budget Alert: ${cat} at ${pctRound}% of monthly limit`,
          body:       `You've spent $${spent.toFixed(2)} of your $${limit.toFixed(2)} ${cat} budget this month (${pctRound}%). ${isOver ? 'You are over budget — consider reviewing your spending.' : 'You are close to your limit.'}`,
          type:       'warning',
          icon_emoji: emoji,
          cta_label:  'View Budget',
          cta_url:    '/wallet?tab=analytics',
        });

        console.log(`Alert sent: user=${wallet.user_id} cat=${cat} pct=${pctRound}`);
        alertsSent++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, alertsSent, usersChecked }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('budget-alerts error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
