/**
 * community-sitemap — generates a sitemap XML for the top public communities
 * URL: /functions/v1/community-sitemap
 * Returns: application/xml with up to 40 community URLs
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Fetch top 40 communities by member count (public only)
    const { data: communities, error } = await supabase
      .from('communities')
      .select('name, display_name, description, member_count, post_count, created_at')
      .eq('is_private', false)
      .order('member_count', { ascending: false })
      .limit(40);

    if (error) throw error;

    const BASE = 'https://testagram.site';
    const now = new Date().toISOString().split('T')[0];

    const urls = (communities ?? []).map((c: any) => {
      // Derive change frequency from activity
      const isActive = (c.post_count ?? 0) > 50;
      const changefreq = isActive ? 'hourly' : 'daily';
      const priority = Math.min(0.95, 0.6 + Math.min(0.35, (c.member_count ?? 0) / 1000));

      return `
  <url>
    <loc>${BASE}/c/${encodeURIComponent(c.name)}</loc>
    <lastmod>${c.created_at?.split('T')[0] ?? now}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority.toFixed(2)}</priority>
  </url>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Generated: ${now} | ${(communities ?? []).length} communities -->
${urls}
</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
        'X-Generated-At': now,
      },
    });
  } catch (err: any) {
    console.error('community-sitemap error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
