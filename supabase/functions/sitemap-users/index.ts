import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Fetch top 200 users by follower count (only those with actual activity)
  const { data: users, error } = await supabase
    .from('user_profiles')
    .select('username, followers_count, created_at')
    .order('followers_count', { ascending: false })
    .gt('followers_count', 0)
    .limit(200);

  if (error) {
    console.error('sitemap-users error:', error);
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }

  const today = new Date().toISOString().slice(0, 10);

  const urlEntries = (users ?? [])
    .filter((u: any) => u.username)
    .map((u: any) => {
      const followers = u.followers_count ?? 0;
      // Priority based on follower tiers
      const priority =
        followers >= 10000 ? '0.9' :
        followers >= 1000  ? '0.8' :
        followers >= 100   ? '0.7' :
                             '0.6';
      const changefreq =
        followers >= 10000 ? 'daily' :
        followers >= 1000  ? 'weekly' :
                             'monthly';
      return `  <url>
    <loc>https://testagram.site/profile/${encodeURIComponent(u.username)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

  return new Response(xml, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=43200', // 12-hour cache
    },
  });
});
