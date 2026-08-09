import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import * as federation from '@/api/federation';
import { FediverseBadge } from '@/components/features/FediverseBadge';
import { Globe, Search, Users, Rss, ExternalLink, UserPlus, UserMinus, Loader2, AlertCircle, Copy, CheckCircle, Heart, Repeat2, MessageCircle, Send, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';

type Tab = 'feed' | 'discover' | 'identity';

export default function FediversePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('feed');
  const [searchHandle, setSearchHandle] = useState('');
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const [following, setFollowing] = useState(false);
  const [remotePosts, setRemotePosts] = useState<any[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [cachedAt, setCachedAt] = useState<Date | null>(null);
  const [federatedFollowing, setFederatedFollowing] = useState<any[]>([]);
  const [federatedFollowers, setFederatedFollowers] = useState<any[]>([]);
  const [gatewayOk, setGatewayOk] = useState<boolean | null>(null);
  // Per-post interaction state: { [postObjectUrl]: { liked, boosted, replyOpen, replyText, sending } }
  const [postStates, setPostStates] = useState<Record<string, { liked?: boolean; boosted?: boolean; replyOpen?: boolean; replyText?: string; sending?: boolean }>>({});
  const [myActor, setMyActor] = useState<any>(null);
  const [keysReady, setKeysReady] = useState<boolean>(false);
  // Keyword search state
  const [keywordQuery, setKeywordQuery] = useState('');
  const [keywordResults, setKeywordResults] = useState<any[]>([]);
  const [searchingKeyword, setSearchingKeyword] = useState(false);
  const [keywordSearched, setKeywordSearched] = useState(false);

  useEffect(() => {
    checkGateway();
    fetchFederatedFeed();
    if (user) {
      fetchFederationStats();
      fetchMyActor();
    }
  }, [user]);

  const checkGateway = async () => {
    try {
      const res = await federation.getHealth();
      setGatewayOk(!!res);
    } catch {
      // Try instance endpoint as fallback
      try {
        await federation.getInstance();
        setGatewayOk(true);
      } catch {
        setGatewayOk(false);
      }
    }
  };

  const fetchMyActor = async () => {
    if (!user) return;
    const { data: actor } = await supabase
      .from('activitypub_actors')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setMyActor(actor);

    const { data: keys } = await supabase
      .from('activitypub_keys')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    setKeysReady(!!keys);
  };

  const cacheFederatedPosts = async (posts: any[]) => {
    const rows = posts
      .filter((p: any) => p.uri ?? p.url ?? p.id)
      .map((p: any) => ({
        object_url: p.uri ?? p.url ?? p.id ?? '',
        actor_url: p.actor?.id ?? p.actor?.url ?? p.account?.url ?? p.actor_url ?? '',
        content: p.content ?? p.text ?? '',
        summary: p.spoiler_text ?? p.summary ?? null,
        media_urls: p.media_attachments ?? p.media_urls ?? [],
        likes_count: p.favourites_count ?? p.likes_count ?? 0,
        replies_count: p.replies_count ?? 0,
        boosts_count: p.reblogs_count ?? p.boosts_count ?? 0,
        published_at: p.created_at ?? p.published ?? new Date().toISOString(),
        raw_object: p,
      }))
      .filter((r: any) => r.object_url);
    if (!rows.length) return;
    await supabase
      .from('remote_posts')
      .upsert(rows, { onConflict: 'object_url', ignoreDuplicates: false })
      .then(() => setCachedAt(new Date()))
      .catch(() => {});
  };

  const fetchFederatedFeed = async () => {
    setLoadingFeed(true);
    try {
      const res: any = await federation.getFederatedTimeline({ limit: 30 });
      const posts = Array.isArray(res) ? res : res?.posts ?? res?.data ?? [];
      setRemotePosts(posts);
      // Cache to DB in background
      cacheFederatedPosts(posts).catch(() => {});
    } catch {
      // Fallback to cached remote_posts
      const { data } = await supabase
        .from('remote_posts')
        .select('*, remote_accounts(username, domain, display_name, avatar_url)')
        .order('published_at', { ascending: false })
        .limit(30);
      setRemotePosts(data ?? []);
      if ((data ?? []).length > 0) setCachedAt(new Date());
    } finally {
      setLoadingFeed(false);
    }
  };

  const fetchFederationStats = async () => {
    if (!user) return;
    const [fwingRes, fwersRes] = await Promise.all([
      supabase.from('federated_following').select('*').eq('local_user_id', user.id),
      supabase.from('federated_followers').select('*').eq('local_user_id', user.id),
    ]);
    setFederatedFollowing(fwingRes.data ?? []);
    setFederatedFollowers(fwersRes.data ?? []);
  };

  const handleSearch = async () => {
    const handle = searchHandle.trim().replace(/^@/, '');
    if (!handle.includes('@')) {
      toast.error('Use full format: user@mastodon.social');
      return;
    }
    setSearching(true);
    setSearchResult(null);
    try {
      const actor = await federation.getUser(handle);
      if (actor) {
        setSearchResult({
          actor_url: actor.id,
          username: actor.preferredUsername ?? handle.split('@')[0],
          domain: handle.split('@')[1] ?? '',
          display_name: actor.name ?? actor.preferredUsername,
          bio: actor.summary,
          avatar_url: actor.icon?.url ?? null,
          followers_url: actor.followers,
          inbox_url: actor.inbox,
        });
      } else {
        toast.error(`Could not find @${handle}`);
      }
    } catch (err: any) {
      toast.error(`Lookup failed: ${err.message ?? 'unknown error'}`);
    } finally {
      setSearching(false);
    }
  };

  const handleUnfollowFederated = async (remoteActorUrl: string) => {
    if (!user) { navigate('/auth'); return; }
    try {
      // Remove from local federated_following table
      await supabase.from('federated_following').delete().eq('local_user_id', user.id).eq('remote_actor_url', remoteActorUrl);
      toast.success('Unfollowed');
      fetchFederationStats();
    } catch (err: any) {
      toast.error(`Unfollow failed: ${err.message ?? ''}`);
    }
  };

  const handleFedLike = async (post: any) => {
    if (!user) { navigate('/auth'); return; }
    const key = post.object_url ?? post.id;
    if (!key) return;
    setPostStates(prev => ({ ...prev, [key]: { ...prev[key], liked: !prev[key]?.liked } }));
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const backendUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetch(`${backendUrl}/functions/v1/activitypub-federation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'like', object_url: key, user_id: user.id }),
      });
    } catch { /* optimistic — ignore errors */ }
  };

  const handleFedBoost = async (post: any) => {
    if (!user) { navigate('/auth'); return; }
    const key = post.object_url ?? post.id;
    if (!key) return;
    setPostStates(prev => ({ ...prev, [key]: { ...prev[key], boosted: !prev[key]?.boosted } }));
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const backendUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetch(`${backendUrl}/functions/v1/activitypub-federation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'boost', object_url: key, user_id: user.id }),
      });
    } catch { /* optimistic */ }
  };

  const handleFedReply = async (post: any) => {
    if (!user) { navigate('/auth'); return; }
    const key = post.object_url ?? post.id;
    if (!key) return;
    const text = postStates[key]?.replyText?.trim();
    if (!text) return;
    setPostStates(prev => ({ ...prev, [key]: { ...prev[key], sending: true } }));
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const backendUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetch(`${backendUrl}/functions/v1/activitypub-federation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'reply', object_url: key, content: text, user_id: user.id }),
      });
      toast.success('Reply sent to the Fediverse!');
      setPostStates(prev => ({ ...prev, [key]: { ...prev[key], replyText: '', replyOpen: false, sending: false } }));
    } catch (err: any) {
      toast.error(`Reply failed: ${err.message ?? ''}`);
      setPostStates(prev => ({ ...prev, [key]: { ...prev[key], sending: false } }));
    }
  };

  const handleFollow = async (account: any) => {
    if (!user) { navigate('/auth'); return; }
    setFollowing(true);
    try {
      const target = account.actor_url ?? `${account.username}@${account.domain}`;
      await federation.follow(target);
      toast.success('Follow request sent!');
      fetchFederationStats();
    } catch (err: any) {
      toast.error(`Follow failed: ${err.message ?? ''}`);
    } finally {
      setFollowing(false);
    }
  };

  const generateKeys = async () => {
    if (!user) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const backendUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${backendUrl}/functions/v1/activitypub-keygen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.status === 'created' || data.status === 'exists') {
        setKeysReady(true);
        toast.success('RSA keys ready!');
        fetchMyActor();
      } else {
        toast.error(data.error ?? 'Keygen failed');
      }
    } catch (err: any) {
      toast.error('Keygen error: ' + err.message);
    }
  };

  const backfillAllKeys = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const backendUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${backendUrl}/functions/v1/activitypub-keygen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ generate_all_missing: true }),
      });
      const data = await res.json();
      if (data.status === 'backfill_complete') {
        toast.success(
          `Backfill done: ${data.generated} generated, ${data.failed} failed, ${data.remaining} remaining`
        );
      } else {
        toast.error(data.error ?? 'Backfill failed');
      }
    } catch (err: any) {
      toast.error('Backfill error: ' + err.message);
    }
  };

  const handleKeywordSearch = async () => {
    const q = keywordQuery.trim();
    if (!q) return;
    setSearchingKeyword(true);
    setKeywordResults([]);
    setKeywordSearched(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const backendUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${backendUrl}/functions/v1/gateway-relay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'search', query: q, type: 'statuses', limit: 20 }),
      });
      const data = await res.json();
      const posts = Array.isArray(data)
        ? data
        : data?.statuses ?? data?.posts ?? data?.data ?? [];
      if (posts.length === 0 && !res.ok) throw new Error(data?.error ?? 'No results');
      setKeywordResults(posts);
    } catch (err: any) {
      // fallback: search remote_posts table
      const { data: cached } = await supabase
        .from('remote_posts')
        .select('*')
        .ilike('content', `%${q}%`)
        .order('published_at', { ascending: false })
        .limit(20);
      setKeywordResults(cached ?? []);
      if ((cached ?? []).length === 0) toast.error(`No results for "${q}"`);
    } finally {
      setSearchingKeyword(false);
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'feed',     label: 'Federated Feed', icon: Rss      },
    { id: 'discover', label: 'Discover',        icon: Search   },
    { id: 'identity', label: 'My Identity',     icon: Globe    },
  ];

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Fediverse" showBack />

      {/* Gateway status banner */}
      {gatewayOk === false && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Gateway temporarily unreachable — serving federated content from local cache.</span>
        </div>
      )}
      {gatewayOk === true && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border-b border-green-500/20 text-green-600 dark:text-green-400 text-xs">
          <Globe className="w-3.5 h-3.5 shrink-0" />
          Gateway connected
        </div>
      )}

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border flex">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3.5 text-sm font-semibold border-b-2 flex items-center justify-center gap-1.5 transition-colors ${
                active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Federated Feed ── */}
      {tab === 'feed' && (
        <div>
          {/* Cache status bar */}
          {cachedAt && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/30 border-b border-border text-xs text-muted-foreground">
              <CheckCircle className="w-3 h-3 text-green-500" />
              Cached locally · last synced {formatDistanceToNow(cachedAt, { addSuffix: true })}
            </div>
          )}
          {loadingFeed ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : remotePosts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground px-6">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold mb-1">No federated posts yet</p>
              <p className="text-sm">Follow people on Mastodon or Misskey to see their posts here</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {remotePosts.map((p: any, i: number) => {
                const actor = p.remote_accounts ?? p.actor ?? p.account ?? {};
                const username = actor.preferredUsername ?? actor.username ?? 'unknown';
                const domain = actor.domain ?? (p.actor_url ? (() => { try { return new URL(p.actor_url).hostname; } catch { return ''; } })() : '');
                const avatarUrl = actor.avatar_url ?? actor.icon?.url;
                const content = p.content ?? p.text ?? '';
                const created = p.published_at ?? p.created_at ?? p.published ?? '';
                return (
  <div key={p.id ?? p.object_url ?? i} className="p-4 hover:bg-muted/5 transition-colors">
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-sm">{username[0]?.toUpperCase()}</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-semibold text-sm">{actor.display_name ?? username}</span>
                          <span className="flex items-center gap-1 text-xs text-purple-500">
                            <Globe className="w-3 h-3" />{domain}
                          </span>
                          {created && (
                            <span className="text-muted-foreground text-xs">
                              · {formatDistanceToNow(new Date(created), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-1.5">@{username}@{domain}</p>
                        <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: content }} />
                        {/* ── Interaction bar ── */}
                        {(() => {
                          const key = p.object_url ?? p.id;
                          const ps = key ? (postStates[key] ?? {}) : {};
                          return (
                            <div className="mt-2.5 flex items-center gap-1 flex-wrap">
                              {/* Like */}
                              <button
                                onClick={() => handleFedLike(p)}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                  ps.liked ? 'bg-pink-500/15 text-pink-600' : 'hover:bg-muted text-muted-foreground hover:text-pink-600'
                                }`}
                              >
                                <Heart className={`w-3.5 h-3.5 ${ps.liked ? 'fill-current' : ''}`} />
                                {(p.likes_count ?? p.favourites_count ?? 0) + (ps.liked ? 1 : 0)}
                              </button>
                              {/* Boost */}
                              <button
                                onClick={() => handleFedBoost(p)}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                  ps.boosted ? 'bg-green-500/15 text-green-600' : 'hover:bg-muted text-muted-foreground hover:text-green-600'
                                }`}
                              >
                                <Repeat2 className="w-3.5 h-3.5" />
                                {(p.boosts_count ?? p.reblogs_count ?? 0) + (ps.boosted ? 1 : 0)}
                              </button>
                              {/* Reply toggle */}
                              {user && (
                                <button
                                  onClick={() => {
                                    if (!key) return;
                                    setPostStates(prev => ({ ...prev, [key]: { ...prev[key], replyOpen: !ps.replyOpen } }));
                                  }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  {p.replies_count ?? 0}
                                </button>
                              )}
                              {/* External link */}
                              {p.object_url && (
                                <a href={p.object_url} target="_blank" rel="noopener noreferrer"
                                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-full hover:bg-muted"
                                >
                                  <ExternalLink className="w-3 h-3" />{domain}
                                </a>
                              )}
                            </div>
                          );
                        })()}
                        {/* Inline reply composer */}
                        {user && (() => {
                          const key = p.object_url ?? p.id;
                          const ps = key ? (postStates[key] ?? {}) : {};
                          if (!ps.replyOpen || !key) return null;
                          return (
                            <div className="mt-2 flex items-start gap-2" onClick={e => e.stopPropagation()}>
                              <textarea
                                className="flex-1 bg-muted rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary border border-border"
                                rows={2}
                                placeholder={`Reply to @${username}@${domain}…`}
                                value={ps.replyText ?? ''}
                                onChange={e => setPostStates(prev => ({ ...prev, [key]: { ...prev[key], replyText: e.target.value } }))}
                              />
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={() => handleFedReply(p)}
                                  disabled={ps.sending || !ps.replyText?.trim()}
                                  className="p-2 bg-primary text-primary-foreground rounded-xl disabled:opacity-50 transition-opacity hover:opacity-90"
                                >
                                  {ps.sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => setPostStates(prev => ({ ...prev, [key]: { ...prev[key], replyOpen: false } }))}
                                  className="p-2 bg-muted rounded-xl text-muted-foreground hover:text-foreground"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Discover / Search ── */}
      {tab === 'discover' && (
        <div className="p-4 space-y-4">
          <div className="text-sm text-muted-foreground bg-purple-500/5 border border-purple-500/15 rounded-xl p-3">
            Search 8,000+ Mastodon, Misskey, and Pleroma instances. Use <span className="font-mono font-medium">@user@instance.social</span> format.
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="@alice@mastodon.social"
              value={searchHandle}
              onChange={e => setSearchHandle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchHandle.trim()}
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {searching ? 'Searching…' : 'Lookup'}
            </button>
          </div>

          {searchResult && (
            <div className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-muted overflow-hidden shrink-0">
                  {searchResult.avatar_url ? (
                    <img src={searchResult.avatar_url} alt={searchResult.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-lg">{searchResult.username[0]?.toUpperCase()}</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{searchResult.display_name ?? searchResult.username}</p>
                  <p className="text-sm text-muted-foreground">@{searchResult.username}@{searchResult.domain}</p>
                  {searchResult.bio && (
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-3" dangerouslySetInnerHTML={{ __html: searchResult.bio }} />
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleFollow(searchResult)}
                  disabled={following}
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {following ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {following ? 'Sending…' : 'Follow'}
                </button>
                <a
                  href={searchResult.actor_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 border border-border rounded-full text-sm flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View profile
                </a>
              </div>
            </div>
          )}

          {/* ── Keyword Post Search ─────────────────────────────────── */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" />
              Search Fediverse Posts
            </p>
            <div className="flex gap-2">
              <input
                className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Search by keyword, hashtag…"
                value={keywordQuery}
                onChange={e => setKeywordQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleKeywordSearch()}
              />
              <button
                onClick={handleKeywordSearch}
                disabled={searchingKeyword || !keywordQuery.trim()}
                className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {searchingKeyword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {searchingKeyword ? 'Searching…' : 'Search'}
              </button>
            </div>

            {/* Results */}
            {keywordResults.length > 0 && (
              <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                {keywordResults.map((p: any, i: number) => {
                  const actor = p.remote_accounts ?? p.actor ?? p.account ?? {};
                  const username = actor.preferredUsername ?? actor.username ?? actor.acct?.split('@')[0] ?? 'unknown';
                  const domain = actor.domain ?? (p.actor_url ? (() => { try { return new URL(p.actor_url).hostname; } catch { return ''; } })() : (actor.acct?.includes('@') ? actor.acct.split('@')[1] : ''));
                  const avatarUrl = actor.avatar_url ?? actor.icon?.url ?? actor.avatar ?? actor.avatar_static;
                  const content = p.content ?? p.text ?? '';
                  const created = p.published_at ?? p.created_at ?? p.published ?? '';
                  const key = p.object_url ?? p.uri ?? p.url ?? p.id ?? String(i);
                  const ps = postStates[key] ?? {};
                  return (
                    <div key={key} className="p-3 hover:bg-muted/10 transition-colors bg-background">
                      <div className="flex gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-muted overflow-hidden shrink-0">
                          {avatarUrl
                            ? <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center font-bold text-xs">{username[0]?.toUpperCase()}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="font-semibold text-xs">{actor.display_name ?? username}</span>
                            <span className="text-xs text-purple-500 flex items-center gap-0.5"><Globe className="w-2.5 h-2.5" />{domain}</span>
                            {created && <span className="text-xs text-muted-foreground">· {formatDistanceToNow(new Date(created), { addSuffix: true })}</span>}
                          </div>
                          <div className="text-xs leading-relaxed text-foreground/90 line-clamp-3" dangerouslySetInnerHTML={{ __html: content }} />
                          <div className="mt-1.5 flex items-center gap-1">
                            <button
                              onClick={() => handleFedLike({ ...p, object_url: key })}
                              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${ps.liked ? 'bg-pink-500/15 text-pink-600' : 'hover:bg-muted text-muted-foreground hover:text-pink-600'}`}
                            >
                              <Heart className={`w-3 h-3 ${ps.liked ? 'fill-current' : ''}`} />
                              {(p.likes_count ?? p.favourites_count ?? 0) + (ps.liked ? 1 : 0)}
                            </button>
                            <button
                              onClick={() => handleFedBoost({ ...p, object_url: key })}
                              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${ps.boosted ? 'bg-green-500/15 text-green-600' : 'hover:bg-muted text-muted-foreground hover:text-green-600'}`}
                            >
                              <Repeat2 className="w-3 h-3" />
                              {(p.boosts_count ?? p.reblogs_count ?? 0) + (ps.boosted ? 1 : 0)}
                            </button>
                            {user && (
                              <button
                                onClick={() => setPostStates(prev => ({ ...prev, [key]: { ...prev[key], replyOpen: !ps.replyOpen } }))}
                                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                              >
                                <MessageCircle className="w-3 h-3" />{p.replies_count ?? 0}
                              </button>
                            )}
                            {(p.object_url ?? p.uri ?? p.url) && (
                              <a href={p.object_url ?? p.uri ?? p.url} target="_blank" rel="noopener noreferrer"
                                className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary px-2 py-1 rounded-full hover:bg-muted transition-colors">
                                <ExternalLink className="w-2.5 h-2.5" />{domain}
                              </a>
                            )}
                          </div>
                          {/* Inline reply for keyword results */}
                          {user && ps.replyOpen && (
                            <div className="mt-1.5 flex items-start gap-1.5">
                              <textarea
                                className="flex-1 bg-muted rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary border border-border"
                                rows={2}
                                placeholder={`Reply to @${username}@${domain}…`}
                                value={ps.replyText ?? ''}
                                onChange={e => setPostStates(prev => ({ ...prev, [key]: { ...prev[key], replyText: e.target.value } }))}
                              />
                              <button
                                onClick={() => handleFedReply({ ...p, object_url: key })}
                                disabled={ps.sending || !ps.replyText?.trim()}
                                className="p-1.5 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                              >
                                {ps.sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                              </button>
                              <button onClick={() => setPostStates(prev => ({ ...prev, [key]: { ...prev[key], replyOpen: false } }))} className="p-1.5 bg-muted rounded-lg text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {keywordSearched && !searchingKeyword && keywordResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No posts found for "{keywordQuery}"</p>
            )}
          </div>

          {/* Stats + Following list */}
          {user && (
            <div className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-border rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold">{federatedFollowing.length}</p>
                  <p className="text-xs text-muted-foreground">Federated following</p>
                </div>
                <div className="border border-border rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold">{federatedFollowers.length}</p>
                  <p className="text-xs text-muted-foreground">Remote followers</p>
                </div>
              </div>
              {federatedFollowing.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <p className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">Currently Following</p>
                  <div className="divide-y divide-border">
                    {federatedFollowing.map((f: any) => (
                      <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-9 h-9 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
                          <Globe className="w-4 h-4 text-purple-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{f.remote_username ?? f.remote_actor_url.split('/').pop()}</p>
                          <p className="text-xs text-muted-foreground truncate">{f.remote_domain ?? f.remote_actor_url}</p>
                        </div>
                        <button
                          onClick={() => handleUnfollowFederated(f.remote_actor_url)}
                          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full border border-border text-xs font-medium hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                        >
                          <UserMinus className="w-3 h-3" />
                          Unfollow
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── My Identity ── */}
      {tab === 'identity' && (
        <div className="p-4 space-y-4">
          {!user ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-3">Sign in to view your Fediverse identity</p>
              <button onClick={() => navigate('/auth')} className="px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm">Sign in</button>
            </div>
          ) : (
            <>
              <FediverseBadge username={user.username} remoteFollowers={federatedFollowers.length} />

              <div className="border border-border rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-sm">Actor Status</h3>
                <div className="space-y-2 text-sm">
                  <Row label="Actor ID" value={myActor?.actor_id ?? '—'} mono />
                  <Row label="Inbox" value={myActor?.inbox_url ?? '—'} mono />
                  <Row label="Domain" value={myActor?.domain ?? 'testagram.site'} />
                  <Row label="RSA Keys" value={keysReady ? '✅ Ready' : '⚠️ Not generated'} />
                </div>
                {!keysReady && (
                  <button
                    onClick={generateKeys}
                    className="w-full py-2 bg-purple-600 text-white rounded-full text-sm font-medium mt-2"
                  >
                    Generate RSA Keys
                  </button>
                )}
              </div>

              <div className="border border-border rounded-xl p-4 space-y-2">
                <h3 className="font-semibold text-sm mb-2">Share your handle</h3>
                <p className="text-xs text-muted-foreground">
                  People on Mastodon, Misskey and other Fediverse platforms can find and follow you using your handle:
                </p>
                <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                  <span className="flex-1 font-mono text-sm">@{user.username}@testagram.site</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`@${user.username}@testagram.site`);
                      toast.success('Copied!');
                    }}
                    className="p-1.5 hover:bg-background rounded-lg transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="border border-border rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-2">Gateway Status</h3>
                <div className="flex items-center gap-2 text-sm">
                  <div className={`w-2 h-2 rounded-full ${gatewayOk ? 'bg-green-500' : 'bg-red-400'}`} />
                  {gatewayOk ? 'TestagramGateway connected' : 'Gateway not configured'}
                </div>
                {!gatewayOk && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Gateway is temporarily unreachable. Federation data is served from local cache. The hardcoded gateway URL is active — check gateway deployment status.
                  </p>
                )}
              </div>

              {/* Backfill RSA Keys for all existing users */}
              <div className="border border-amber-500/20 rounded-xl p-4 bg-amber-500/5">
                <h3 className="font-semibold text-sm mb-1 text-amber-700 dark:text-amber-400">
                  Backfill RSA Keys
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Generate ActivityPub RSA-2048 key pairs for all existing users who don’t have them yet.
                  Run this once after deploying federation support.
                </p>
                <button
                  onClick={backfillAllKeys}
                  className="w-full py-2 bg-amber-600 text-white rounded-full text-sm font-medium hover:bg-amber-700 transition-colors"
                >
                  Backfill All Missing Keys (batch of 50)
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
