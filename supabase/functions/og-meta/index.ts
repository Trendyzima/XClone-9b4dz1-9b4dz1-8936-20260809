import { corsHeaders } from '../_shared/cors.ts';

// ── OG Metadata Fetcher ──────────────────────────────────────────────────────
// Fetches Open Graph metadata (title, description, image) from any URL.
// Runs server-side to avoid CORS issues from the browser.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'url is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate URL
    let parsed: URL;
    try { parsed = new URL(url); } catch {
      return new Response(JSON.stringify({ error: 'invalid url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the page HTML with a 5s timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let html = '';
    try {
      const res = await fetch(parsed.href, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Testagram/1.0; +https://testagram.site/bot)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch {
      clearTimeout(timer);
      // Return minimal data — at least show the domain
      const domain = parsed.hostname.replace('www.', '');
      return new Response(JSON.stringify({ url, domain, title: domain, description: null, image: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract OG / meta tags with simple regex (fast, no DOM parser needed)
    const getMeta = (property: string): string | null => {
      // og:property
      const ogMatch = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'));
      if (ogMatch?.[1]) return ogMatch[1];
      // name= variant
      const nameMatch = html.match(new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'));
      return nameMatch?.[1] ?? null;
    };

    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const titleTag = titleTagMatch?.[1]?.trim() ?? null;

    const title       = getMeta('og:title')       ?? getMeta('twitter:title') ?? titleTag;
    const description = getMeta('og:description') ?? getMeta('twitter:description') ?? getMeta('description');
    const image       = getMeta('og:image')        ?? getMeta('twitter:image');
    const siteName    = getMeta('og:site_name');
    const domain      = parsed.hostname.replace('www.', '');

    // Make image URL absolute if relative
    let absoluteImage = image;
    if (image && !image.startsWith('http')) {
      absoluteImage = `${parsed.origin}${image.startsWith('/') ? '' : '/'}${image}`;
    }

    return new Response(JSON.stringify({
      url,
      domain,
      title:       title?.slice(0, 120)       ?? domain,
      description: description?.slice(0, 300) ?? null,
      image:       absoluteImage              ?? null,
      siteName:    siteName                   ?? null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[og-meta] error:', err);
    return new Response(JSON.stringify({ error: 'internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
