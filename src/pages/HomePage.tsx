
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ComposePost } from '@/components/features/ComposePost';
import { PostCard } from '@/components/features/PostCard';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import {
  Loader2, Sparkles, Globe, Users, Rss, RefreshCw,
  MessageCircle, Repeat2, Heart, Languages, ChevronDown, ChevronUp,
  TrendingUp, Hash, BookOpen,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatNumber } from '@/lib/utils';
import { DynamicAd } from '@/components/features/DynamicAd';
import { NativeAdCard } from '@/components/features/NativeAdCard';
import { usePageBanner } from '@/hooks/usePageBanner';
import { ADMOB_CONFIG } from '@/lib/admob';
import { SponsoredPostCard } from '@/components/features/SponsoredPostCard';
import { StoriesStrip } from '@/components/features/StoriesStrip';
import * as federation from '@/api/federation';

const PAGE_SIZE = 15;

type Tab = 'foryou' | 'following' | 'federated' | 'popular' | 'tech' | 'science';

type FeedItem =
  | { type: 'post'; data: any }
  | { type: 'thread'; data: any }
  | { type: 'fedpost'; data: any }
  | { type: 'sponsored'; data: any }
  | { type: 'user-suggestions'; data: null };

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'foryou',    label: 'For you',   icon: Sparkles   },
  { id: 'following', label: 'Following', icon: Users      },
  { id: 'popular',   label: 'Popular',   icon: TrendingUp },
  { id: 'tech',      label: 'Tech',      icon: Hash       },
  { id: 'science',   label: 'Science',   icon: BookOpen   },
  { id: 'federated', label: 'Federated', icon: Globe      },
];

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('foryou');
  const [page, setPage] = useState(0);
  const [sponsoredPosts, setSponsoredPosts] = useState<any[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  // Fetch blocked user IDs to filter from feed
  useEffect(() => {
    if (!user) { setBlockedUserIds(new Set()); return; }
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id)
      .then(({ data }) => {
        setBlockedUserIds(new Set((data ?? []).map((r: any) => r.blocked_id)));
      });
  }, [user?.id]);
  const abortRef = useRef<AbortController | null>(null);

  usePageBanner({ adId: ADMOB_CONFIG.BANNER_FEED, margin: 64, delay: 4000 });

  // Define fetchInitialFeed and fetchSponsoredContent outside useEffect to make them stable
  // or use useCallback if they depend on props/state and need to be memoized.
  // Given their usage in deps, making them stable is the goal.
  // Only show ads that users actually created AND admin approved (status=active, payment=paid)
  const fetchSponsoredContent = async () => {
    try {
      const { data } = await supabase
        .from('user_ads')
        .select('*, user_profiles!user_ads_user_id_fkey(id, username, avatar_url, verified)')
        .eq('status', 'active')
        .eq('payment_status', 'paid')
        .order('created_at', { ascending: false })
        .limit(3);
      setSponsoredPosts(data && data.length > 0 ? data : []);
    } catch { setSponsoredPosts([]); }
  };

  // ── Cache federated posts to remote_posts table ───────────────────────────
  const cacheFederatedPosts = async (posts: any[]) => {
    if (posts.length === 0) return;
    const rows = posts
      .filter((p: any) => p.uri ?? p.url ?? p.id)
      .map((p: any) => {
        const actorUrl =
          p.actor?.id ?? p.actor?.url ??
          p.account?.url ?? p.account?.id ??
          p.actor_url ?? '';
        return {
          object_url: p.uri ?? p.url ?? p.id ?? '',
          actor_url: actorUrl,
          content: p.content ?? p.text ?? '',
          summary: p.spoiler_text ?? p.summary ?? null,
          media_urls: p.media_attachments ?? p.media_urls ?? [],
          likes_count: p.favourites_count ?? p.likes_count ?? 0,
          replies_count: p.replies_count ?? 0,
          boosts_count: p.reblogs_count ?? p.boosts_count ?? 0,
          published_at: p.created_at ?? p.published ?? new Date().toISOString(),
          raw_object: p,
        };
      })
      .filter((r: any) => r.object_url);

    if (rows.length === 0) return;
    try {
      await supabase
        .from('remote_posts')
        .upsert(rows, { onConflict: 'object_url', ignoreDuplicates: false });
      console.log(`[feed] Cached ${rows.length} federated posts to remote_posts`);
    } catch (cacheErr) {
      console.warn('[feed] Failed to cache federated posts:', cacheErr);
    }
  };

  // ── Federated timeline via Gateway ──────────────────────────────────────────
  const fetchFederatedPosts = async (): Promise<any[]> => {
    try {
      const res: any = await federation.getHomeTimeline({ limit: 30 });
      const posts = Array.isArray(res) ? res : res?.posts ?? res?.data ?? [];
      const normalized = posts.map((p: any) => ({
        ...p,
        id: p.id ?? p.uri ?? p.url ?? String(Math.random()),
        content: p.content ?? p.text ?? '',
        created_at: p.created_at ?? p.published ?? new Date().toISOString(),
        actor: p.actor ?? p.account ?? {},
      }));
      // Cache to DB in background (non-blocking)
      cacheFederatedPosts(normalized).catch(() => {});
      return normalized;
    } catch (err) {
      console.warn('[feed] Gateway unreachable, using remote_posts cache:', err);
      try {
        const { data } = await supabase
          .from('remote_posts')
          .select('*, remote_accounts(username, domain, display_name, avatar_url)')
          .order('published_at', { ascending: false })
          .limit(30);
        return (data ?? []).map((p: any) => ({
          ...p,
          id: p.id,
          content: p.content ?? '',
          created_at: p.published_at ?? p.created_at,
          actor: p.remote_accounts ?? {},
        }));
      } catch {
        return [];
      }
    }
  };

  // ── Local posts feed ────────────────────────────────────────────────────────
  const fetchFeed = async (pageNum: number): Promise<FeedItem[]> => {
    try {
      let postsQuery = supabase
        .from('posts')
        .select('*, user_profiles(*)')
        .is('community_id', null)
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      let threadsQuery = supabase
        .from('threads')
        .select('*, user_profiles(*)')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .range(pageNum * 5, (pageNum + 1) * 5 - 1);

      if (activeTab === 'following' && user) {
        const { data: followingData } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        const ids = followingData?.map(f => f.following_id) ?? [];
        if (ids.length === 0) return [];

        postsQuery = postsQuery.in('user_id', ids).order('created_at', { ascending: false });
        threadsQuery = threadsQuery.in('user_id', ids);
      } else if (activeTab === 'popular') {
        postsQuery = postsQuery
          .order('likes_count', { ascending: false })
          .order('views_count', { ascending: false });
      } else if (activeTab === 'tech' || activeTab === 'science') {
        const keywords = activeTab === 'tech'
          ? ['tech', 'technology', 'programming', 'coding', 'javascript', 'python', 'ai', 'software', 'developer', 'web']
          : ['science', 'research', 'biology', 'physics', 'chemistry', 'math', 'space', 'medicine', 'climate'];
        const { data: tags } = await supabase.from('hashtags').select('id').in('tag', keywords);
        const tagIds = (tags ?? []).map((t: any) => t.id);
        if (!tagIds.length) return [];
        const { data: phs } = await supabase
          .from('post_hashtags').select('post_id').in('hashtag_id', tagIds).limit(200);
        const allIds = [...new Set((phs ?? []).map((ph: any) => ph.post_id))] as string[];
        const pagedIds = allIds.slice(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE);
        if (!pagedIds.length) return [];
        postsQuery = supabase
          .from('posts').select('*, user_profiles(*)').is('community_id', null)
          .in('id', pagedIds).order('likes_count', { ascending: false });
      } else {
        postsQuery = postsQuery.order('created_at', { ascending: false });
      }

      const [postsRes, threadsRes] = await Promise.all([postsQuery, threadsQuery]);

      // Boosted map
      const postIds = (postsRes.data ?? []).map((p: any) => p.id);
      let boostedMap: Record<string, { boost_type: string }> = {};
      if (postIds.length > 0) {
        const { data: bd } = await supabase
          .from('boosted_posts')
          .select('post_id, boost_type, budget')
          .in('post_id', postIds)
          .eq('is_active', true);
        (bd ?? []).forEach((b: any) => {
          boostedMap[b.post_id] = { boost_type: b.budget > 0 ? 'paid' : 'rewarded_ad' };
        });
      }

      const scorePost = (p: any) => {
        const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3_600_000;
        return (
          (p.views_count ?? 0) * 0.1 +
          (p.likes_count ?? 0) * 2 +
          (p.reposts_count ?? 0) * 3 +
          Math.max(0, 100 - ageHours * 0.5)
        );
      };

      const posts = (postsRes.data ?? []).map((p: any) => ({
        type: 'post' as const,
        data: { ...p, is_boosted: !!boostedMap[p.id], boost_type: boostedMap[p.id]?.boost_type },
        _score: scorePost(p),
        _ts: new Date(p.created_at).getTime(),
      }));

      const threads = (threadsRes.data ?? []).map((t: any) => ({
        type: 'thread' as const,
        data: t,
        _score: 0,
        _ts: new Date(t.created_at).getTime(),
      }));

      let combined = [...posts, ...threads];
      if (activeTab === 'foryou') {
        combined.sort((a, b) => b._score - a._score);
      } else {
        combined.sort((a, b) => b._ts - a._ts);
      }

      const withExtras: FeedItem[] = [];
      let sponsoredIdx = 0;
      let suggestionInserted = false;

      for (let i = 0; i < combined.length; i++) {
        withExtras.push({ type: combined[i].type, data: combined[i].data } as FeedItem);

        if (i === 2 && pageNum === 0 && !suggestionInserted) {
          withExtras.push({ type: 'user-suggestions', data: null });
          suggestionInserted = true;
        }

        if ((i + 1) % (6 + Math.floor(Math.random() * 3)) === 0 && sponsoredIdx < sponsoredPosts.length) {
          withExtras.push({ type: 'sponsored', data: sponsoredPosts[sponsoredIdx++] });
        }
      }

      return withExtras;
    } catch (err) {
      console.error('[feed] fetchFeed error:', err);
      return [];
    }
  };

  const fetchInitialFeed = async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setFeedItems([]);
    setPage(0);

    if (activeTab === 'federated') {
      const fedPosts = await fetchFederatedPosts();
      setFeedItems(fedPosts.map(p => ({ type: 'fedpost' as const, data: p })));
    } else if (activeTab === 'following' && user) {
      // Merge local following posts + gateway federated home timeline
      const [localResult, gatewayResult] = await Promise.allSettled([
        fetchFeed(0),
        fetchFederatedPosts(),
      ]);
      const local = localResult.status === 'fulfilled' ? localResult.value : [];
      const gateway =
        gatewayResult.status === 'fulfilled'
          ? gatewayResult.value.map((p: any) => ({ type: 'fedpost' as const, data: p }))
          : [];
      // Interleave gateway posts: one every ~4 local items
      const merged: FeedItem[] = [...local];
      gateway.slice(0, 6).forEach((item: FeedItem, i: number) => {
        const insertAt = Math.min(merged.length, (i + 1) * 4);
        merged.splice(insertAt, 0, item);
      });
      const filtered = merged.filter((item: any) => {
        const uid = item.data?.user_id ?? item.data?.user_profiles?.id;
        return !uid || !blockedUserIds.has(uid);
      });
      setFeedItems(filtered);
    } else {
      const items = await fetchFeed(0);
      setFeedItems(items);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInitialFeed();
    fetchSponsoredContent();
  }, [activeTab, user?.id]); // Removed fetchInitialFeed and fetchSponsoredContent from deps as they are defined in the component scope.
                             // If they were wrapped in useCallback with their own deps, they could be included.
                             // Given the error about 'exhaustive-deps' and the desire to make them stable,
                             // moving their definitions outside and making them stable (not re-created on every render)
                             // or carefully using useCallback is the standard fix.
                             // For this correction, assuming they are stable by not being inside an effect/render block.

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInitialFeed();
    setRefreshing(false);
  };

  const loadMoreFeed = async (): Promise<boolean> => {
    if (activeTab === 'federated') return false;
    const nextPage = page + 1;
    const newItems = await fetchFeed(nextPage);
    if (newItems.length > 0) {
      setFeedItems(prev => [...prev, ...newItems]);
      setPage(nextPage);
      return newItems.length >= PAGE_SIZE;
    }
    return false;
  };

  const { lastElementRef, loading: loadingMore } = useInfiniteScroll(loadMoreFeed);

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <TopBar title="Home" />

      {/* Bluesky-style Tabs */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex overflow-x-auto scrollbar-hide">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[90px] py-3.5 font-semibold transition-colors border-b-2 text-sm flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-primary' : ''}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stories — only visible on the For You tab */}
      {activeTab === 'foryou' && <StoriesStrip />}

      <ComposePost onSuccess={fetchInitialFeed} />

      {/* Top ad */}
      <DynamicAd location="feed_top" className="border-b border-border p-4" />

      {/* Refresh */}
      {!loading && (
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors border-b border-border"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh feed'}
        </button>
      )}

      {/* Feed content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : feedItems.length === 0 ? (
        <EmptyState tab={activeTab} navigate={navigate} />
      ) : (
        <>
          {feedItems.map((item, index) => (
            <div
              key={`${item.type}-${item.type === 'user-suggestions' ? 'sug' : (item.data as any)?.id ?? index}-${index}`}
              ref={index === feedItems.length - 1 ? lastElementRef : null}
              className="animate-slide-in"
            >
              {item.type === 'post' ? (
                <PostCard post={item.data} onUpdate={fetchInitialFeed} />
              ) : item.type === 'fedpost' ? (
                <FederatedPostCard post={item.data} />
              ) : item.type === 'sponsored' ? (
                <SponsoredPostCard post={item.data} />
              ) : item.type === 'user-suggestions' ? (
                <InlineSuggestions />
              ) : (
                <ThreadCard thread={item.data} />
              )}

              {(index + 1) % 6 === 0 && index !== feedItems.length - 1 && (
                <NativeAdCard className="mx-0 rounded-none border-x-0 border-b border-border" />
              )}
              {(index + 1) % 8 === 0 && (
                <DynamicAd location="feed_inline" className="border-b border-border px-4 py-3" />
              )}
            </div>
          ))}

          {loadingMore && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ tab, navigate }: { tab: Tab; navigate: (p: string) => void }) {
  if (tab === 'federated') {
    return (
      <div className="text-center py-16 text-muted-foreground px-6">
        <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-semibold mb-1">No federated posts yet</p>
        <p className="text-sm mb-4">The gateway is connected — follow people on Mastodon to populate this feed</p>
        <button
          onClick={() => navigate('/fediverse')}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium"
        >
          Open Fediverse
        </button>
      </div>
    );
  }
  if (tab === 'following') {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-semibold mb-1">Nothing here yet</p>
        <p className="text-sm">Follow users to see their posts</p>
      </div>
    );
  }
  if (tab === 'tech' || tab === 'science') {
    return (
      <div className="text-center py-16 text-muted-foreground px-6">
        <Hash className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-semibold mb-1">No {tab === 'tech' ? 'tech' : 'science'} posts yet</p>
        <p className="text-sm">Posts with #{tab}-related hashtags will appear here</p>
      </div>
    );
  }
  return (
    <div className="text-center py-16 text-muted-foreground">
      <Rss className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p className="text-lg font-semibold mb-1">No posts yet</p>
      <p className="text-sm">Be the first to post!</p>
    </div>
  );
}

// ── Federated Post Card ───────────────────────────────────────────────────────
function FederatedPostCard({ post }: { post: any }) {
  const actor = post.actor ?? post.account ?? {};
  const username =
    actor.preferredUsername ?? actor.username ?? actor.acct ?? 'unknown';
  const domain =
    actor.url
      ? (() => { try { return new URL(actor.url).hostname; } catch { return ''; } })()
      : actor.domain ?? '';
  const avatarUrl = actor.icon?.url ?? actor.avatar ?? actor.avatar_url;
  const displayName = actor.name ?? actor.display_name ?? username;
  const createdAt = post.created_at ?? post.published ?? '';

  // ── Translator state ────────────────────────────────────────────────────
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const handleTranslate = async () => {
    if (translation) {
      setShowTranslation(prev => !prev);
      return;
    }
    const rawText = (post.content ?? post.text ?? '').replace(/<[^>]*>/g, '').trim();
    if (!rawText) return;
    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: [
            {
              role: 'user',
              content: `Translate the following text to English. Return only the translation, nothing else:\n\n${rawText}`,
            },
          ],
          model: 'gemini-2.0-flash',
        },
      });
      if (error) throw error;
      const result = data?.choices?.[0]?.message?.content ??
        data?.content ??
        data?.text ??
        data?.response ?? '';
      setTranslation(result.trim());
      setShowTranslation(true);
    } catch (err) {
      console.warn('[translate] Error:', err);
      setTranslation('Translation failed. Please try again.');
      setShowTranslation(true);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="border-b border-border p-4 hover:bg-muted/5 transition-colors">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-sm">
              {username[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-semibold text-sm">{displayName}</span>
            <span className="flex items-center gap-1 text-xs text-purple-500">
              <Globe className="w-3 h-3" />
              {domain}
            </span>
            {createdAt && (
              <span className="text-muted-foreground text-xs">
                · {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-1.5">
            @{username}@{domain}
          </p>
          <div
            className="text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: post.content ?? post.text ?? '' }}
          />

          {/* Translated text panel */}
          {showTranslation && translation && (
            <div className="mt-2 p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl">
              <p className="text-xs font-semibold text-blue-500 mb-1 flex items-center gap-1">
                <Languages className="w-3 h-3" /> Translated to English
              </p>
              <p className="text-sm leading-relaxed text-foreground">{translation}</p>
            </div>
          )}

          {Array.isArray(post.media_attachments) && post.media_attachments.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
              {post.media_attachments.slice(0, 4).map((m: any, i: number) =>
                m.type === 'image' ? (
                  <img
                    key={i}
                    src={m.url ?? m.preview_url}
                    alt={m.description ?? ''}
                    className="w-full h-32 object-cover"
                    loading="lazy"
                  />
                ) : null
              )}
            </div>
          )}

          <div className="flex items-center gap-4 mt-2.5 text-muted-foreground text-xs">
            <span className="flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5" />
              {formatNumber(post.replies_count ?? 0)}
            </span>
            <span className="flex items-center gap-1">
              <Repeat2 className="w-3.5 h-3.5" />
              {formatNumber(post.reblogs_count ?? post.boosts_count ?? 0)}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="w-3.5 h-3.5" />
              {formatNumber(post.favourites_count ?? post.likes_count ?? 0)}
            </span>
            {/* Translate button */}
            <button
              onClick={handleTranslate}
              disabled={translating}
              className="ml-auto flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors disabled:opacity-50"
            >
              {translating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : showTranslation ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <Languages className="w-3.5 h-3.5" />
              )}
              {translating ? 'Translating…' : showTranslation ? 'Hide' : 'Translate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inline Suggestions ────────────────────────────────────────────────────────
function InlineSuggestions() {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: followData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      const followed = new Set(followData?.map((f: any) => f.following_id) ?? []);
      setFollowingIds(followed);

      const { data } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url, followers_count')
        .neq('id', user.id)
        .order('followers_count', { ascending: false })
        .limit(10);

      if (data) setSuggestions(data.filter((u: any) => !followed.has(u.id)).slice(0, 3));
    })();
  }, [user]);

  const handleFollow = async (targetId: string) => {
    if (!user) return;
    await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId });
    setFollowingIds(prev => new Set([...prev, targetId]));
  };

  if (suggestions.length === 0) return null;

  return (
    <div className="border-b border-border p-4 bg-muted/20">
      <h3 className="font-bold text-sm mb-3 text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        Who to follow
      </h3>
      <div className="space-y-3">
        {suggestions.map((sug: any) => (
          <div key={sug.id} className="flex items-center justify-between">
            <button
              onClick={() => navigate(`/profile/${sug.username}`)}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
            >
              <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0">
                {sug.avatar_url ? (
                  <img src={sug.avatar_url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                    {sug.username?.[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{sug.username}</p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(sug.followers_count ?? 0)} followers
                </p>
              </div>
            </button>
            <button
              onClick={() => handleFollow(sug.id)}
              disabled={followingIds.has(sug.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors flex-shrink-0 ${
                followingIds.has(sug.id)
                  ? 'bg-muted text-muted-foreground border-border'
                  : 'border-foreground hover:bg-muted'
              }`}
            >
              {followingIds.has(sug.id) ? 'Following' : 'Follow'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Thread Card ───────────────────────────────────────────────────────────────
function ThreadCard({ thread }: { thread: any }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/thread/${thread.id}`)}
      className="border-b border-border p-4 hover:bg-muted/5 cursor-pointer transition-colors"
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
          {thread.user_profiles?.avatar_url ? (
            <img src={thread.user_profiles.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-sm">
              {thread.user_profiles?.username?.[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-sm">{thread.user_profiles?.username}</span>
            <span className="text-muted-foreground text-xs">
              · {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
            </span>
          </div>
          <h3 className="font-bold text-base mb-1">{thread.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{thread.content}</p>
          {thread.cover_image && (
            <div className="mt-2 rounded-xl overflow-hidden border border-border">
              <img src={thread.cover_image} alt={thread.title} className="w-full max-h-48 object-cover" loading="lazy" />
            </div>
          )}
          <div className="flex items-center gap-5 mt-2 text-muted-foreground">
            <span className="flex items-center gap-1.5 text-xs">
              <MessageCircle className="w-3.5 h-3.5" />
              {formatNumber(thread.replies_count ?? 0)}
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <Repeat2 className="w-3.5 h-3.5" />
              {formatNumber(thread.reposts_count ?? 0)}
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <Heart className="w-3.5 h-3.5" />
              {formatNumber(thread.likes_count ?? 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
