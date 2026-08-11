
import { useState, useEffect } from 'react';
import { PageAdBanner } from '@/components/features/AdSenseAd';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, BadgeCheck, Heart, MessageCircle, TrendingUp, BookOpen, Video, Image as ImageIcon, Clock, Bookmark } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatNumber } from '@/lib/utils';
import { useSEO } from '@/hooks/useSEO';

// ThreadsAdBanner is defined above

interface Thread {
  id: string;
  user_id: string;
  title: string;
  content: string;
  cover_image: string | null;
  media_url: string | null;
  media_type: string | null;
  views_count: number;
  likes_count: number;
  reposts_count: number;
  replies_count: number;
  created_at: string;
  user_profiles: {
    id: string;
    username: string;
    avatar_url: string | null;
    verified: boolean;
  };
}

// Strip markdown-like syntax for clean plain-text preview
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,3}\s+/gm, '')     // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1')     // italic
    .replace(/^>\s+/gm, '')          // blockquotes
    .replace(/^•\s+/gm, '')         // bullets
    .replace(/^---$/gm, '')          // dividers
    .replace(/\n{2,}/g, ' ')         // collapse blank lines
    .trim();
}

// Accent border color based on content length
function accentBorderClass(content: string): string {
  const len = content.length;
  if (len > 3000) return 'border-l-purple-500';
  if (len > 1500) return 'border-l-blue-500';
  if (len > 500)  return 'border-l-teal-500';
  return 'border-l-green-500';
}

function ThreadsAdBanner() { return <PageAdBanner />; }
export default function ThreadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('For You');

// ThreadsAdBanner is rendered below the tabs

  // ── SEO — dynamic title + ItemList JSON-LD from top 5 threads ─────────────
  const topThreads = threads.filter(t => t.views_count > 0).slice(0, 5);
  const threadsJsonLd = topThreads.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Trending Threads on Testagram',
    description: 'Top long-form articles and stories from creators on Testagram',
    url: 'https://testagram.site/threads',
    numberOfItems: topThreads.length,
    itemListElement: topThreads.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.title,
      url: `https://testagram.site/thread/${t.id}`,
      image: t.cover_image || undefined,
    })),
  } : undefined;
  useSEO({
    title: threads.length > 0
      ? `Threads — ${formatNumber(threads.length)} stories & articles`
      : 'Threads — Long-form Stories & Articles',
    description: 'Read long-form articles, stories, and opinion threads from creators on Testagram. Discover trending threads and start your own.',
    url: '/threads',
    type: 'website',
    keywords: 'threads, articles, long-form, stories, testagram, creator writing, opinion, trending',
    structuredData: threadsJsonLd,
  });

  const tabs = ['For You', 'Following', 'Trending', 'Reading List'];

  useEffect(() => {
    fetchThreads();
  }, [activeTab, user?.id]);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      // Reading List — fetch from thread_bookmarks
      if (activeTab === 'Reading List') {
        if (!user) { setThreads([]); setLoading(false); return; }
        const { data: bookmarks } = await supabase
          .from('thread_bookmarks')
          .select('thread_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        const bookmarkIds = (bookmarks ?? []).map((b: any) => b.thread_id).filter(Boolean);
        if (bookmarkIds.length === 0) { setThreads([]); setLoading(false); return; }
        const { data: savedData, error: savedErr } = await supabase
          .from('threads')
          .select(`id, user_id, title, content, cover_image, media_url, media_type,
            views_count, likes_count, reposts_count, replies_count, created_at,
            user_profiles (id, username, avatar_url, verified)`)
          .in('id', bookmarkIds)
          .eq('is_published', true);
        if (savedErr) throw savedErr;
        setThreads(savedData || []);
        setLoading(false);
        return;
      }

      let query = supabase
        .from('threads')
        .select(`
          id, user_id, title, content, cover_image, media_url, media_type,
          views_count, likes_count, reposts_count, replies_count, created_at,
          user_profiles (
            id, username, avatar_url, verified
          )
        `)
        .eq('is_published', true);

      if (activeTab === 'Following' && user) {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        const followingIds = follows?.map(f => f.following_id) || [];
        if (followingIds.length > 0) {
          query = query.in('user_id', followingIds);
        } else {
          setThreads([]);
          setLoading(false);
          return;
        }
      }

      query = query.order(activeTab === 'Trending' ? 'views_count' : 'created_at', { ascending: false });

      const { data, error } = await query.limit(50);
      if (error) throw error;

      setThreads(data || []);
    } catch (error) {
      console.error('Error fetching threads:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Threads" />
      <ThreadsAdBanner />

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 px-6 py-4 font-semibold transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* AdSense banner — between tabs and thread list */}
      <PageAdBanner />

      {/* Create Thread */}
      {user && (
        <div className="p-4 border-b border-border">
          <Button
            onClick={() => navigate('/threads/create')}
            className="w-full rounded-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Thread
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : activeTab === 'Reading List' && !user ? (
        <div className="text-center py-16 px-4">
          <Bookmark className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">Sign in to see your reading list</p>
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center py-12 px-4">
          {activeTab === 'Reading List'
            ? <Bookmark className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            : <TrendingUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />}
          <p className="text-muted-foreground">
            {activeTab === 'Following'
              ? 'No threads from people you follow'
              : activeTab === 'Reading List'
                ? 'No saved threads — bookmark threads to add them here'
                : 'No threads yet'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {threads.map((thread) => (
            <article
              key={thread.id}
              onClick={() => navigate(`/thread/${thread.id}`)}
              className={`p-4 hover:bg-muted/30 transition-colors cursor-pointer border-l-4 ${accentBorderClass(thread.content)} bg-background`}
            >
              {/* The self-invoking function inside map was incorrect syntax for JSX,
                  it should return JSX directly. The logic is moved outside or directly into the JSX. */}
              {(() => {
                const wordCount = thread.content.trim().split(/\s+/).length;
                const readTime = Math.max(1, Math.ceil(wordCount / 200));
                const previewText = stripMarkdown(thread.content).slice(0, 280);
                const hasVideo = !!(thread.media_url && thread.media_type === 'video');
                const hasImage = !!(thread.cover_image);
                return (
                  <>
                    {/* Author row */}
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0"
                        onClick={(e) => { e.stopPropagation(); navigate(`/profile/${thread.user_profiles.username}`); }}
                      >
                        {thread.user_profiles.avatar_url
                          ? <img src={thread.user_profiles.avatar_url} alt={thread.user_profiles.username} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center font-bold text-sm">{thread.user_profiles.username[0].toUpperCase()}</div>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm truncate">{thread.user_profiles.username}</span>
                          {thread.user_profiles.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" fill="currentColor" />}
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}</span>
                      </div>
                      {/* Reading List saved badge */}
                      {activeTab === 'Reading List' && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0 mr-1">
                          <Bookmark className="w-2.5 h-2.5" fill="currentColor" />Saved
                        </span>
                      )}
                      {/* Meta badges */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasVideo && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-600 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                            <Video className="w-2.5 h-2.5" />Video
                          </span>
                        )}
                        {!hasVideo && hasImage && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
                            <ImageIcon className="w-2.5 h-2.5" />Photo
                          </span>
                        )}
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                          <Clock className="w-2.5 h-2.5" />{readTime} min
                        </span>
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                          <BookOpen className="w-2.5 h-2.5" />{wordCount} words
                        </span>
                      </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-lg font-bold leading-snug mb-2">{thread.title}</h2>

                    {/* Content preview — plain text, no HTML injection */}
                    <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 mb-3">
                      {previewText}{previewText.length >= 280 ? '…' : ''}
                    </p>

                    {/* Media thumbnail */}
                    {hasVideo && thread.media_url && (
                      <div className="relative rounded-xl overflow-hidden mb-3 bg-black aspect-video max-h-48">
                        <video
                          src={thread.media_url}
                          className="w-full h-full object-cover opacity-80"
                          muted playsInline
                          onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                            <Video className="w-6 h-6 text-white" />
                          </div>
                        </div>
                      </div>
                    )}
                    {!hasVideo && hasImage && (
                      <img
                        src={thread.cover_image!}
                        alt={thread.title}
                        className="rounded-xl w-full max-h-56 object-cover mb-3"
                        loading="lazy"
                      />
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Heart className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">{formatNumber(thread.likes_count)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">{formatNumber(thread.replies_count ?? 0)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">{formatNumber(thread.views_count)} views</span>
                      </div>
                      <span className="ml-auto text-xs font-semibold text-primary hover:underline">Read →</span>
                    </div>
                  </>
                );
              })()}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
