import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { X, Heart, UserPlus, DollarSign, MessageCircle, Bell, Repeat2 } from 'lucide-react';
import { useNotificationSound } from '@/hooks/useNotificationSound';

interface BannerItem {
  id: string;
  type: string;
  from_user_id: string | null;
  fromUsername?: string;
  fromAvatar?: string | null;
  postId?: string | null;
  timestamp: number;
}

const TYPE_CFG: Record<string, { icon: React.ElementType; color: string; bg: string; label: (u: string) => string }> = {
  like:         { icon: Heart,        color: 'text-pink-600',   bg: 'bg-pink-500/10 border-pink-500/20',   label: u => `@${u} liked your post`          },
  follow:       { icon: UserPlus,     color: 'text-primary',    bg: 'bg-primary/10 border-primary/20',     label: u => `@${u} started following you`      },
  repost:       { icon: Repeat2,      color: 'text-green-600',  bg: 'bg-green-500/10 border-green-500/20', label: u => `@${u} reposted your post`         },
  mention:      { icon: Bell,         color: 'text-blue-600',   bg: 'bg-blue-500/10 border-blue-500/20',   label: u => `@${u} mentioned you`              },
  reply:        { icon: MessageCircle,color: 'text-purple-600', bg: 'bg-purple-500/10 border-purple-500/20',label: u => `@${u} replied to your post`       },
  tip:          { icon: DollarSign,   color: 'text-amber-600',  bg: 'bg-amber-500/10 border-amber-500/20', label: u => `@${u} sent you a tip! 💰`          },
  payment_sent: { icon: DollarSign,   color: 'text-amber-600',  bg: 'bg-amber-500/10 border-amber-500/20', label: u => `@${u} sent you money 💰`           },
};

export function LiveNotificationBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { play: playSound } = useNotificationSound();
  const [banner, setBanner] = useState<BannerItem | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedUsers = useRef<Record<string, { username: string; avatar_url: string | null }>>({});

  const clearTimers = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (slideTimerRef.current) clearTimeout(slideTimerRef.current);
  };

  const dismissBanner = useCallback(() => {
    setVisible(false);
    slideTimerRef.current = setTimeout(() => setBanner(null), 350);
  }, []);

  const showBannerItem = useCallback(async (notif: any) => {
    const fromId = notif.from_user_id;
    if (!fromId) return;
    const cfg = TYPE_CFG[notif.type];
    if (!cfg) return;

    // Resolve user info (cached)
    if (!resolvedUsers.current[fromId]) {
      const { data } = await supabase
        .from('user_profiles')
        .select('username, avatar_url')
        .eq('id', fromId)
        .maybeSingle();
      if (data) resolvedUsers.current[fromId] = data;
    }
    const resolved = resolvedUsers.current[fromId];
    if (!resolved) return;

    clearTimers();

    // Play distinct sound per notification type
    const SOUND_MAP: Record<string, 'like'|'follow'|'tip'|'comment'|'repost'|'dm'> = {
      like: 'like', follow: 'follow', tip: 'tip', payment_sent: 'tip',
      reply: 'comment', mention: 'comment', repost: 'repost',
    };
    const soundType = SOUND_MAP[notif.type] ?? 'dm';
    playSound(soundType);

    setBanner({
      id: notif.id,
      type: notif.type,
      from_user_id: fromId,
      fromUsername: resolved.username,
      fromAvatar: resolved.avatar_url,
      postId: notif.post_id,
      timestamp: Date.now(),
    });
    // Small delay so React can mount the element before sliding in
    slideTimerRef.current = setTimeout(() => setVisible(true), 30);
    // Auto-dismiss after 5s
    timerRef.current = setTimeout(dismissBanner, 5000);
  }, [dismissBanner]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`live-notif-banner-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload: any) => {
        showBannerItem(payload.new);
      })
      .subscribe();

    return () => {
      clearTimers();
      supabase.removeChannel(channel);
    };
  }, [user?.id, showBannerItem]);

  if (!banner) return null;

  const cfg = TYPE_CFG[banner.type];
  const Icon = cfg?.icon ?? Bell;
  const label = cfg ? cfg.label(banner.fromUsername ?? 'Someone') : 'New notification';
  const bg = cfg?.bg ?? 'bg-background border-border';
  const color = cfg?.color ?? 'text-foreground';

  const handleClick = () => {
    dismissBanner();
    if (banner.postId) navigate(`/post/${banner.postId}`);
    else if (banner.fromUsername) navigate(`/profile/${banner.fromUsername}`);
    else navigate('/notifications');
  };

  return (
    <div
      className={`fixed top-16 left-1/2 z-[500] transition-all duration-350 ease-out pointer-events-auto
        ${visible ? '-translate-x-1/2 translate-y-0 opacity-100' : '-translate-x-1/2 -translate-y-4 opacity-0'}`}
      style={{ maxWidth: 'min(400px, calc(100vw - 32px))' }}
    >
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl backdrop-blur-sm cursor-pointer select-none ${bg}`}
        onClick={handleClick}
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0 border-2 border-background shadow">
          {banner.fromAvatar
            ? <img src={banner.fromAvatar} alt={banner.fromUsername} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center font-bold text-sm bg-muted">
                {banner.fromUsername?.[0]?.toUpperCase()}
              </div>
          }
        </div>

        {/* Icon + Label */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${color}`} />
          <p className="text-sm font-semibold truncate text-foreground">{label}</p>
        </div>

        {/* Dismiss */}
        <button
          onClick={e => { e.stopPropagation(); dismissBanner(); }}
          className="p-1 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full overflow-hidden">
        {visible && (
          <div
            className={`h-full ${color.replace('text-', 'bg-')} rounded-full`}
            style={{
              animation: 'live-banner-progress 5s linear forwards',
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes live-banner-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}
