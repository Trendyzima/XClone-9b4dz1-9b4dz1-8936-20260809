import { useState, useRef, useEffect } from 'react';
import { Heart, MessageCircle, Repeat2, Share, Volume2, VolumeX, Play, DollarSign } from 'lucide-react';
import { Post } from '@/types';
import { formatNumber } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { VideoMonetizationAd } from './VideoMonetizationAd';

interface VideoPlayerProps {
  post: Post;
  isActive: boolean;
  onUpdate?: () => void;
}

// Show pre-roll ad on every 3rd video OR for monetized content
let videoViewCounter = 0;

export function VideoPlayer({ post, isActive, onUpdate }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [isReposted, setIsReposted] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [repostsCount, setRepostsCount] = useState(post.reposts_count);
  const [showComments, setShowComments] = useState(false);
  const [showPrerollAd, setShowPrerollAd] = useState(false);
  const [adDoneForThisPost, setAdDoneForThisPost] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      trackView();
      videoViewCounter++;

      // Show pre-roll: every 3rd video OR if post is monetized
      const shouldShowAd = !adDoneForThisPost && (post.is_monetized || videoViewCounter % 3 === 0);
      if (shouldShowAd) {
        setShowPrerollAd(true);
        setAdDoneForThisPost(true);
      } else {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [isActive]);

  const handleAdComplete = () => {
    setShowPrerollAd(false);
    const video = videoRef.current;
    if (video) video.play().then(() => setIsPlaying(true)).catch(() => {});
  };

  const trackView = async () => {
    try {
      await supabase.rpc('increment_post_view', { post_id_param: post.id });
    } catch (error) {
      console.error('Error tracking view:', error);
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setIsPlaying(true); }
    else { video.pause(); setIsPlaying(false); }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleLike = async () => {
    if (!user) { navigate('/auth'); return; }
    const newIsLiked = !isLiked;
    const newCount = newIsLiked ? likesCount + 1 : Math.max(0, likesCount - 1);
    setIsLiked(newIsLiked);
    setLikesCount(newCount);
    try {
      if (newIsLiked) {
        await supabase.from('likes').insert({ user_id: user.id, post_id: post.id });
        await supabase.from('posts').update({ likes_count: newCount }).eq('id', post.id);
        if (post.user_id !== user.id) {
          await supabase.from('notifications').insert({ user_id: post.user_id, type: 'like', from_user_id: user.id, post_id: post.id });
        }
      } else {
        await supabase.from('likes').delete().match({ user_id: user.id, post_id: post.id });
        await supabase.from('posts').update({ likes_count: newCount }).eq('id', post.id);
      }
      onUpdate?.();
    } catch (error) {
      console.error('Like error:', error);
      setIsLiked(!newIsLiked);
      setLikesCount(likesCount);
    }
  };

  const handleRepost = async () => {
    if (!user) { navigate('/auth'); return; }
    const newIsReposted = !isReposted;
    const newCount = newIsReposted ? repostsCount + 1 : Math.max(0, repostsCount - 1);
    setIsReposted(newIsReposted);
    setRepostsCount(newCount);
    try {
      if (newIsReposted) {
        await supabase.from('reposts').insert({ user_id: user.id, post_id: post.id });
        await supabase.from('posts').update({ reposts_count: newCount }).eq('id', post.id);
        if (post.user_id !== user.id) {
          await supabase.from('notifications').insert({ user_id: post.user_id, type: 'repost', from_user_id: user.id, post_id: post.id });
        }
        toast({ title: 'Reposted successfully' });
      } else {
        await supabase.from('reposts').delete().match({ user_id: user.id, post_id: post.id });
        await supabase.from('posts').update({ reposts_count: newCount }).eq('id', post.id);
        toast({ title: 'Repost removed' });
      }
      onUpdate?.();
    } catch (error) {
      console.error('Repost error:', error);
      setIsReposted(!newIsReposted);
      setRepostsCount(repostsCount);
    }
  };

  return (
    <div className="relative h-screen w-full max-w-full bg-black snap-start snap-always overflow-hidden">
      {/* Pre-roll monetization ad overlay */}
      {showPrerollAd && (
        <VideoMonetizationAd
          postId={post.id}
          creatorUserId={post.user_id}
          onAdComplete={handleAdComplete}
          skipAfterSeconds={5}
        />
      )}

      <video
        ref={videoRef}
        src={post.video_url || ''}
        loop
        playsInline
        muted={isMuted}
        className="h-full w-full object-cover"
        onClick={togglePlay}
        style={{ maxWidth: '100vw' }}
      />

      <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none" style={{ maxWidth: '100vw' }}>
        <div className="flex items-center justify-between text-white pointer-events-auto">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 rounded-full bg-muted overflow-hidden">
              {post.user_profiles?.avatar_url ? (
                <img src={post.user_profiles.avatar_url} alt={post.user_profiles.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold">
                  {post.user_profiles?.username[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <span className="font-bold">{post.user_profiles?.username}</span>
              {post.is_monetized && (
                <div className="flex items-center gap-0.5 text-xs text-green-400">
                  <DollarSign className="w-3 h-3" />
                  <span>Monetized</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={toggleMute}
            className="p-2 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {!isPlaying && !showPrerollAd && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={togglePlay}
              className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center hover:bg-black/70 transition-colors pointer-events-auto"
            >
              <Play className="w-8 h-8 text-white ml-1" fill="currentColor" />
            </button>
          </div>
        )}

        <div className="flex justify-between items-end text-white pointer-events-auto">
          <div className="flex-1 pr-4">
            <p className="font-semibold mb-2">{post.content}</p>
          </div>

          <div className="flex flex-col space-y-4">
            <button onClick={handleLike} className="flex flex-col items-center space-y-1 text-white hover:scale-110 transition-transform">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isLiked ? 'bg-pink-600' : 'bg-black/50'}`}>
                <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
              </div>
              <span className="text-sm font-semibold">{formatNumber(likesCount)}</span>
            </button>

            <button onClick={() => setShowComments(!showComments)} className="flex flex-col items-center space-y-1 text-white hover:scale-110 transition-transform">
              <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                <MessageCircle className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold">{formatNumber(post.replies_count)}</span>
            </button>

            <button onClick={handleRepost} className="flex flex-col items-center space-y-1 text-white hover:scale-110 transition-transform">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isReposted ? 'bg-green-600' : 'bg-black/50'}`}>
                <Repeat2 className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold">{formatNumber(repostsCount)}</span>
            </button>

            <button className="flex flex-col items-center space-y-1 text-white hover:scale-110 transition-transform">
              <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                <Share className="w-6 h-6" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
