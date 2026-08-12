import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const ONSPACE_AI_BASE_URL = Deno.env.get('ONSPACE_AI_BASE_URL') ?? 'https://ai.onspace.ai/v1';
const ONSPACE_AI_API_KEY  = Deno.env.get('ONSPACE_AI_API_KEY') ?? '';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Thresholds — module scope
const AUTO_BAN_THRESHOLD = 80;
const FLAG_THRESHOLD     = 50;
const BAN_DURATION_HOURS = 24;
const PERM_BAN_STRIKES   = 3;

interface ModerationResult {
  overall_score: number;
  categories: {
    hate_speech: number;
    harassment: number;
    explicit_content: number;
    violence: number;
    spam: number;
    misinformation: number;
  };
  action: 'pass' | 'flag' | 'auto_ban';
  reason: string;
}

async function analyzeContent(content: string): Promise<ModerationResult> {
  const prompt = `You are a professional AI content moderation system trained to detect policy violations on a social media platform. Analyze the following post content and return ONLY a JSON object (no markdown, no explanation).

Content to analyze:
"""
${content.slice(0, 1000)}
"""

Return a JSON object with this exact structure:
{
  "overall_score": <integer 0-100, represents overall harm level>,
  "categories": {
    "hate_speech": <0-100, targets race/religion/gender/orientation/ethnicity>,
    "harassment": <0-100, direct attacks/threats/bullying at individuals>,
    "explicit_content": <0-100, sexual/graphic content inappropriate for general audiences>,
    "violence": <0-100, promotes/glorifies violence or physical harm>,
    "spam": <0-100, repetitive/misleading/scam content>,
    "misinformation": <0-100, dangerous false information health/safety/elections>
  },
  "action": "<pass|flag|auto_ban>",
  "reason": "<brief explanation of the primary concern, max 100 chars>"
}

Scoring guidelines:
- 0-20: No concern (normal content)
- 21-49: Borderline (context-dependent, not harmful)  
- 50-79: Concerning (flag for human review)
- 80-100: Clearly violates policy (auto-ban recommended)

The action field must be: "pass" if overall_score < 50, "flag" if 50-79, "auto_ban" if >= 80.

Return only the JSON, no other text.`;

  const response = await fetch(`${ONSPACE_AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ONSPACE_AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-flash-1.5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI error: ${err}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content ?? '{}';

  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    // Clamp scores to 0-100
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n ?? 0)));
    return {
      overall_score: clamp(parsed.overall_score ?? 0),
      categories: {
        hate_speech:      clamp(parsed.categories?.hate_speech ?? 0),
        harassment:       clamp(parsed.categories?.harassment ?? 0),
        explicit_content: clamp(parsed.categories?.explicit_content ?? 0),
        violence:         clamp(parsed.categories?.violence ?? 0),
        spam:             clamp(parsed.categories?.spam ?? 0),
        misinformation:   clamp(parsed.categories?.misinformation ?? 0),
      },
      action: parsed.action === 'auto_ban' ? 'auto_ban' : parsed.action === 'flag' ? 'flag' : 'pass',
      reason: String(parsed.reason ?? '').slice(0, 120),
    };
  } catch {
    // Fallback — low score, pass
    return {
      overall_score: 0,
      categories: { hate_speech: 0, harassment: 0, explicit_content: 0, violence: 0, spam: 0, misinformation: 0 },
      action: 'pass',
      reason: 'Unable to parse AI response',
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { post_id, content: rawContent, user_id: rawUserId, scan_recent } = body;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── BATCH: scan recent posts ───────────────────────────────────────────
    if (scan_recent) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentPosts } = await supabaseAdmin
        .from('posts')
        .select('id, content, user_id')
        .gte('created_at', since)
        .limit(50);

      const results: any[] = [];
      for (const post of recentPosts ?? []) {
        if (!post.content || post.content.length < 5) continue;

        // Skip already moderated
        const { data: existing } = await supabaseAdmin
          .from('content_moderation_logs')
          .select('id')
          .eq('post_id', post.id)
          .maybeSingle();
        if (existing) continue;

        try {
          const result = await analyzeContent(post.content);
          results.push({ post_id: post.id, user_id: post.user_id, result, content: post.content });
        } catch (err) {
          console.error(`Moderation error for post ${post.id}:`, err);
        }
      }

      // Process results
      let flagged = 0; let banned = 0;
      for (const { post_id: pid, user_id: uid, result, content } of results) {
        if (result.action === 'pass') continue;

        // Log it
        const { data: logRow } = await supabaseAdmin.from('content_moderation_logs').insert({
          post_id: pid, user_id: uid,
          content_snippet: content.slice(0, 200),
          overall_score: result.overall_score,
          categories: result.categories,
          action: result.action,
          reason: result.reason,
        }).select().single();

        if (result.action === 'auto_ban') {
          banned++;
          // Get strike count
          const { data: profile } = await supabaseAdmin.from('user_profiles').select('strike_count, username').eq('id', uid).single();
          const strikes = (profile?.strike_count ?? 0) + 1;
          const isPermanent = strikes >= PERM_BAN_STRIKES;

          await supabaseAdmin.from('user_profiles').update({
            is_blocked: true,
            strike_count: strikes,
          }).eq('id', uid);

          const expiresAt = isPermanent ? null : new Date(Date.now() + BAN_DURATION_HOURS * 3600000).toISOString();
          await supabaseAdmin.from('user_bans').insert({
            user_id: uid, banned_by: null,
            reason: `AI Auto-ban: ${result.reason}`,
            ban_type: isPermanent ? 'permanent' : 'temporary',
            duration_hours: isPermanent ? null : BAN_DURATION_HOURS,
            expires_at: expiresAt,
            moderation_log_id: logRow?.id,
            strike_count: strikes,
          });

          // Notify regulators
          const { data: regulators } = await supabaseAdmin.from('platform_regulators').select('user_id');
          for (const reg of regulators ?? []) {
            await supabaseAdmin.from('platform_inbox').insert({
              user_id: reg.user_id,
              subject: `⚠️ Auto-ban: @${profile?.username ?? uid}`,
              body: `AI detected policy violation (score: ${result.overall_score}/100).\nCategory: ${result.reason}\n${isPermanent ? '🚫 PERMANENT BAN (3 strikes)' : `⏱ 24-hour ban (Strike ${strikes}/${PERM_BAN_STRIKES})`}\n\nReview in Regulator Panel → Moderation tab.`,
              type: 'update', icon_emoji: '⚠️',
              cta_label: 'Review in Regulator Panel', cta_url: '/regulator',
            });
          }
        } else if (result.action === 'flag') {
          flagged++;
          // Notify regulators
          const { data: profile } = await supabaseAdmin.from('user_profiles').select('username').eq('id', uid).single();
          const { data: regulators } = await supabaseAdmin.from('platform_regulators').select('user_id');
          for (const reg of regulators ?? []) {
            await supabaseAdmin.from('platform_inbox').insert({
              user_id: reg.user_id,
              subject: `🚩 Flagged content: @${profile?.username ?? uid}`,
              body: `AI flagged a post for review (score: ${result.overall_score}/100).\nReason: ${result.reason}\n\nHuman review required. Check Regulator Panel → Moderation tab.`,
              type: 'update', icon_emoji: '🚩',
              cta_label: 'Review', cta_url: '/regulator',
            });
          }
        }
      }

      return new Response(JSON.stringify({
        scanned: results.length,
        flagged, banned,
        message: `Scanned ${results.length} posts. Flagged: ${flagged}, Auto-banned: ${banned}`,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── SINGLE POST moderation ─────────────────────────────────────────────
    if (!post_id && !rawContent) {
      return new Response(JSON.stringify({ error: 'post_id or content required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let content = rawContent ?? '';
    let userId = rawUserId ?? null;

    if (post_id && !content) {
      const { data: post } = await supabaseAdmin.from('posts').select('content, user_id').eq('id', post_id).single();
      content = post?.content ?? '';
      userId = post?.user_id ?? null;
    }

    if (!content || content.length < 3) {
      return new Response(JSON.stringify({ action: 'pass', overall_score: 0, reason: 'Content too short to analyze' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await analyzeContent(content);

    // Log to DB
    const { data: logRow } = await supabaseAdmin.from('content_moderation_logs').insert({
      post_id: post_id ?? null,
      user_id: userId,
      content_snippet: content.slice(0, 200),
      overall_score: result.overall_score,
      categories: result.categories,
      action: result.action,
      reason: result.reason,
    }).select().single();

    // Execute action
    if (result.action === 'auto_ban' && userId) {
      const { data: profile } = await supabaseAdmin.from('user_profiles').select('strike_count, username').eq('id', userId).single();
      const strikes = (profile?.strike_count ?? 0) + 1;
      const isPermanent = strikes >= PERM_BAN_STRIKES;

      await supabaseAdmin.from('user_profiles').update({ is_blocked: true, strike_count: strikes }).eq('id', userId);

      const expiresAt = isPermanent ? null : new Date(Date.now() + BAN_DURATION_HOURS * 3600000).toISOString();
      await supabaseAdmin.from('user_bans').insert({
        user_id: userId, banned_by: null,
        reason: `AI Auto-ban: ${result.reason}`,
        ban_type: isPermanent ? 'permanent' : 'temporary',
        duration_hours: isPermanent ? null : BAN_DURATION_HOURS,
        expires_at: expiresAt,
        moderation_log_id: logRow?.id,
        strike_count: strikes,
      });

      const { data: regulators } = await supabaseAdmin.from('platform_regulators').select('user_id');
      for (const reg of regulators ?? []) {
        await supabaseAdmin.from('platform_inbox').insert({
          user_id: reg.user_id,
          subject: `⚠️ Auto-ban triggered: @${profile?.username}`,
          body: `Score: ${result.overall_score}/100 — ${result.reason}. Strike ${strikes}/${PERM_BAN_STRIKES}. Review in Moderation tab.`,
          type: 'update', icon_emoji: '⚠️',
          cta_label: 'Review', cta_url: '/regulator',
        });
      }
    } else if (result.action === 'flag' && userId) {
      const { data: profile } = await supabaseAdmin.from('user_profiles').select('username').eq('id', userId).single();
      const { data: regulators } = await supabaseAdmin.from('platform_regulators').select('user_id');
      for (const reg of regulators ?? []) {
        await supabaseAdmin.from('platform_inbox').insert({
          user_id: reg.user_id,
          subject: `🚩 Content flagged: @${profile?.username}`,
          body: `Score: ${result.overall_score}/100 — ${result.reason}. Human review needed.`,
          type: 'update', icon_emoji: '🚩',
          cta_label: 'Review', cta_url: '/regulator',
        });
      }
    }

    return new Response(JSON.stringify({ ...result, log_id: logRow?.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('ai-moderation error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
