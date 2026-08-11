import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Megaphone, BadgeCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface UserAdCardProps {
  ad: {
    id: string;
    title: string;
    description: string;
    image_url?: string | null;
    video_url?: string | null;
    target_url?: string | null;
    user_profiles?: {
      id: string;
      username: string;
      avatar_url?: string | null;
      verified?: boolean;
    } | null;
  };
}

/**
 * UserAdCard — renders a user-created sponsored ad inline in the feed.
 * Looks like a native post with a clear "Sponsored" badge.
 * Tracks impressions via ad_impressions table on mount.
 */
export function UserAdCard({ ad }: UserAdCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const impressionTracked = useRef(false);

  useEffect(() => {
    if (impressionTracked.current) return;
    impressionTracked.current = true;
    // Track impression asynchronously — non-blocking
    supabase.from('ad_impressions').insert({
      ad_id: ad.id,
      user_id: user?.id ?? null,
      clicked: false,
    }).catch(() => {});
  }, [ad.id, user?.id]);

  const handleClick = async () => {
    // Mark as clicked
    supabase.from('ad_impressions').insert({
      ad_id: ad.id,
      user_id: user?.id ?? null,
      clicked: true,
    }).catch(() => {});
    // Also update clicks counter
    supabase.rpc('track_ad_view', { ad_id_param: ad.id, user_id_param: user?.id ?? null }).catch(() => {});

    if (ad.target_url) {
      window.open(ad.target_url, '_blank', 'noopener,noreferrer');
    }
  };

  const advertiserName = ad.user_profiles?.username ?? 'Advertiser';
  const advertiserAvatar = ad.user_profiles?.avatar_url;
  const isVerified = ad.user_profiles?.verified;

  return (
    <div className="border-b border-border hover:bg-muted/5 transition-colors">
      {/* Header — looks like a post author row */}
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        <div
          className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 cursor-pointer border border-border bg-gradient-to-br from-primary/15 to-amber-500/10"
          onClick={() => ad.user_profiles && navigate(`/profile/${advertiserName}`)}
        >
          {advertiserAvatar ? (
            <img src={advertiserAvatar} alt={advertiserName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-primary/60" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="font-semibold text-sm cursor-pointer hover:underline"
              onClick={() => ad.user_profiles && navigate(`/profile/${advertiserName}`)}
            >
              {advertiserName}
            </span>
            {isVerified && <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />}
            {/* Sponsored pill — clear ad indicator */}
            <span className="flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Sponsored
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Promoted · Advertising</p>
        </div>
      </div>

      {/* Ad content */}
      <div
        className="px-4 pb-3 cursor-pointer"
        onClick={handleClick}
      >
        {/* Ad image/video */}
        {ad.video_url ? (
          <div className="mb-2.5 rounded-2xl overflow-hidden border border-border bg-black">
            <video
              src={ad.video_url}
              className="w-full max-h-64 object-cover"
              muted
              autoPlay
              loop
              playsInline
            />
          </div>
        ) : ad.image_url ? (
          <div className="mb-2.5 rounded-2xl overflow-hidden border border-border">
            <img
              src={ad.image_url}
              alt={ad.title}
              className="w-full max-h-64 object-cover"
              loading="lazy"
            />
          </div>
        ) : null}

        {/* Ad text */}
        <p className="font-bold text-base leading-snug mb-0.5">{ad.title}</p>
        <p className="text-sm text-muted-foreground line-clamp-2">{ad.description}</p>

        {/* CTA button */}
        {ad.target_url && (
          <div className="mt-3">
            <div className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:opacity-90 active:scale-95 transition-all shadow-sm">
              <ExternalLink className="w-3.5 h-3.5" />
              Learn More
            </div>
          </div>
        )}
      </div>

      {/* Why am I seeing this? */}
      <div className="px-4 pb-2 flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground/50">Why this ad?</span>
        <button
          className="text-[10px] text-primary/50 hover:text-primary transition-colors"
          onClick={() => navigate('/my-ads')}
        >
          Advertise
        </button>
      </div>
    </div>
  );
}
