
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { PostCard } from '@/components/features/PostCard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { sendActivityNotification } from '@/components/layout/AuthProvider';
import { Post } from '@/types';
import { Loader2, Send, BadgeCheck, Twitter, Facebook, Link2, MessageCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Reply {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_profiles: {
    id: string;
    username: string;
    avatar_url?: string;
    verified: boolean;
  };
}

// Inject OG meta tags dynamically for social sharing previews
function injectPostMeta(post: Post) {
  const title = `${post.user_profiles?.username || 'Post'} on Testagram`;
  const description = post.content?.slice(0, 200) || 'View this post on Testagram';

  // Priority: media_urls[0] > image_url > video thumbnail via CDN > app icon
  let image = 'https://testagram.site/app-icon.jpg';
  if (post.media_urls && post.media_urls.length > 0) {
    image = post.media_urls[0];
  } else if (post.image_url) {
    image = post.image_url;
  } else if (post.is_video && post.video_url) {
    // For videos, try to use the video URL itself as og:image type video/mp4
    // Many scrapers will use og:image so we keep the app icon fallback
    image = 'https://testagram.site/app-icon.jpg';
  }

  const url = `${window.location.origin}/post/${post.id}`;

  const setMeta = (property: string, content: string) => {
    let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
    if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el); }
    el.setAttribute('content', content);
  };
  const setNameMeta = (name: string, content: string) => {
    let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
    if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
    el.setAttribute('content', content);
  };

  document.title = title;
  setMeta('og:title', title);
  setMeta('og:description', description);
  setMeta('og:image', image);
  setMeta('og:image:width', '1200');
  setMeta('og:image:height', '630');
  setMeta('og:url', url);
  setMeta('og:type', post.is_video ? 'video.other' : 'article');
  setMeta('og:site_name', 'Testagram');
  if (post.is_video && post.video_url) {
    setMeta('og:video', post.video_url);
    setMeta('og:video:type', 'video/mp4');
  }
  setNameMeta('twitter:card', (post.media_urls?.length || post.image_url) ? 'summary_large_image' : 'summary');
  setNameMeta('twitter:title', title);
  setNameMeta('twitter:description', description);
  setNameMeta('twitter:image', image);
  setNameMeta('twitter:site', '@testagram');
  setNameMeta('description', description);
}

export default function PostThreadPage() {
  const { postId } = useParams<{ postId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [post, setPost] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const fetchPostAndReplies = async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .select('*, user_profiles (*)')
        .eq('id', postId)
        .single();
      if (postError) throw postError;
      setPost(postData);

      // Inject OG tags for social sharing / link unfurling
      if (postData) { // Added check for postData to ensure it's not null before passing to injectPostMeta
        injectPostMeta(postData);
      }


      // Increment view count
      supabase
        .from('posts')
        .update({ views_count: (postData.views_count || 0) + 1 })
        .eq('id', postId)
        .then(() => {});

      const { data: repliesData, error: repliesError } = await supabase
        .from('replies')
        .select('*, user_profiles (*)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (repliesError) throw repliesError;
      setReplies(repliesData || []);
    } catch (err) {
      console.error('Error fetching post thread:', err);
      toast({ title: 'Error', description: 'Failed to load post', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (postId) fetchPostAndReplies();
  }, [postId]);

  const handleReply = async () => {
    if (!user) return navigate('/auth');
    if (!replyContent.trim() || !postId) return;

    setSubmitting(true);
    try {
      const { error: insertError } = await supabase.from('replies').insert({
        post_id: postId,
        user_id: user.id,
        content: replyContent.trim(),
      });
      if (insertError) throw insertError;

      if (post) {
        await supabase.from('posts')
          .update({ replies_count: (post.replies_count || 0) + 1 }) // Added nullish coalescing for replies_count
          .eq('id', postId);
      }

      if (post && post.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: post.user_id,
          type: 'reply',
          from_user_id: user.id,
          post_id: postId,
        });
        await sendActivityNotification({
          recipientUserId: post.user_id,
          title: 'New Reply',
          body: `${user.username} replied to your post: "${replyContent.trim().slice(0, 60)}..."`,
          data: { route: `/post/${postId}`, type: 'reply', fromUserId: user.id, postId },
        });
      }

      setReplyContent('');
      toast({ title: 'Reply posted!' });
      fetchPostAndReplies();
    } catch (err: any) {
      console.error('Reply error:', err);
      toast({ title: 'Error', description: err.message || 'Failed to post reply', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/post/${postId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopySuccess(true);
      toast({ title: 'Link copied!' });
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const shareToX = () => {
    const url = `${window.location.origin}/post/${postId}`;
    const text = post ? `${post.content?.slice(0, 100)}...` : 'Check out this post on Testagram';
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  const shareToFacebook = () => {
    const url = `${window.location.origin}/post/${postId}`;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  };

  const shareToWhatsApp = () => {
    const url = `${window.location.origin}/post/${postId}`;
    const text = post ? `${post.content?.slice(0, 100)}... ` : '';
    window.open(`https://wa.me/?text=${encodeURIComponent(text + url)}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar title="Post" showBack />
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <MessageCircle className="w-16 h-16 opacity-30" />
          <p className="font-semibold text-lg">Post not found</p>
          <p className="text-sm text-center max-w-xs">This post may have been deleted or the link is invalid.</p>
          <Button onClick={() => navigate('/')} variant="outline" className="rounded-full">Go Home</Button>
        </div>
      </div>
    );
  }

  const postUrl = `${window.location.origin}/post/${postId}`;
  const postThumb =
    (post.media_urls && post.media_urls.length > 0 ? post.media_urls[0] : null) ||
    post.image_url || null;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <TopBar title="Post" showBack />

      {/* Main post */}
      <PostCard post={post} onUpdate={fetchPostAndReplies} />

      {/* Share Panel */}
      <div className="border-b border-border p-4 bg-muted/5">
        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Share this post</p>
        {/* Thumbnail preview when image exists */}
        {postThumb && (
          <div className="mb-3 rounded-xl overflow-hidden border border-border flex items-center gap-3 p-2 bg-card">
            <img src={postThumb} alt="Post thumbnail" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{post.user_profiles?.username} on Testagram</p>
              <p className="text-xs text-muted-foreground truncate">{post.content?.slice(0, 80)}</p>
              <p className="text-xs text-primary mt-0.5 truncate">{postUrl}</p>
            </div>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
          >
            <Link2 className="w-4 h-4" />
            {copySuccess ? 'Copied!' : 'Copy Link'}
          </button>
          <button
            onClick={shareToX}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-black text-white hover:bg-neutral-800 text-sm font-medium transition-colors"
          >
            <Twitter className="w-4 h-4" />
            X (Twitter)
          </button>
          <button
            onClick={shareToFacebook}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#1877F2] text-white hover:bg-[#1864d2] text-sm font-medium transition-colors"
          >
            <Facebook className="w-4 h-4" />
            Facebook
          </button>
          <button
            onClick={shareToWhatsApp}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#25D366] text-white hover:bg-[#1da851] text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            WhatsApp
          </button>
        </div>
      </div>

      {/* Reply composer */}
      {user && (
        <div className="border-b border-border p-4 bg-muted/5">
          <div className="flex space-x-3">
            <div className="w-10 h-10 rounded-full bg-muted flex-shrink-0 overflow-hidden">
              {user.avatar ? (
                <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold">
                  {user.username[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1">
              <Textarea
                placeholder={`Reply to @${post.user_profiles?.username}...`}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[80px] border-0 resize-none focus-visible:ring-0 p-0 text-base bg-transparent"
                maxLength={280}
              />
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                {replyContent.length > 0 && (
                  <span className={`text-sm ${replyContent.length > 260 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {replyContent.length}/280
                  </span>
                )}
                <Button
                  onClick={handleReply}
                  disabled={submitting || !replyContent.trim() || replyContent.length > 280}
                  className="rounded-full px-6 font-semibold ml-auto"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <>
                      <Send className="w-4 h-4 mr-1.5" />
                      Reply
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Replies list */}
      <div>
        {replies.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="font-medium">No replies yet</p>
            <p className="text-sm mt-1">Be the first to reply!</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b border-border">
              <span className="text-sm font-semibold text-muted-foreground">
                {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
              </span>
            </div>
            {replies.map((reply) => (
              <div key={reply.id} className="border-b border-border p-4 hover:bg-muted/5 transition-colors">
                <div className="flex space-x-3">
                  <div
                    className="w-10 h-10 rounded-full bg-muted flex-shrink-0 overflow-hidden cursor-pointer"
                    onClick={() => navigate(`/profile/${reply.user_profiles.username}`)}
                  >
                    {reply.user_profiles.avatar_url ? (
                      <img src={reply.user_profiles.avatar_url} alt={reply.user_profiles.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-semibold">
                        {reply.user_profiles.username[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="font-bold cursor-pointer hover:underline"
                        onClick={() => navigate(`/profile/${reply.user_profiles.username}`)}
                      >
                        {reply.user_profiles.username}
                      </span>
                      {reply.user_profiles.verified && (
                        <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />
                      )}
                      <span className="text-muted-foreground text-sm">
                        · {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-foreground mt-1 whitespace-pre-wrap break-words">{reply.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
