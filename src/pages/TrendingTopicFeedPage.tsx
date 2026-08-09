import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { PostCard } from '@/components/features/PostCard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { TrendingUp, Hash, Users, Loader2, RefreshCw, CheckCircle } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';

export default function TrendingTopicFeedPage() {
  const { topic } = useParams<{ topic: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [topicData, setTopicData] = useState<any>(null);
  const [hashtagData, setHashtagData] = useState<any>(null);
  const [isFollowingHashtag, setIsFollowingHashtag] = useState(false);
  const [followingHashtag, setFollowingHashtag] = useState(false);
  const [postCount, setPostCount] = useState(0);

  const decodedTopic = decodeURIComponent(topic ?? '');

  const fetchTopic = useCallback(async () => {
    if (!decodedTopic) return;

    // Fetch trending_topics row
    const { data: td } = await supabase
      .from('trending_topics')
      .select('*')
      .eq('topic', decodedTopic)
      .maybeSingle();
    setTopicData(td ?? null);

    // Fetch hashtag record (for follow button)
    const cleanTag = decodedTopic.replace(/^#/, '');
    const { data: hd } = await supabase
      .from('hashtags')
      .select('*')
      .eq('tag', cleanTag)
      .maybeSingle();
    setHashtagData(hd ?? null);

    // Check if user follows this hashtag
    if (user && hd) {
      const { data: follow } = await supabase
        .from('hashtag_follows')
        .select('id')
        .eq('user_id', user.id)
        .eq('hashtag_id', hd.id)
        .maybeSingle();
      setIsFollowingHashtag(!!follow);
    }
  }, [decodedTopic, user]);

  const fetchPosts = useCallback(async () => {
    if (!decodedTopic) return;
    setRefreshing(true);
    try {
      // Fetch posts matching topic by content (last 7 days), sorted by engagement
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, count } = await supabase
        .from('posts')
        .select('*, user_profiles(*)', { count: 'exact' })
        .ilike('content', `%${decodedTopic.replace(/^#/, '')}%`)
        .gte('created_at', sevenDaysAgo)
        .order('likes_count', { ascending: false })
        .limit(40);

      if (data) {
        // Sort by combined engagement (likes + reposts) client-side for precision
        const sorted = [...data].sort(
          (a, b) => (b.likes_count + b.reposts_count) - (a.likes_count + a.reposts_count)
        );
        setPosts(sorted);
        setPostCount(count ?? data.length);
      }
    } catch (e) {
      console.error('fetchPosts error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [decodedTopic]);

  useEffect(() => {
    fetchTopic();
    fetchPosts();
  }, [fetchTopic, fetchPosts]);

  const handleFollowHashtag = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!hashtagData) {
      toast.error('Hashtag not found');
      return;
    }
    setFollowingHashtag(true);
    try {
      if (isFollowingHashtag) {
        await supabase.from('hashtag_follows')
          .delete()
          .eq('user_id', user.id)
          .eq('hashtag_id', hashtagData.id);
        setIsFollowingHashtag(false);
        toast.success(`Unfollowed #${hashtagData.tag}`);
      } else {
        await supabase.from('hashtag_follows')
          .insert({ user_id: user.id, hashtag_id: hashtagData.id });
        setIsFollowingHashtag(true);
        toast.success(`Following #${hashtagData.tag}!`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setFollowingHashtag(false);
    }
  };

  const categoryColor: Record<string, string> = {
    technology:  'bg-blue-500/10 text-blue-600 border-blue-500/20',
    sports:      'bg-green-500/10 text-green-600 border-green-500/20',
    politics:    'bg-red-500/10 text-red-600 border-red-500/20',
    entertainment: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    business:    'bg-amber-500/10 text-amber-600 border-amber-500/20',
    health:      'bg-teal-500/10 text-teal-600 border-teal-500/20',
  };
  const catCls = topicData?.category ? (categoryColor[topicData.category] ?? 'bg-primary/10 text-primary border-primary/20') : 'bg-primary/10 text-primary border-primary/20';

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Trending" showBack />

      {/* Hero header */}
      <div className="px-4 pt-4 pb-3 border-b border-border bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold truncate">{decodedTopic}</h1>
                {topicData?.category && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${catCls}`}>
                    {topicData.category}
                  </span>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mt-2 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Hash className="w-3.5 h-3.5" />
                <span className="font-semibold text-foreground">{formatNumber(postCount)}</span>
                <span>posts</span>
              </div>
              {topicData?.posts_count != null && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="font-semibold text-foreground">{formatNumber(topicData.posts_count)}</span>
                  <span>total</span>
                </div>
              )}
              {hashtagData?.usage_count != null && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  <span className="font-semibold text-foreground">{formatNumber(hashtagData.usage_count)}</span>
                  <span>uses</span>
                </div>
              )}
            </div>
          </div>

          {/* Follow hashtag button */}
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <button
              onClick={() => fetchPosts()}
              disabled={refreshing}
              className="p-2 rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {hashtagData && (
              <button
                onClick={handleFollowHashtag}
                disabled={followingHashtag}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all ${
                  isFollowingHashtag
                    ? 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20'
                    : 'bg-primary text-primary-foreground hover:opacity-90'
                }`}
              >
                {followingHashtag
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : isFollowingHashtag
                    ? <><CheckCircle className="w-3.5 h-3.5" />Following</>
                    : <>+ Follow</>}
              </button>
            )}
          </div>
        </div>

        {/* Live post count badge */}
        <div className="mt-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-muted-foreground font-medium">
            Showing top posts from the last 7 days · sorted by engagement
          </span>
        </div>
      </div>

      {/* Post feed */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground px-6 text-center">
          <Hash className="w-16 h-16 mb-4 opacity-20" />
          <p className="font-bold text-lg mb-1">No posts yet</p>
          <p className="text-sm">No posts found for "{decodedTopic}" in the last 7 days.</p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-semibold text-sm hover:opacity-90"
          >
            Go Home
          </button>
        </div>
      ) : (
        <div>
          {posts.map((post, idx) => (
            <div key={post.id} className="relative">
              {/* Rank indicator for top 3 */}
              {idx < 3 && (
                <div className="flex items-center gap-2 px-4 pt-2 pb-0 text-xs font-bold">
                  <span className={idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-slate-400' : 'text-amber-600'}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} #{idx + 1} most engaged
                  </span>
                  <span className="text-muted-foreground font-normal">
                    · {formatNumber(post.likes_count + post.reposts_count)} reactions
                  </span>
                </div>
              )}
              <PostCard post={post} onUpdate={fetchPosts} />
            </div>
          ))}
          <div className="py-8 text-center text-sm text-muted-foreground">
            Showing top {posts.length} posts for "{decodedTopic}"
          </div>
        </div>
      )}
    </div>
  );
}
