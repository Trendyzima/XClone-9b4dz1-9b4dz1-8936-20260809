import { useState, useEffect, useRef, useCallback } from 'react';
import { VideoPlayer } from '@/components/features/VideoPlayer';
import { supabase } from '@/lib/supabase';
import { Post } from '@/types';
import { Loader2, Gift, X, Zap, Play, TrendingUp } from 'lucide-react';
import { initAdMob, showInterstitial, showRewarded, ADMOB_CONFIG } from '@/lib/admob';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const AD_EVERY_N_VIDEOS = 4;
const PRELOAD_AHEAD = 2;
const PAGE_SIZE = 20;

export default function VideosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const lastScrollTop = useRef(0);

  // Rewarded ad state
  const [showRewardPrompt, setShowRewardPrompt] = useState(false);
  const [rewardPending, setRewardPending] = useState(false);
  const [rewardMessage, setRewardMessage] = useState('');
  const lastRewardedAt = useRef(0);

  // Preload map: index → shouldPreload
  const [preloadMap, setPreloadMap] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetchVideos(0);
    initAdMob();
  }, []);

  const fetchVideos = async (pageNum: number) => {
    try {
      // Mix new + old: order by views & created_at for variety
      const { data, error } = await supabase
        .from('posts')
        .select('*, user_profiles (*)')
        .eq('is_video', true)
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      const newVideos = data || [];
      if (newVideos.length < PAGE_SIZE) setHasMore(false);

      if (pageNum === 0) {
        setVideos(newVideos);
        // Preload first 3
        const init: Record<number, boolean> = {};
        for (let i = 0; i < Math.min(3, newVideos.length); i++) init[i] = true;
        setPreloadMap(init);
      } else {
        setVideos(prev => {
          const combined = [...prev, ...newVideos];
          return combined;
        });
      }
      setPage(pageNum);
    } catch (err) {
      console.error('fetchVideos error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Throttled scroll handler using requestAnimationFrame
  const ticking = useRef(false);
  const handleScroll = useCallback(() => {
    if (ticking.current) return;
    ticking.current = true;

    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) { ticking.current = false; return; }

      const viewportH = window.innerHeight;
      const idx = Math.round(container.scrollTop / viewportH);

      if (idx !== activeIndexRef.current && idx < videos.length) {
        activeIndexRef.current = idx;
        setActiveIndex(idx);

        // Preload ahead
        setPreloadMap(prev => {
          const map = { ...prev };
          for (let i = idx; i <= idx + PRELOAD_AHEAD && i < videos.length; i++) {
            map[i] = true;
          }
          return map;
        });

        // Interstitial ad
        if (idx > 0 && idx % AD_EVERY_N_VIDEOS === 0) {
          showInterstitial(ADMOB_CONFIG.INTERSTITIAL);
        }

        // Rewarded ad prompt
        if (idx > 0 && idx % 8 === 0 && Date.now() - lastRewardedAt.current > 30_000) {
          setShowRewardPrompt(true);
        }

        // Load more pages
        if (idx >= videos.length - 3 && hasMore) {
          fetchVideos(page + 1);
        }
      }
      ticking.current = false;
    });
  }, [videos.length, hasMore, page]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleWatchRewardedAd = async () => {
    setRewardPending(true);
    try {
      const reward = await showRewarded(ADMOB_CONFIG.REWARDED);
      if (reward) {
        lastRewardedAt.current = Date.now();
        setRewardMessage('🎉 You unlocked 2× reach boost on your next post!');
        setTimeout(() => { setShowRewardPrompt(false); setRewardMessage(''); }, 3500);
      } else {
        setShowRewardPrompt(false);
      }
    } finally {
      setRewardPending(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-black text-white gap-4">
        <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center">
          <Play className="w-10 h-10" />
        </div>
        <p className="text-xl font-bold">No videos yet</p>
        <p className="text-white/60 text-center px-8">Be the first to share a video!</p>
        <button
          onClick={() => navigate('/')}
          className="mt-2 px-6 py-2 bg-white/10 rounded-full text-sm font-medium hover:bg-white/20 transition-colors"
        >
          Go to Home Feed
        </button>
      </div>
    );
  }

  return (
    <div className="relative bg-black" style={{ height: '100svh' }}>
      {/* TikTok-style vertical scroll feed */}
      <div
        ref={containerRef}
        className="video-feed-container w-full"
        style={{
          height: '100svh',
          overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {videos.map((video, index) => (
          <div
            key={video.id}
            className="video-feed-item"
            style={{
              height: '100svh',
              scrollSnapAlign: 'start',
              scrollSnapStop: 'always',
              position: 'relative',
            }}
          >
            <VideoPlayer
              post={video}
              isActive={index === activeIndex}
              onUpdate={() => fetchVideos(0)}
              shouldPreload={!!preloadMap[index]}
            />
          </div>
        ))}

        {/* Loading more indicator */}
        {hasMore && (
          <div className="flex items-center justify-center py-8 bg-black">
            <Loader2 className="w-6 h-6 animate-spin text-white/40" />
          </div>
        )}
      </div>

      {/* Video index indicator */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <div className="bg-black/40 backdrop-blur-sm rounded-full px-3 py-1">
          <p className="text-white/70 text-xs font-medium">
            {activeIndex + 1} / {videos.length}{hasMore ? '+' : ''}
          </p>
        </div>
      </div>

      {/* Rewarded Ad Prompt */}
      {showRewardPrompt && !rewardMessage && (
        <div className="absolute bottom-24 left-4 right-4 z-50 animate-slide-in">
          <div className="bg-black/85 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shrink-0">
              <Gift className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-sm">Watch an ad</p>
              <p className="text-white/70 text-xs">Unlock 2× reach boost on your next post</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRewardPrompt(false)}
                className="p-2 text-white/60 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={handleWatchRewardedAd}
                disabled={rewardPending}
                className="flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-orange-500 text-black font-bold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {rewardPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Watch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reward success toast */}
      {rewardMessage && (
        <div className="absolute bottom-28 left-4 right-4 z-50">
          <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-black font-bold text-sm px-5 py-3.5 rounded-2xl text-center shadow-lg">
            {rewardMessage}
          </div>
        </div>
      )}
    </div>
  );
}
