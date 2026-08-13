import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const SYSTEM_PROMPT = `You are Testagram Support Assistant — a helpful, friendly AI assistant for the Testagram social media platform.

You help users with:
- Account & Profile: username changes, profile editing, verification, privacy settings, account deletion
- Posts & Engagement: posting videos, creating polls, scheduling posts, hashtags, reporting content
- Payments & Monetization: M-Pesa, PayPal, wallet, boosting posts, creator earnings (CPM $1.50–$3.50), premium subscriptions, refunds
- Safety & Security: blocking/muting users, reporting abuse, two-factor authentication (OTP via email), suspicious activity

Key facts about Testagram:
- Creator earnings: video CPM $1.50–$3.50 per 1k views (tier based), tips (85% to creator, 15% platform), P2P transfers (5% platform fee), ad revenue (40% creator, 60% platform)
- M-Pesa deposits: minimum KES 10. PayPal payout minimum: $5 USD
- Verification: Basic, Creator, Business, or Celebrity tiers — pay via M-Pesa or wallet
- Support email: support@tsocial.com
- Content violations: warning → temporary ban → permanent ban (3 strikes)
- Appeals: visit /appeals page

Always be concise, warm, and accurate. If a question is outside Testagram's scope, politely say so and suggest contacting support@tsocial.com. Never make up specific numbers or features you are unsure about.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');
    const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');

    if (!apiKey || !baseUrl) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build conversation with system prompt prepended
    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.slice(-10), // last 10 messages for context window
    ];

    const aiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: fullMessages,
        max_tokens: 512,
        temperature: 0.4,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('AI error:', errText);
      return new Response(JSON.stringify({ error: `AI: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await aiRes.json();
    const reply = data.choices?.[0]?.message?.content ?? "I'm sorry, I couldn't generate a response. Please try again.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('help-chatbot error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
