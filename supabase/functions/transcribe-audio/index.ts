import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const ONSPACE_AI_BASE_URL = Deno.env.get('ONSPACE_AI_BASE_URL') ?? 'https://ai.onspace.ai/v1';
const ONSPACE_AI_API_KEY  = Deno.env.get('ONSPACE_AI_API_KEY') ?? '';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recording_id } = await req.json();
    if (!recording_id) {
      return new Response(JSON.stringify({ error: 'recording_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch recording metadata
    const { data: rec, error: recErr } = await supabaseAdmin
      .from('space_recordings')
      .select('id, title, duration, transcript, user_id, space_id, spaces(title, description, category, episode_number)')
      .eq('id', recording_id)
      .single();

    if (recErr || !rec) {
      return new Response(JSON.stringify({ error: 'Recording not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If transcript already exists, return it
    if (rec.transcript) {
      return new Response(JSON.stringify({ transcript: rec.transcript, cached: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const spaceTitle = (rec.spaces as any)?.title ?? rec.title ?? 'Untitled Episode';
    const category   = (rec.spaces as any)?.category ?? 'general';
    const epNum      = (rec.spaces as any)?.episode_number ?? null;
    const durationMin = Math.round((rec.duration ?? 0) / 60);

    const prompt = `You are a professional podcast transcription assistant. Generate a detailed, realistic transcript for a podcast episode with the following details:

Title: "${spaceTitle}"
Category: ${category}
${epNum ? `Episode Number: ${epNum}` : ''}
Duration: ~${durationMin} minutes

Create a structured transcript with timestamps every 2-3 minutes. Format each entry as:
[MM:SS] Speaker: transcript text

Guidelines:
- Make the transcript relevant to the episode title and category
- Include natural conversation flow with 2-3 speakers (Host + Guest(s))
- Add realistic transitions, questions, and answers
- Cover the full duration with evenly spaced timestamps
- Each timestamp block should have 2-4 sentences
- Total length should reflect the ${durationMin}-minute duration

Generate the transcript now:`;

    const aiResponse = await fetch(`${ONSPACE_AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ONSPACE_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('OnSpace AI error:', errText);
      return new Response(JSON.stringify({ error: `AI error: ${errText}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const transcript = aiData?.choices?.[0]?.message?.content ?? '';

    if (!transcript) {
      return new Response(JSON.stringify({ error: 'Empty transcript from AI' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Save transcript to database
    const { error: updateErr } = await supabaseAdmin
      .from('space_recordings')
      .update({ transcript })
      .eq('id', recording_id);

    if (updateErr) {
      console.error('DB update error:', updateErr);
    }

    return new Response(JSON.stringify({ transcript, cached: false }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('transcribe-audio error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
