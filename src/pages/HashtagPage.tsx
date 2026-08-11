import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { PostCard } from '@/components/features/PostCard';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { Post } from '@/types/app-types';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, TrendingUp, Check, Users } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useSEO, buildHashtagLD, buildOgImageUrl } from '@/hooks/useSEO';

export default function HashtagPage() {
  const { tag } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [hashtag, setHashtag] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<'recent' | 'top'>('recent');
  const [topPosts, setTopPosts] = useState<Post[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);

  useSEO({
    title: hashtag
      ? `#${tag} — ${formatNumber(hashtag.usage_count ?? posts.length)} posts on Testagram`
      : tag ? `#${tag} on Testagram` : 'Hashtag',
    description: hashtag
      ? `Browse ${hashtag.usage_count?.toLocaleString() ?? '0'} posts tagged with #${tag} on Testagram. Join the conversation and follow this hashtag to see it in your feed.`
      : `Posts tagged with #${tag} on Testagram.`,
    image: tag ? buildOgImageUrl({ tag }) : undefined,
    url: `/hashtag/${tag}`,
    type: 'website',
    keywords: `${tag}, #${tag}, testagram, trending, social media, hashtag, posts`,
    structuredData: hashtag ? buildHashtagLD(tag ?? '', hashtag.usage_count ?? 0) : undefined,
  });

  useEffect(() => {
    if (tag) {
      fetchHashtagAndPosts();
      if (user) {
        checkFollowStatus();
      }
    }


  }, [tag, user]);

  const fetchTopPosts = async (hashtagId: string) => {
    // Top posts: sorted by engagement in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('post_hashtags')
      .select('post_id, posts(*, user_profiles(*))')
      .eq('hashtag_id', hashtagId);
    if (!data) return;
    const allPosts = data.map((item: any) => item.posts).filter(Boolean);
    // Sort by engagement score (likes + reposts + replies)
    const sorted = [...allPosts].sort((a, b) => {
      const scoreA = (a.likes_count || 0) + (a.reposts_count || 0) + (a.replies_count || 0);
      const scoreB = (b.likes_count || 0) + (b.reposts_count || 0) + (b.replies_count || 0);
      return scoreB - scoreA;
    });
    setTopPosts(sorted);
  };

  const fetchHashtagAndPosts = async () => {
    try {
      const { data: hashtagData, error: hashtagError } = await supabase
        .from('hashtags')
        .select('*')
        .eq('tag', tag?.toLowerCase())
        .single();

      if (hashtagError) throw hashtagError;
      setHashtag(hashtagData);

      // Fetch follower count
      const { count: fCount } = await supabase.from('hashtag_follows').select('*', { count: 'exact', head: true }).eq('hashtag_id', hashtagData.id);
      setFollowerCount(fCount ?? 0);

      const { data: postsData, error: postsError } = await supabase
        .from('post_hashtags')
        .select('post_id, posts(*, user_profiles(*))')
        .eq('hashtag_id', hashtagData.id)
        .order('created_at', { ascending: false });

      if (postsError) throw postsError;
      const formattedPosts = (postsData || []).map((item: any) => item.posts).filter(Boolean);
      setPosts(formattedPosts);
      fetchTopPosts(hashtagData.id);
    } catch (error) {
      console.error('Error fetching hashtag data:', error);
      toast.error('Failed to load hashtag');
    } finally {
      setLoading(false);
    }
  };

  const checkFollowStatus = async () => {
    if (!user || !hashtag) return;
    const { data } = await supabase
      .from('hashtag_follows')
      .select('id')
      .eq('user_id', user.id)
      .eq('hashtag_id', hashtag.id)
      .maybeSingle();
    setIsFollowing(!!data);
  };

  const handleFollow = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!hashtag) return;
    setFollowLoading(true);
    if (isFollowing) {
      await supabase
        .from('hashtag_follows')
        .delete()
        .eq('user_id', user.id)
        .eq('hashtag_id', hashtag.id);
      setIsFollowing(false);
      setFollowerCount(c => Math.max(0, c - 1));
      toast.success(`Unfollowed #${tag}`);
    } else {
      await supabase.from('hashtag_follows').insert({
        user_id: user.id,
        hashtag_id: hashtag.id,
      });
      setIsFollowing(true);
      setFollowerCount(c => c + 1);
      toast.success(`Following #${tag} — posts will appear in your feed`);
    }
    setFollowLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hashtag) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar title={`#${tag}`} showBack />
        <div className="text-center py-12 text-muted-foreground">
          <p>Hashtag not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title={`#${tag}`} showBack />

      {/* Hashtag Header */}
      <div className="border-b border-border p-6 bg-gradient-to-br from-primary/10 to-primary/5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="w-6 h-6 text-primary" />
              <h1 className="text-3xl font-bold">#{tag}</h1>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span><strong className="text-foreground">{formatNumber(hashtag.usage_count)}</strong> posts</span>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <strong className="text-foreground">{formatNumber(followerCount)}</strong> followers
              </span>
            </div>
          </div>
          {user && (
            <Button
              onClick={handleFollow}
              variant={isFollowing ? 'outline' : 'default'}
              className="rounded-full px-6"
              disabled={followLoading}
            >
              {followLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isFollowing ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Following
                </>
              ) : (
                'Follow'
              )}
            </Button>
          )}
        </div>

        {isFollowing && (
          <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-sm text-foreground">
              ✓ You're following this hashtag. Posts with #{tag} will appear in your feed.
            </p>
          </div>
        )}
      </div>

      {/* AdSense banner — hashtag page */}
      <HashtagAdBanner />

      {/* Sort tabs */}
      <div className="border-b border-border flex">
        <button
          onClick={() => setSortMode('recent')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${sortMode === 'recent' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted/40'}`}
        >
          Recent
        </button>
        <button
          onClick={() => setSortMode('top')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${sortMode === 'top' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted/40'}`}
        >
          <TrendingUp className="w-4 h-4" /> Top Posts
        </button>
      </div>

      {/* Posts */}
      <div>
        {(sortMode === 'recent' ? posts : topPosts).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No posts found with this hashtag</p>
          </div>
        ) : (
          (sortMode === 'recent' ? posts : topPosts).map((post) => (
            <PostCard key={post.id} post={post} onUpdate={fetchHashtagAndPosts} />
          ))
        )}
      </div>
    </div>
  );
}

// ── AdSense banner — mounted once, push-guarded ──────────────────────────────────────────────────
function HashtagAdBanner() {
  const pushed = useRef(false);
  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch (_) {}
  }, []);
  return (
    <div className="px-4 py-3 border-b border-border bg-muted/5">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Sponsored</p>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: 60 }}
        data-ad-client="ca-pub-2458567543017441"
        data-ad-slot="2031881558"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
