import { Heart, MessageCircle, Repeat2, Share, MoreHorizontal, BadgeCheck, Trash2, TrendingUp, Zap, Eye, BarChart3 } from 'lucide-react';
import { sendActivityNotification } from '@/components/layout/AuthProvider';
import { Post } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { cn, parseContent, formatNumber } from '@/lib/utils';
import { SharePostDialog } from './SharePostDialog';
import { BookmarkButton } from './BookmarkButton';
import { PollCard } from './PollCard';
import { EditPostDialog } from './EditPostDialog';
import { BoostPostDialog } from './BoostPostDialog';
import { OneClickBoost } from './OneClickBoost';
import { RewardedAdBoost } from './RewardedAdBoost';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PostCardProps {
  post: Post;
  onUpdate?: () => void;
}

export function PostCard({ post, onUpdate }: PostCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLiked, setIsLiked] = useState(false);
  const [isReposted, setIsReposted] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [repostsCount, setRepostsCount] = useState(post.reposts_count);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [poll, setPoll] = useState<any>(null);
  const [showBoostDialog, setShowBoostDialog] = useState(false);
  const [showOneClickBoost, setShowOneClickBoost] = useState(false);
  const [showRewardedBoost, setShowRewardedBoost] = useState(false);
  const [shareCount, setShareCount] = useState(0);

  // Get media URLs (support both legacy single image and new multi-image)
  const mediaUrls = post.media_urls && post.media_urls.length > 0 
    ? post.media_urls 
    : post.image_url 
      ? [post.image_url] 
      : [];

  // Determine boost label
  const boostLabel = post.is_boosted
    ? post.boost_type === 'paid'
      ? 'Sponsored Content'
      : 'Boosted Content'
    : null;

  // Fetch poll if it exists
  useEffect(() => {
    const fetchPoll = async () => {
      const { data } = await supabase
        .from('polls')
        .select(`
          *,
          options:poll_options(*)
        `)
        .eq('post_id', post.id)
        .maybeSingle();

      if (data) setPoll(data);
    };

    fetchPoll();
  }, [post.id]);

  // Check if user has already liked/reposted this post
  useEffect(() => {
    if (!user) return;

    const checkUserInteractions = async () => {
      try {
        // Check if liked
        const { data: likeData } = await supabase
          .from('likes')
          .select('id')
          .eq('user_id', user.id)
          .eq('post_id', post.id)
          .maybeSingle();

        setIsLiked(!!likeData);

        // Check if reposted
        const { data: repostData } = await supabase
          .from('reposts')
          .select('id')
          .eq('user_id', user.id)
          .eq('post_id', post.id)
          .maybeSingle();

        setIsReposted(!!repostData);
      } catch (error) {
        console.error('Error checking user interactions:', error);
      }
    };

    checkUserInteractions();
  }, [user, post.id]);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate('/auth');
      return;
    }

    const newIsLiked = !isLiked;
    const newCount = newIsLiked ? likesCount + 1 : Math.max(0, likesCount - 1);

    setIsLiked(newIsLiked);
    setLikesCount(newCount);

    try {
      if (newIsLiked) {
        const { error: insertError } = await supabase
          .from('likes')
          .insert({ user_id: user.id, post_id: post.id });
        
        if (insertError) throw insertError;

        const { error: updateError } = await supabase
          .from('posts')
          .update({ likes_count: newCount })
          .eq('id', post.id);
        
        if (updateError) throw updateError;
        
        if (post.user_id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: post.user_id,
            type: 'like',
            from_user_id: user.id,
            post_id: post.id,
          });
          // Send push notification
          sendActivityNotification({
            recipientUserId: post.user_id,
            title: 'New Like',
            body: `${user.username} liked your post`,
            data: { route: `/post/${post.id}`, type: 'like' }
          });
        }
      } else {
        const { error: deleteError } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', post.id);
        
        if (deleteError) throw deleteError;

        const { error: updateError } = await supabase
          .from('posts')
          .update({ likes_count: newCount })
          .eq('id', post.id);
        
        if (updateError) throw updateError;
      }
      onUpdate?.();
    } catch (error: any) {
      console.error('Like error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to like post',
        variant: 'destructive',
      });
      setIsLiked(!newIsLiked);
      setLikesCount(likesCount);
    }
  };

  const handleRepost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate('/auth');
      return;
    }

    const newIsReposted = !isReposted;
    const newCount = newIsReposted ? repostsCount + 1 : Math.max(0, repostsCount - 1);

    setIsReposted(newIsReposted);
    setRepostsCount(newCount);

    try {
      if (newIsReposted) {
        const { error: insertError } = await supabase
          .from('reposts')
          .insert({ user_id: user.id, post_id: post.id });
        
        if (insertError) throw insertError;

        const { error: updateError } = await supabase
          .from('posts')
          .update({ reposts_count: newCount })
          .eq('id', post.id);
        
        if (updateError) throw updateError;
        
        if (post.user_id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: post.user_id,
            type: 'repost',
            from_user_id: user.id,
            post_id: post.id,
          });
          sendActivityNotification({
            recipientUserId: post.user_id,
            title: 'New Repost',
            body: `${user.username} reposted your post`,
            data: { route: `/post/${post.id}`, type: 'repost' }
          });
        }
        
        toast({ title: 'Reposted successfully' });
      } else {
        const { error: deleteError } = await supabase
          .from('reposts')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', post.id);
        
        if (deleteError) throw deleteError;

        const { error: updateError } = await supabase
          .from('posts')
          .update({ reposts_count: newCount })
          .eq('id', post.id);
        
        if (updateError) throw updateError;
        
        toast({ title: 'Repost removed' });
      }
      onUpdate?.();
    } catch (error: any) {
      console.error('Repost error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to repost',
        variant: 'destructive',
      });
      setIsReposted(!newIsReposted);
      setRepostsCount(repostsCount);
    }
  };

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/post/${post.id}`;
    const shareText = `${post.content.slice(0, 150)}${post.content.length > 150 ? '\u2026' : ''}`;

    const trackShare = () => {
      setShareCount(c => c + 1);
      // Fire-and-forget analytics increment
      supabase.from('post_analytics')
        .select('id, shares')
        .eq('post_id', post.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.id) {
            supabase.from('post_analytics')
              .update({ shares: (data.shares || 0) + 1 })
              .eq('id', data.id)
              .catch(() => {});
          } else {
            supabase.from('post_analytics')
              .insert({ post_id: post.id, shares: 1 })
              .catch(() => {});
          }
        });
    };

    if (navigator.share) {
      try {
        await navigator.share({
          title: `@${post.user_profiles?.username} on Tsocial`,
          text: shareText,
          url,
        });
        trackShare();
      } catch (err: any) {
        // User cancelled (AbortError) — do nothing; other errors fall back to dialog
        if (err?.name !== 'AbortError') setShowShareDialog(true);
      }
    } else {
      // No Web Share API — try clipboard first, then open dialog
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copied!', description: 'Post link copied to clipboard' });
        trackShare();
      } catch {
        setShowShareDialog(true);
      }
    }
  };

  const handlePostClick = () => {
    navigate(`/post/${post.id}`);
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id)
        .eq('user_id', user?.id);

      if (error) throw error;

      toast({ title: 'Post deleted successfully' });
      onUpdate?.();
    } catch (error: any) {
      console.error('Error deleting post:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete post',
        variant: 'destructive',
      });
    }
  };

  return (
    <div 
      className="border-b border-border p-4 hover:bg-muted/5 transition-colors cursor-pointer"
      onClick={handlePostClick}
    >
      {/* Boost label */}
      {boostLabel && (
        <div className={`flex items-center gap-1.5 text-xs font-semibold mb-2 px-1 ${
          boostLabel === 'Sponsored Content'
            ? 'text-blue-500'
            : 'text-amber-500'
        }`}>
          {boostLabel === 'Sponsored Content'
            ? <><TrendingUp className="w-3 h-3" /> Sponsored Content</>
            : <><Zap className="w-3 h-3" /> Boosted Content</>}
        </div>
      )}
      <div className="flex space-x-3">
        <div 
          className="w-10 h-10 rounded-full bg-muted flex-shrink-0 overflow-hidden cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/profile/${post.user_profiles?.username}`);
          }}
        >
          {post.user_profiles?.avatar_url ? (
            <img
              src={post.user_profiles.avatar_url}
              alt={post.user_profiles.username}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm font-semibold">
              {post.user_profiles?.username[0]?.toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center space-x-1 min-w-0 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/profile/${post.user_profiles?.username}`);
              }}
            >
              <span className="font-bold text-foreground truncate">
                {post.user_profiles?.username}
              </span>
              {post.user_profiles?.verified && (
                <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" fill="currentColor" />
              )}
              <span className="text-muted-foreground text-sm truncate">
                @{post.user_profiles?.username}
              </span>
              <span className="text-muted-foreground text-sm flex-shrink-0">·</span>
              <span className="text-muted-foreground text-sm flex-shrink-0">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </span>
            </div>
            {user?.id === post.user_id && (
              <div className="relative flex-shrink-0">
                <button 
                  className="text-muted-foreground hover:text-primary p-2 -mr-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteMenu(!showDeleteMenu);
                  }}
                  title="Options"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                {showDeleteMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteMenu(false);
                      }}
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-background border border-border rounded-lg shadow-lg z-50">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowEditDialog(true);
                          setShowDeleteMenu(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-muted flex items-center gap-2 rounded-t-lg"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                        Edit post
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteMenu(false);
                          navigate(`/post-analytics/${post.id}`);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-muted flex items-center gap-2"
                      >
                        <BarChart3 className="w-4 h-4 text-blue-500" />
                        Post Analytics
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteMenu(false);
                          handleDelete();
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-destructive/10 text-destructive flex items-center gap-2 rounded-b-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete post
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div 
            className="post-content text-foreground mt-1 whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: parseContent(post.content) }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.tagName === 'A') {
                e.stopPropagation();
              }
            }}
          />

          {/* Video Player */}
          {post.is_video && post.video_url && (
            <div className="mt-3 rounded-2xl overflow-hidden bg-black max-h-[600px]">
              <video
                controls
                className="w-full h-full max-h-[600px] object-contain"
                playsInline
                preload="metadata"
              >
                <source src={post.video_url} type="video/mp4" />
                <source src={post.video_url} type="video/webm" />
                <source src={post.video_url} type="video/ogg" />
                Your browser does not support the video tag.
              </video>
            </div>
          )}

          {/* Multi-Image Grid */}
          {!post.is_video && mediaUrls.length > 0 && (
            <div className={`mt-3 gap-2 rounded-2xl overflow-hidden ${
              mediaUrls.length === 1 ? 'grid grid-cols-1' :
              mediaUrls.length === 2 ? 'grid grid-cols-2' :
              mediaUrls.length === 3 ? 'grid grid-cols-2' :
              'grid grid-cols-2'
            }`}>
              {mediaUrls.map((url: string, index: number) => (
                <div 
                  key={index}
                  className={`relative overflow-hidden ${
                    mediaUrls.length === 3 && index === 0 ? 'col-span-2' : ''
                  }`}
                >
                  <img 
                    src={url} 
                    alt={`Post media ${index + 1}`} 
                    className="w-full h-full object-cover max-h-96" 
                  />
                </div>
              ))}
            </div>
          )}

          {poll && <PollCard poll={poll} postId={post.id} />}

          {/* Views count — visible to all users */}
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <Eye className="w-3.5 h-3.5" />
            <span>{formatNumber(post.views_count || 0)} views</span>
          </div>

          <div className="flex justify-between mt-3 max-w-md">
            <button 
              className="flex items-center space-x-2 text-muted-foreground hover:text-primary transition-colors group"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/post/${post.id}`);
              }}
            >
              <div className="p-2 rounded-full group-hover:bg-primary/10 transition-colors">
                <MessageCircle className="w-5 h-5" />
              </div>
              <span className="text-sm">{formatNumber(post.replies_count)}</span>
            </button>

            <button
              onClick={handleRepost}
              className={cn(
                'flex items-center space-x-2 transition-colors group',
                isReposted ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'
              )}
            >
              <div className="p-2 rounded-full group-hover:bg-green-500/10 transition-colors">
                <Repeat2 className="w-5 h-5" />
              </div>
              <span className="text-sm">{formatNumber(repostsCount)}</span>
            </button>

            <button
              onClick={handleLike}
              className={cn(
                'flex items-center space-x-2 transition-colors group',
                isLiked ? 'text-pink-600' : 'text-muted-foreground hover:text-pink-600'
              )}
            >
              <div className="p-2 rounded-full group-hover:bg-pink-600/10 transition-colors">
                <Heart className={cn('w-5 h-5', isLiked && 'fill-current')} />
              </div>
              <span className="text-sm">{formatNumber(likesCount)}</span>
            </button>

            <button 
              className="flex items-center space-x-2 text-muted-foreground hover:text-primary transition-colors group"
              onClick={handleNativeShare}
            >
              <div className="p-2 rounded-full group-hover:bg-primary/10 transition-colors">
                <Share className="w-5 h-5" />
              </div>
              {shareCount > 0 && <span className="text-sm tabular-nums">{shareCount}</span>}
            </button>

            <div onClick={(e) => e.stopPropagation()}>
              <BookmarkButton postId={post.id} />
            </div>

            {user?.id === post.user_id && (
              <>
                <button
                  className="flex items-center space-x-2 text-muted-foreground hover:text-primary transition-colors group"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOneClickBoost(true);
                  }}
                  title="Boost Post"
                >
                  <div className="p-2 rounded-full group-hover:bg-primary/10 transition-colors">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </button>
                <button
                  className="flex items-center space-x-2 text-muted-foreground hover:text-amber-500 transition-colors group"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRewardedBoost(true);
                  }}
                  title="Free Boost (Watch Ad)"
                >
                  <div className="p-2 rounded-full group-hover:bg-amber-500/10 transition-colors">
                    <Zap className="w-5 h-5" />
                  </div>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <SharePostDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        post={post}
      />

      {user?.id === post.user_id && (
        <>
          <EditPostDialog
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            post={post}
            onSuccess={() => {
              onUpdate?.();
              toast({ title: 'Post updated' });
            }}
          />
          <BoostPostDialog
            open={showBoostDialog}
            onOpenChange={setShowBoostDialog}
            postId={post.id}
          />
          <Dialog open={showOneClickBoost} onOpenChange={setShowOneClickBoost}>
            <DialogContent className="max-w-lg max-h-[92vh] flex flex-col p-0 overflow-hidden">
              <DialogHeader className="px-6 pt-5 pb-2 shrink-0 border-b border-border">
                <DialogTitle>Boost Your Post</DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto flex-1 px-6 py-4">
                <OneClickBoost
                  postId={post.id}
                  postContent={post.content}
                  onClose={() => setShowOneClickBoost(false)}
                />
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showRewardedBoost} onOpenChange={setShowRewardedBoost}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Free Boost — Watch Ad</DialogTitle>
              </DialogHeader>
              <RewardedAdBoost
                postId={post.id}
                postContent={post.content}
                onClose={() => setShowRewardedBoost(false)}
                onBoostApplied={() => { setShowRewardedBoost(false); onUpdate?.(); }}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
