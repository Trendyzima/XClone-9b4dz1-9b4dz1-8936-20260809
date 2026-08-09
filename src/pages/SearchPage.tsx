import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Input } from '@/components/ui/input';
import { Search, Loader2, BadgeCheck, Globe, ExternalLink, UserPlus, Hash, Users, Clock, X, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PostCard } from '@/components/features/PostCard';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import * as federation from '@/api/federation';
import { formatNumber } from '@/lib/utils';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [activeTab, setActiveTab] = useState('Posts');
  const [posts, setPosts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [hashtags, setHashtags] = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [fediverseResults, setFediverseResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fediverseLoading, setFediverseLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Autocomplete state ──────────────────────────────────────────────────────
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [acUsers, setAcUsers] = useState<any[]>([]);
  const [acHashtags, setAcHashtags] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('tsocial_recent_searches') || '[]').slice(0, 6); }
    catch { return []; }
  });
  const acDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Click-outside to close autocomplete
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchAutocomplete = async (q: string) => {
    if (!q.trim()) { setAcUsers([]); setAcHashtags([]); return; }
    const clean = q.replace(/^[@#]/, '');
    const isHash = q.startsWith('#');
    const isUser = q.startsWith('@');
    const [ur, hr] = await Promise.all([
      isHash ? Promise.resolve({ data: [] as any[] }) :
        supabase.from('user_profiles').select('id,username,avatar_url,verified,followers_count')
          .ilike('username', `${clean}%`).order('followers_count', { ascending: false }).limit(5),
      isUser ? Promise.resolve({ data: [] as any[] }) :
        supabase.from('hashtags').select('id,tag,usage_count')
          .ilike('tag', `${clean}%`).order('usage_count', { ascending: false }).limit(4),
    ]);
    setAcUsers(ur.data || []);
    setAcHashtags(hr.data || []);
  };

  const saveRecentSearch = (q: string) => {
    if (!q.trim()) return;
    const updated = [q, ...recentSearches.filter(s => s !== q)].slice(0, 6);
    setRecentSearches(updated);
    try { localStorage.setItem('tsocial_recent_searches', JSON.stringify(updated)); } catch {}
  };

  const clearRecentSearch = (q: string) => {
    const updated = recentSearches.filter(s => s !== q);
    setRecentSearches(updated);
    try { localStorage.setItem('tsocial_recent_searches', JSON.stringify(updated)); } catch {}
  };

  const tabs = ['Posts', 'Users', 'Hashtags', 'Communities', 'Fediverse'];

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      performSearch(q);
    }
  }, [searchParams]);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setLoading(true);

    try {
      const [postsRes, usersRes, hashtagsRes, communitiesRes] = await Promise.all([
        supabase
          .from('posts')
          .select('*, user_profiles (*)')
          .ilike('content', `%${searchQuery}%`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('user_profiles')
          .select('*')
          .or(`username.ilike.%${searchQuery}%,bio.ilike.%${searchQuery}%`)
          .limit(20),
        supabase
          .from('hashtags')
          .select('*')
          .ilike('tag', `%${searchQuery.replace(/^#/, '')}%`)
          .order('usage_count', { ascending: false })
          .limit(20),
        supabase
          .from('communities')
          .select('*')
          .or(`name.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
          .order('member_count', { ascending: false })
          .limit(20),
      ]);

      setPosts(postsRes.data || []);
      setUsers(usersRes.data || []);
      setHashtags(hashtagsRes.data || []);
      setCommunities(communitiesRes.data || []);

      // ── Fediverse search ───────────────────────────────────────────
      setFediverseLoading(true);
      const cleaned = searchQuery.replace(/^@/, '');

      // 1. Check local remote_accounts cache
      try {
        const { data: remoteData } = await supabase
          .from('remote_accounts')
          .select('*')
          .or(`username.ilike.%${cleaned}%,domain.ilike.%${cleaned}%,display_name.ilike.%${cleaned}%`)
          .limit(20);
        setFediverseResults(remoteData || []);
      } catch {
        setFediverseResults([]);
      }

      // 2. Gateway broad search for any query
      try {
        const gwResult: any = await federation.search(cleaned, 'users');
        const accounts: any[] = Array.isArray(gwResult)
          ? gwResult
          : gwResult?.accounts ?? gwResult?.users ?? gwResult?.data ?? [];
        if (accounts.length > 0) {
          const mapped = accounts
            .map((a: any) => ({
              actor_url: a.url ?? a.id ?? a.actor_url ?? '',
              username: a.username ?? a.preferredUsername ?? a.acct?.split('@')[0] ?? '',
              domain:
                a.acct?.split('@')[1] ??
                a.domain ??
                (a.url ? (() => { try { return new URL(a.url).hostname; } catch { return ''; } })() : ''),
              display_name: a.display_name ?? a.name ?? a.username ?? '',
              bio: a.note ?? a.summary ?? a.bio ?? '',
              avatar_url: a.avatar ?? a.avatar_static ?? a.avatar_url ?? a.icon?.url ?? null,
            }))
            .filter((a: any) => a.username && a.actor_url);

          setFediverseResults(prev => {
            const existing = new Set(prev.map((r: any) => r.actor_url));
            return [
              ...prev,
              ...mapped.filter((a: any) => !existing.has(a.actor_url)),
            ];
          });
        }
      } catch { /* gateway search unavailable */ }

      // 3. Direct WebFinger lookup for @user@domain format
      if (cleaned.includes('@')) {
        try {
          const actor = await federation.getUser(cleaned);
          if (actor) {
            const account = {
              actor_url: actor.id || actor.actor_url || cleaned,
              username: actor.preferredUsername || cleaned.split('@')[0],
              domain: cleaned.split('@')[1] || '',
              display_name: actor.name ?? actor.preferredUsername,
              bio: actor.summary,
              avatar_url: actor.icon?.url ?? actor.avatar_url,
              raw_actor: actor,
            };
            setFediverseResults((prev) => {
              const exists = prev.some((r) => r.actor_url === account.actor_url);
              return exists ? prev : [account, ...prev];
            });
          }
        } catch { /* WebFinger lookup failed */ }
      }

      setFediverseLoading(false);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      saveRecentSearch(query.trim());
      setShowAutocomplete(false);
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setShowAutocomplete(true);
    // Autocomplete debounce: 200ms
    if (acDebounceRef.current) clearTimeout(acDebounceRef.current);
    acDebounceRef.current = setTimeout(() => fetchAutocomplete(val), 200);
    // Full search debounce: 300ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => performSearch(val.trim()), 300);
    }
  };

  const handleFediverseFollow = async (account: any) => {
    if (!user) { navigate('/auth'); return; }
    try {
      // Prefer acct/actor_url for gateway follow
      const target = account.actor_url || `${account.username}@${account.domain}`;
      await federation.follow(target);
      toast.success(`Follow request sent to @${account.username}@${account.domain}`);
    } catch (err) {
      console.error('follow failed', err);
      toast.error('Follow failed');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Search" showBack />

      <div className="sticky top-14 z-30 bg-background border-b border-border" ref={searchContainerRef}>
        <form onSubmit={handleSearch} className="p-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search posts, people, or @user@domain…"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => setShowAutocomplete(true)}
              className="pl-12 h-11 rounded-full bg-muted border-0 focus-visible:ring-2 focus-visible:ring-primary"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setAcUsers([]); setAcHashtags([]); setShowAutocomplete(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}

            {/* ── Autocomplete Dropdown ────────────────────────────────── */}
            {showAutocomplete && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto">

                {/* Recent searches (when input is short/empty) */}
                {recentSearches.length > 0 && !acUsers.length && !acHashtags.length && (
                  <div>
                    <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recent</p>
                      <button type="button" onClick={() => { setRecentSearches([]); localStorage.removeItem('tsocial_recent_searches'); }}
                        className="text-[10px] text-muted-foreground hover:text-foreground">Clear all</button>
                    </div>
                    {recentSearches.map(s => (
                      <div key={s} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors group">
                        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                        <button type="button" className="flex-1 text-sm text-left"
                          onClick={() => { setQuery(s); setShowAutocomplete(false); navigate(`/search?q=${encodeURIComponent(s)}`); saveRecentSearch(s); }}>
                          {s}
                        </button>
                        <button type="button" onClick={() => clearRecentSearch(s)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* User suggestions */}
                {acUsers.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-1.5">People</p>
                    {acUsers.map(u => (
                      <button type="button" key={u.id}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                        onClick={() => { saveRecentSearch(`@${u.username}`); setShowAutocomplete(false); navigate(`/profile/${u.username}`); }}>
                        <div className="w-8 h-8 rounded-full bg-muted overflow-hidden shrink-0">
                          {u.avatar_url
                            ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" />
                            : <div className="w-full h-full flex items-center justify-center font-bold text-xs">{u.username[0]?.toUpperCase()}</div>}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-semibold truncate">@{u.username}</span>
                            {u.verified && <BadgeCheck className="w-3 h-3 text-primary shrink-0" fill="currentColor" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground">{formatNumber(u.followers_count || 0)} followers</p>
                        </div>
                        <TrendingUp className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Hashtag suggestions */}
                {acHashtags.length > 0 && (
                  <div className="pb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-2">Hashtags</p>
                    <div className="flex flex-wrap gap-2 px-4">
                      {acHashtags.map(h => (
                        <button type="button" key={h.id}
                          onClick={() => { saveRecentSearch(`#${h.tag}`); setShowAutocomplete(false); navigate(`/hashtag/${h.tag}`); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/8 hover:bg-primary/15 border border-primary/15 rounded-full text-xs font-semibold text-primary transition-colors">
                          <Hash className="w-3 h-3" />
                          <span>#{h.tag}</span>
                          <span className="text-primary/50 font-normal">{formatNumber(h.usage_count)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* No results state */}
                {query.trim().length >= 2 && !acUsers.length && !acHashtags.length && !recentSearches.length && (
                  <div className="px-4 py-5 text-center text-sm text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No suggestions for "{query}"
                  </div>
                )}
              </div>
            )}
          </div>
        </form>

        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-4 py-3.5 font-semibold transition-colors border-b-2 flex items-center gap-1.5 text-sm ${
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {tab === 'Fediverse' && <Globe className="w-3.5 h-3.5" />}
              {tab === 'Hashtags' && <Hash className="w-3.5 h-3.5" />}
              {tab === 'Communities' && <Users className="w-3.5 h-3.5" />}
              {tab}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {activeTab === 'Posts' && (
            posts.length > 0 ? (
              posts.map((post) => (
                <PostCard key={post.id} post={post} onUpdate={() => performSearch(query)} />
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No posts found{query ? ` for "${query}"` : ''}</p>
              </div>
            )
          )}

          {activeTab === 'Users' && (
            <div className="divide-y divide-border">
              {users.length > 0 ? (
                users.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => navigate(`/profile/${u.username}`)}
                    className="p-4 hover:bg-muted/5 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted overflow-hidden">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold">
                            {u.username[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <p className="font-semibold">{u.username}</p>
                          {u.verified && (
                            <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />
                          )}
                        </div>
                        {u.bio && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{u.bio}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {u.followers_count} followers
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No users found{query ? ` for "${query}"` : ''}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Hashtags' && (
            <div className="divide-y divide-border">
              {hashtags.length > 0 ? (
                hashtags.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => navigate(`/hashtag/${h.tag}`)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Hash className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-primary">#{h.tag}</p>
                      <p className="text-sm text-muted-foreground">{formatNumber(h.usage_count)} posts</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Hash className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No hashtags found{query ? ` for "${query}"` : ''}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Communities' && (
            <div className="divide-y divide-border">
              {communities.length > 0 ? (
                communities.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/c/${c.name}`)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-12 h-12 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                      {c.icon_url ? (
                        <img src={c.icon_url} alt={c.display_name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold">{c.display_name[0]}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{c.display_name}</p>
                      {c.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{c.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <Users className="w-3 h-3 inline mr-1" />
                        {formatNumber(c.member_count)} members
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No communities found{query ? ` for "${query}"` : ''}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Fediverse' && (
            <div className="divide-y divide-border">
              {/* Search hint */}
              <div className="px-4 py-3 bg-purple-500/5 border-b border-purple-500/10">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-purple-500" />
                  Search across Mastodon, Misskey, Pleroma and 8000+ servers — use @user@domain format
                </p>
              </div>

              {fediverseLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}

              {!fediverseLoading && fediverseResults.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Search for Fediverse users</p>
                  <p className="text-sm mt-1">Try: @alice@mastodon.social</p>
                </div>
              )}

              {fediverseResults.map((account: any) => (
                <div key={account.actor_url} className="p-4 hover:bg-muted/5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-muted overflow-hidden shrink-0">
                      {account.avatar_url ? (
                        <img src={account.avatar_url} alt={account.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-lg">
                          {account.username[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{account.display_name || account.username}</p>
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/10 rounded-full">
                          <Globe className="w-3 h-3 text-purple-500" />
                          <span className="text-xs text-purple-500">{account.domain}</span>
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">@{account.username}@{account.domain}</p>
                      {account.bio && (
                        <div
                          className="text-xs text-muted-foreground mt-0.5 line-clamp-2"
                          dangerouslySetInnerHTML={{ __html: account.bio }}
                        />
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <a
                        href={account.actor_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-muted rounded-full transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-4 h-4 text-muted-foreground" />
                      </a>
                      <button
                        onClick={() => handleFediverseFollow(account)}
                        className="p-2 hover:bg-primary/10 rounded-full transition-colors"
                        title="Follow"
                      >
                        <UserPlus className="w-4 h-4 text-primary" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
