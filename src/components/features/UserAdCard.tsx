import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Globe, MoreHorizontal, X, ThumbsUp, MessageCircle, Share2, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatNumber } from '@/lib/utils';

interface UserAdCardProps {
  ad: {
    id: string;
    title: string;
    description: string;
    image_url?: string | null;
    video_url?: string | null;
    target_url?: string | null;
    impressions?: number;
    clicks?: number;
    user_profiles?: {
      id: string;
      username: string;
      avatar_url?: string | null;
      verified?: boolean;
    } | null;
  };
}

/**
 * UserAdCard — Facebook-style sponsored post card.
 * Features: advertiser header with "Ad · 🌐" label, full-bleed media,
 * body copy with expand, link preview strip, full-width CTA button,
 * and a like/comment/share engagement row.
 */
export function UserAdCard({ ad }: UserAdCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const impressionTracked = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(ad.impressions ? Math.floor(ad.impressions * 0.04) : 0);

  useEffect(() => {
    if (impressionTracked.current) return;
    impressionTracked.current = true;
    supabase.from('ad_impressions').insert({
      ad_id: ad.id,
      user_id: user?.id ?? null,
      clicked: false,
    }).catch(() => {});
  }, [ad.id, user?.id]);

  const handleClick = () => {
    supabase.from('ad_impressions').insert({
      ad_id: ad.id,
      user_id: user?.id ?? null,
      clicked: true,
    }).catch(() => {});
    supabase.rpc('track_ad_view', { ad_id_param: ad.id, user_id_param: user?.id ?? null }).catch(() => {});
    if (ad.target_url) window.open(ad.target_url, '_blank', 'noopener,noreferrer');
  };

  if (dismissed) return null;

  const advertiserName = ad.user_profiles?.username ?? 'Advertiser';
  const advertiserAvatar = ad.user_profiles?.avatar_url;
  const isVerified = ad.user_profiles?.verified;

  // Extract domain from target_url for link preview strip
  let domain = '';
  let domainShort = '';
  if (ad.target_url) {
    try {
      const u = new URL(ad.target_url);
      domain = u.hostname;
      domainShort = domain.replace(/^www\./, '');
    } catch { domain = ''; }
  }

  const bodyText = ad.description ?? '';
  const SHORT_LIMIT = 120;
  const isLong = bodyText.length > SHORT_LIMIT;
  const displayBody = expanded || !isLong ? bodyText : bodyText.slice(0, SHORT_LIMIT) + '…';

  const commentCount = ad.clicks ? Math.floor(ad.clicks * 0.12) : 0;
  const shareCount = ad.clicks ? Math.floor(ad.clicks * 0.05) : 0;

  return (
    <div className="border-b border-border bg-card hover:bg-muted/5 transition-colors">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-2">
        <div
          className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 cursor-pointer border border-border"
          onClick={() => ad.user_profiles && navigate(`/profile/${advertiserName}`)}
        >
          {advertiserAvatar ? (
            <img src={advertiserAvatar} alt={advertiserName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/30 to-amber-400/20 flex items-center justify-center font-bold text-primary text-sm">
              {advertiserName[0]?.toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              className="font-bold text-sm hover:underline truncate"
              onClick={() => ad.user_profiles && navigate(`/profile/${advertiserName}`)}
            >
              {advertiserName}
            </button>
            {isVerified && <BadgeCheck className="w-4 h-4 text-primary shrink-0" fill="currentColor" />}
          </div>
          {/* "Ad · 🌐" label — exact Facebook pattern */}
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-muted-foreground font-medium">Ad</span>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <Globe className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>

        {/* Options + close */}
        <div className="flex items-center gap-1 shrink-0">
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors">
            <MoreHorizontal className="w-5 h-5" />
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
            title="Hide ad"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Body copy ──────────────────────────────────────────────── */}
      <div className="px-4 pb-2.5">
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
          {displayBody}
          {isLong && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-primary font-semibold ml-1 hover:underline"
            >
              See more
            </button>
          )}
        </p>
      </div>

      {/* ── Full-bleed media ────────────────────────────────────────── */}
      {ad.video_url ? (
        <div className="w-full bg-black cursor-pointer" onClick={handleClick}>
          <video
            src={ad.video_url}
            className="w-full max-h-[400px] object-cover"
            muted
            autoPlay
            loop
            playsInline
          />
        </div>
      ) : ad.image_url ? (
        <div className="w-full cursor-pointer" onClick={handleClick}>
          <img
            src={ad.image_url}
            alt={ad.title}
            className="w-full max-h-[400px] object-cover"
            loading="lazy"
          />
        </div>
      ) : null}

      {/* ── Link preview strip (Facebook-style) ─────────────────────── */}
      {domain && (
        <div
          className="flex items-center justify-between bg-muted/40 border-t border-border px-4 py-3 cursor-pointer hover:bg-muted/60 transition-colors"
          onClick={handleClick}
        >
          <div className="min-w-0 flex-1 mr-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium truncate">{domainShort}</p>
            <p className="font-bold text-sm leading-tight line-clamp-1 mt-0.5">{ad.title}</p>
            {ad.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{ad.description}</p>
            )}
          </div>
          {/* CTA button */}
          <button
            className="shrink-0 px-4 py-2 bg-muted border border-border rounded-md text-sm font-bold hover:bg-muted/80 transition-colors whitespace-nowrap"
            onClick={handleClick}
          >
            {ad.target_url?.includes('sign') || ad.target_url?.includes('register')
              ? 'Sign up'
              : ad.target_url?.includes('shop') || ad.target_url?.includes('buy')
              ? 'Shop now'
              : 'Learn more'}
          </button>
        </div>
      )}

      {/* ── Engagement counts ───────────────────────────────────────── */}
      {(likeCount > 0 || commentCount > 0) && (
        <div className="px-4 py-1.5 flex items-center justify-between text-xs text-muted-foreground border-t border-border/50">
          <div className="flex items-center gap-1.5">
            {likeCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-[8px] text-white">👍</span>
                {formatNumber(likeCount + (liked ? 1 : 0))}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {commentCount > 0 && <span>{formatNumber(commentCount)} comments</span>}
            {shareCount > 0 && <span>{formatNumber(shareCount)} shares</span>}
          </div>
        </div>
      )}

      {/* ── Action bar ─────────────────────────────────────────────── */}
      <div className="px-2 py-0.5 flex items-center border-t border-border/60">
        <button
          onClick={() => setLiked(l => !l)}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-muted/60 ${liked ? 'text-blue-600' : 'text-muted-foreground'}`}
        >
          <ThumbsUp className={`w-4 h-4 ${liked ? 'fill-blue-600' : ''}`} />
          Like
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted/60 transition-colors">
          <MessageCircle className="w-4 h-4" />
          Comment
        </button>
        <button
          onClick={() => { if (ad.target_url) navigator.clipboard.writeText(ad.target_url).catch(() => {}); }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <Share2 className="w-4 h-4" />
          Share
        </button>
      </div>

      {/* ── Why am I seeing this ────────────────────────────────────── */}
      <div className="px-4 pb-2 flex items-center gap-2 text-[10px] text-muted-foreground/50">
        <span>Why this ad?</span>
        <span>·</span>
        <button className="hover:text-primary transition-colors" onClick={() => navigate('/create-ad')}>
          <ExternalLink className="w-3 h-3 inline mr-0.5" />
          Advertise
        </button>
      </div>
    </div>
  );
}
