/**
 * og-image — Dynamic Open Graph image generator
 * URL: /functions/v1/og-image
 *
 * Query params:
 *   ?username=    → Profile card (avatar, name, bio, follower count)
 *   ?thread=      → Thread card (title, author, excerpt, cover image, views)
 *   ?post=        → Post card (content excerpt, image/video thumbnail, likes)
 *   ?community=   → Community card (icon, name, member count)
 *   ?tag=         → Hashtag card (#tag, post count)
 *
 * Returns: image/svg+xml
 * Crawlers and Open Graph both accept SVG for OG images.
 * For PNG support: serve via a converter proxy or use a cdn with SVG→PNG support.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BRAND_COLOR = '#7c3aed';
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
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
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
    <linearGradient id="overlayGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0f0721" stop-opacity="0.95"/>
      <stop offset="65%" stop-color="#1e0a3c" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#0f0721" stop-opacity="0.3"/>
    </linearGradient>
    <clipPath id="avatarClip">
      <circle cx="120" cy="200" r="64"/>
    </clipPath>
    <clipPath id="communityClip">
      <rect x="48" y="136" width="128" height="128" rx="24"/>
    </clipPath>
    <clipPath id="mediaCoverClip">
      <rect x="640" y="0" width="560" height="630" rx="0"/>
    </clipPath>
    <clipPath id="postThumbClip">
      <rect x="700" y="80" width="440" height="300" rx="20"/>
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
  id: string; title: string; content: string; cover_image?: string; media_url?: string;
  views_count?: number; likes_count?: number;
  user_profiles?: { username?: string; avatar_url?: string; verified?: boolean };
}): string {
  const titleLines = wrapText(t.title, 42, 2);
  const excerpt = t.content?.replace(/<[^>]*>/g, '').slice(0, 160) ?? '';
  const excerptLines = wrapText(excerpt, 68, 3);
  const author = t.user_profiles?.username ?? 'unknown';
  const views = formatNum(t.views_count ?? 0);
  const likes = formatNum(t.likes_count ?? 0);

  // Use actual cover image or media thumbnail as the right panel background
  const coverUrl = t.cover_image || t.media_url;
  const rightPanel = coverUrl
    ? `
  <!-- Actual thread cover image fills the right side -->
  <image href="${escapeXml(coverUrl)}" x="640" y="0" width="560" height="630"
    clip-path="url(#mediaCoverClip)" preserveAspectRatio="xMidYMid slice"/>
  <!-- Dark gradient overlay so left text remains readable -->
  <rect x="0" y="0" width="1200" height="630" fill="url(#overlayGrad)"/>
  `
    : `
  <!-- Decorative right panel (no cover image) -->
  <rect x="760" y="80" width="380" height="460" rx="24" fill="white" opacity="0.03" stroke="white" stroke-width="1" stroke-opacity="0.07"/>
  <text x="950" y="260" font-family="system-ui" font-size="100" text-anchor="middle" opacity="0.1">📖</text>
  <text x="950" y="360" font-family="system-ui,-apple-system,sans-serif" font-size="16" fill="white" opacity="0.2" text-anchor="middle">Read on Testagram</text>
  `;

  return `
  ${rightPanel}

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
  `;
}

function postSvg(p: {
  id: string; content: string; image_url?: string; video_url?: string;
  likes_count?: number; views_count?: number; reposts_count?: number;
  user_profiles?: { username?: string; avatar_url?: string; verified?: boolean };
}): string {
  const text = p.content?.replace(/<[^>]*>/g, '') ?? '';
  const textLines = wrapText(text, 52, 4);
  const author = p.user_profiles?.username ?? 'unknown';
  const likes = formatNum(p.likes_count ?? 0);
  const views = formatNum(p.views_count ?? 0);
  const reposts = formatNum(p.reposts_count ?? 0);

  // Embed actual image/video thumbnail on the right side
  const mediaUrl = p.image_url || p.video_url;
  const isVideo = !p.image_url && !!p.video_url;

  const rightPanel = mediaUrl
    ? `
  <!-- Actual post media fills the right side -->
  <image href="${escapeXml(mediaUrl)}" x="640" y="0" width="560" height="630"
    clip-path="url(#mediaCoverClip)" preserveAspectRatio="xMidYMid slice"/>
  <!-- Gradient overlay -->
  <rect x="0" y="0" width="1200" height="630" fill="url(#overlayGrad)"/>
  ${isVideo ? `
  <!-- Video play indicator -->
  <circle cx="920" cy="315" r="44" fill="white" opacity="0.15"/>
  <polygon points="905,295 905,335 945,315" fill="white" opacity="0.9"/>
  ` : ''}
  `
    : `
  <rect x="760" y="80" width="380" height="460" rx="24" fill="white" opacity="0.03" stroke="white" stroke-width="1" stroke-opacity="0.07"/>
  <text x="950" y="300" font-family="system-ui" font-size="100" text-anchor="middle" opacity="0.08">${isVideo ? '▶' : '📝'}</text>
  `;

  const avatarEl = p.user_profiles?.avatar_url
    ? `<image href="${escapeXml(p.user_profiles.avatar_url)}" x="48" y="90" width="56" height="56" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" style="clip-path: circle(28px at 76px 118px)"/>`
    : `<circle cx="76" cy="118" r="28" fill="${BRAND_COLOR}" opacity="0.4"/>
       <text x="76" y="126" font-family="system-ui" font-size="22" fill="white" text-anchor="middle" font-weight="700">${escapeXml(author[0]?.toUpperCase() ?? '?')}</text>`;

  return `
  ${rightPanel}

  <!-- Post label -->
  <rect x="48" y="56" width="86" height="28" rx="14" fill="${BRAND_COLOR}" opacity="0.22" stroke="${BRAND_COLOR}" stroke-width="1"/>
  <text x="91" y="75" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="700" fill="${BRAND_LIGHT}" text-anchor="middle">POST</text>

  <!-- Author row -->
  <circle cx="76" cy="118" r="30" fill="none" stroke="url(#accentGrad)" stroke-width="2" opacity="0.7"/>
  ${avatarEl}
  <text x="118" y="113" font-family="system-ui,-apple-system,sans-serif" font-size="20" font-weight="700" fill="white">@${escapeXml(truncate(author, 18))}</text>
  ${p.user_profiles?.verified ? `<text x="${118 + Math.min(author.length, 18) * 12 + 4}" y="113" font-family="system-ui" font-size="16" fill="${BRAND_COLOR}">✓</text>` : ''}

  <!-- Content lines -->
  ${textLines.map((line, i) => `
  <text x="48" y="${170 + i * 44}" font-family="system-ui,-apple-system,sans-serif" font-size="34" font-weight="600" fill="white">
    ${escapeXml(line)}
  </text>`).join('')}

  <!-- Stats row -->
  <rect x="48" y="460" width="520" height="68" rx="20" fill="white" opacity="0.05" stroke="white" stroke-width="1" stroke-opacity="0.08"/>
  <text x="80" y="490" font-family="system-ui,-apple-system,sans-serif" font-size="26" font-weight="800" fill="white">${escapeXml(likes)}</text>
  <text x="80" y="514" font-family="system-ui,-apple-system,sans-serif" font-size="13" fill="white" opacity="0.45">likes</text>
  <text x="200" y="490" font-family="system-ui,-apple-system,sans-serif" font-size="26" font-weight="800" fill="white">${escapeXml(views)}</text>
  <text x="200" y="514" font-family="system-ui,-apple-system,sans-serif" font-size="13" fill="white" opacity="0.45">views</text>
  <text x="320" y="490" font-family="system-ui,-apple-system,sans-serif" font-size="26" font-weight="800" fill="white">${escapeXml(reposts)}</text>
  <text x="320" y="514" font-family="system-ui,-apple-system,sans-serif" font-size="13" fill="white" opacity="0.45">reposts</text>
  `;
}

function communitySvg(c: {
  name: string; display_name: string; description?: string;
  icon_url?: string; banner_url?: string; member_count?: number; post_count?: number;
}): string {
  const desc = truncate(c.description ?? '', 130);
  const descLines = wrapText(desc, 60, 3);
  const members = formatNum(c.member_count ?? 0);
  const posts = formatNum(c.post_count ?? 0);

  // Use banner_url as right-panel background if available
  const bannerPanel = c.banner_url
    ? `
  <image href="${escapeXml(c.banner_url)}" x="640" y="0" width="560" height="630"
    clip-path="url(#mediaCoverClip)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="0" width="1200" height="630" fill="url(#overlayGrad)"/>
  `
    : `
  <rect x="760" y="80" width="380" height="460" rx="24" fill="white" opacity="0.03" stroke="white" stroke-width="1" stroke-opacity="0.07"/>
  <text x="950" y="250" font-family="system-ui" font-size="100" text-anchor="middle" opacity="0.1">👥</text>
  `;

  const iconEl = c.icon_url
    ? `<image href="${escapeXml(c.icon_url)}" x="48" y="136" width="128" height="128" clip-path="url(#communityClip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="48" y="136" width="128" height="128" rx="24" fill="${BRAND_COLOR}" opacity="0.3"/>
       <text x="112" y="215" font-family="system-ui" font-size="60" text-anchor="middle" opacity="0.8">${escapeXml(c.display_name[0]?.toUpperCase() ?? 'C')}</text>`;

  return `
  ${bannerPanel}

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
    const postId = url.searchParams.get('post');
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
        .select('id, title, content, cover_image, media_url, views_count, likes_count, user_profiles(username, avatar_url, verified)')
        .eq('id', threadId)
        .maybeSingle();

      svgContent = thread ? threadSvg(thread) : defaultSvg();

    } else if (postId) {
      const { data: post } = await supabase
        .from('posts')
        .select('id, content, image_url, video_url, likes_count, views_count, reposts_count, user_profiles(username, avatar_url, verified)')
        .eq('id', postId)
        .maybeSingle();

      svgContent = post ? postSvg(post) : defaultSvg();

    } else if (communityName) {
      const { data: community } = await supabase
        .from('communities')
        .select('name, display_name, description, icon_url, banner_url, member_count, post_count')
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
