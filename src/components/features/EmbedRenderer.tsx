import { useState, useMemo } from 'react';
import { Play, ExternalLink, X } from 'lucide-react';

// ── esbuild-safe module-level constants ──────────────────────────────────────
const YT_PATTERN = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
const SPOTIFY_PATTERN = /https?:\/\/open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/;
const SOUNDCLOUD_PATTERN = /https?:\/\/soundcloud\.com\/[\w-]+\/[\w-]+/;
const TWITTER_PATTERN = /https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/;
const TIKTOK_PATTERN = /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.]+\/video\/(\d+)/;
const INSTAGRAM_PATTERN = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/;
const GIPHY_PATTERN = /https?:\/\/(?:media\d*\.)?giphy\.com\/(?:media|gifs)\/(?:[^/]+[-])?([a-zA-Z0-9]+)(?:\/\S+)?/;
const CODEPEN_PATTERN = /https?:\/\/codepen\.io\/[\w-]+\/pen\/([\w-]+)/;
const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;
const CODEPEN_USER_PATTERN = /codepen\.io\/([\w-]+)\/pen/;

interface EmbedInfo {
  type: 'youtube' | 'spotify' | 'soundcloud' | 'twitter' | 'tiktok' | 'instagram' | 'giphy' | 'codepen';
  url: string;
  id?: string;
  subtype?: string;
}

export function detectEmbed(text: string): EmbedInfo | null {
  const yt = text.match(YT_PATTERN);
  if (yt) return { type: 'youtube', url: text, id: yt[1] };

  const sp = text.match(SPOTIFY_PATTERN);
  if (sp) return { type: 'spotify', url: text, subtype: sp[1], id: sp[2] };

  if (SOUNDCLOUD_PATTERN.test(text)) return { type: 'soundcloud', url: text };

  const tw = text.match(TWITTER_PATTERN);
  if (tw) return { type: 'twitter', url: text, id: tw[1] };

  const tt = text.match(TIKTOK_PATTERN);
  if (tt) return { type: 'tiktok', url: text, id: tt[1] };

  const ig = text.match(INSTAGRAM_PATTERN);
  if (ig) return { type: 'instagram', url: text, id: ig[1] };

  const gi = text.match(GIPHY_PATTERN);
  if (gi) return { type: 'giphy', url: text, id: gi[1] };

  const cp = text.match(CODEPEN_PATTERN);
  if (cp) return { type: 'codepen', url: text, id: cp[1] };

  return null;
}

export function extractEmbedUrls(content: string): string[] {
  const urls = content.match(URL_PATTERN) ?? [];
  return urls.filter(u => detectEmbed(u) !== null);
}

// ── Individual embed renderers (named exports for deterministic tree-shaking) ─

export function YouTubeEmbed({ id }: { id: string }) {
  const [show, setShow] = useState(false);
  const thumb = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
  const fallback = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

  if (!show) {
    return (
      <div className="relative rounded-2xl overflow-hidden bg-black cursor-pointer group aspect-video max-h-64"
        onClick={() => setShow(true)}>
        <img src={thumb} alt="YouTube video"
          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
          onError={e => { (e.target as HTMLImageElement).src = fallback; }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
            <Play className="w-7 h-7 text-white fill-white ml-1" />
          </div>
        </div>
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 bg-black/70 rounded-full">
          <svg viewBox="0 0 28 20" className="w-5 h-3.5 fill-red-600">
            <path d="M27.4 3.1A3.5 3.5 0 0 0 24.9.6C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5C28 14.7 28 10 28 10s0-4.7-.6-6.9zM11.2 14.3V5.7l7.3 4.3-7.3 4.3z" />
          </svg>
          <span className="text-white text-[10px] font-bold">YouTube</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden aspect-video bg-black">
      <iframe
        src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`}
        title="YouTube video"
        className="w-full h-full"
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

export function SpotifyEmbed({ id, subtype }: { id: string; subtype: string }) {
  const height = subtype === 'track' ? 80 : 152;
  return (
    <div className="rounded-2xl overflow-hidden">
      <iframe
        src={`https://open.spotify.com/embed/${subtype}/${id}?utm_source=generator&theme=0`}
        width="100%"
        height={height}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        className="border-0"
        title="Spotify player"
      />
    </div>
  );
}

export function SoundCloudEmbed({ url }: { url: string }) {
  const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff5500&auto_play=false&hide_related=false&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false`;
  return (
    <div className="rounded-2xl overflow-hidden">
      <iframe width="100%" height={120} src={src}
        title="SoundCloud player" loading="lazy" className="border-0" />
    </div>
  );
}

export function TwitterEmbed({ id }: { id: string }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-border">
      <iframe
        src={`https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=light`}
        width="100%" height={300} loading="lazy" className="border-0" title="Tweet"
      />
    </div>
  );
}

export function GiphyEmbed({ id }: { id: string }) {
  return (
    <div className="rounded-2xl overflow-hidden">
      <img src={`https://media.giphy.com/media/${id}/giphy.gif`} alt="GIF"
        className="w-full max-h-64 object-contain bg-black rounded-2xl" loading="lazy" />
    </div>
  );
}

export function CodePenEmbed({ id, url }: { id: string; url: string }) {
  const [show, setShow] = useState(false);
  const userMatch = url.match(CODEPEN_USER_PATTERN);
  const username = userMatch?.[1] ?? 'anonymous';

  if (!show) {
    return (
      <button onClick={() => setShow(true)}
        className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-left">
        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shrink-0">
          <svg viewBox="0 0 138 26" className="w-6 h-6 fill-white">
            <path d="M80.1 4.3L69 11.8 57.9 4.3 69 16.1 80.1 4.3zM60.5 4.3L49.4 11.8 49.4 20.3 69 8.5 88.6 20.3 88.6 11.8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">CodePen: {username}/{id}</p>
          <p className="text-xs text-muted-foreground">Click to load pen</p>
        </div>
        <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-border">
      <iframe
        src={`https://codepen.io/${username}/embed/${id}?default-tab=result&theme-id=dark`}
        width="100%" height={400} loading="lazy" className="border-0" title="CodePen" allowFullScreen
      />
    </div>
  );
}

export function LinkPreview({ url }: { url: string }) {
  // Compute domain synchronously without IIFE — stable across builds
  let domain = url;
  try { domain = new URL(url).hostname.replace('www.', ''); } catch { /* use raw url */ }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 p-3.5 rounded-2xl border border-border bg-muted/30 hover:bg-muted/60 transition-colors group"
      onClick={e => e.stopPropagation()}>
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <ExternalLink className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{domain}</p>
        <p className="text-sm font-medium truncate text-primary group-hover:underline">
          {url.length > 60 ? url.slice(0, 60) + '\u2026' : url}
        </p>
      </div>
    </a>
  );
}

// ── Platform label helpers — module-level, no closures (esbuild guard) ────────
function getPlatformLabel(type: string): string {
  if (type === 'youtube')    return 'YouTube';
  if (type === 'spotify')    return 'Spotify';
  if (type === 'soundcloud') return 'SoundCloud';
  if (type === 'twitter')    return 'X / Twitter';
  if (type === 'giphy')      return 'Giphy GIF';
  if (type === 'codepen')    return 'CodePen';
  if (type === 'tiktok')     return 'TikTok';
  if (type === 'instagram')  return 'Instagram';
  return 'Link';
}

function getPlatformBadgeCls(type: string): string {
  if (type === 'youtube')    return 'bg-red-600/10 text-red-600 border-red-600/20';
  if (type === 'spotify')    return 'bg-green-600/10 text-green-600 border-green-600/20';
  if (type === 'soundcloud') return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
  if (type === 'twitter')    return 'bg-sky-500/10 text-sky-600 border-sky-500/20';
  if (type === 'giphy')      return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
  if (type === 'codepen')    return 'bg-foreground/8 text-foreground border-border';
  if (type === 'tiktok')     return 'bg-foreground/8 text-foreground border-border';
  if (type === 'instagram')  return 'bg-pink-500/10 text-pink-600 border-pink-500/20';
  return 'bg-primary/10 text-primary border-primary/20';
}

// ── ComposeEmbedPreview — live embed card shown while composing ───────────────
// esbuild guard: module-level component, no inline objects in render
export function ComposeEmbedPreview({ url, onRemove }: { url: string; onRemove?: () => void }) {
  const info = detectEmbed(url);
  let domain = url;
  try { domain = new URL(url).hostname.replace('www.', ''); } catch { /* keep raw */ }

  const badgeCls   = info ? getPlatformBadgeCls(info.type) : 'bg-primary/10 text-primary border-primary/20';
  const badgeLabel = info ? getPlatformLabel(info.type) : domain;

  return (
    <div className="relative mt-2 rounded-2xl overflow-hidden border border-border bg-card shadow-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeCls}`}>
            {badgeLabel}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[180px]">
            {url.length > 50 ? url.slice(0, 50) + '\u2026' : url}
          </span>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="ml-2 p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Remove embed preview"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Live embed */}
      <div className="p-2" onClick={e => e.stopPropagation()}>
        {info?.type === 'youtube' && info.id && <YouTubeEmbed id={info.id} />}
        {info?.type === 'spotify' && info.id && info.subtype && <SpotifyEmbed id={info.id} subtype={info.subtype} />}
        {info?.type === 'soundcloud' && <SoundCloudEmbed url={url} />}
        {info?.type === 'twitter' && info.id && <TwitterEmbed id={info.id} />}
        {info?.type === 'giphy' && info.id && <GiphyEmbed id={info.id} />}
        {info?.type === 'codepen' && info.id && <CodePenEmbed id={info.id} url={url} />}
        {(!info || info.type === 'tiktok' || info.type === 'instagram') && <LinkPreview url={url} />}
      </div>
    </div>
  );
}

// ── Main EmbedRenderer component ─────────────────────────────────────────────
interface EmbedRendererProps {
  content: string;
}

export function EmbedRenderer({ content }: EmbedRendererProps) {
  // useMemo to avoid new Set on every render (esbuild non-determinism guard)
  const unique = useMemo(() => {
    const all = extractEmbedUrls(content);
    const seen: string[] = [];
    return all.filter(u => { if (seen.includes(u)) return false; seen.push(u); return true; });
  }, [content]);

  if (unique.length === 0) return null;

  return (
    <div className="mt-3 space-y-3" onClick={e => e.stopPropagation()}>
      {unique.map((url, i) => {
        const info = detectEmbed(url);
        if (!info) return null;

        if (info.type === 'youtube' && info.id) return <YouTubeEmbed key={i} id={info.id} />;
        if (info.type === 'spotify' && info.id && info.subtype) return <SpotifyEmbed key={i} id={info.id} subtype={info.subtype} />;
        if (info.type === 'soundcloud') return <SoundCloudEmbed key={i} url={url} />;
        if (info.type === 'twitter' && info.id) return <TwitterEmbed key={i} id={info.id} />;
        if (info.type === 'giphy' && info.id) return <GiphyEmbed key={i} id={info.id} />;
        if (info.type === 'codepen' && info.id) return <CodePenEmbed key={i} id={info.id} url={url} />;
        if (info.type === 'tiktok' || info.type === 'instagram') return <LinkPreview key={i} url={url} />;
        return null;
      })}
    </div>
  );
}
