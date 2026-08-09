import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Heart, Share, BadgeCheck, MessageCircle, Repeat2, Bookmark, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { parseContent, formatNumber } from '@/lib/utils';
import { PostCard } from '@/components/features/PostCard';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { cn } from '@/lib/utils';

interface Reply {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_reply_id: string | null;
  user_profiles: {
    username: string;
    avatar_url: string | null;
    verified: boolean;
  };
  replies?: Reply[];
}

export default function ThreadDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [thread, setThread] = useState<any>(null);
  const [relatedPosts, setRelatedPosts] = useState<any[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [isReposted, setIsReposted] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (id) {
      fetchThread();
      fetchReplies();
      incrementViews();
      checkUserInteractions();
    }
  }, [id, user]);

  const incrementViews = async () => {
    if (!id) return;
    
    const { error } = await supabase.rpc('increment', {
      table_name: 'threads',
      row_id: id,
      column_name: 'views_count'
    });

    if (error) {
      await supabase
        .from('threads')
        .update({ views_count: supabase.raw('views_count + 1') })
        .eq('id', id);
    }
  };

  const checkUserInteractions = async () => {
    if (!user || !id) return;

    // Check if liked
    const { data: likeData } = await supabase
      .from('thread_likes')
      .select('id')
      .eq('user_id', user.id)
      .eq('thread_id', id)
      .single();

    setIsLiked(!!likeData);

    // Check if reposted
    const { data: repostData } = await supabase
      .from('thread_reposts')
      .select('id')
      .eq('user_id', user.id)
      .eq('thread_id', id)
      .single();

    setIsReposted(!!repostData);

    // Check if bookmarked
    const { data: bookmarkData } = await supabase
      .from('thread_bookmarks')
      .select('id')
      .eq('user_id', user.id)
      .eq('thread_id', id)
      .single();

    setIsBookmarked(!!bookmarkData);
  };

  const fetchThread = async () => {
    try {
      const { data, error } = await supabase
        .from('threads')
        .select(`
          *,
          user_profiles (
            id,
            username,
            avatar_url,
            verified
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setThread(data);

      // Extract hashtags and fetch related posts
      const hashtags = (data.content.match(/#\w+/g) || []).map(tag => tag.substring(1).toLowerCase());
      
      if (hashtags.length > 0) {
        const { data: hashtagsData } = await supabase
          .from('hashtags')
          .select('id')
          .in('tag', hashtags);

        if (hashtagsData && hashtagsData.length > 0) {
          const hashtagIds = hashtagsData.map(h => h.id);
          
          const { data: postsData } = await supabase
            .from('post_hashtags')
            .select(`
              post_id,
              posts (
                *,
                user_profiles (*)
              )
            `)
            .in('hashtag_id', hashtagIds)
            .limit(10);

          const posts = (postsData || []).map((item: any) => item.posts).filter(Boolean);
          setRelatedPosts(posts);
        }
      }
    } catch (error) {
      console.error('Error fetching thread:', error);
      toast({
        title: 'Error',
        description: 'Thread not found',
        variant: 'destructive',
      });
      navigate('/threads');
    } finally {
      setLoading(false);
    }
  };

  const fetchReplies = async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from('thread_replies')
      .select(`
        *,
        user_profiles (
          username,
          avatar_url,
          verified
        )
      `)
      .eq('thread_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching replies:', error);
      return;
    }

    // Build nested reply structure
    const replyMap = new Map<string, Reply>();
    const rootReplies: Reply[] = [];

    data.forEach((reply: any) => {
      const replyObj: Reply = {
        ...reply,
        replies: []
      };
      replyMap.set(reply.id, replyObj);
    });

    data.forEach((reply: any) => {
      const replyObj = replyMap.get(reply.id)!;
      if (reply.parent_reply_id) {
        const parent = replyMap.get(reply.parent_reply_id);
        if (parent) {
          parent.replies = parent.replies || [];
          parent.replies.push(replyObj);
        } else {
          rootReplies.push(replyObj);
        }
      } else {
        rootReplies.push(replyObj);
      }
    });

    setReplies(rootReplies);
  };

  const handleLike = async () => {
    if (!user || !thread) {
      navigate('/auth');
      return;
    }

    const newIsLiked = !isLiked;
    const newCount = newIsLiked ? thread.likes_count + 1 : Math.max(0, thread.likes_count - 1);
    
    setIsLiked(newIsLiked);
    setThread({ ...thread, likes_count: newCount });

    try {
      if (newIsLiked) {
        await supabase.from('thread_likes').insert({
          user_id: user.id,
          thread_id: thread.id
        });
      } else {
        await supabase
          .from('thread_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('thread_id', thread.id);
      }
    } catch (error: any) {
      console.error('Like error:', error);
      setIsLiked(!newIsLiked);
      setThread({ ...thread, likes_count: thread.likes_count });
    }
  };

  const handleRepost = async () => {
    if (!user || !thread) {
      navigate('/auth');
      return;
    }

    const newIsReposted = !isReposted;
    const newCount = newIsReposted ? thread.reposts_count + 1 : Math.max(0, thread.reposts_count - 1);
    
    setIsReposted(newIsReposted);
    setThread({ ...thread, reposts_count: newCount });

    try {
      if (newIsReposted) {
        await supabase.from('thread_reposts').insert({
          user_id: user.id,
          thread_id: thread.id
        });
        sonnerToast.success('Thread reposted!');
      } else {
        await supabase
          .from('thread_reposts')
          .delete()
          .eq('user_id', user.id)
          .eq('thread_id', thread.id);
        sonnerToast.success('Repost removed');
      }
    } catch (error: any) {
      console.error('Repost error:', error);
      setIsReposted(!newIsReposted);
      setThread({ ...thread, reposts_count: thread.reposts_count });
    }
  };

  const handleBookmark = async () => {
    if (!user || !thread) {
      navigate('/auth');
      return;
    }

    const newIsBookmarked = !isBookmarked;
    setIsBookmarked(newIsBookmarked);

    try {
      if (newIsBookmarked) {
        await supabase.from('thread_bookmarks').insert({
          user_id: user.id,
          thread_id: thread.id
        });
        sonnerToast.success('Thread bookmarked!');
      } else {
        await supabase
          .from('thread_bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('thread_id', thread.id);
        sonnerToast.success('Bookmark removed');
      }
    } catch (error: any) {
      console.error('Bookmark error:', error);
      setIsBookmarked(!newIsBookmarked);
    }
  };

  const handleReply = async (parentReplyId?: string) => {
    if (!user || !thread || !replyText.trim()) return;

    try {
      const { error } = await supabase.from('thread_replies').insert({
        thread_id: thread.id,
        user_id: user.id,
        content: replyText.trim(),
        parent_reply_id: parentReplyId || null
      });

      if (error) throw error;

      setReplyText('');
      setReplyingTo(null);
      fetchReplies();
      setThread({ ...thread, replies_count: thread.replies_count + 1 });
      sonnerToast.success('Reply posted!');
    } catch (error: any) {
      console.error('Reply error:', error);
      sonnerToast.error('Failed to post reply');
    }
  };

  const toggleReplyExpansion = (replyId: string) => {
    const newExpanded = new Set(expandedReplies);
    if (newExpanded.has(replyId)) {
      newExpanded.delete(replyId);
    } else {
      newExpanded.add(replyId);
    }
    setExpandedReplies(newExpanded);
  };

  const renderReply = (reply: Reply, depth = 0) => {
    const hasReplies = reply.replies && reply.replies.length > 0;
    const isExpanded = expandedReplies.has(reply.id);

    return (
      <div key={reply.id} className={cn("border-l-2 border-border", depth > 0 && "ml-12")}>
        <div className="p-4 hover:bg-muted/5">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
              {reply.user_profiles.avatar_url ? (
                <img src={reply.user_profiles.avatar_url} alt={reply.user_profiles.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold">
                  {reply.user_profiles.username[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-semibold">{reply.user_profiles.username}</span>
                {reply.user_profiles.verified && (
                  <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />
                )}
                <span className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                </span>
              </div>
              <p className="break-words whitespace-pre-wrap">{reply.content}</p>
              <div className="flex items-center space-x-4 mt-2">
                <button
                  onClick={() => setReplyingTo(reply.id)}
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Reply
                </button>
                {hasReplies && (
                  <button
                    onClick={() => toggleReplyExpansion(reply.id)}
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {reply.replies!.length} {reply.replies!.length === 1 ? 'reply' : 'replies'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {replyingTo === reply.id && (
          <div className="ml-16 mr-4 mb-4 flex items-start space-x-3">
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Reply to @${reply.user_profiles.username}...`}
              className="flex-1"
            />
            <div className="flex flex-col gap-2">
              <Button size="sm" onClick={() => handleReply(reply.id)}>
                <Send className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {hasReplies && isExpanded && (
          <div className="border-l-2 border-primary/20">
            {reply.replies!.map(childReply => renderReply(childReply, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!thread) return null;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Thread" showBack />

      <article className="max-w-3xl mx-auto">
        {/* Thread Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center space-x-3 mb-4">
            <div
              className="w-12 h-12 rounded-full bg-muted overflow-hidden cursor-pointer"
              onClick={() => navigate(`/profile/${thread.user_profiles.username}`)}
            >
              {thread.user_profiles.avatar_url ? (
                <img
                  src={thread.user_profiles.avatar_url}
                  alt={thread.user_profiles.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold">
                  {thread.user_profiles.username[0].toUpperCase()}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold">{thread.user_profiles.username}</span>
                {thread.user_profiles.verified && (
                  <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>

          <h1 className="text-3xl font-bold mb-4">{thread.title}</h1>

          {thread.cover_image && (
            <img
              src={thread.cover_image}
              alt={thread.title}
              className="rounded-xl w-full max-h-[500px] object-cover mb-6"
            />
          )}

          <div
            className="prose prose-lg dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: parseContent(thread.content) }}
          />
        </div>

        {/* Thread Actions */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleLike}
                className={cn(
                  'flex items-center space-x-2 transition-colors',
                  isLiked ? 'text-pink-600' : 'text-muted-foreground hover:text-pink-600'
                )}
              >
                <Heart className={cn('w-5 h-5', isLiked && 'fill-current')} />
                <span className="font-medium">{formatNumber(thread.likes_count)}</span>
              </button>

              <button
                onClick={handleRepost}
                className={cn(
                  'flex items-center space-x-2 transition-colors',
                  isReposted ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'
                )}
              >
                <Repeat2 className="w-5 h-5" />
                <span className="font-medium">{formatNumber(thread.reposts_count)}</span>
              </button>

              <div className="flex items-center space-x-2 text-muted-foreground">
                <MessageCircle className="w-5 h-5" />
                <span className="font-medium">{formatNumber(thread.replies_count)} replies</span>
              </div>

              <div className="flex items-center space-x-2 text-muted-foreground">
                <span className="font-medium">{formatNumber(thread.views_count)} views</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleBookmark}
                className={cn(
                  'p-2 rounded-full transition-colors',
                  isBookmarked 
                    ? 'text-primary bg-primary/10' 
                    : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                )}
              >
                <Bookmark className={cn('w-5 h-5', isBookmarked && 'fill-current')} />
              </button>
              <Button variant="outline" size="sm" className="rounded-full">
                <Share className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </div>

        {/* Reply Input */}
        {user && !replyingTo && (
          <div className="p-4 border-b border-border">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold">
                    {user.username[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply..."
                  className="min-h-[100px]"
                />
                <div className="flex justify-end mt-2">
                  <Button
                    onClick={() => handleReply()}
                    disabled={!replyText.trim()}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Reply
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Replies */}
        {replies.length > 0 && (
          <div className="border-t border-border">
            <div className="p-4 bg-muted/30">
              <h2 className="font-bold text-lg">{formatNumber(thread.replies_count)} Replies</h2>
            </div>
            <div className="divide-y divide-border">
              {replies.map(reply => renderReply(reply))}
            </div>
          </div>
        )}

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <div className="border-t border-border">
            <div className="p-4 bg-muted/30">
              <h2 className="font-bold text-lg">Related Posts</h2>
              <p className="text-sm text-muted-foreground">Posts with similar topics</p>
            </div>
            <div>
              {relatedPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
