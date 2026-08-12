import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { TrendingUp, Users, Hash, Radio, Sparkles, Plus, Check, RefreshCw, Trophy, Loader2, X } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { UserSuggestionsWidget } from '../features/UserSuggestionsWidget';
import { ContentSuggestionsWidget } from '../features/ContentSuggestionsWidget';
import { toast } from 'sonner';

interface TrendingHashtag {
  id: string;
  tag: string;
  usage_count: number;
  daily_posts: number;
  trend_score: number;
}

interface TrendingTopic {
  id: string;
  topic: string;
  category: string;
  posts_count: number;
}

interface Community {
  id: string;
  name: string;
  display_name: string;
  icon_url?: string;
  member_count: number;
}

interface Space {
  id: string;
  title: string;
  host_id: string;
  listener_count: number;
  is_live: boolean;
  user_profiles: {
    username: string;
    avatar_url?: string;
  };
}

interface LeaderboardEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  verified: boolean;
  weekly_earnings: number;
}

function CreatorLeaderboardWidget() {
  const navigate = useNavigate();
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaders = useCallback(async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data } = await supabase
      .from('creator_earnings')
      .select('user_id, amount')
      .gte('created_at', sevenDaysAgo)
      .eq('status', 'paid');

    if (!data) { setLoading(false); return; }

    // Aggregate by user
    const totals: { [uid: string]: number } = {};
    data.forEach(e => {
      totals[e.user_id] = (totals[e.user_id] ?? 0) + Number(e.amount);
    });
    const topIds = (Object.keys(totals) as string[])
      .sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0))
      .slice(0, 5);

    if (topIds.length === 0) { setLoading(false); return; }

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url, verified')
      .in('id', topIds);

    const merged: LeaderboardEntry[] = topIds.map(uid => {
      const p = profiles?.find(pr => pr.id === uid);
      return {
        user_id: uid,
        username: p?.username ?? 'Unknown',
        avatar_url: p?.avatar_url ?? null,
        verified: p?.verified ?? false,
        weekly_earnings: totals[uid],
      };
    });
    setLeaders(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeaders();
    const iv = setInterval(fetchLeaders, 60_000);
    return () => clearInterval(iv);
  }, [fetchLeaders]);

  if (loading || leaders.length === 0) return null;

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

  return (
    <div className="bg-gradient-to-br from-amber-500/8 to-orange-500/5 rounded-xl p-4 border border-amber-500/20">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-amber-500" />
        <h3 className="font-bold text-sm">Top Earners This Week</h3>
      </div>
      <div className="space-y-2">
        {leaders.map((entry, idx) => (
          <button
            key={entry.user_id}
            onClick={() => navigate(`/profile/${entry.username}`)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-muted/50 transition-colors text-left"
          >
            <span className="text-base shrink-0 w-5 text-center">{medals[idx]}</span>
            <div className="w-7 h-7 rounded-full bg-muted overflow-hidden shrink-0">
              {entry.avatar_url
                ? <img src={entry.avatar_url} alt={entry.username} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold">{entry.username[0]?.toUpperCase()}</div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">@{entry.username}</p>
            </div>
            <span className="text-xs font-bold text-green-600 shrink-0">${entry.weekly_earnings.toFixed(2)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RightSidebar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [trending, setTrending] = useState<TrendingTopic[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<TrendingHashtag[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [liveSpaces, setLiveSpaces] = useState<Space[]>([]);
  const [followedTags, setFollowedTags] = useState<Set<string>>(new Set());
  const [suggestedCommunity, setSuggestedCommunity] = useState<Community | null>(null);
  const [suggestedSpace, setSuggestedSpace] = useState<Space | null>(null);
  const [followedHashtags, setFollowedHashtags] = useState<any[]>([]);
  const [followedHashtagsLoading, setFollowedHashtagsLoading] = useState(false);

  const pickRandomSuggestions = useCallback((comms: Community[], spaces: Space[]) => {
    if (comms.length > 0) setSuggestedCommunity(comms[Math.floor(Math.random() * comms.length)]);
    if (spaces.length > 0) setSuggestedSpace(spaces[Math.floor(Math.random() * spaces.length)]);
  }, []);

  useEffect(() => {
    fetchTrending();
    fetchTrendingHashtags();
    fetchCommunities();
    fetchLiveSpaces();
    if (user) { fetchFollowedTags(); fetchFollowedHashtagsPanel(); }

    // Auto-refresh trending hashtags every 60s
    const iv = setInterval(fetchTrendingHashtags, 60_000);
    // Rotate suggestions every 30s
    const sv = setInterval(() => {
      pickRandomSuggestions(communities, liveSpaces);
    }, 30_000);
    return () => { clearInterval(iv); clearInterval(sv); };
  }, [user?.id]);

  const fetchFollowedHashtagsPanel = async () => {
    if (!user) return;
    setFollowedHashtagsLoading(true);
    const { data } = await supabase
      .from('hashtag_follows')
      .select('hashtag_id, hashtags(id, tag, usage_count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    setFollowedHashtags((data ?? []).map((d: any) => d.hashtags).filter(Boolean));
    setFollowedHashtagsLoading(false);
  };

  const unfollowHashtag = async (hashtagId: string, tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    await supabase.from('hashtag_follows').delete().eq('user_id', user.id).eq('hashtag_id', hashtagId);
    setFollowedHashtags(prev => prev.filter(h => h.id !== hashtagId));
    setFollowedTags(prev => { const s = new Set(prev); s.delete(hashtagId); return s; });
  };

  const fetchFollowedTags = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('hashtag_follows')
      .select('hashtag_id')
      .eq('user_id', user.id);
    if (data) setFollowedTags(new Set(data.map((r: any) => r.hashtag_id)));
  };

  const toggleTagFollow = async (tag: TrendingHashtag, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { navigate('/auth'); return; }
    const isFollowing = followedTags.has(tag.id);
    if (isFollowing) {
      await supabase.from('hashtag_follows').delete().eq('user_id', user.id).eq('hashtag_id', tag.id);
      setFollowedTags(prev => { const s = new Set(prev); s.delete(tag.id); return s; });
      toast.success(`Unfollowed #${tag.tag}`);
    } else {
      await supabase.from('hashtag_follows').insert({ user_id: user.id, hashtag_id: tag.id });
      setFollowedTags(prev => new Set([...prev, tag.id]));
      toast.success(`Following #${tag.tag}`);
    }
  };

  const fetchTrendingHashtags = async () => {
    const { data } = await supabase
      .from('trending_hashtags')
      .select('hashtag_id, trend_score, daily_posts, hashtags(id, tag, usage_count)')
      .order('trend_score', { ascending: false })
      .limit(8);
    if (data) {
      const tags = data
        .filter((row: any) => row.hashtags)
        .map((row: any) => ({
          id: row.hashtags.id,
          tag: row.hashtags.tag,
          usage_count: row.hashtags.usage_count ?? 0,
          daily_posts: row.daily_posts ?? 0,
          trend_score: row.trend_score ?? 0,
        }));
      setTrendingHashtags(tags);
    }
  };

  const fetchTrending = async () => {
    // Refresh trending from real posts
    await supabase.rpc('refresh_trending_topics');
    
    const { data } = await supabase
      .from('trending_topics')
      .select('*')
      .order('posts_count', { ascending: false })
      .limit(5);

    if (data) setTrending(data);
  };

  const fetchCommunities = async () => {
    const { data } = await supabase
      .from('communities')
      .select('*')
      .order('member_count', { ascending: false })
      .limit(10);
    if (data) {
      setCommunities(data);
      if (data.length > 0) setSuggestedCommunity(data[Math.floor(Math.random() * data.length)]);
    }
  };

  const fetchLiveSpaces = async () => {
    const { data } = await supabase
      .from('spaces')
      .select(`*, user_profiles (username, avatar_url)`)
      .eq('is_live', true)
      .order('listener_count', { ascending: false })
      .limit(5);
    if (data) {
      setLiveSpaces(data);
      if (data.length > 0) setSuggestedSpace(data[Math.floor(Math.random() * data.length)]);
    }
  };

  return (
    <aside className="hidden xl:block w-80 h-screen sticky top-0 p-4 space-y-4 overflow-y-auto">
      {/* Create Community */}
      <div className="bg-muted/50 rounded-xl p-4 border border-border">
        <h3 className="font-bold text-lg mb-3 flex items-center">
          <Users className="w-5 h-5 mr-2 text-primary" />
          Communities
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Create your own community to connect with like-minded people
        </p>
        <Button
          onClick={() => navigate('/communities')}
          className="w-full rounded-full"
          variant="outline"
        >
          <Plus className="w-4 h-4 mr-2" />
          Browse Communities
        </Button>
      </div>

      {/* ── Spotlight: Random Community Suggestion ── */}
      {suggestedCommunity && (
        <div className="bg-gradient-to-br from-blue-500/8 to-primary/5 rounded-xl p-4 border border-primary/15">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <Users className="w-4 h-4 text-primary" /> Community Spotlight
            </h3>
            <button onClick={() => setSuggestedCommunity(communities[Math.floor(Math.random() * communities.length)])}
              className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <button onClick={() => navigate(`/c/${suggestedCommunity.name}`)}
            className="w-full text-left flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
              {suggestedCommunity.icon_url
                ? <img src={suggestedCommunity.icon_url} alt={suggestedCommunity.display_name} className="w-full h-full object-cover" />
                : <span className="text-lg font-bold">{suggestedCommunity.display_name[0]}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{suggestedCommunity.display_name}</p>
              <p className="text-xs text-muted-foreground">{suggestedCommunity.member_count?.toLocaleString()} members</p>
              {suggestedCommunity.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{suggestedCommunity.description}</p>
              )}
            </div>
          </button>
          <button onClick={() => navigate(`/c/${suggestedCommunity.name}`)}
            className="mt-2 w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-colors">
            Join Community →
          </button>
        </div>
      )}

      {/* ── Spotlight: Random Space Suggestion ── */}
      {suggestedSpace && (
        <div className="bg-gradient-to-br from-red-500/8 to-orange-500/5 rounded-xl p-4 border border-red-500/15">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-red-500 animate-pulse" /> Space Spotlight
            </h3>
            <button onClick={() => liveSpaces.length > 0 && setSuggestedSpace(liveSpaces[Math.floor(Math.random() * liveSpaces.length)])}
              className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <button onClick={() => navigate('/spaces')}
            className="w-full text-left flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
              {suggestedSpace.user_profiles?.avatar_url
                ? <img src={suggestedSpace.user_profiles.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" />
                : <Radio className="w-6 h-6 text-red-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{suggestedSpace.title}</p>
              <p className="text-xs text-muted-foreground">by @{suggestedSpace.user_profiles?.username}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] text-red-500 font-bold">{suggestedSpace.listener_count} listening live</span>
              </div>
            </div>
          </button>
          <button onClick={() => navigate('/spaces')}
            className="mt-2 w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 text-xs font-bold rounded-xl transition-colors">
            Join Space →
          </button>
        </div>
      )}

      {/* Live Audio Spaces */}
      {liveSpaces.length > 0 && (
        <div className="bg-muted/50 rounded-xl p-4 border border-border">
          <h3 className="font-bold text-lg mb-3 flex items-center">
            <Radio className="w-5 h-5 mr-2 text-red-500 animate-pulse" />
            Live Spaces
          </h3>
          <div className="space-y-3">
            {liveSpaces.map((space) => (
              <button
                key={space.id}
                onClick={() => navigate('/spaces')}
                className="w-full text-left p-3 hover:bg-muted rounded-lg transition-colors"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <Radio className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{space.title}</p>
                    <p className="text-xs text-muted-foreground">
                      @{space.user_profiles.username}
                    </p>
                    <p className="text-xs text-red-500 font-medium mt-1">
                      🔴 {space.listener_count} listening
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <Button
            onClick={() => navigate('/spaces')}
            variant="outline"
            className="w-full mt-3 rounded-full"
          >
            View All Spaces
          </Button>
        </div>
      )}

      {/* ── Followed Hashtags Panel ── */}
      {user && (
        <div className="bg-gradient-to-br from-primary/8 to-primary/3 rounded-xl p-4 border border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-primary" />
              Followed Hashtags
            </h3>
            <button onClick={() => navigate('/hashtags')}
              className="text-xs text-primary font-semibold hover:underline transition-colors">
              Manage
            </button>
          </div>
          {followedHashtagsLoading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : followedHashtags.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground mb-2">No hashtags followed yet</p>
              <button onClick={() => navigate('/hashtags')}
                className="flex items-center justify-center gap-1 w-full py-2 border border-dashed border-primary/30 rounded-xl text-xs font-semibold text-primary hover:bg-primary/5 transition-colors">
                <Plus className="w-3 h-3" /> Discover hashtags
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {followedHashtags.map(h => (
                <div key={h.id} className="group flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/hashtag/${h.tag}`)}
                    className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted/60 transition-colors text-left min-w-0">
                    <Hash className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-primary truncate">#{h.tag}</span>
                    {h.usage_count > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                        {formatNumber(h.usage_count)}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={e => unfollowHashtag(h.id, h.tag, e)}
                    className="p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Unfollow">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button onClick={() => navigate('/hashtags')}
                className="w-full mt-1 py-1.5 text-xs text-primary font-semibold hover:bg-primary/5 rounded-lg transition-colors">
                + Discover more →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Trending Hashtags */}
      {trendingHashtags.length > 0 && (
        <div className="bg-muted/50 rounded-xl p-4 border border-border">
          <h3 className="font-bold text-lg mb-3 flex items-center justify-between">
            <span className="flex items-center">
              <Hash className="w-5 h-5 mr-2 text-primary" />
              Trending Tags
            </span>
            <span className="text-[10px] font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Live</span>
          </h3>
          <div className="space-y-1">
            {trendingHashtags.map((tag, i) => (
              <button
                key={tag.id}
                onClick={() => navigate(`/hashtag/${tag.tag}`)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                  <span className="text-sm font-semibold text-primary truncate">#{tag.tag}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="text-[10px] text-muted-foreground">
                    {formatNumber(tag.usage_count > 0 ? tag.usage_count : tag.daily_posts)} posts
                  </span>
                  <button
                    onClick={(e) => toggleTagFollow(tag, e)}
                    className={`p-1 rounded-full transition-colors ${
                      followedTags.has(tag.id)
                        ? 'bg-primary/10 text-primary'
                        : 'opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground'
                    }`}
                    title={followedTags.has(tag.id) ? 'Unfollow' : 'Follow'}
                  >
                    {followedTags.has(tag.id)
                      ? <Check className="w-3 h-3" />
                      : <Plus className="w-3 h-3" />
                    }
                  </button>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Trending Topics */}
      <div className="bg-muted/50 rounded-xl p-4 border border-border">
        <h3 className="font-bold text-lg mb-3 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2 text-primary" />
          Trending
        </h3>
        <div className="space-y-3">
          {trending.map((topic, index) => (
            <button
              key={topic.id}
              onClick={() => {
                if (topic.topic.startsWith('#')) {
                  navigate(`/hashtag/${topic.topic.substring(1)}`);
                } else {
                  navigate(`/trending/${encodeURIComponent(topic.topic)}`);
                }
              }}
              className="w-full text-left p-3 hover:bg-muted rounded-lg transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground mb-1">
                    <span className="font-bold">{index + 1}</span>
                    <span>·</span>
                    <span>{topic.category}</span>
                  </div>
                  <p className="font-bold text-sm">{topic.topic}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatNumber(topic.posts_count)} posts
                  </p>
                </div>
                <TrendingUp className="w-4 h-4 text-primary flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
        <Button
          onClick={() => navigate('/explore')}
          variant="ghost"
          className="w-full mt-3"
        >
          Show more
        </Button>
      </div>

      {/* Suggested Communities */}
      <div className="bg-muted/50 rounded-xl p-4 border border-border">
        <h3 className="font-bold text-lg mb-3 flex items-center">
          <Users className="w-5 h-5 mr-2 text-primary" />
          Popular Communities
        </h3>
        <div className="space-y-3">
          {communities.map((community) => (
            <button
              key={community.id}
              onClick={() => navigate(`/c/${community.name}`)}
              className="w-full text-left p-3 hover:bg-muted rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {community.icon_url ? (
                    <img
                      src={community.icon_url}
                      alt={community.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold">{community.display_name[0]}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{community.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(community.member_count)} members
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
        <Button
          onClick={() => navigate('/communities')}
          variant="ghost"
          className="w-full mt-3"
        >
          Show more
        </Button>
      </div>

      {/* User Suggestions */}
      <UserSuggestionsWidget />

      {/* Creator Leaderboard */}
      <CreatorLeaderboardWidget />

      {/* Content Suggestions */}
      <ContentSuggestionsWidget />

      {/* AI Features */}
      <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl p-4 border border-purple-500/20">
        <h3 className="font-bold text-lg mb-2 flex items-center">
          <Sparkles className="w-5 h-5 mr-2 text-purple-500" />
          AI-Powered
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Discover personalized content, trending topics, and smart recommendations
        </p>
        <Button
          onClick={() => navigate('/ai')}
          className="w-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Explore AI
        </Button>
      </div>

      {/* Footer Links */}
      <div className="text-xs text-muted-foreground px-4 space-y-2 pb-4">
        <div className="flex flex-wrap gap-2">
          <a href="#" className="hover:underline">Terms</a>
          <span>·</span>
          <a href="#" className="hover:underline">Privacy</a>
          <span>·</span>
          <a href="#" className="hover:underline">Help</a>
          <span>·</span>
          <a href="#" className="hover:underline">About</a>
        </div>
        <p>© 2025 T Social</p>
      </div>
    </aside>
  );
}
