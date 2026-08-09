import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Input } from '@/components/ui/input';
import { Search, TrendingUp, Hash } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TrendingTopic } from '@/types';
import { PostCard } from '@/components/features/PostCard';
import { formatNumber } from '@/lib/utils';
import { usePageBanner } from '@/hooks/usePageBanner';
import { ADMOB_CONFIG } from '@/lib/admob';
import { BannerAdPosition } from '@capacitor-community/admob';

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('For You');
  const [trending, setTrending] = useState<TrendingTopic[]>([]);
  const [rankedPosts, setRankedPosts] = useState<any[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const tabs = ['For You', 'Trending', 'News', 'Sports', 'Entertainment'];

  // Explore page banner — ADMOB_CONFIG.BANNER_EXPLORE, positioned above bottom nav
  usePageBanner({
    adId: ADMOB_CONFIG.BANNER_EXPLORE,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 64,
    delay: 2000,
  });

  useEffect(() => {
    fetchTrending();
    fetchRankedContent();
    fetchTrendingHashtags();
  }, [activeTab]);

  const fetchTrending = async () => {
    setLoading(true);
    try {
      await supabase.rpc('refresh_trending_topics');
      const { data, error } = await supabase
        .from('trending_topics')
        .select('*')
        .order('posts_count', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTrending(data || []);
    } catch (error) {
      console.error('Error fetching trending:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRankedContent = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('posts')
        .select(`*, user_profiles (*)`)
        .order('likes_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30);

      setRankedPosts(data || []);
    } catch (error) {
      console.error('Error fetching ranked content:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendingHashtags = async () => {
    try {
      const { data } = await supabase
        .from('trending_hashtags')
        .select(`*, hashtags (*)`)
        .order('trend_score', { ascending: false })
        .limit(20);

      if (data) {
        setTrendingHashtags(data.map((t: any) => t.hashtags).filter(Boolean));
      }
    } catch (error) {
      console.error('Error fetching trending hashtags:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const filteredTrending = activeTab === 'For You'
    ? trending.slice(0, 20)
    : activeTab === 'Trending'
      ? trending.slice(0, 20)
      : trending.filter((t) => t.category.toLowerCase() === activeTab.toLowerCase()).slice(0, 20);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-20">
      <TopBar title="Explore" showProfile={false} />

      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <form onSubmit={handleSearch} className="p-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search T"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-11 rounded-full bg-muted border-0 focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </form>

        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 px-4 py-4 font-semibold transition-colors border-b-2 whitespace-nowrap ${
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

      <div>
        {activeTab === 'For You' && (
          <>
            {trendingHashtags.length > 0 && (
              <div className="border-b border-border">
                <div className="p-4 bg-muted/30">
                  <h2 className="font-bold text-lg flex items-center gap-2">
                    <Hash className="w-5 h-5" />
                    Trending Hashtags
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4">
                  {trendingHashtags.slice(0, 6).map((hashtag: any) => (
                    <button
                      key={hashtag.id}
                      onClick={() => navigate(`/hashtag/${hashtag.tag}`)}
                      className="p-3 border border-border rounded-xl hover:bg-muted/50 text-left transition-colors"
                    >
                      <p className="font-bold text-primary">#{hashtag.tag}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(hashtag.usage_count)} posts
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {rankedPosts.length > 0 && (
              <div>
                <div className="p-4 bg-muted/30 border-b border-border">
                  <h2 className="font-bold text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Top Posts
                  </h2>
                </div>
                {rankedPosts.map((post) => (
                  <PostCard key={post.id} post={post} onUpdate={fetchRankedContent} />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab !== 'For You' && (
          <div className="divide-y divide-border">
            {filteredTrending.length > 0 ? (
              filteredTrending.map((topic, index) => (
                <div
                  key={topic.id}
                  className="p-4 hover:bg-muted/5 cursor-pointer transition-colors"
                  onClick={() => {
                    if (topic.topic.startsWith('#')) {
                      navigate(`/hashtag/${topic.topic.substring(1)}`);
                    } else {
                      navigate(`/search?q=${encodeURIComponent(topic.topic)}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 text-muted-foreground text-sm">
                        <span className="font-semibold">{index + 1}</span>
                        <span>·</span>
                        <span>{topic.category}</span>
                        {activeTab === 'Trending' && <span>· Trending</span>}
                      </div>
                      <h3 className="font-bold text-foreground mt-1 text-lg">{topic.topic}</h3>
                      <p className="text-muted-foreground text-sm mt-1">
                        {topic.posts_count.toLocaleString()} posts
                      </p>
                    </div>
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-semibold text-lg mb-2">No {activeTab.toLowerCase()} topics</p>
                <p className="text-sm">Check back later</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
