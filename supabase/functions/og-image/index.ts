/**
 * og-image — Dynamic Open Graph image generator
 * URL: /functions/v1/og-image
 *
 * Query params:
 *   ?username=    → Profile card (avatar, name, bio, follower count)
 *   ?thread=      → Thread card (title, author, excerpt, views)
 *   ?community=   → Community card (icon, name, member count)
 *   ?tag=         → Hashtag card (#tag, post count)
 *
 * Returns: image/svg+xml (crawlers and Open Graph support SVG)
 * For PNG: browsers render the SVG, and og: crawlers accept SVG directly.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BRAND_COLOR = '#7c3aed'; // Testagram violet
const BRAND_LIGHT = '#ede9fe';
const BASE = 'https://testagram.site';

function escapeXml(str: string): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(str: string, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
      if (lines.length >= maxLines - 1) {
        current += ' …';
        break;
      }
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current && lines.length < maxLines) lines.push(current.trim());
  return lines;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function makeSvg(content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f0721"/>
      <stop offset="60%" stop-color="#1e0a3c"/>
      <stop offset="100%" stop-color="#0a0118"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BRAND_COLOR}"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <clipPath id="avatarClip">
      <circle cx="120" cy="200" r="64"/>
    </clipPath>
    <clipPath id="communityClip">
      <rect x="48" y="136" width="128" height="128" rx="24"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)"/>

  <!-- Decorative circles -->
  <circle cx="950" cy="80" r="200" fill="${BRAND_COLOR}" opacity="0.08"/>
  <circle cx="1100" cy="520" r="150" fill="#2563eb" opacity="0.06"/>
  <circle cx="100" cy="550" r="120" fill="${BRAND_COLOR}" opacity="0.05"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="1200" height="6" fill="url(#accentGrad)"/>

  <!-- Brand watermark -->
  <text x="1152" y="44" font-family="system-ui,-apple-system,sans-serif" font-size="22" font-weight="700"
    fill="white" opacity="0.25" text-anchor="end">testagram</text>

  ${content}

  <!-- Bottom bar -->
  <rect x="0" y="596" width="1200" height="34" fill="white" opacity="0.04"/>
  <text x="48" y="618" font-family="system-ui,-apple-system,sans-serif" font-size="16" fill="white" opacity="0.4">
    ${escapeXml(BASE)}
  </text>
  <text x="1152" y="618" font-family="system-ui,-apple-system,sans-serif" font-size="16" fill="white" opacity="0.4" text-anchor="end">
    Join the conversation →
  </text>
</svg>`;
}

function profileSvg(p: {
  username: string; bio?: string; avatar_url?: string; followers_count?: number;
  following_count?: number; verified?: boolean; is_creator?: boolean; total_earnings?: number;
}): string {
  const bio = truncate(p.bio ?? '', 120);
  const bioLines = wrapText(bio, 60, 2);
  const followers = formatNum(p.followers_count ?? 0);
  const following = formatNum(p.following_count ?? 0);

  const verifiedBadge = p.verified
    ? `<circle cx="196" cy="252" r="16" fill="${BRAND_COLOR}"/>
       <text x="196" y="258" font-family="system-ui" font-size="14" fill="white" text-anchor="middle">✓</text>`
    : '';

  const creatorBadge = p.is_creator
    ? `<rect x="48" y="300" width="130" height="28" rx="14" fill="${BRAND_COLOR}" opacity="0.2" stroke="${BRAND_COLOR}" stroke-width="1"/>
       <text x="113" y="319" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="600" fill="${BRAND_LIGHT}" text-anchor="middle">⭐ Creator</text>`
    : '';

  const avatarCircle = p.avatar_url
    ? `<image href="${escapeXml(p.avatar_url)}" x="56" y="136" width="128" height="128" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="120" cy="200" r="64" fill="${BRAND_COLOR}" opacity="0.3"/>
       <text x="120" y="215" font-family="system-ui" font-size="52" font-weight="700" fill="white" text-anchor="middle" opacity="0.8">${escapeXml(p.username[0]?.toUpperCase() ?? '?')}</text>`;

  return `
  <!-- Avatar ring -->
  <circle cx="120" cy="200" r="70" fill="none" stroke="url(#accentGrad)" stroke-width="3" opacity="0.8"/>
  ${avatarCircle}
  ${verifiedBadge}

  <!-- Username -->
  <text x="48" y="300" font-family="system-ui,-apple-system,sans-serif" font-size="48" font-weight="800" fill="white">
    ${escapeXml(truncate(p.username, 18))}
  </text>
  ${creatorBadge}

  <!-- Bio lines -->
  ${bioLines.map((line, i) => `
  <text x="48" y="${350 + i * 36}" font-family="system-ui,-apple-system,sans-serif" font-size="24" fill="white" opacity="0.6">
    ${escapeXml(line)}
  </text>`).join('')}

  <!-- Stats row -->
  <rect x="48" y="430" width="220" height="72" rx="16" fill="white" opacity="0.06" stroke="white" stroke-width="1" stroke-opacity="0.1"/>
  <text x="158" y="460" font-family="system-ui,-apple-system,sans-serif" font-size="30" font-weight="800" fill="white" text-anchor="middle">${escapeXml(followers)}</text>
  <text x="158" y="488" font-family="system-ui,-apple-system,sans-serif" font-size="14" fill="white" opacity="0.5" text-anchor="middle">followers</text>

  <rect x="284" y="430" width="220" height="72" rx="16" fill="white" opacity="0.06" stroke="white" stroke-width="1" stroke-opacity="0.1"/>
  <text x="394" y="460" font-family="system-ui,-apple-system,sans-serif" font-size="30" font-weight="800" fill="white" text-anchor="middle">${escapeXml(following)}</text>
  <text x="394" y="488" font-family="system-ui,-apple-system,sans-serif" font-size="14" fill="white" opacity="0.5" text-anchor="middle">following</text>

  <!-- Decorative right panel -->
  <rect x="700" y="100" width="440" height="420" rx="24" fill="white" opacity="0.03" stroke="white" stroke-width="1" stroke-opacity="0.08"/>
  <text x="920" y="220" font-family="system-ui" font-size="96" text-anchor="middle" opacity="0.12">👤</text>
  <text x="920" y="320" font-family="system-ui,-apple-system,sans-serif" font-size="20" fill="white" opacity="0.25" text-anchor="middle">@${escapeXml(p.username)} on Testagram</text>
  `;
}

function threadSvg(t: {
  id: string; title: string; content: string; cover_image?: string;
  views_count?: number; likes_count?: number;
  user_profiles?: { username?: string; avatar_url?: string; verified?: boolean };
}): string {
  const titleLines = wrapText(t.title, 42, 2);
  const excerpt = t.content?.replace(/<[^>]*>/g, '').slice(0, 160) ?? '';
  const excerptLines = wrapText(excerpt, 68, 3);
  const author = t.user_profiles?.username ?? 'unknown';
  const views = formatNum(t.views_count ?? 0);
  const likes = formatNum(t.likes_count ?? 0);

  return `
  <!-- Article label -->
  <rect x="48" y="90" width="110" height="32" rx="16" fill="${BRAND_COLOR}" opacity="0.25" stroke="${BRAND_COLOR}" stroke-width="1"/>
  <text x="103" y="111" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="700" fill="${BRAND_LIGHT}" text-anchor="middle">📝 THREAD</text>

  <!-- Title lines -->
  ${titleLines.map((line, i) => `
  <text x="48" y="${160 + i * 64}" font-family="system-ui,-apple-system,sans-serif" font-size="52" font-weight="800" fill="white">
    ${escapeXml(line)}
  </text>`).join('')}

  <!-- Divider -->
  <rect x="48" y="${160 + titleLines.length * 64 + 8}" width="80" height="4" rx="2" fill="url(#accentGrad)"/>

  <!-- Excerpt lines -->
  ${excerptLines.map((line, i) => `
  <text x="48" y="${160 + titleLines.length * 64 + 40 + i * 30}" font-family="system-ui,-apple-system,sans-serif" font-size="22" fill="white" opacity="0.55">
    ${escapeXml(line)}
  </text>`).join('')}

  <!-- Author chip -->
  <rect x="48" y="490" width="240" height="52" rx="26" fill="white" opacity="0.07" stroke="white" stroke-width="1" stroke-opacity="0.12"/>
  <text x="72" y="522" font-family="system-ui,-apple-system,sans-serif" font-size="20" fill="white" opacity="0.8">by @${escapeXml(truncate(author, 16))}</text>
  ${t.user_profiles?.verified ? `<text x="238" y="522" font-family="system-ui" font-size="18" fill="${BRAND_COLOR}">✓</text>` : ''}

  <!-- Stats -->
  <text x="320" y="522" font-family="system-ui,-apple-system,sans-serif" font-size="20" fill="white" opacity="0.4">👁 ${escapeXml(views)}</text>
  <text x="420" y="522" font-family="system-ui,-apple-system,sans-serif" font-size="20" fill="white" opacity="0.4">❤ ${escapeXml(likes)}</text>

  <!-- Right panel -->
  <rect x="760" y="80" width="380" height="460" rx="24" fill="white" opacity="0.03" stroke="white" stroke-width="1" stroke-opacity="0.07"/>
  <text x="950" y="260" font-family="system-ui" font-size="100" text-anchor="middle" opacity="0.1">📖</text>
  <text x="950" y="360" font-family="system-ui,-apple-system,sans-serif" font-size="16" fill="white" opacity="0.2" text-anchor="middle">Read on Testagram</text>
  `;
}

function communitySvg(c: {
  name: string; display_name: string; description?: string;
  icon_url?: string; member_count?: number; post_count?: number;
}): string {
  const desc = truncate(c.description ?? '', 130);
  const descLines = wrapText(desc, 60, 3);
  const members = formatNum(c.member_count ?? 0);
  const posts = formatNum(c.post_count ?? 0);

  const iconEl = c.icon_url
    ? `<image href="${escapeXml(c.icon_url)}" x="48" y="136" width="128" height="128" clip-path="url(#communityClip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="48" y="136" width="128" height="128" rx="24" fill="${BRAND_COLOR}" opacity="0.3"/>
       <text x="112" y="215" font-family="system-ui" font-size="60" text-anchor="middle" opacity="0.8">${escapeXml(c.display_name[0]?.toUpperCase() ?? 'C')}</text>`;

  return `
  <!-- Community label -->
  <rect x="48" y="84" width="154" height="32" rx="16" fill="${BRAND_COLOR}" opacity="0.22" stroke="${BRAND_COLOR}" stroke-width="1"/>
  <text x="125" y="105" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="700" fill="${BRAND_LIGHT}" text-anchor="middle">🌐 COMMUNITY</text>

  <!-- Icon with rounded rect -->
  <rect x="44" y="132" width="136" height="136" rx="28" fill="white" opacity="0.08" stroke="white" stroke-width="1" stroke-opacity="0.15"/>
  ${iconEl}

  <!-- Community name -->
  <text x="48" y="312" font-family="system-ui,-apple-system,sans-serif" font-size="54" font-weight="800" fill="white">
    ${escapeXml(truncate(c.display_name, 20))}
  </text>
  <text x="48" y="348" font-family="system-ui,-apple-system,sans-serif" font-size="22" fill="white" opacity="0.4">c/${escapeXml(c.name)}</text>

  <!-- Description -->
  ${descLines.map((line, i) => `
  <text x="48" y="${396 + i * 30}" font-family="system-ui,-apple-system,sans-serif" font-size="22" fill="white" opacity="0.55">
    ${escapeXml(line)}
  </text>`).join('')}

  <!-- Stats row -->
  <rect x="48" y="492" width="200" height="68" rx="16" fill="white" opacity="0.06" stroke="white" stroke-width="1" stroke-opacity="0.1"/>
  <text x="148" y="522" font-family="system-ui,-apple-system,sans-serif" font-size="30" font-weight="800" fill="white" text-anchor="middle">${escapeXml(members)}</text>
  <text x="148" y="548" font-family="system-ui,-apple-system,sans-serif" font-size="13" fill="white" opacity="0.45" text-anchor="middle">members</text>

  <rect x="264" y="492" width="180" height="68" rx="16" fill="white" opacity="0.06" stroke="white" stroke-width="1" stroke-opacity="0.1"/>
  <text x="354" y="522" font-family="system-ui,-apple-system,sans-serif" font-size="30" font-weight="800" fill="white" text-anchor="middle">${escapeXml(posts)}</text>
  <text x="354" y="548" font-family="system-ui,-apple-system,sans-serif" font-size="13" fill="white" opacity="0.45" text-anchor="middle">posts</text>

  <!-- Right decorative panel -->
  <rect x="760" y="80" width="380" height="460" rx="24" fill="white" opacity="0.03" stroke="white" stroke-width="1" stroke-opacity="0.07"/>
  <text x="950" y="250" font-family="system-ui" font-size="100" text-anchor="middle" opacity="0.1">👥</text>
  `;
}

function hashtagSvg(tag: string, postCount: number): string {
  const posts = formatNum(postCount);
  return `
  <!-- Hashtag label -->
  <rect x="48" y="84" width="130" height="32" rx="16" fill="${BRAND_COLOR}" opacity="0.22" stroke="${BRAND_COLOR}" stroke-width="1"/>
  <text x="113" y="105" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="700" fill="${BRAND_LIGHT}" text-anchor="middle">TRENDING</text>

  <!-- Big hashtag -->
  <text x="48" y="280" font-family="system-ui,-apple-system,sans-serif" font-size="110" font-weight="900" fill="url(#accentGrad)" opacity="0.9">
    #${escapeXml(truncate(tag, 14))}
  </text>

  <!-- Post count -->
  <text x="48" y="360" font-family="system-ui,-apple-system,sans-serif" font-size="36" fill="white" opacity="0.55">
    ${escapeXml(posts)} posts
  </text>
  <text x="48" y="410" font-family="system-ui,-apple-system,sans-serif" font-size="22" fill="white" opacity="0.35">
    Join the conversation on Testagram
  </text>

  <!-- Right decorative -->
  <text x="950" y="320" font-family="system-ui" font-size="140" text-anchor="middle" opacity="0.06">#</text>
  `;
}

function defaultSvg(): string {
  return `
  <text x="600" y="250" font-family="system-ui,-apple-system,sans-serif" font-size="72" font-weight="900"
    fill="white" text-anchor="middle">Testagram</text>
  <text x="600" y="340" font-family="system-ui,-apple-system,sans-serif" font-size="28" fill="white"
    opacity="0.5" text-anchor="middle">Social Media · Videos · Communities</text>
  <rect x="200" y="380" width="800" height="4" rx="2" fill="url(#accentGrad)" opacity="0.6"/>
  <text x="600" y="440" font-family="system-ui,-apple-system,sans-serif" font-size="22" fill="white"
    opacity="0.3" text-anchor="middle">Post · Connect · Earn</text>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const username = url.searchParams.get('username');
    const threadId = url.searchParams.get('thread');
    const communityName = url.searchParams.get('community');
    const tag = url.searchParams.get('tag');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let svgContent = '';

    if (username) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('username, bio, avatar_url, followers_count, following_count, verified, is_creator, total_earnings')
        .eq('username', username)
        .maybeSingle();

      svgContent = profile ? profileSvg(profile) : defaultSvg();

    } else if (threadId) {
      const { data: thread } = await supabase
        .from('threads')
        .select('id, title, content, cover_image, views_count, likes_count, user_profiles(username, avatar_url, verified)')
        .eq('id', threadId)
        .maybeSingle();

      svgContent = thread ? threadSvg(thread) : defaultSvg();

    } else if (communityName) {
      const { data: community } = await supabase
        .from('communities')
        .select('name, display_name, description, icon_url, member_count, post_count')
        .eq('name', communityName)
        .eq('is_private', false)
        .maybeSingle();

      svgContent = community ? communitySvg(community) : defaultSvg();

    } else if (tag) {
      const { data: hashtag } = await supabase
        .from('hashtags')
        .select('tag, usage_count')
        .eq('tag', tag.toLowerCase())
        .maybeSingle();

      svgContent = hashtagSvg(tag, hashtag?.usage_count ?? 0);

    } else {
      svgContent = defaultSvg();
    }

    const svg = makeSvg(svgContent);

    return new Response(svg, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: any) {
    console.error('og-image error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
