import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Hash, Search, TrendingUp, Check, Plus, Loader2, X, Flame, Users, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { useSEO } from '@/hooks/useSEO';
import { PageAdBanner } from '@/components/features/AdSenseAd';

function HashtagDiscoveryAdBanner() { return <PageAdBanner />; }

const SEARCH_DEBOUNCE_MS = 350;

export default function HashtagDiscoveryPage() {
  useSEO({ title: 'Hashtag Discovery', url: '/hashtags', noindex: true });
  const { user } = useAuth();
  const navigate = useNavigate();

  const [followedHashtags, setFollowedHashtags] = useState<any[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  // Fetch followed hashtags + trending
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [followRes, trendRes] = await Promise.all([
        user
          ? supabase.from('hashtag_follows')
              .select('hashtag_id, hashtags(id, tag, usage_count)')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(100)
          : Promise.resolve({ data: [] }),
        supabase.from('trending_hashtags')
          .select('trend_score, hourly_posts, daily_posts, hashtags(id, tag, usage_count)')
          .order('trend_score', { ascending: false })
          .limit(30),
      ]);
      const followed = ((followRes as any).data ?? []).map((f: any) => f.hashtags).filter(Boolean);
      setFollowedHashtags(followed);
      setFollowedIds(followed.map((h: any) => h.id));
      setTrendingHashtags(
        ((trendRes.data ?? []) as any[])
          .filter((r: any) => r.hashtags)
          .map((r: any) => ({ ...r.hashtags, trend_score: r.trend_score, hourly_posts: r.hourly_posts, daily_posts: r.daily_posts }))
      );
      setLoading(false);
    };
    load();
  }, [user?.id]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const clean = q.replace(/^#/, '').toLowerCase();
    const { data } = await supabase.from('hashtags')
      .select('id, tag, usage_count')
      .ilike('tag', `${clean}%`)
      .order('usage_count', { ascending: false })
      .limit(20);
    setSearchResults(data ?? []);
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const toggleFollow = async (tag: string, hashtagId: string) => {
    if (!user) { navigate('/auth'); return; }
    setActionLoading(hashtagId);
    const isFollowing = followedIds.includes(hashtagId);
    if (isFollowing) {
      await supabase.from('hashtag_follows').delete().eq('user_id', user.id).eq('hashtag_id', hashtagId);
      setFollowedIds(prev => prev.filter(id => id !== hashtagId));
      setFollowedHashtags(prev => prev.filter(h => h.id !== hashtagId));
      toast.success(`Unfollowed #${tag}`);
    } else {
      await supabase.from('hashtag_follows').insert({ user_id: user.id, hashtag_id: hashtagId });
      setFollowedIds(prev => [...prev, hashtagId]);
      const htData = trendingHashtags.find(h => h.id === hashtagId)
        ?? searchResults.find(h => h.id === hashtagId)
        ?? { id: hashtagId, tag, usage_count: 0 };
      setFollowedHashtags(prev => [htData, ...prev]);
      toast.success(`Following #${tag}!`);
    }
    setActionLoading('');
  };

  const unfollowAll = async () => {
    if (!user || followedHashtags.length === 0) return;
    if (!window.confirm(`Unfollow all ${followedHashtags.length} hashtags?`)) return;
    await supabase.from('hashtag_follows').delete().eq('user_id', user.id);
    setFollowedHashtags([]);
    setFollowedIds([]);
    toast.success('Unfollowed all hashtags');
  };

  const displayList = query.trim() ? searchResults : trendingHashtags;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Hashtag Discovery" showBack />
      <HashtagDiscoveryAdBanner />

      {/* Search bar */}
      <div className="sticky top-14 z-20 bg-background border-b border-border px-4 py-3">
        <div className="relative">
          {searching
            ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
            : <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />}
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search hashtags…"
            className="w-full pl-10 pr-10 py-2.5 bg-muted/50 border border-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-colors"
          />
          {query && (
            <button onClick={() => { setQuery(''); setSearchResults([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto">

        {/* ── Followed Hashtags section ── */}
        {!query && (
          <section className="border-b border-border">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                <h2 className="font-bold text-sm">
                  Following
                  {followedHashtags.length > 0 && (
                    <span className="ml-1.5 text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      {followedHashtags.length}
                    </span>
                  )}
                </h2>
              </div>
              {followedHashtags.length > 0 && (
                <button onClick={unfollowAll} className="text-xs text-muted-foreground hover:text-destructive transition-colors font-medium">
                  Unfollow all
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : followedHashtags.length === 0 ? (
              <div className="text-center py-8 px-6 text-muted-foreground">
                <Hash className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">No hashtags followed yet</p>
                <p className="text-xs mt-1">Follow hashtags below to see posts from them in your feed</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 px-4 pb-4">
                {followedHashtags.map((h: any) => (
                  <div key={h.id} className="group flex items-center gap-1 pl-3 pr-1 py-1.5 rounded-full bg-primary/10 border border-primary/25 hover:border-primary/40 transition-colors">
                    <button onClick={() => navigate(`/hashtag/${h.tag}`)}
                      className="flex items-center gap-1 text-primary text-sm font-bold hover:underline">
                      <Hash className="w-3.5 h-3.5" />{h.tag}
                      {h.usage_count > 0 && <span className="text-[10px] text-primary/60 font-normal">{formatNumber(h.usage_count)}</span>}
                    </button>
                    <button onClick={() => toggleFollow(h.tag, h.id)} disabled={actionLoading === h.id}
                      className="w-6 h-6 rounded-full bg-primary/15 hover:bg-destructive/20 hover:text-destructive text-primary flex items-center justify-center transition-colors ml-1">
                      {actionLoading === h.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Trending / Search results ── */}
        <section>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            {query ? <Search className="w-4 h-4 text-primary" /> : <Flame className="w-4 h-4 text-orange-500" />}
            <h2 className="font-bold text-sm">{query ? `Results for "${query}"` : 'Trending Hashtags'}</h2>
            {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto" />}
          </div>

          {displayList.length === 0 && !loading && !searching ? (
            <div className="text-center py-12 text-muted-foreground">
              <Hash className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">{query ? 'No hashtags found' : 'No trending hashtags yet'}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {displayList.map((h: any, idx: number) => {
                const isFollowing = followedIds.includes(h.id);
                return (
                  <div key={h.id}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors">
                    {/* Rank */}
                    {!query && (
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black text-sm ${
                        idx === 0 ? 'bg-orange-500 text-white' :
                        idx === 1 ? 'bg-amber-400 text-white' :
                        idx === 2 ? 'bg-yellow-300 text-yellow-900' :
                        'bg-muted text-muted-foreground'
                      }`}>{idx + 1}</div>
                    )}
                    {/* Hashtag info */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/hashtag/${h.tag}`)}>
                      <div className="flex items-center gap-1.5">
                        <Hash className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-bold text-sm">{h.tag}</span>
                        {!query && h.trend_score > 50 && (
                          <TrendingUp className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" />{formatNumber(h.usage_count ?? 0)} posts
                        </span>
                        {h.daily_posts > 0 && (
                          <span className="text-xs text-orange-500 font-semibold">
                            +{formatNumber(h.daily_posts)}/day
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Follow / Unfollow button */}
                    {user && (
                      <button
                        onClick={() => toggleFollow(h.tag, h.id)}
                        disabled={actionLoading === h.id}
                        className={`flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold border-2 transition-all shrink-0 disabled:opacity-50 ${
                          isFollowing
                            ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                            : 'border-primary text-primary hover:bg-primary hover:text-primary-foreground'
                        }`}
                      >
                        {actionLoading === h.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : isFollowing ? <><Check className="w-3 h-3" />Following</> : <><Plus className="w-3 h-3" />Follow</>}
                      </button>
                    )}
                    {!user && (
                      <button onClick={() => navigate('/auth')}
                        className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors shrink-0">
                        <Plus className="w-3 h-3" />Follow
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
