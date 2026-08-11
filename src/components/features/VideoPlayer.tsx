import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Heart, MessageCircle, Repeat2, Share, Volume2, VolumeX,
  Play, DollarSign, Crown, BadgeCheck, X, Send, Loader2,
} from 'lucide-react';
import { Post } from '@/types/app-types';
import { formatNumber } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { VideoMonetizationAd } from './VideoMonetizationAd';
import { usePremium } from '@/hooks/usePremium';

interface VideoPlayerProps {
  post: Post;
  isActive: boolean;
  onUpdate?: () => void;
  shouldPreload?: boolean;
}

interface Reply {
  id: string;
  content: string;
  created_at: string;
  user_profiles: { username: string; avatar_url: string | null } | null;
}

// @__PURE__ — primitive object, no constructor side-effects for esbuild
const _counter = { n: 0 };

// @__PURE__ annotation prevents esbuild tree-shaker non-determinism
const authorPremiumCache: Map<string, boolean> = /* @__PURE__ */ new Map();

export function VideoPlayer({ post, isActive, onUpdate, shouldPreload }: VideoPlayerProps) {
  const videoRef       = useRef<HTMLVideoElement>(null);
  const progressRef    = useRef<HTMLDivElement>(null);
  const lastTapRef     = useRef<{ time: number; x: number; y: number } | null>(null);
  const heartTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { user }                = useAuth();
  const { isActive: isPremium } = usePremium();
  const navigate                = useNavigate();
  const { toast }               = useToast();

  const [isPlaying, setIsPlaying]             = useState(false);
  const [isMuted, setIsMuted]                 = useState(true);
  const [isLiked, setIsLiked]                 = useState(false);
  const [isReposted, setIsReposted]           = useState(false);
  const [likesCount, setLikesCount]           = useState(post.likes_count);
  const [repostsCount, setRepostsCount]       = useState(post.reposts_count);
  const [repliesCount, setRepliesCount]       = useState(post.replies_count);

  // Ads
  const [showPrerollAd, setShowPrerollAd]     = useState(false);
  const [showMidrollAd, setShowMidrollAd]     = useState(false);
  const [adDoneForThisPost, setAdDoneForThisPost] = useState(false);
  const [midrollDone, setMidrollDone]         = useState(false);

  // Progress bar
  const [videoProgress, setVideoProgress]     = useState(0);
  const [isDragging, setIsDragging]           = useState(false);

  // Double-tap heart burst
  const [heartPos, setHeartPos]               = useState<{ x: number; y: number } | null>(null);

  // Author premium badge
  const [isAuthorPremium, setIsAuthorPremium] = useState(false);

  // Comment sheet
  const [showComments, setShowComments]       = useState(false);
  const [comments, setComments]               = useState<Reply[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment]           = useState('');
  const [posting, setPosting]                 = useState(false);

  /* ── Author premium cache ──────────────────────────────────────────────── */
  useEffect(() => {
    const uid = post.user_id;
    if (authorPremiumCache.has(uid)) {
      setIsAuthorPremium(authorPremiumCache.get(uid)!);
      return;
    }
    supabase
      .from('premium_subscriptions')
      .select('id')
      .eq('user_id', uid)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
      .then(({ data }) => {
        const has = !!data;
        authorPremiumCache.set(uid, has);
        setIsAuthorPremium(has);
      });
  }, [post.user_id]);

  /* ── Play / pause on active change ────────────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      trackView();
      _counter.n++;

      const shouldShowAd = !isPremium && !adDoneForThisPost &&
        (post.is_monetized || _counter.n % 3 === 0);
      if (shouldShowAd) {
        setShowPrerollAd(true);
        setAdDoneForThisPost(true);
      } else {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    } else {
      video.pause();
      setIsPlaying(false);
      setShowComments(false);
    }
  }, [isActive]);

  /* ── Ad complete ───────────────────────────────────────────────────────── */
  const handleAdComplete = () => {
    setShowPrerollAd(false);
    setShowMidrollAd(false);
    const video = videoRef.current;
    if (video) video.play().then(() => setIsPlaying(true)).catch(() => {});
  };

  /* ── Time update → progress + mid-roll trigger ────────────────────────── */
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || isDragging) return;
    const pct = video.currentTime / (video.duration || 1);
    setVideoProgress(pct * 100);
    if (midrollDone || !post.is_monetized || isPremium) return;
    if (pct >= 0.5) {
      setMidrollDone(true);
      video.pause();
      setShowMidrollAd(true);
    }
  };

  /* ── Track view ────────────────────────────────────────────────────────── */
  const trackView = async () => {
    try {
      await supabase.rpc('increment_post_view', { post_id_param: post.id });
    } catch (_) {}
  };

  /* ── Toggle play ───────────────────────────────────────────────────────── */
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setIsPlaying(true); }
    else              { video.pause(); setIsPlaying(false); }
  };

  /* ── Toggle mute ───────────────────────────────────────────────────────── */
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  /* ── Like (shared logic for tap button + double-tap) ──────────────────── */
  const triggerLike = useCallback(async () => {
    if (!user) { navigate('/auth'); return; }
    if (isLiked) return; // double-tap only adds, never removes
    const newCount = likesCount + 1;
    setIsLiked(true);
    setLikesCount(newCount);
    try {
      await supabase.from('likes').insert({ user_id: user.id, post_id: post.id });
      await supabase.from('posts').update({ likes_count: newCount }).eq('id', post.id);
      if (post.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: post.user_id, type: 'like', from_user_id: user.id, post_id: post.id,
        });
      }
      onUpdate?.();
    } catch (_) {
      setIsLiked(false);
      setLikesCount(likesCount);
    }
  }, [user, isLiked, likesCount, post.id, post.user_id]);

  const handleLikeToggle = async () => {
    if (!user) { navigate('/auth'); return; }
    const newIsLiked = !isLiked;
    const newCount   = newIsLiked ? likesCount + 1 : Math.max(0, likesCount - 1);
    setIsLiked(newIsLiked);
    setLikesCount(newCount);
    try {
      if (newIsLiked) {
        await supabase.from('likes').insert({ user_id: user.id, post_id: post.id });
        await supabase.from('posts').update({ likes_count: newCount }).eq('id', post.id);
        if (post.user_id !== user.id)
          await supabase.from('notifications').insert({ user_id: post.user_id, type: 'like', from_user_id: user.id, post_id: post.id });
      } else {
        await supabase.from('likes').delete().match({ user_id: user.id, post_id: post.id });
        await supabase.from('posts').update({ likes_count: newCount }).eq('id', post.id);
      }
      onUpdate?.();
    } catch (_) {
      setIsLiked(!newIsLiked);
      setLikesCount(likesCount);
    }
  };

  /* ── Double-tap detection ──────────────────────────────────────────────── */
  const handleVideoTap = (e: React.MouseEvent<HTMLVideoElement> | React.TouchEvent<HTMLVideoElement>) => {
    // Don't fire if tapping on controls area (right 80px)
    const target = e.currentTarget.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const relX = clientX - target.left;
    const relY = clientY - target.top;

    // Skip right-edge controls zone
    if (relX > target.width - 80) return;

    const now  = Date.now();
    const last = lastTapRef.current;

    if (last && now - last.time < 300) {
      // Double tap!
      lastTapRef.current = null;
      const pctX = (relX / target.width) * 100;
      const pctY = (relY / target.height) * 100;
      setHeartPos({ x: pctX, y: pctY });
      if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
      heartTimerRef.current = setTimeout(() => setHeartPos(null), 900);
      triggerLike();
    } else {
      lastTapRef.current = { time: now, x: relX, y: relY };
      // Single tap after 300 ms → toggle play
      setTimeout(() => {
        if (lastTapRef.current && Date.now() - lastTapRef.current.time >= 290) {
          lastTapRef.current = null;
          togglePlay();
        }
      }, 310);
    }
  };

  /* ── Seek bar scrub ────────────────────────────────────────────────────── */
  const seekTo = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const bar   = progressRef.current;
    const video = videoRef.current;
    if (!bar || !video || !video.duration) return;
    const rect = bar.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = pct * video.duration;
    setVideoProgress(pct * 100);
  }, []);

  const handleProgressMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    seekTo(e);
  };
  const handleProgressMouseMove = (e: React.MouseEvent) => { if (isDragging) seekTo(e); };
  const handleProgressMouseUp   = ()                      => setIsDragging(false);

  const handleProgressTouchStart = (e: React.TouchEvent) => { setIsDragging(true); seekTo(e); };
  const handleProgressTouchMove  = (e: React.TouchEvent) => { if (isDragging) seekTo(e); };
  const handleProgressTouchEnd   = ()                     => setIsDragging(false);

  /* ── Repost ────────────────────────────────────────────────────────────── */
  const handleRepost = async () => {
    if (!user) { navigate('/auth'); return; }
    const newIsReposted = !isReposted;
    const newCount      = newIsReposted ? repostsCount + 1 : Math.max(0, repostsCount - 1);
    setIsReposted(newIsReposted);
    setRepostsCount(newCount);
    try {
      if (newIsReposted) {
        await supabase.from('reposts').insert({ user_id: user.id, post_id: post.id });
        await supabase.from('posts').update({ reposts_count: newCount }).eq('id', post.id);
        if (post.user_id !== user.id)
          await supabase.from('notifications').insert({ user_id: post.user_id, type: 'repost', from_user_id: user.id, post_id: post.id });
        toast({ title: 'Reposted successfully' });
      } else {
        await supabase.from('reposts').delete().match({ user_id: user.id, post_id: post.id });
        await supabase.from('posts').update({ reposts_count: newCount }).eq('id', post.id);
        toast({ title: 'Repost removed' });
      }
      onUpdate?.();
    } catch (_) {
      setIsReposted(!newIsReposted);
      setRepostsCount(repostsCount);
    }
  };

  /* ── Comments ──────────────────────────────────────────────────────────── */
  const openComments = async () => {
    setShowComments(true);
    if (comments.length > 0) return;
    setCommentsLoading(true);
    const { data } = await supabase
      .from('replies')
      .select('id, content, created_at, user_profiles(username, avatar_url)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setComments((data as Reply[]) || []);
    setCommentsLoading(false);
  };

  const submitComment = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!newComment.trim()) return;
    setPosting(true);
    const text = newComment.trim();
    setNewComment('');
    const { data: inserted } = await supabase
      .from('replies')
      .insert({ post_id: post.id, user_id: user.id, content: text })
      .select('id, content, created_at, user_profiles(username, avatar_url)')
      .single();
    if (inserted) {
      setComments(prev => [inserted as Reply, ...prev]);
      setRepliesCount(c => c + 1);
    }
    setPosting(false);
  };

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="relative h-screen w-full max-w-full bg-black snap-start snap-always overflow-hidden">

      {/* Pre-roll ad */}
      {showPrerollAd && (
        <VideoMonetizationAd
          postId={post.id}
          creatorUserId={post.user_id}
          onAdComplete={handleAdComplete}
          skipAfterSeconds={5}
        />
      )}

      {/* Mid-roll ad */}
      {showMidrollAd && (
        <div className="absolute inset-0 z-50 flex flex-col">
          <div className="absolute top-2 right-2 z-10 bg-black/60 text-white/70 text-[10px] font-bold px-2 py-0.5 rounded-full">
            Mid-roll Ad
          </div>
          <VideoMonetizationAd
            postId={post.id}
            creatorUserId={post.user_id}
            onAdComplete={handleAdComplete}
            skipAfterSeconds={5}
          />
        </div>
      )}

      {/* ── Video element ─────────────────────────────────────────────────── */}
      <video
        ref={videoRef}
        src={post.video_url || ''}
        loop
        playsInline
        muted={isMuted}
        preload={shouldPreload ? 'auto' : 'metadata'}
        className="h-full w-full object-cover"
        style={{ maxWidth: '100vw' }}
        onTimeUpdate={handleTimeUpdate}
        onClick={handleVideoTap}
        onTouchEnd={handleVideoTap}
      />

      {/* ── Double-tap heart burst ─────────────────────────────────────────── */}
      {heartPos && (
        <div
          className="absolute pointer-events-none z-50"
          style={{ left: `${heartPos.x}%`, top: `${heartPos.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          <Heart
            className="w-20 h-20 text-pink-500 fill-pink-500 animate-ping"
            style={{ animationDuration: '0.6s', animationIterationCount: 1 }}
          />
          <Heart
            className="absolute inset-0 w-20 h-20 text-white fill-white opacity-60"
            style={{ animation: 'scale-up 0.9s ease-out forwards' }}
          />
        </div>
      )}

      {/* ── Mute button — top-right, always tappable ──────────────────────── */}
      <button
        onClick={toggleMute}
        className="absolute top-4 right-4 z-30 p-3 bg-black/60 backdrop-blur-sm rounded-full hover:bg-black/80 active:scale-95 transition-all shadow-lg"
        style={{ touchAction: 'manipulation' }}
      >
        {isMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
      </button>

      {/* ── Seek / progress bar ── above the bottom info strip ───────────── */}
      {!showPrerollAd && !showMidrollAd && (
        <div
          ref={progressRef}
          className="absolute left-0 right-0 z-30 cursor-pointer"
          style={{ bottom: showComments ? '70vh' : '88px', touchAction: 'none' }}
          onMouseDown={handleProgressMouseDown}
          onMouseMove={handleProgressMouseMove}
          onMouseUp={handleProgressMouseUp}
          onMouseLeave={handleProgressMouseUp}
          onTouchStart={handleProgressTouchStart}
          onTouchMove={handleProgressTouchMove}
          onTouchEnd={handleProgressTouchEnd}
        >
          {/* Hit-area padding */}
          <div className="py-3 px-0">
            <div className="relative h-1 bg-white/20 rounded-full mx-0">
              {/* Filled track */}
              <div
                className="absolute left-0 top-0 h-full bg-white rounded-full transition-none"
                style={{ width: `${videoProgress}%` }}
              />
              {/* Scrub handle */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md shadow-black/50 -ml-1.5 transition-opacity"
                style={{ left: `${videoProgress}%`, opacity: isDragging ? 1 : 0.85 }}
              />
              {/* Mid-roll marker at 50% for monetized */}
              {post.is_monetized && !isPremium && !midrollDone && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-400 border border-black/40"
                  style={{ left: '50%', marginLeft: '-4px' }}
                  title="Ad at 50%"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Overlay: author info + action buttons ─────────────────────────── */}
      <div
        className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none"
        style={{ maxWidth: '100vw' }}
      >
        {/* Top: author */}
        <div className="flex items-center justify-between text-white pointer-events-auto">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 rounded-full bg-muted overflow-hidden">
              {post.user_profiles?.avatar_url ? (
                <img
                  src={post.user_profiles.avatar_url}
                  alt={post.user_profiles.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold">
                  {post.user_profiles?.username?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold">{post.user_profiles?.username}</span>
                {post.user_profiles?.verified && (
                  <BadgeCheck className="w-3.5 h-3.5 text-primary" fill="currentColor" />
                )}
                {isAuthorPremium && (
                  <Crown className="w-3.5 h-3.5 text-amber-400" fill="currentColor" title="Premium" />
                )}
              </div>
              {post.is_monetized && (
                <div className="flex items-center gap-0.5 text-xs text-green-400">
                  <DollarSign className="w-3 h-3" />
                  <span>Monetized</span>
                </div>
              )}
            </div>
          </div>
          <div className="w-11" />
        </div>

        {/* Centre: play icon when paused */}
        {!isPlaying && !showPrerollAd && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center">
              <Play className="w-8 h-8 text-white ml-1" fill="currentColor" />
            </div>
          </div>
        )}

        {/* Bottom: caption + action buttons */}
        <div className="flex justify-between items-end text-white pointer-events-auto pb-14">
          <div className="flex-1 pr-4">
            <p className="font-semibold text-sm leading-snug line-clamp-3">{post.content}</p>
          </div>

          <div className="flex flex-col space-y-4">
            {/* Like */}
            <button
              onClick={handleLikeToggle}
              className="flex flex-col items-center space-y-1 text-white hover:scale-110 active:scale-95 transition-transform"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isLiked ? 'bg-pink-600' : 'bg-black/50'}`}>
                <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
              </div>
              <span className="text-sm font-semibold">{formatNumber(likesCount)}</span>
            </button>

            {/* Comments */}
            <button
              onClick={openComments}
              className="flex flex-col items-center space-y-1 text-white hover:scale-110 active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                <MessageCircle className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold">{formatNumber(repliesCount)}</span>
            </button>

            {/* Repost */}
            <button
              onClick={handleRepost}
              className="flex flex-col items-center space-y-1 text-white hover:scale-110 active:scale-95 transition-transform"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isReposted ? 'bg-green-600' : 'bg-black/50'}`}>
                <Repeat2 className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold">{formatNumber(repostsCount)}</span>
            </button>

            {/* Share */}
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ url: `${window.location.origin}/post/${post.id}` }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
                  toast({ title: 'Link copied!' });
                }
              }}
              className="flex flex-col items-center space-y-1 text-white hover:scale-110 active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                <Share className="w-6 h-6" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ── Comment sheet ─────────────────────────────────────────────────── */}
      {showComments && (
        <div
          className="absolute inset-x-0 bottom-0 z-40 flex flex-col"
          style={{ height: '70vh' }}
        >
          {/* Backdrop tap-to-close */}
          <div
            className="absolute inset-x-0 top-0 bottom-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowComments(false)}
            style={{ height: '100%', zIndex: -1 }}
          />

          <div className="relative flex flex-col h-full bg-[#111] rounded-t-2xl overflow-hidden border-t border-white/10">
            {/* Sheet header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/10 shrink-0">
              <span className="text-white font-bold text-sm">{repliesCount} Comment{repliesCount !== 1 ? 's' : ''}</span>
              <button
                onClick={() => setShowComments(false)}
                className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Comment list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {commentsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-white/40">
                  <MessageCircle className="w-8 h-8" />
                  <p className="text-sm">No comments yet. Be the first!</p>
                </div>
              ) : (
                comments.map(c => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {c.user_profiles?.avatar_url ? (
                        <img src={c.user_profiles.avatar_url} alt={c.user_profiles.username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-white/60">
                          {c.user_profiles?.username?.[0]?.toUpperCase() ?? '?'}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-white/80 font-semibold text-xs mr-2">
                        {c.user_profiles?.username ?? 'User'}
                      </span>
                      <span className="text-white text-sm break-words">{c.content}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Reply input */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-white/10 bg-[#0a0a0a]">
              <input
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                placeholder="Add a comment…"
                className="flex-1 bg-white/10 text-white placeholder-white/30 rounded-full px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-white/30"
              />
              <button
                onClick={submitComment}
                disabled={!newComment.trim() || posting}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-black disabled:opacity-40 active:scale-95 transition-all"
              >
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyframe for heart scale-up animation */}
      <style>{`
        @keyframes scale-up {
          0%   { transform: scale(0.5); opacity: 0.8; }
          60%  { transform: scale(1.4); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
