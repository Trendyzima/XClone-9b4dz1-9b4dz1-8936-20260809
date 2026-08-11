import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Heart, Share, BadgeCheck, MessageCircle, Repeat2, Bookmark, Send, Sparkles, X, Clock, ChevronUp, ChevronDown, Check, Copy, ExternalLink } from 'lucide-react';
import { useSEO, buildThreadLD } from '@/hooks/useSEO';
import { formatDistanceToNow } from 'date-fns';
import { parseContent, formatNumber } from '@/lib/utils';
import { PostCard } from '@/components/features/PostCard';
import { DynamicAd } from '@/components/features/DynamicAd';
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

  useSEO({
    title: thread ? thread.title : 'Thread',
    description: thread
      ? (thread.content?.replace(/<[^>]*>/g, '').slice(0, 155) || `Read "${thread.title}" on Testagram`)
      : 'Read this thread on Testagram',
    image: thread?.cover_image || thread?.media_url || undefined,
    url: thread ? `/thread/${thread.id}` : undefined,
    type: 'article',
    keywords: thread ? `${thread.title}, testagram, thread, article, creator` : undefined,
    structuredData: thread ? buildThreadLD(thread) : undefined,
  });
  const [relatedPosts, setRelatedPosts] = useState<any[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [isReposted, setIsReposted] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'shared'>('idle');

  // Thread Reactions
  const THREAD_REACTIONS = ['❤️', '😂', '🔥', '😮', '👏'] as const;
  const [threadReactionCounts, setThreadReactionCounts] = useState<Record<string, number>>({});
  const [userThreadReaction, setUserThreadReaction] = useState<string | null>(null);
  const [showThreadReactionPicker, setShowThreadReactionPicker] = useState(false);

  const fetchThreadReactions = async () => {
    if (!id) return;
    const { data } = await supabase.from('thread_reactions').select('emoji, user_id').eq('thread_id', id);
    const counts: Record<string, number> = {};
    let myR: string | null = null;
    (data ?? []).forEach((r: any) => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      if (r.user_id === user?.id) myR = r.emoji;
    });
    setThreadReactionCounts(counts);
    setUserThreadReaction(myR);
  };

  const handleThreadReact = async (emoji: string) => {
    if (!user) { navigate('/auth'); return; }
    setShowThreadReactionPicker(false);
    const prev = userThreadReaction;
    if (prev === emoji) {
      setUserThreadReaction(null);
      setThreadReactionCounts(c => { const u = { ...c }; u[emoji] = Math.max(0, (u[emoji] ?? 1) - 1); if (!u[emoji]) delete u[emoji]; return u; });
      await supabase.from('thread_reactions').delete().eq('thread_id', id).eq('user_id', user.id);
    } else {
      setUserThreadReaction(emoji);
      setThreadReactionCounts(c => {
        const u = { ...c };
        if (prev) { u[prev] = Math.max(0, (u[prev] ?? 1) - 1); if (!u[prev]) delete u[prev]; }
        u[emoji] = (u[emoji] || 0) + 1;
        return u;
      });
      await supabase.from('thread_reactions').upsert({ thread_id: id, user_id: user.id, emoji }, { onConflict: 'thread_id,user_id' });
    }
  };

  // Chapter editor for thread owner
  const [editingChapters, setEditingChapters] = useState(false);
  const [editChapters, setEditChapters] = useState<{ time: string; title: string }[]>([]);
  const [savingChapters, setSavingChapters] = useState(false);

  const openChapterEditor = () => {
    const chs: { time: number; title: string }[] = (thread as any).chapters ?? [];
    setEditChapters(chs.map(ch => ({ time: `${Math.floor(ch.time / 60)}:${String(Math.floor(ch.time % 60)).padStart(2, '0')}`, title: ch.title })));
    setEditingChapters(true);
  };

  const saveChapters = async () => {
    if (!thread) return;
    setSavingChapters(true);
    const parsed = editChapters
      .filter(ch => ch.title.trim())
      .map(ch => {
        const parts = ch.time.split(':').map(Number);
        const secs = parts.length === 2 ? parts[0] * 60 + (parts[1] || 0) : parts[0] || 0;
        return { time: secs, title: ch.title.trim() };
      });
    await supabase.from('threads').update({ chapters: parsed.length > 0 ? parsed : null }).eq('id', thread.id);
    setThread({ ...thread, chapters: parsed.length > 0 ? parsed : null });
    setChapters(parsed);
    setEditingChapters(false);
    setSavingChapters(false);
    sonnerToast.success('Chapters saved!');
  };

  // Video Chapters
  const videoRef = useRef<HTMLVideoElement>(null);
  const [chapters, setChapters] = useState<{ time: number; title: string }[]>([]);
  const [currentChapter, setCurrentChapter] = useState(0);

  // AI Summarizer
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const handleSummarize = async () => {
    if (summary) { setShowSummary(v => !v); return; }
    if (!thread) return;
    setSummarizing(true);
    try {
      const topReplies = replies
        .slice(0, 6)
        .map(r => `- ${r.user_profiles?.username}: ${r.content}`)
        .join('\n');
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: [{
            role: 'user',
            content: `Summarize this thread in exactly 3 bullet points. Each bullet should be one crisp sentence. Return ONLY the 3 bullets starting with "•":\n\nTitle: ${thread.title}\n\nContent: ${thread.content.replace(/<[^>]*>/g, '').slice(0, 1200)}${topReplies ? '\n\nTop comments:\n' + topReplies : ''}`,
          }],
          model: 'google/gemini-3-flash-preview',
        },
      });
      if (error) throw error;
      const raw = data?.choices?.[0]?.message?.content ?? data?.content ?? data?.text ?? '';
      setSummary(raw.trim());
      setShowSummary(true);
    } catch {
      setSummary('• Could not generate summary. Please try again.');
      setShowSummary(true);
    } finally {
      setSummarizing(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchThread();
      fetchReplies();
      incrementViews();
      checkUserInteractions();
      fetchThreadReactions();
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

      // Inject OG meta for deep link sharing
      const ogTitle = `${data.title} — by @${data.user_profiles?.username}`;
      const ogDesc = data.content?.replace(/<[^>]*>/g, '').slice(0, 200) || 'Read this thread';
      const ogImg = data.cover_image || data.media_url || `${window.location.origin}/app-icon.jpg`;
      const setM = (p: string, c: string) => { let el = document.querySelector(`meta[property="${p}"]`) as HTMLMetaElement | null; if (!el) { el = document.createElement('meta'); el.setAttribute('property', p); document.head.appendChild(el); } el.setAttribute('content', c); };
      document.title = ogTitle;
      setM('og:title', ogTitle); setM('og:description', ogDesc); setM('og:image', ogImg);
      setM('og:url', window.location.href); setM('og:type', 'article');

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

      {/* ── Chapter Editor Modal ── */}
      {editingChapters && (
        <div className="fixed inset-0 z-[400] bg-black/60 flex items-end justify-center p-4" onClick={() => setEditingChapters(false)}>
          <div className="bg-background border border-border rounded-2xl w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Edit Video Chapters</h3>
              <button onClick={() => setEditingChapters(false)} className="p-1.5 rounded-full hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {editChapters.map((ch, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="text" value={ch.time} onChange={e => setEditChapters(prev => prev.map((c, j) => j === i ? { ...c, time: e.target.value } : c))}
                    placeholder="0:00" className="w-16 text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  <input type="text" value={ch.title} onChange={e => setEditChapters(prev => prev.map((c, j) => j === i ? { ...c, title: e.target.value } : c))}
                    placeholder="Chapter title…" maxLength={40} className="flex-1 text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  <button onClick={() => setEditChapters(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={() => setEditChapters(prev => [...prev, { time: '0:00', title: '' }])} className="w-full py-2 border-2 border-dashed border-border rounded-xl text-xs font-semibold text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors">
                + Add Chapter
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingChapters(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold hover:bg-muted">Cancel</button>
              <button onClick={saveChapters} disabled={savingChapters} className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {savingChapters ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save Chapters
              </button>
            </div>
          </div>
        </div>
      )}

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

          <div className="flex items-start justify-between gap-3 mb-4">
            <h1 className="text-3xl font-bold flex-1">{thread.title}</h1>
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all mt-1 ${
                showSummary
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-400'
                  : 'border-border text-muted-foreground hover:border-amber-500/30 hover:bg-amber-500/5 hover:text-amber-600'
              } disabled:opacity-50`}
              title="AI TL;DR Summary"
            >
              {summarizing
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              {summarizing ? 'Summarizing…' : showSummary ? 'Hide TL;DR' : 'TL;DR'}
            </button>
          </div>

          {/* AI Summary Card */}
          {showSummary && summary && (
            <div className="mb-5 bg-amber-500/8 border border-amber-500/20 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">AI TL;DR</span>
                </div>
                <button onClick={() => setShowSummary(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1.5">
                {summary.split('\n').filter(l => l.trim()).map((line, i) => (
                  <p key={i} className="text-sm text-foreground leading-relaxed">{line.trim()}</p>
                ))}
              </div>
            </div>
          )}

          {/* Thread video with chapter support */}
          {thread.media_url && thread.media_type === 'video' && (
            <div className="rounded-xl overflow-hidden mb-3 bg-black">
              <video
                ref={videoRef}
                src={thread.media_url}
                controls
                className="w-full max-h-[420px] object-contain"
                playsInline
                onLoadedMetadata={() => setChapters((thread as any).chapters ?? [])}
                onTimeUpdate={() => {
                  const t = videoRef.current?.currentTime ?? 0;
                  const chs: { time: number; title: string }[] = (thread as any).chapters ?? [];
                  if (chs.length > 0) {
                    const idx = chs.reduce((best, ch, i) => ch.time <= t ? i : best, 0);
                    setCurrentChapter(idx);
                    setChapters(chs);
                  }
                }}
              />
              {chapters.length > 0 && (
                <div className="bg-black/90 px-4 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] text-white/50 uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3 h-3" /> Chapters</p>
                    {/* Chapter edit button — only for thread owner */}
                    {user && thread?.user_profiles?.id === user.id && (
                      <button onClick={openChapterEditor} className="text-[10px] text-primary font-semibold hover:underline">✏️ Edit</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {chapters.map((ch, i) => (
                      <button key={i} onClick={() => { if (videoRef.current) videoRef.current.currentTime = ch.time; setCurrentChapter(i); }}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                          currentChapter === i ? 'bg-primary text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
                        }`}>
                        {Math.floor(ch.time / 60)}:{String(Math.floor(ch.time % 60)).padStart(2, '0')} {ch.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Thread cover image */}
          {thread.cover_image && !thread.media_url && (
            <img
              src={thread.cover_image}
              alt={thread.title}
              className="rounded-xl w-full max-h-[500px] object-cover mb-6"
            />
          )}

          {/* Inline media gallery */}
          {thread.media_urls && Array.isArray(thread.media_urls) && thread.media_urls.length > 0 && (
            <div className={`grid gap-2 mb-5 ${
              thread.media_urls.length === 1 ? 'grid-cols-1' :
              thread.media_urls.length === 2 ? 'grid-cols-2' :
              'grid-cols-3'
            }`}>
              {thread.media_urls.map((url: string, i: number) => (
                <div key={i} className="rounded-xl overflow-hidden aspect-square bg-muted">
                  <img src={url} alt={`media-${i}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}

          <div
            className="prose prose-lg dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: parseContent(thread.content) }}
          />
        </div>

        {/* Thread Actions */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-wrap gap-y-2">
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

              {/* Reaction picker */}
              <div className="relative">
                <button
                  onClick={() => setShowThreadReactionPicker(v => !v)}
                  className={cn('flex items-center gap-1.5 transition-colors', userThreadReaction ? 'text-pink-600' : 'text-muted-foreground hover:text-pink-600')}
                >
                  <span className="text-base leading-none">{userThreadReaction ?? '😊'}</span>
                  {Object.values(threadReactionCounts).reduce((a, b) => a + b, 0) > 0 && (
                    <span className="text-xs font-medium">{Object.values(threadReactionCounts).reduce((a, b) => a + b, 0)}</span>
                  )}
                </button>
                {showThreadReactionPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowThreadReactionPicker(false)} />
                    <div className="absolute bottom-full mb-2 left-0 flex gap-1 bg-background border border-border rounded-full px-2 py-1.5 shadow-xl z-50">
                      {THREAD_REACTIONS.map(emoji => (
                        <button key={emoji} onClick={() => handleThreadReact(emoji)}
                          className={cn('text-xl transition-all hover:scale-125 active:scale-90 rounded-full w-9 h-9 flex items-center justify-center',
                            userThreadReaction === emoji ? 'bg-primary/10 ring-2 ring-primary/20' : 'hover:bg-muted')}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

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
              <button
                onClick={async () => {
                  const shareUrl = `${window.location.origin}/thread/${thread.id}`;
                  const shareTitle = thread.title;
                  const shareText = `${thread.title} — by @${thread.user_profiles?.username}\n\n${thread.content?.replace(/<[^>]*>/g, '').slice(0, 120)}…`;
                  if (navigator.share) {
                    try {
                      await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
                      setShareState('shared');
                    } catch {
                      // user cancelled — silent
                    }
                  } else {
                    await navigator.clipboard.writeText(shareUrl);
                    setShareState('copied');
                  }
                  setTimeout(() => setShareState('idle'), 2500);
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full border transition-all text-sm font-semibold ${
                  shareState === 'copied' ? 'bg-green-500/10 border-green-500/30 text-green-600' :
                  shareState === 'shared' ? 'bg-primary/10 border-primary/30 text-primary' :
                  'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {shareState === 'copied' ? <><Check className="w-4 h-4" />Copied!</> :
                 shareState === 'shared' ? <><ExternalLink className="w-4 h-4" />Shared!</> :
                 navigator.share ? <><Share className="w-4 h-4" />Share</> :
                 <><Copy className="w-4 h-4" />Copy link</>}
              </button>
            </div>
          </div>
          {/* Reaction bubbles */}
          {Object.keys(threadReactionCounts).length > 0 && (
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {THREAD_REACTIONS.filter(e => (threadReactionCounts[e] ?? 0) > 0).map(emoji => (
                <button key={emoji} onClick={() => handleThreadReact(emoji)}
                  className={cn('flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border transition-all hover:scale-105',
                    userThreadReaction === emoji ? 'bg-primary/10 border-primary/30 text-primary font-semibold' : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/20')}>
                  <span>{emoji}</span><span>{threadReactionCounts[emoji]}</span>
                </button>
              ))}
            </div>
          )}
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

        {/* ── Wise Brain Ad after thread content ── */}
        <div className="border-t border-border px-4 py-3">
          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest text-center mb-1">🧠 Wise Brain Ad</p>
          <DynamicAd location="feed_inline" className="rounded-2xl overflow-hidden" />
        </div>

        {/* Replies */}
        {replies.length > 0 && (
          <div className="border-t border-border">
            <div className="p-4 bg-muted/30">
              <h2 className="font-bold text-lg">{formatNumber(thread.replies_count)} Replies</h2>
            </div>
            <div className="divide-y divide-border">
              {replies.map((reply, idx) => (
                <div key={reply.id}>
                  {renderReply(reply)}
                  {/* Inject ad wisely every 8 comments — not at position 0 */}
                  {idx > 0 && (idx + 1) % 8 === 0 && (
                    <div className="px-4 py-3 bg-muted/20 border-b border-border">
                      <p className="text-[9px] text-muted-foreground/40 uppercase tracking-widest text-center mb-1">Sponsored</p>
                      <DynamicAd location="feed_inline" className="rounded-xl overflow-hidden" />
                    </div>
                  )}
                </div>
              ))}
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
