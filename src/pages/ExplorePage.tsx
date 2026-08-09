import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Input } from '@/components/ui/input';
import { Search, TrendingUp, Globe, BadgeCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { usePageBanner } from '@/hooks/usePageBanner';
import { ADMOB_CONFIG } from '@/lib/admob';
import { BannerAdPosition } from '@/lib/capacitor-stub';

type ExploreTab = 'Explore' | 'Trending' | 'News' | 'Sports' | 'Entertainment';

export default function ExplorePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ExploreTab>('Explore');
  const [trending, setTrending] = useState<any[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<any[]>([]);
  const [whoToFollow, setWhoToFollow] = useState<any[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const tabs: ExploreTab[] = ['Explore', 'Trending', 'News', 'Sports', 'Entertainment'];

  usePageBanner({
    adId: ADMOB_CONFIG.BANNER_EXPLORE,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 64,
    delay: 2000,
  });

  useEffect(() => {
    fetchData();
  }, [activeTab, user?.id]);

  const fetchData = async () => {
    setLoading(true);
    await supabase.rpc('refresh_trending_topics').catch(() => {});

    const [trendingRes, hashtagRes, whoRes] = await Promise.all([
      supabase
        .from('trending_topics')
        .select('*')
        .order('posts_count', { ascending: false })
        .limit(50),
      supabase
        .from('trending_hashtags')
        .select('hashtag_id, trend_score, daily_posts, hashtags(id, tag, usage_count)')
        .order('trend_score', { ascending: false })
        .limit(20),
      supabase
        .from('user_profiles')
        .select('*')
        .order('followers_count', { ascending: false })
        .limit(10),
    ]);

    setTrending(trendingRes.data ?? []);

    if (hashtagRes.data) {
      setTrendingHashtags(
        hashtagRes.data
          .filter((r: any) => r.hashtags)
          .map((r: any) => ({ ...r.hashtags, daily_posts: r.daily_posts }))
      );
    }

    if (whoRes.data) {
      let suggestions = whoRes.data;
      if (user) suggestions = suggestions.filter((u: any) => u.id !== user.id);
      setWhoToFollow(suggestions.slice(0, 5));
    }

    if (user) {
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);
      if (follows) setFollowingIds(new Set(follows.map((f: any) => f.following_id)));
    }

    setLoading(false);
  };

  const handleFollow = async (profileId: string, username: string) => {
    if (!user) { navigate('/auth'); return; }
    const isFollowing = followingIds.has(profileId);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', profileId);
      setFollowingIds(prev => { const s = new Set(prev); s.delete(profileId); return s; });
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: profileId });
      setFollowingIds(prev => new Set([...prev, profileId]));
      await supabase.from('notifications').insert({ user_id: profileId, type: 'follow', from_user_id: user.id }).catch(() => {});
      toast.success(`Following @${username}!`);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const navigateTopic = (topic: string) =>
    topic.startsWith('#')
      ? navigate(`/hashtag/${topic.slice(1)}`)
      : navigate(`/search?q=${encodeURIComponent(topic)}`);

  const getFilteredTrending = () => {
    if (activeTab === 'Explore' || activeTab === 'Trending') return trending;
    return trending.filter(t => t.category?.toLowerCase() === activeTab.toLowerCase());
  };

  const newsItems = trending
    .filter(t => ['news', 'entertainment', 'sports', 'politics'].includes((t.category ?? '').toLowerCase()))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <TopBar title="Explore" showProfile={false} />

      {/* ── Sticky Search + Tabs ────────────────────────────────────────────── */}
      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <form onSubmit={handleSearch} className="px-3 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search Tsocial"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 rounded-full bg-muted/80 border-0 focus-visible:ring-1 focus-visible:ring-primary text-sm"
            />
          </div>
        </form>
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 px-5 py-3 font-semibold transition-colors border-b-2 whitespace-nowrap text-sm ${
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

      {/* ── Explore Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'Explore' && (
        <div>
          {/* Today's News */}
          {newsItems.length > 0 && (
            <section className="border-b border-border">
              <div className="px-4 pt-4 pb-2">
                <h2 className="font-bold text-xl">Today's News</h2>
              </div>
              <div className="divide-y divide-border">
                {newsItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigateTopic(item.topic)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-base leading-snug">{item.topic}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      · {item.category} · {formatNumber(item.posts_count)} posts
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Trending Topics numbered list */}
          {trending.length > 0 && (
            <section className="border-b border-border">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <h2 className="font-bold text-xl">Trending</h2>
              </div>
              <div className="divide-y divide-border">
                {trending.slice(0, 10).map((topic, i) => (
                  <button
                    key={topic.id}
                    onClick={() => navigateTopic(topic.topic)}
                    className="w-full text-left px-4 py-3.5 hover:bg-muted/30 transition-colors flex items-start justify-between group"
                  >
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {i + 1} · Trending · {topic.category}
                      </p>
                      <p className="font-bold text-base mt-0.5">{topic.topic}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatNumber(topic.posts_count)} posts
                      </p>
                    </div>
                    <span className="text-muted-foreground/50 text-lg leading-none mt-1 group-hover:text-muted-foreground transition-colors">···</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Who to follow */}
          {whoToFollow.length > 0 && (
            <section className="border-b border-border">
              <div className="px-4 pt-4 pb-2">
                <h2 className="font-bold text-xl">Who to follow</h2>
              </div>
              <div className="divide-y divide-border">
                {whoToFollow.map((profile) => (
                  <div key={profile.id} className="px-4 py-3 flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-full bg-muted overflow-hidden flex-shrink-0 cursor-pointer"
                      onClick={() => navigate(`/profile/${profile.username}`)}
                    >
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                          {profile.username[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => navigate(`/profile/${profile.username}`)}
                    >
                      <div className="flex items-center gap-1">
                        <p className="font-bold text-sm truncate">{profile.username}</p>
                        {profile.verified && (
                          <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" fill="currentColor" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {profile.bio ? profile.bio.slice(0, 50) : `@${profile.username}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleFollow(profile.id, profile.username)}
                      className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                        followingIds.has(profile.id)
                          ? 'border border-border hover:bg-muted'
                          : 'bg-foreground text-background hover:opacity-90'
                      }`}
                    >
                      {followingIds.has(profile.id) ? 'Following' : 'Follow'}
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate('/discover')}
                className="w-full px-4 py-3.5 text-sm text-primary hover:bg-muted/30 transition-colors text-left font-medium"
              >
                Show more
              </button>
            </section>
          )}

          {/* Trending Hashtags grid */}
          {trendingHashtags.length > 0 && (
            <section className="border-b border-border p-4">
              <h2 className="font-bold text-xl mb-3">Trending Hashtags</h2>
              <div className="grid grid-cols-2 gap-2">
                {trendingHashtags.slice(0, 8).map((tag: any) => (
                  <button
                    key={tag.id}
                    onClick={() => navigate(`/hashtag/${tag.tag}`)}
                    className="p-3 border border-border rounded-xl hover:bg-muted/50 text-left transition-colors"
                  >
                    <p className="font-bold text-primary text-sm">#{tag.tag}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatNumber(tag.usage_count)} posts
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Trending Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'Trending' && (
        <div>
          {/* Global Trending hero banner */}
          <div className="relative overflow-hidden border-b border-border mx-4 my-4 rounded-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-indigo-900 to-purple-900" />
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_50%_0%,rgba(100,200,255,0.4),transparent_70%)]" />
            <div className="relative px-5 py-8 flex items-end justify-between">
              <div>
                <h2 className="text-white text-2xl font-bold leading-tight">Global Trending</h2>
                <p className="text-white/70 text-sm mt-1 mb-3">The most popular posts</p>
                <button
                  onClick={() => navigate('/')}
                  className="px-5 py-2 border border-white/60 text-white text-sm font-semibold rounded-full hover:bg-white/15 transition-colors"
                >
                  Explore
                </button>
              </div>
              <Globe className="w-20 h-20 text-white/10 flex-shrink-0" />
            </div>
          </div>

          <div className="divide-y divide-border">
            {trending.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">No trending topics yet</p>
                <p className="text-sm mt-1">Check back soon</p>
              </div>
            ) : trending.map((topic, i) => (
              <button
                key={topic.id}
                onClick={() => navigateTopic(topic.topic)}
                className="w-full text-left px-4 py-3.5 hover:bg-muted/30 transition-colors flex items-start justify-between group"
              >
                <div>
                  <p className="text-xs text-muted-foreground">
                    {i + 1} · Trending in {topic.category}
                  </p>
                  <p className="font-bold text-base mt-0.5">{topic.topic}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatNumber(topic.posts_count)} posts
                  </p>
                </div>
                <span className="text-muted-foreground/50 text-lg leading-none mt-1 group-hover:text-muted-foreground transition-colors">···</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Category Tabs (News / Sports / Entertainment) ──────────────────── */}
      {(['News', 'Sports', 'Entertainment'] as ExploreTab[]).includes(activeTab) && (
        <div>
          {getFilteredTrending().length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-semibold">No {activeTab} trends yet</p>
              <p className="text-sm mt-1">Check back soon</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {getFilteredTrending().map((topic, i) => (
                <button
                  key={topic.id}
                  onClick={() => navigateTopic(topic.topic)}
                  className="w-full text-left px-4 py-3.5 hover:bg-muted/30 transition-colors flex items-start justify-between group"
                >
                  <div>
                    <p className="text-xs text-muted-foreground">{i + 1} · {activeTab}</p>
                    <p className="font-bold text-base mt-0.5">{topic.topic}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatNumber(topic.posts_count)} posts
                    </p>
                  </div>
                  <span className="text-muted-foreground/50 text-lg leading-none mt-1 group-hover:text-muted-foreground transition-colors">···</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
