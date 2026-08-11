import { useState, useEffect, useRef, useCallback } from 'react';
import { VideoPlayer } from '@/components/features/VideoPlayer';
import { supabase } from '@/lib/supabase';
import { Post } from '@/types/app-types';
import { Loader2, Gift, X, Zap, Play } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const PRELOAD_AHEAD = 2;
const PAGE_SIZE = 20;

type FeedTab = 'foryou' | 'following';

export default function VideosPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkProcessed = useRef(false);
  const [videos, setVideos] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<FeedTab>('foryou');
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  // Top 5 videos for SEO ItemList JSON-LD
  const topVideos = videos.slice(0, 5);
  const videosJsonLd = topVideos.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Trending Videos on Testagram',
    description: 'Top short videos from creators around the world on Testagram.',
    url: 'https://testagram.site/videos',
    numberOfItems: topVideos.length,
    itemListElement: topVideos.map((v: any, i: number) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'VideoObject',
        name: v.content?.replace(/<[^>]*>/g, '').slice(0, 80) || 'Video on Testagram',
        description: v.content?.replace(/<[^>]*>/g, '').slice(0, 200) || 'Watch this video on Testagram',
        thumbnailUrl: v.image_url || 'https://testagram.site/app-icon.jpg',
        uploadDate: v.created_at,
        contentUrl: v.video_url,
        author: {
          '@type': 'Person',
          name: v.user_profiles?.username ?? 'Creator',
          url: `https://testagram.site/profile/${v.user_profiles?.username}`,
        },
        interactionStatistic: [
          { '@type': 'InteractionCounter', interactionType: 'https://schema.org/WatchAction', userInteractionCount: v.views_count ?? 0 },
          { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: v.likes_count ?? 0 },
        ],
      },
    })),
  } : undefined;

  useSEO({
    title: 'Trending Videos',
    description: 'Watch short videos from creators around the world on Testagram. Discover trending clips, go viral, and earn from your content.',
    url: '/videos',
    type: 'website',
    keywords: 'short videos, trending clips, viral videos, creators, testagram, tiktok-style, video feed',
    structuredData: videosJsonLd,
  });

  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);

  // Rewarded ad state
  const [showRewardPrompt, setShowRewardPrompt] = useState(false);
  const [rewardPending, setRewardPending] = useState(false);
  const [rewardMessage, setRewardMessage] = useState('');
  const lastRewardedAt = useRef(0);

  // Preload map: index → shouldPreload
  const [preloadMap, setPreloadMap] = useState<Record<number, boolean>>({});

  // Fetch following IDs when user logs in
  useEffect(() => {
    if (!user) { setFollowingIds([]); return; }
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .then(({ data }) => setFollowingIds((data ?? []).map((f: any) => f.following_id)));
  }, [user?.id]);

  // Re-fetch when tab changes
  useEffect(() => {
    setVideos([]);
    setPage(0);
    setHasMore(true);
    setActiveIndex(0);
    activeIndexRef.current = 0;
    deepLinkProcessed.current = false;
    setPreloadMap({});
    // Scroll to top
    if (containerRef.current) containerRef.current.scrollTo({ top: 0 });
    setLoading(true);
    fetchVideos(0);
  }, [activeTab]);

  // Deep link: scroll to specific video on load (?id=postId)
  useEffect(() => {
    if (deepLinkProcessed.current || videos.length === 0) return;
    const deepId = searchParams.get('id');
    if (!deepId) return;
    const targetIdx = videos.findIndex(v => v.id === deepId);
    if (targetIdx === -1) return;
    deepLinkProcessed.current = true;
    setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      container.scrollTo({ top: targetIdx * window.innerHeight });
      activeIndexRef.current = targetIdx;
      setActiveIndex(targetIdx);
      setPreloadMap(prev => {
        const map = { ...prev };
        for (let i = Math.max(0, targetIdx - 1); i <= targetIdx + PRELOAD_AHEAD && i < videos.length; i++) {
          map[i] = true;
        }
        return map;
      });
    }, 200);
  }, [videos]);

  // Sync shareable URL as user scrolls
  useEffect(() => {
    const vid = videos[activeIndex];
    if (vid?.id) {
      setSearchParams({ id: vid.id }, { replace: true });
    }
  }, [activeIndex]);

  const fetchVideos = async (pageNum: number) => {
    try {
      let query = supabase
        .from('posts')
        .select('*, user_profiles (*)')
        .eq('is_video', true)
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      // Following tab: filter to videos from followed users
      if (activeTab === 'following') {
        if (followingIds.length === 0) {
          setLoading(false);
          return;
        }
        query = supabase
          .from('posts')
          .select('*, user_profiles (*)')
          .eq('is_video', true)
          .in('user_id', followingIds)
          .order('created_at', { ascending: false })
          .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);
      }

      const { data, error } = await query;
      if (error) throw error;

      const newVideos = data || [];
      if (newVideos.length < PAGE_SIZE) setHasMore(false);

      if (pageNum === 0) {
        setVideos(newVideos);
        const init: Record<number, boolean> = {};
        for (let i = 0; i < Math.min(3, newVideos.length); i++) init[i] = true;
        setPreloadMap(init);
      } else {
        setVideos(prev => [...prev, ...newVideos]);
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

        // Rewarded ad prompt every 8 videos, throttled 30s
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
      lastRewardedAt.current = Date.now();
      setRewardMessage('🎉 You unlocked 2× reach boost on your next post!');
      setTimeout(() => { setShowRewardPrompt(false); setRewardMessage(''); }, 3500);
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
        {/* Tab switcher even on empty state */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-1.5 py-1 border border-white/10">
          {(['foryou', 'following'] as FeedTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                activeTab === tab ? 'bg-white text-black' : 'text-white/70 hover:text-white'
              }`}
            >
              {tab === 'foryou' ? 'For You' : 'Following'}
            </button>
          ))}
        </div>
        <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center">
          <Play className="w-10 h-10" />
        </div>
        <p className="text-xl font-bold">
          {activeTab === 'following' && user
            ? "No videos from people you follow yet"
            : "No videos yet"}
        </p>
        <p className="text-white/60 text-center px-8">
          {activeTab === 'following' && user
            ? "Follow some creators to see their videos here"
            : "Be the first to share a video!"}
        </p>
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
      {/* For You / Following tab bar — overlaid at top of screen */}
      <div className="absolute top-0 left-0 right-0 z-30 flex justify-center pt-3 pointer-events-none">
        <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full px-1.5 py-1 border border-white/10 pointer-events-auto">
          {(['foryou', 'following'] as FeedTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all active:scale-95 ${
                activeTab === tab
                  ? 'bg-white text-black shadow-sm'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              {tab === 'foryou' ? 'For You' : 'Following'}
            </button>
          ))}
        </div>
      </div>

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

      {/* Video index indicator — shifted below tab bar */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
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
