import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Invoked by a cron job (or manually) — scans trending_hashtags for
// high-trending tags (trend_score > 75), finds the most recent post per
// user that uses each tag, and sends a platform_inbox notification.

const TREND_THRESHOLD = 75;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // 1. Fetch all currently hot hashtags
    const { data: hotTags, error: tagsError } = await supabase
      .from('trending_hashtags')
      .select('hashtag_id, trend_score, hourly_posts, hashtags(id, tag, usage_count)')
      .gt('trend_score', TREND_THRESHOLD)
      .order('trend_score', { ascending: false })
      .limit(20);

    if (tagsError) throw tagsError;
    if (!hotTags || hotTags.length === 0) {
      return new Response(JSON.stringify({ ok: true, alerted: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tagIds = hotTags.map((t: any) => t.hashtag_id).filter(Boolean);

    // 2. Find posts from the last 24h that use these hashtags
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: postHashtags, error: phError } = await supabase
      .from('post_hashtags')
      .select('post_id, hashtag_id, posts(id, user_id, content, created_at)')
      .in('hashtag_id', tagIds)
      .gte('created_at', cutoff);

    if (phError) throw phError;

    // 3. Deduplicate: one alert per (user, hashtag) pair
    //    Track already-alerted pairs in platform_inbox to avoid spam
    const alerted = new Set<string>();
    let alertCount = 0;

    for (const ph of (postHashtags ?? [])) {
      const post = (ph as any).posts;
      if (!post?.user_id || !post?.id) continue;

      const tagRow = hotTags.find((t: any) => t.hashtag_id === ph.hashtag_id);
      if (!tagRow?.hashtags?.tag) continue;

      const tag = (tagRow.hashtags as any).tag as string;
      const score = Math.round(tagRow.trend_score ?? 0);
      const key = `${post.user_id}:${ph.hashtag_id}`;
      if (alerted.has(key)) continue;

      // Check if we already sent this alert today
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await supabase
        .from('platform_inbox')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', post.user_id)
        .eq('type', 'trending_alert')
        .ilike('body', `%${tag}%`)
        .gte('sent_at', `${today}T00:00:00Z`);

      if ((count ?? 0) > 0) { alerted.add(key); continue; }

      // Send the alert
      const hourly = tagRow.hourly_posts ?? 0;
      await supabase.from('platform_inbox').insert({
        user_id: post.user_id,
        subject: `🔥 Your post is in a trending hashtag`,
        body: `Your post is tagged with #${tag}, which is trending right now with a score of ${score}/100 (+${hourly} posts this hour). This is a great time to engage — reply to comments and share your post for maximum reach!`,
        type: 'trending_alert',
        icon_emoji: '🔥',
        cta_label: `View #${tag}`,
        cta_url: `/hashtag/${tag}`,
        read: false,
        sent_at: new Date().toISOString(),
      });

      alerted.add(key);
      alertCount++;
    }

    console.log(`[trending-hashtag-alert] Sent ${alertCount} alerts for ${hotTags.length} hot tags`);
    return new Response(
      JSON.stringify({ ok: true, alerted: alertCount, hotTags: hotTags.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[trending-hashtag-alert] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
