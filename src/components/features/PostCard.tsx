
import { Heart, MessageCircle, Repeat2, Share, MoreHorizontal, BadgeCheck, Trash2, TrendingUp, Zap, Eye, BarChart3, Users, History, X, Languages, Loader2 as TransLoader, Smile, DollarSign, Play, Coins, Flag, Check as CheckIcon } from 'lucide-react';
import { sendActivityNotification } from '@/components/layout/AuthProvider';
import { Post } from '@/types/app-types';
import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect, useRef, useCallback } from 'react';
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
import { VideoMonetizationAd } from './VideoMonetizationAd';

const REPORT_CATEGORIES = [
  { id: 'spam',           emoji: '📢', label: 'Spam',               desc: 'Unsolicited or repetitive content' },
  { id: 'hate_speech',    emoji: '⚠️', label: 'Hate Speech',         desc: 'Promotes hatred against a group' },
  { id: 'misinformation', emoji: '🔍', label: 'Misinformation',      desc: 'False or misleading information' },
  { id: 'explicit',       emoji: '🔞', label: 'Explicit Content',    desc: 'Adult content not marked properly' },
  { id: 'violence',       emoji: '🚫', label: 'Violence',            desc: 'Graphic violence or threats' },
  { id: 'harassment',     emoji: '😡', label: 'Harassment',          desc: 'Targeting or bullying someone' },
] as const;

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
  // Engagement tooltip
  const [showEngagement, setShowEngagement] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // Edit history
  const [showEditHistory, setShowEditHistory] = useState(false);
  const editHistory: any[] = (post as any).edit_history ?? [];

  // Post Reactions
  const REACTIONS = ['❤️', '😂', '😮', '😢', '🔥'] as const;
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const fetchReactions = useCallback(async () => {
    const { data } = await supabase
      .from('post_reactions')
      .select('emoji, user_id')
      .eq('post_id', post.id);
    if (data) {
      const counts: Record<string, number> = {};
      let myReaction: string | null = null;
      data.forEach(r => {
        counts[r.emoji] = (counts[r.emoji] || 0) + 1;
        if (r.user_id === user?.id) myReaction = r.emoji;
      });
      setReactionCounts(counts);
      setUserReaction(myReaction);
    }
  }, [post.id, user?.id]);

  useEffect(() => { fetchReactions(); }, [post.id]);

  const handleReact = async (emoji: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { navigate('/auth'); return; }
    setShowReactionPicker(false);
    const prevReaction = userReaction;

    if (prevReaction === emoji) {
      // Remove reaction
      setUserReaction(null);
      setReactionCounts(prev => {
        const updated = { ...prev };
        updated[emoji] = Math.max(0, (updated[emoji] || 1) - 1);
        if (!updated[emoji]) delete updated[emoji];
        return updated;
      });
      await supabase.from('post_reactions').delete().eq('post_id', post.id).eq('user_id', user.id);
      if (emoji === '❤️' && isLiked) {
        const newCount = Math.max(0, likesCount - 1);
        setIsLiked(false);
        setLikesCount(newCount);
        await supabase.from('likes').delete().eq('user_id', user.id).eq('post_id', post.id);
        await supabase.from('posts').update({ likes_count: newCount }).eq('id', post.id);
      }
    } else {
      // Add / switch reaction
      setUserReaction(emoji);
      setReactionCounts(prev => {
        const updated = { ...prev };
        if (prevReaction) {
          updated[prevReaction] = Math.max(0, (updated[prevReaction] || 1) - 1);
          if (!updated[prevReaction]) delete updated[prevReaction];
        }
        updated[emoji] = (updated[emoji] || 0) + 1;
        return updated;
      });
      await supabase.from('post_reactions').upsert(
        { post_id: post.id, user_id: user.id, emoji },
        { onConflict: 'post_id,user_id' }
      );
      // Sync ❤️ with likes table
      if (emoji === '❤️' && !isLiked) {
        const newCount = likesCount + 1;
        setIsLiked(true);
        setLikesCount(newCount);
        await supabase.from('likes').insert({ user_id: user.id, post_id: post.id }).catch(() => {});
        await supabase.from('posts').update({ likes_count: newCount }).eq('id', post.id);
        if (post.user_id !== user.id) {
          await supabase.from('notifications').insert({ user_id: post.user_id, type: 'like', from_user_id: user.id, post_id: post.id });
          sendActivityNotification({ recipientUserId: post.user_id, title: 'New Reaction', body: `${user.username} reacted ❤️ to your post`, data: { route: `/post/${post.id}`, type: 'like' } });
        }
      } else if (prevReaction === '❤️' && emoji !== '❤️' && isLiked) {
        const newCount = Math.max(0, likesCount - 1);
        setIsLiked(false);
        setLikesCount(newCount);
        await supabase.from('likes').delete().eq('user_id', user.id).eq('post_id', post.id);
        await supabase.from('posts').update({ likes_count: newCount }).eq('id', post.id);
      }
    }
    onUpdate?.();
  };

  // Post Translation
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);

  const handleTranslate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showTranslation) { setShowTranslation(false); return; }
    if (translatedContent) { setShowTranslation(true); return; }
    setTranslating(true);
    try {
      // Check cache first
      const { data: cached } = await supabase
        .from('post_translations')
        .select('translated_content')
        .eq('post_id', post.id)
        .eq('language_code', 'en')
        .maybeSingle();
      if (cached?.translated_content) {
        setTranslatedContent(cached.translated_content);
        setShowTranslation(true);
        setTranslating(false);
        return;
      }
      // Call AI
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: [{
            role: 'user',
            content: `Translate the following social media post to English. Return ONLY the translated text, no explanations or quotes:\n\n${post.content}`,
          }],
          model: 'gemini-2.0-flash',
        },
      });
      if (error) throw error;
      const translated = data?.choices?.[0]?.message?.content ??
        data?.content ?? data?.text ?? data?.response ?? '';
      if (translated.trim()) {
        setTranslatedContent(translated.trim());
        setShowTranslation(true);
        // Cache it
        await supabase.from('post_translations').upsert(
          { post_id: post.id, language_code: 'en', translated_content: translated.trim() },
          { onConflict: 'post_id,language_code' }
        ).catch(() => {});
      }
    } catch (err) {
      console.warn('[translate]', err);
      toast({ title: 'Translation failed', description: 'Could not translate this post', variant: 'destructive' });
    } finally {
      setTranslating(false);
    }
  };

  const fetchAnalytics = useCallback(async () => {
    if (analytics) return; // already loaded
    setLoadingAnalytics(true);
    const { data } = await supabase
      .from('post_analytics')
      .select('views, unique_viewers, engagement_rate, shares')
      .eq('post_id', post.id)
      .maybeSingle();
    setAnalytics(data ?? { views: post.views_count ?? 0, unique_viewers: 0, engagement_rate: 0, shares: 0 });
    setLoadingAnalytics(false);
  }, [post.id, analytics, post.views_count]);

  const openTooltip = useCallback(() => {
    setShowEngagement(true);
    fetchAnalytics();
  }, [fetchAnalytics]);

  const closeTooltip = useCallback(() => {
    setShowEngagement(false);
  }, []);

  // Long-press for mobile
  const handleViewsMouseDown = () => {
    tooltipTimer.current = setTimeout(openTooltip, 500);
  };
  const handleViewsMouseUp = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
  };

  // Tip dialog state
  const [showTipDialog, setShowTipDialog] = useState(false);
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [tipMessage, setTipMessage] = useState('');
  const [tippingLoading, setTippingLoading] = useState(false);

  const handleSendTip = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!tipAmount || tipAmount <= 0) return;
    setTippingLoading(true);
    try { // Added try-catch block here
      // Use the new platform-cut RPC — 85% to creator, 15% to platform
        const { error: tipErr } = await supabase.rpc('send_tip_with_platform_cut', {
          p_from_user_id: user.id,
          p_to_user_id: post.user_id,
          p_amount: tipAmount,
          p_message: tipMessage.trim() || null,
          p_post_id: post.id,
        });
        if (tipErr) {
          // Fallback to old direct method if RPC not available
          const { data: wallet } = await supabase.from('user_wallets').select('id,balance').eq('user_id', user.id).maybeSingle();
          if (!wallet || Number(wallet.balance) < tipAmount) {
            toast({ title: 'Insufficient balance', description: 'Top up your wallet to send tips', variant: 'destructive' }); return;
          }
          await supabase.from('user_wallets').update({ balance: Number(wallet.balance) - tipAmount }).eq('user_id', user.id);
          await supabase.from('tips').insert({ from_user_id: user.id, to_user_id: post.user_id, amount: tipAmount, message: tipMessage.trim() || null, post_id: post.id });
          await supabase.from('notifications').insert({ user_id: post.user_id, type: 'payment_sent', from_user_id: user.id, post_id: post.id });
          await supabase.from('creator_earnings').insert({ user_id: post.user_id, source: 'tips', amount: tipAmount, post_id: post.id, status: 'paid' }).catch(() => {});
        } else {
          await supabase.from('notifications').insert({ user_id: post.user_id, type: 'payment_sent', from_user_id: user.id, post_id: post.id });
        }
        toast({ title: `Tip of $${tipAmount} sent!`, description: `You tipped @${post.user_profiles?.username}` });
        setShowTipDialog(false);
        setTipAmount(null);
        setTipMessage('');
    } catch (err: any) {
      toast({ title: 'Tip failed', description: err.message, variant: 'destructive' });
    } finally {
      setTippingLoading(false);
    }
  };

  // Report state
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const handleSubmitReport = async () => {
    if (!user || !reportCategory) return;
    setReportSubmitting(true);
    await supabase.from('post_reports').upsert(
      { post_id: post.id, reporter_id: user.id, category: reportCategory },
      { onConflict: 'post_id,reporter_id' }
    ).catch(() => {});
    toast({ title: 'Report submitted', description: 'Thanks for helping keep the community safe.' });
    setShowReportDialog(false);
    setReportCategory('');
    setReportSubmitting(false);
  };

  // Video monetization pre-roll
  const videoRef2 = useRef<HTMLVideoElement | null>(null);
  const adShownRef = useRef(false);
  const [showVideoAd, setShowVideoAd] = useState(false);

  const handleVideoPlay = () => {
    if ((post as any).is_monetized && !adShownRef.current) {
      adShownRef.current = true;
      videoRef2.current?.pause();
      setShowVideoAd(true);
    }
  };

  const handleAdComplete = () => {
    setShowVideoAd(false);
    videoRef2.current?.play().catch(() => {});
  };

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
                      {editHistory.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowEditHistory(true);
                            setShowDeleteMenu(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-muted flex items-center gap-2"
                        >
                          <History className="w-4 h-4 text-blue-500" />
                          Edit History
                        </button>
                      )}
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
            dangerouslySetInnerHTML={{ __html: parseContent(showTranslation && translatedContent ? translatedContent : post.content) }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.tagName === 'A') {
                e.stopPropagation();
              }
            }}
          />

          {/* Translate button */}
          {post.content && post.content.length > 20 && (
            <button
              onClick={handleTranslate}
              className={`mt-1 flex items-center gap-1 text-xs font-medium transition-colors ${
                showTranslation ? 'text-primary' : 'text-muted-foreground hover:text-primary'
              }`}
            >
              {translating
                ? <TransLoader className="w-3 h-3 animate-spin" />
                : <Languages className="w-3 h-3" />
              }
              {translating ? 'Translating…' : showTranslation ? 'Show original' : 'Translate'}
            </button>
          )}

          {/* Video Player with monetization pre-roll */}
          {post.is_video && post.video_url && (
            <div className="mt-3 relative rounded-2xl overflow-hidden bg-black max-h-[600px]" onClick={e => e.stopPropagation()}>
              {showVideoAd && (
                <VideoMonetizationAd
                  postId={post.id}
                  creatorUserId={post.user_id}
                  onAdComplete={handleAdComplete}
                  skipAfterSeconds={5}
                />
              )}
              {(post as any).is_monetized && (
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-full text-xs text-green-400 font-semibold pointer-events-none">
                  <DollarSign className="w-3 h-3" />Monetized
                </div>
              )}
              <video
                ref={videoRef2}
                controls
                className="w-full h-full max-h-[600px] object-contain"
                playsInline
                preload="metadata"
                onPlay={handleVideoPlay}
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

          {/* Reaction bubbles */}
          {Object.keys(reactionCounts).length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
              {REACTIONS.filter(e => (reactionCounts[e] ?? 0) > 0).map(emoji => (
                <button
                  key={emoji}
                  onClick={(e) => handleReact(emoji, e)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border transition-all duration-100 hover:scale-105 active:scale-95',
                    userReaction === emoji
                      ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                      : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/20 hover:bg-primary/5'
                  )}
                >
                  <span>{emoji}</span>
                  <span className="font-medium">{formatNumber(reactionCounts[emoji])}</span>
                </button>
              ))}
            </div>
          )}

          {/* Views count with Engagement Tooltip */}
          <div className="relative inline-block mt-2">
            <button
              onMouseEnter={openTooltip}
              onMouseLeave={closeTooltip}
              onMouseDown={handleViewsMouseDown}
              onMouseUp={handleViewsMouseUp}
              onTouchStart={handleViewsMouseDown}
              onTouchEnd={handleViewsMouseUp}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer select-none"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{formatNumber(post.views_count || 0)} views</span>
              <BarChart3 className="w-3 h-3 opacity-40" />
            </button>

            {/* Tooltip popover */}
            {showEngagement && (
              <div
                ref={tooltipRef}
                className="absolute bottom-full left-0 mb-2 z-50 w-56 bg-background/95 backdrop-blur-md border border-border rounded-2xl shadow-xl p-3 pointer-events-none"
                onClick={e => e.stopPropagation()}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" /> Post Analytics
                </p>
                {loadingAnalytics ? (
                  <div className="flex items-center justify-center py-3">
                    <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : analytics ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-blue-500/8 rounded-xl p-2 text-center">
                      <p className="text-sm font-bold text-blue-600">{formatNumber(analytics.views ?? post.views_count ?? 0)}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center justify-center gap-0.5"><Eye className="w-2.5 h-2.5" />Views</p>
                    </div>
                    <div className="bg-purple-500/8 rounded-xl p-2 text-center">
                      <p className="text-sm font-bold text-purple-600">{formatNumber(analytics.unique_viewers ?? 0)}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center justify-center gap-0.5"><Users className="w-2.5 h-2.5" />Unique</p>
                    </div>
                    <div className="bg-green-500/8 rounded-xl p-2 text-center">
                      <p className="text-sm font-bold text-green-600">{Number(analytics.engagement_rate ?? 0).toFixed(1)}%</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center justify-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" />Engagement</p>
                    </div>
                    <div className="bg-orange-500/8 rounded-xl p-2 text-center">
                      <p className="text-sm font-bold text-orange-600">{formatNumber((analytics.shares ?? 0) + shareCount)}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center justify-center gap-0.5"><Share className="w-2.5 h-2.5" />Shares</p>
                    </div>
                  </div>
                ) : null}
                {/* Arrow */}
                <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-background border-r border-b border-border rotate-45" />
              </div>
            )}
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

            {/* Reaction button + picker */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowReactionPicker(p => !p); }}
                onMouseEnter={() => setShowReactionPicker(true)}
                onMouseLeave={() => setShowReactionPicker(false)}
                className={cn(
                  'flex items-center space-x-1.5 transition-colors group',
                  userReaction ? 'text-pink-600' : 'text-muted-foreground hover:text-pink-600'
                )}
              >
                <div className="p-2 rounded-full group-hover:bg-pink-600/10 transition-colors">
                  {userReaction
                    ? <span className="text-base leading-none">{userReaction}</span>
                    : <Heart className="w-5 h-5" />}
                </div>
                <span className="text-sm">{formatNumber(likesCount)}</span>
              </button>
              {/* Reaction picker flyout */}
              {showReactionPicker && (
                <div
                  className="absolute bottom-full mb-1 left-0 flex gap-0.5 bg-background border border-border rounded-full px-2 py-1.5 shadow-xl z-50"
                  onMouseEnter={() => setShowReactionPicker(true)}
                  onMouseLeave={() => setShowReactionPicker(false)}
                  onClick={e => e.stopPropagation()}
                >
                  {REACTIONS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={(e) => handleReact(emoji, e)}
                      className={cn(
                        'text-xl transition-all duration-100 hover:scale-125 active:scale-90 rounded-full w-9 h-9 flex items-center justify-center',
                        userReaction === emoji ? 'bg-primary/10 scale-110 ring-2 ring-primary/20' : 'hover:bg-muted'
                      )}
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

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

            {/* Tip + Report buttons — only for other people's posts */}
            {user && user.id !== post.user_id && (
              <button
                className="flex items-center space-x-2 text-muted-foreground hover:text-amber-500 transition-colors group"
                onClick={(e) => { e.stopPropagation(); setShowTipDialog(true); }}
                title="Send a tip"
              >
                <div className="p-2 rounded-full group-hover:bg-amber-500/10 transition-colors">
                  <DollarSign className="w-5 h-5" />
                </div>
              </button>
            )}
            {user && user.id !== post.user_id && (
              <button
                className="flex items-center space-x-2 text-muted-foreground hover:text-red-500 transition-colors group"
                onClick={(e) => { e.stopPropagation(); setShowReportDialog(true); }}
                title="Report post"
              >
                <div className="p-2 rounded-full group-hover:bg-red-500/10 transition-colors">
                  <Flag className="w-4 h-4" />
                </div>
              </button>
            )}

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

      {/* ── Edit History Bottom Sheet ── */}
      {showEditHistory && editHistory.length > 0 && (
        <div
          className="fixed inset-0 z-[250] bg-black/60"
          onClick={(e) => { e.stopPropagation(); setShowEditHistory(false); }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-500" />
                <h2 className="font-bold text-base">Edit History</h2>
                <span className="text-xs bg-blue-500/10 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{editHistory.length} edit{editHistory.length !== 1 ? 's' : ''}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowEditHistory(false); }}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Current version */}
            <div className="px-5 py-4 border-b border-border bg-green-500/3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full">Current</span>
                {(post as any).edited_at && (
                  <span className="text-xs text-muted-foreground">
                    {new Date((post as any).edited_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-green-800 dark:text-green-300 bg-green-500/5 rounded-xl px-3 py-2.5">{post.content}</p>
            </div>
            {/* Previous versions — most-recent first */}
            {[...editHistory].reverse().map((entry: any, idx: number) => (
              <div key={idx} className="px-5 py-4 border-b border-border last:border-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-full">v{editHistory.length - idx}</span>
                  {entry.edited_at && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.edited_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words line-through text-muted-foreground/70 bg-red-500/3 rounded-xl px-3 py-2.5">
                  {entry.content ?? entry.previous_content ?? '(no content saved)'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tip Dialog */}
      {showTipDialog && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setShowTipDialog(false); }}>
          <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-muted">
                {post.user_profiles?.avatar_url
                  ? <img src={post.user_profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center font-bold text-sm">{post.user_profiles?.username?.[0]?.toUpperCase()}</div>}
              </div>
              <div>
                <p className="font-bold">Tip @{post.user_profiles?.username}</p>
                <p className="text-xs text-muted-foreground">Support this creator</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[1, 5, 10].map(amt => (
                <button key={amt} onClick={() => setTipAmount(tipAmount === amt ? null : amt)}
                  className={`py-3 rounded-xl font-bold text-lg border-2 transition-all ${
                    tipAmount === amt ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-border hover:border-amber-400'
                  }`}>${amt}</button>
              ))}
            </div>
            <input
              type="number" min="0.5" step="0.5"
              placeholder="Custom amount ($)"
              value={tipAmount && ![1,5,10].includes(tipAmount) ? tipAmount : ''}
              onChange={e => setTipAmount(parseFloat(e.target.value) || null)}
              className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
            <textarea
              placeholder="Optional message…"
              value={tipMessage}
              onChange={e => setTipMessage(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowTipDialog(false); setTipAmount(null); setTipMessage(''); }}
                className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold hover:bg-muted">Cancel</button>
              <button onClick={handleSendTip} disabled={!tipAmount || tippingLoading}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
                {tippingLoading ? <TransLoader className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                {tipAmount ? `Send $${tipAmount}` : 'Send Tip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Dialog */}
      {showReportDialog && (
        <div className="fixed inset-0 z-[350] bg-black/60" onClick={(e) => { e.stopPropagation(); setShowReportDialog(false); }}>
          <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg">Report Post</h2>
                <p className="text-sm text-muted-foreground">Select the reason for this report</p>
              </div>
              <button onClick={() => { setShowReportDialog(false); setReportCategory(''); }} className="p-2 rounded-full hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {REPORT_CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setReportCategory(cat.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                    reportCategory === cat.id ? 'border-red-500 bg-red-500/5' : 'border-border hover:border-red-500/30 hover:bg-red-500/3'
                  }`}>
                  <span className="text-xl shrink-0">{cat.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{cat.label}</p>
                    <p className="text-xs text-muted-foreground">{cat.desc}</p>
                  </div>
                  {reportCategory === cat.id && (
                    <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                      <CheckIcon className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <button onClick={handleSubmitReport} disabled={!reportCategory || reportSubmitting}
              className="w-full py-3.5 bg-red-500 text-white rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-red-600 transition-colors">
              {reportSubmitting ? <TransLoader className="w-5 h-5 animate-spin" /> : <Flag className="w-5 h-5" />}
              {reportSubmitting ? 'Submitting…' : 'Submit Report'}
            </button>
            <p className="text-xs text-muted-foreground text-center">Reports are reviewed by our moderation team within 24 hours.</p>
          </div>
        </div>
      )}

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
