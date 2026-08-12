import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const FUND_CPM         = 0.0015;  // $0.0015 per view = $1.50 per 1k views (creator share)
const AD_REVENUE_SHARE = 0.30;    // Creator gets 30% of platform ad revenue attribution

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const results = { videoFund: 0, adRevenue: 0, subscriptions: 0, errors: [] as string[] };

    // ── 1. Video Creator Fund ─────────────────────────────────────────
    // Pay creators for videos with 1000+ views not yet paid
    const { data: videos, error: videosErr } = await supabase
      .from('posts')
      .select('id, user_id, views_count')
      .eq('is_video', true)
      .eq('fund_earnings_paid', false)
      .gt('views_count', 1000);

    if (videosErr) {
      results.errors.push(`videos: ${videosErr.message}`);
    } else {
      for (const video of (videos ?? [])) {
        const thousands = Math.floor(video.views_count / 1000);
        const earned    = thousands * FUND_CPM * 1000;
        if (earned <= 0) continue;

        const { error: earningErr } = await supabase.from('creator_earnings').insert({
          user_id: video.user_id,
          source:  'video_fund',
          amount:  earned,
          post_id: video.id,
          status:  'completed',
        });
        if (earningErr) { results.errors.push(`earning ${video.id}: ${earningErr.message}`); continue; }

        const { error: walletErr } = await supabase.rpc('add_to_wallet', {
          p_user_id: video.user_id,
          p_amount:  earned,
        });
        if (walletErr) { results.errors.push(`wallet ${video.id}: ${walletErr.message}`); continue; }

        await supabase.from('posts').update({ fund_earnings_paid: true }).eq('id', video.id);
        results.videoFund += earned;
        console.log(`Video fund: user=${video.user_id} video=${video.id} earned=$${earned.toFixed(4)}`);
      }
    }

    // ── 2. Ad Revenue Distribution ────────────────────────────────────
    // Distribute ad revenue to monetized creators based on their recent views
    const thisMonth = new Date();
    thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);

    // Check total platform ad revenue for this month
    const { data: adRevenue } = await supabase
      .from('creator_ad_revenue')
      .select('creator_user_id, gross_revenue')
      .gte('created_at', thisMonth.toISOString());

    // Find monetized creators and their video view shares
    const { data: monetizedCreators } = await supabase
      .from('user_monetization')
      .select('user_id, revenue_share_percentage')
      .eq('is_monetized', true)
      .gt('total_views', 0);

    if (monetizedCreators && monetizedCreators.length > 0) {
      // Get total views across all monetized creators this month
      const creatorIds = monetizedCreators.map((c: any) => c.user_id);
      const { data: viewData } = await supabase
        .from('posts')
        .select('user_id, views_count')
        .in('user_id', creatorIds)
        .gte('created_at', thisMonth.toISOString());

      const viewsByCreator: Record<string, number> = {};
      (viewData ?? []).forEach((p: any) => {
        viewsByCreator[p.user_id] = (viewsByCreator[p.user_id] ?? 0) + (p.views_count ?? 0);
      });
      const totalViews = Object.values(viewsByCreator).reduce((s, v) => s + v, 0);

      // Total platform ad gross this month (from ad_placements revenue)
      const { data: adPlacements } = await supabase
        .from('ad_placements')
        .select('revenue')
        .gte('created_at', thisMonth.toISOString());
      const platformAdRevenue = (adPlacements ?? []).reduce((s: number, a: any) => s + Number(a.revenue), 0);
      const toDistribute = platformAdRevenue * AD_REVENUE_SHARE;

      if (toDistribute > 0.01 && totalViews > 0) {
        for (const [creatorId, views] of Object.entries(viewsByCreator)) {
          if (views === 0) continue;
          const share = (views / totalViews) * toDistribute;
          if (share < 0.001) continue;

          // Check if already distributed this month
          const { data: existing } = await supabase
            .from('creator_earnings')
            .select('id').eq('user_id', creatorId).eq('source', 'ad_revenue_share')
            .gte('created_at', thisMonth.toISOString()).limit(1).maybeSingle();
          if (existing) continue;

          await supabase.from('creator_earnings').insert({
            user_id: creatorId, source: 'ad_revenue_share',
            amount: share, status: 'completed',
          });
          await supabase.rpc('add_to_wallet', { p_user_id: creatorId, p_amount: share });
          results.adRevenue += share;
        }
      }
    }

    // ── 3. Subscription renewal reminders ────────────────────────────
    // Find subscriptions expiring in next 3 days — send reminder
    const expiryWindow = new Date(Date.now() + 3 * 86400000).toISOString();
    const { data: expiringSubs } = await supabase
      .from('creator_subscriptions')
      .select('id, subscriber_id, creator_id, tier, expires_at')
      .eq('status', 'active')
      .lt('expires_at', expiryWindow)
      .gt('expires_at', new Date().toISOString());

    for (const sub of (expiringSubs ?? [])) {
      const { data: alreadyNotified } = await supabase.from('platform_inbox').select('id')
        .eq('user_id', sub.subscriber_id).ilike('subject', `%subscription expires%`)
        .gte('sent_at', new Date(Date.now() - 86400000).toISOString()).limit(1).maybeSingle();
      if (alreadyNotified) continue;

      await supabase.from('platform_inbox').insert({
        user_id:    sub.subscriber_id,
        subject:    `Your ${sub.tier} subscription expires soon`,
        body:       `Your subscription expires on ${new Date(sub.expires_at).toLocaleDateString()}. Renew to keep access to exclusive content.`,
        type:       'warning',
        icon_emoji: '⏰',
        cta_label:  'View Subscription',
        cta_url:    '/profile',
      });
      results.subscriptions++;
    }

    // ── 4. Notify creators of milestone earnings ──────────────────────
    const { data: milestoneCheck } = await supabase
      .from('user_monetization')
      .select('user_id, total_earnings');

    const MILESTONES = [1, 5, 10, 50, 100, 500, 1000];
    for (const m of (milestoneCheck ?? [])) {
      const total = Number(m.total_earnings ?? 0);
      for (const milestone of MILESTONES) {
        if (total < milestone) continue;
        const key = `milestone_${milestone}_notified`;
        const { data: meta } = await supabase.from('platform_inbox').select('id')
          .eq('user_id', m.user_id).ilike('subject', `%$${milestone} earned%`)
          .limit(1).maybeSingle();
        if (meta) continue;

        await supabase.from('platform_inbox').insert({
          user_id:    m.user_id,
          subject:    `🎉 Milestone: $${milestone} earned!`,
          body:       `Congratulations! You've earned $${milestone} total on Testagram. Keep creating amazing content to grow your income.`,
          type:       'system',
          icon_emoji: '🏆',
          cta_label:  'View Earnings',
          cta_url:    '/monetization',
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('distribute-earnings error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
