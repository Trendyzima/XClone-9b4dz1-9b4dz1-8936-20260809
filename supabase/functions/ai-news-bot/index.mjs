import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, action } = await req.json();

    const apiKey  = Deno.env.get('ONSPACE_AI_API_KEY');
    const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!apiKey || !baseUrl) {
      return new Response(JSON.stringify({ error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Action: analyze_trending ─────────────────────────────────────────────
    if (action === 'analyze_trending') {
      // Fetch top trending topics
      const { data: topics } = await supabase
        .from('trending_topics')
        .select('topic, category, posts_count')
        .order('posts_count', { ascending: false })
        .limit(10);

      // Fetch top posts by engagement
      const { data: topPosts } = await supabase
        .from('posts')
        .select('content, views_count, likes_count, reposts_count, replies_count, created_at')
        .is('community_id', null)
        .order('views_count', { ascending: false })
        .limit(20);

      const topicsText = (topics || []).map(t => `"${t.topic}" (${t.posts_count} posts, ${t.category})`).join(', ');
      const postsText = (topPosts || []).slice(0, 5).map(p =>
        `"${p.content?.slice(0, 80)}…" [👁 ${p.views_count}, ❤️ ${p.likes_count}]`
      ).join('\n');

      const prompt = `You are a social media content analyst for Testagram, an X/Twitter-style platform.

Trending topics: ${topicsText || 'Not enough data yet'}

Top posts by views:
${postsText || 'No posts yet'}

Analyze the trending data and provide:
1. **Key Trend Analysis** (2-3 sentences about what's trending)
2. **Content Opportunities** (3 specific content ideas that would perform well right now)
3. **Posting Tips** (2 actionable tips based on current trends)
4. **Best Posting Time** (recommendation based on engagement patterns)

Keep the response concise and actionable. Format with clear sections.`;

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) throw new Error(`AI error: ${await res.text()}`);
      const data = await res.json();
      return new Response(JSON.stringify({
        content: data.choices?.[0]?.message?.content ?? '',
        topics: topics || [],
        type: 'trending_analysis',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Action: suggest_content ──────────────────────────────────────────────
    if (action === 'suggest_content' && user_id) {
      // Fetch user's recent posts to understand their style
      const { data: userPosts } = await supabase
        .from('posts')
        .select('content, views_count, likes_count')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(5);

      // Fetch trending hashtags
      const { data: hashtags } = await supabase
        .from('hashtags')
        .select('tag, usage_count')
        .order('usage_count', { ascending: false })
        .limit(10);

      const userStyle = (userPosts || []).map(p => `"${p.content?.slice(0, 60)}…" [${p.likes_count} likes]`).join('\n') || 'No posts yet';
      const trendingTags = (hashtags || []).map(h => `#${h.tag}`).join(', ');

      const prompt = `You are a creative content coach for a social media creator on Testagram.

Creator's recent posts:
${userStyle}

Currently trending hashtags: ${trendingTags || 'general content'}

Generate 5 personalized content suggestions tailored to this creator's style and current trends. For each suggestion provide:
- **Post idea** (the actual text they could post, 1-2 sentences, engaging)
- **Why it works** (one sentence)
- **Hashtags** (3-5 relevant tags)

Make the suggestions feel natural, human, and likely to generate engagement.`;

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) throw new Error(`AI error: ${await res.text()}`);
      const data = await res.json();
      return new Response(JSON.stringify({
        content: data.choices?.[0]?.message?.content ?? '',
        type: 'content_suggestions',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Action: analyze_post ─────────────────────────────────────────────────
    if (action === 'analyze_post') {
      const { post_content } = await req.json().catch(() => ({}));
      const prompt = `Analyze this social media post and provide brief feedback:

Post: "${post_content}"

Provide:
1. **Engagement Score** (1-10 with brief reason)
2. **Strengths** (what works well)
3. **Improvements** (1-2 specific suggestions)
4. **Suggested hashtags** (5 relevant tags)`;

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) throw new Error(`AI error: ${await res.text()}`);
      const data = await res.json();
      return new Response(JSON.stringify({
        content: data.choices?.[0]?.message?.content ?? '',
        type: 'post_analysis',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[ai-news-bot]', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
