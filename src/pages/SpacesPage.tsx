import { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { Space } from '@/types/app-types';
import {
  Radio, Users, Mic, Loader2, Headphones, Video, Settings, BadgeCheck,
  Lock, Play, Clock, Hash, Rss, Search, Bell, BellOff, Copy, Share2,
  CalendarDays, ChevronDown, Check, TrendingUp, Bookmark, Star,
  Plus, ListMusic, X, Trash2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, intervalToDuration, format, isPast } from 'date-fns';
import { formatNumber } from '@/lib/utils';
import { StartSpaceDialog } from '@/components/features/StartSpaceDialog';
import { JoinSpaceDialog } from '@/components/features/JoinSpaceDialog';
import { ManageSpaceDialog } from '@/components/features/ManageSpaceDialog';
import { toast } from 'sonner';
import { useSEO } from '@/hooks/useSEO';
import { PageAdBanner } from '@/components/features/AdSenseAd';
function SpacesAdBanner() { return <PageAdBanner />; }

// Module-level constants — esbuild-safe
const CATEGORIES = [
  { id: 'all',           name: 'All',           emoji: '🎙️' },
  { id: 'technology',    name: 'Tech',           emoji: '💻' },
  { id: 'business',      name: 'Business',       emoji: '💼' },
  { id: 'entertainment', name: 'Entertainment',  emoji: '🎭' },
  { id: 'education',     name: 'Education',      emoji: '📚' },
  { id: 'news',          name: 'News',           emoji: '📰' },
  { id: 'comedy',        name: 'Comedy',         emoji: '😂' },
  { id: 'music',         name: 'Music',          emoji: '🎵' },
  { id: 'health',        name: 'Health',         emoji: '🏃' },
  { id: 'sports',        name: 'Sports',         emoji: '⚽' },
] as const;

const SPACE_TABS = ['live', 'recordings', 'upcoming', 'playlists'] as const;
type SpaceTab = typeof SPACE_TABS[number];

// Live reaction emojis at module scope to prevent render-scope allocation (esbuild guard)
const LIVE_EMOJIS = ['❤️', '🔥', '🎉', '👏', '🤣', '💯'] as const;

function formatDurationSecs(secs: number) {
  const d = intervalToDuration({ start: 0, end: secs * 1000 });
  if ((d.hours ?? 0) > 0) return `${d.hours}h ${d.minutes ?? 0}m`;
  return `${d.minutes ?? 0}m ${d.seconds ?? 0}s`;
}

interface FloatingReaction { id: string; emoji: string; x: number; }
interface Playlist { id: string; name: string; items: string[]; }

export default function SpacesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SpaceTab>('live');
  const [allRecordings, setAllRecordings] = useState<any[]>([]);
  const [scheduledSpaces, setScheduledSpaces] = useState<any[]>([]);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [liveViewerCounts, setLiveViewerCounts] = useState<{ [id: string]: number }>({});
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [followingHosts, setFollowingHosts] = useState<Set<string>>(() => new Set<string>());
  const [followingLoading, setFollowingLoading] = useState<string | null>(null);
  const [savedRecordings, setSavedRecordings] = useState<Set<string>>(() => new Set<string>());
  const [showRssModal, setShowRssModal] = useState(false);
  const [rssUser, setRssUser] = useState('');
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => new Set<string>());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Live Reactions ──────────────────────────────────────────────────────────
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const reactionTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const sendLiveReaction = useCallback((emoji: string) => {
    const reaction: FloatingReaction = { id: `${Date.now()}-${Math.random()}`, emoji, x: 10 + Math.random() * 80 };
    setFloatingReactions(prev => [...prev, reaction]);
    const t = setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== reaction.id)), 2200);
    reactionTimers.current.push(t);
  }, []);

  useEffect(() => { return () => { reactionTimers.current.forEach(clearTimeout); }; }, []);

  // ── Podcast Playlists ──────────────────────────────────────────────────────
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try { const r = localStorage.getItem('podcast_playlists'); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlistForRec, setPlaylistForRec] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const savePlaylists = useCallback((updated: Playlist[]) => {
    setPlaylists(updated);
    localStorage.setItem('podcast_playlists', JSON.stringify(updated));
  }, []);

  const createPlaylist = useCallback((recId: string | null) => {
    if (!newPlaylistName.trim()) return;
    const pl: Playlist = { id: `pl_${Date.now()}`, name: newPlaylistName.trim(), items: recId ? [recId] : [] };
    savePlaylists([...playlists, pl]);
    toast.success(`Playlist "${pl.name}" created`);
    setNewPlaylistName('');
    setShowPlaylistModal(false);
  }, [newPlaylistName, playlists, savePlaylists]);

  const addToPlaylist = useCallback((plId: string, recId: string) => {
    const updated = playlists.map(pl =>
      pl.id === plId ? { ...pl, items: pl.items.includes(recId) ? pl.items : [...pl.items, recId] } : pl
    );
    savePlaylists(updated);
    toast.success('Added to playlist');
    setShowPlaylistModal(false);
  }, [playlists, savePlaylists]);

  const removeFromPlaylist = useCallback((plId: string, recId: string) => {
    savePlaylists(playlists.map(pl => pl.id === plId ? { ...pl, items: pl.items.filter(id => id !== recId) } : pl));
  }, [playlists, savePlaylists]);

  const deletePlaylist = useCallback((plId: string) => {
    savePlaylists(playlists.filter(pl => pl.id !== plId));
    toast.success('Playlist deleted');
  }, [playlists, savePlaylists]);

  const liveSpaces = spaces.filter(s => s.is_live);
  const topSpace = liveSpaces[0];

  useSEO({
    title: liveSpaces.length > 0
      ? `${liveSpaces.length} Live Space${liveSpaces.length !== 1 ? 's' : ''} — Audio & Podcasts`
      : 'Spaces — Live Audio & Podcast Rooms',
    description: topSpace
      ? `Now live: "${topSpace.title}" with ${topSpace.listener_count ?? 0} listeners. Join live audio rooms, podcasts, and creator spaces on Testagram.`
      : 'Join live audio rooms, podcast episodes, and creator conversations on Testagram. Start or join a Space now.',
    url: '/spaces',
    type: 'website',
    keywords: 'live audio, podcast, spaces, testagram, creator rooms, live conversations, audio streaming',
  });

  useEffect(() => {
    fetchSpaces();
    fetchAllRecordings();
    fetchScheduledSpaces();
    if (user) { fetchUserProfile(); fetchFollowingHosts(); loadSavedRecordings(); }
  }, [user]);

  useEffect(() => {
    if (spaces.length === 0) return;
    const pollViewers = async () => {
      const ids = spaces.map(s => s.id);
      const { data } = await supabase.from('space_participants').select('space_id').in('space_id', ids);
      if (!data) return;
      const counts: { [id: string]: number } = {};
      for (const id of ids) counts[id] = 0;
      for (const row of data) counts[row.space_id] = (counts[row.space_id] ?? 0) + 1;
      setLiveViewerCounts(counts);
    };
    pollViewers();
    const iv = setInterval(pollViewers, 10_000);
    return () => clearInterval(iv);
  }, [spaces]);

  const fetchUserProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('verified, subscriber_count, followers_count, creator_tier, username').eq('id', user.id).single();
    if (data) setUserProfile(data);
  };

  const fetchFollowingHosts = async () => {
    if (!user) return;
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
    if (data) setFollowingHosts(new Set(data.map((r: any) => r.following_id)));
  };

  const loadSavedRecordings = () => {
    try { const raw = localStorage.getItem('saved_recordings'); if (raw) setSavedRecordings(new Set(JSON.parse(raw))); } catch { /* ignore */ }
  };

  const toggleSaveRecording = useCallback((recId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedRecordings(prev => {
      const next = new Set(prev);
      if (next.has(recId)) next.delete(recId); else next.add(recId);
      localStorage.setItem('saved_recordings', JSON.stringify([...next]));
      toast.success(next.has(recId) ? 'Episode saved' : 'Episode removed from saved');
      return next;
    });
  }, []);

  const toggleFollowHost = useCallback(async (hostId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { navigate('/auth'); return; }
    setFollowingLoading(hostId);
    const isFollowing = followingHosts.has(hostId);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', hostId);
      setFollowingHosts(prev => { const s = new Set(prev); s.delete(hostId); return s; });
      toast.success('Unfollowed host');
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: hostId });
      setFollowingHosts(prev => new Set([...prev, hostId]));
      toast.success("Following host — you'll be notified when they go live");
    }
    setFollowingLoading(null);
  }, [user, followingHosts, navigate]);

  const handleShareSpace = useCallback((id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/spaces?space=${id}`;
    if (navigator.share) { navigator.share({ title, url }).catch(() => {}); }
    else { navigator.clipboard.writeText(url).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); toast.success('Link copied!'); }); }
  }, []);

  const fetchSpaces = async () => {
    try {
      const { data, error } = await supabase.from('spaces').select('*, host:user_profiles!spaces_host_id_fkey(*)').eq('is_live', true).order('listener_count', { ascending: false });
      if (error) throw error;
      setSpaces(data || []);
    } catch { } finally { setLoading(false); }
  };

  const fetchAllRecordings = async () => {
    const { data } = await supabase.from('space_recordings')
      .select('*, user_profiles(*), spaces(title, description, category, artwork_url, episode_number, chapters, tags, subscriber_only, host:user_profiles!spaces_host_id_fkey(*))')
      .order('created_at', { ascending: false }).limit(40);
    if (data) setAllRecordings(data);
  };

  const fetchScheduledSpaces = async () => {
    const { data } = await supabase.from('spaces').select('*, host:user_profiles!spaces_host_id_fkey(*)')
      .eq('is_live', false).is('ended_at', null).order('created_at', { ascending: false }).limit(20);
    if (data) setScheduledSpaces(data);
  };

  const handleStartSpace = () => {
    if (!user) { navigate('/auth'); return; }
    if (!userProfile?.verified) { toast.error('Only verified users can start Audio Spaces'); return; }
    setShowStartDialog(true);
  };

  const filteredSpaces = spaces.filter(s => {
    const matchCat = activeCategory === 'all' || (s as any).category === activeCategory;
    const matchSearch = !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const filteredRecordings = allRecordings.filter(r => {
    const matchCat = activeCategory === 'all' || r.spaces?.category === activeCategory;
    const matchSearch = !searchQuery || r.spaces?.title?.toLowerCase().includes(searchQuery.toLowerCase()) || r.title?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const filteredScheduled = scheduledSpaces.filter(s => {
    const matchCat = activeCategory === 'all' || (s as any).category === activeCategory;
    const matchSearch = !searchQuery || s.title?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Spaces" />

      {/* Floating live reactions */}
      <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
        {floatingReactions.map(r => (
          <div key={r.id} className="absolute bottom-24 text-3xl select-none"
            style={{ left: `${r.x}%`, animation: 'floatUp 2.2s ease-out forwards' }}>
            {r.emoji}
          </div>
        ))}
      </div>

      {/* Hero banner */}
      <div className="bg-gradient-to-br from-primary/15 via-background to-purple-500/10 border-b border-border px-4 py-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2">
              <Radio className="w-6 h-6 text-primary" />Audio Spaces
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Live podcasts, panels & conversations</p>
          </div>
          {user && (
            <Button className="rounded-full shadow-lg shadow-primary/20" onClick={handleStartSpace}>
              <Mic className="w-4 h-4 mr-1.5" />Go Live
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /><strong className="text-foreground">{spaces.length}</strong> live now</span>
          <span className="flex items-center gap-1.5"><Headphones className="w-3.5 h-3.5" /><strong className="text-foreground">{allRecordings.length}</strong> episodes</span>
          {scheduledSpaces.length > 0 && <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-blue-500" /><strong className="text-foreground">{scheduledSpaces.length}</strong> upcoming</span>}
          <button onClick={() => { setRssUser(userProfile?.username ?? ''); setShowRssModal(true); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-orange-500 transition-colors ml-auto">
            <Rss className="w-3.5 h-3.5" /> RSS
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search spaces, podcasts, hosts…"
            className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>

      {/* Live Reaction Rail — shown only when live spaces exist */}
      {activeTab === 'live' && filteredSpaces.length > 0 && (
        <div className="flex items-center justify-center gap-3 py-2.5 bg-gradient-to-r from-red-500/5 to-orange-500/5 border-b border-red-500/10">
          <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />React Live
          </span>
          {LIVE_EMOJIS.map(e => (
            <button key={e} onClick={() => sendLiveReaction(e)}
              className="text-2xl hover:scale-125 active:scale-110 transition-transform duration-100"
              title={`React with ${e}`}>
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Category pills */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-border">
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              activeCategory === cat.id ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}>
            <span>{cat.emoji}</span>{cat.name}
          </button>
        ))}
      </div>

      <SpacesAdBanner />

      {/* Verified badge info */}
      {user && !userProfile?.verified && (
        <div className="mx-4 mt-4 flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
          <Lock className="w-5 h-5 text-orange-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-700 dark:text-orange-400">Verified accounts only</p>
            <p className="text-xs text-orange-600 dark:text-orange-500">Get verified to host live audio spaces</p>
          </div>
          <button onClick={() => navigate('/verify')}
            className="ml-auto text-xs font-bold text-orange-600 px-3 py-1.5 border border-orange-300 dark:border-orange-700 rounded-full hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors shrink-0">
            Apply
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="sticky top-0 z-30 bg-background border-b border-border">
        <div className="flex">
          {([
            { key: 'live',       icon: Radio,        label: 'Live',      badge: spaces.length > 0 ? spaces.length : 0,             badgeColor: 'bg-red-500/10 text-red-500' },
            { key: 'recordings', icon: Headphones,   label: 'Episodes',  badge: 0,                                                  badgeColor: '' },
            { key: 'upcoming',   icon: CalendarDays, label: 'Upcoming',  badge: scheduledSpaces.length > 0 ? scheduledSpaces.length : 0, badgeColor: 'bg-blue-500/10 text-blue-500' },
            { key: 'playlists',  icon: ListMusic,    label: 'Playlists', badge: playlists.length > 0 ? playlists.length : 0,         badgeColor: 'bg-primary/10 text-primary' },
          ] as const).map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key as SpaceTab)}
                className={`flex-1 py-3 font-semibold text-xs border-b-2 transition-colors flex items-center justify-center gap-1 ${
                  activeTab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {t.badge > 0 && <span className={`ml-0.5 px-1.5 py-0.5 text-[9px] rounded-full font-bold ${t.badgeColor}`}>{t.badge}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4">

        {/* ── LIVE TAB ── */}
        {activeTab === 'live' && (
          filteredSpaces.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4"><Radio className="w-10 h-10 text-primary" /></div>
              <h3 className="text-xl font-bold mb-2">No live Spaces</h3>
              <p className="text-muted-foreground text-sm mb-6">Check back later or start one yourself</p>
              {user && userProfile?.verified && (
                <Button className="rounded-full" onClick={handleStartSpace}><Radio className="w-4 h-4 mr-2" />Start a Space</Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSpaces.map(space => {
                const ep = (space as any).episode_number;
                const cats = (space as any).category;
                const catMeta = CATEGORIES.find(c => c.id === cats);
                const tags: string[] = (space as any).tags ?? [];
                const hostId = space.host_id;
                const isOwnSpace = user?.id === hostId;
                const isSubscriberOnly = (space as any).subscriber_only;
                return (
                  <div key={space.id} className="border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-colors">
                    <div className="relative bg-gradient-to-br from-primary/8 to-purple-500/5 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-primary/20 to-purple-500/20 flex-shrink-0 shadow-md">
                          {(space as any).artwork_url
                            ? <img src={(space as any).artwork_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-2xl">{catMeta?.emoji ?? '🎙️'}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className="flex items-center gap-1 text-red-500 font-bold text-xs"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />LIVE</span>
                            {catMeta && <span className="text-xs text-muted-foreground">{catMeta.emoji} {catMeta.name}</span>}
                            {ep && <span className="text-xs text-muted-foreground">· Ep. {ep}</span>}
                            {(space as any).has_video && <span className="flex items-center gap-0.5 text-xs text-primary"><Video className="w-3 h-3" />Video</span>}
                            {isSubscriberOnly && (
                              <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-bold">
                                <Star className="w-2.5 h-2.5" />Subscribers only
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-base leading-snug">{space.title}</h3>
                          {space.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{space.description}</p>}
                        </div>
                        <div className="flex flex-col gap-1">
                          {isOwnSpace && (
                            <button onClick={e => { e.stopPropagation(); setSelectedSpace(space); setShowManageDialog(true); }} className="p-2 hover:bg-muted rounded-lg">
                              <Settings className="w-4 h-4 text-muted-foreground" />
                            </button>
                          )}
                          <button onClick={e => handleShareSpace(space.id, space.title, e)} className="p-2 hover:bg-muted rounded-lg">
                            {copiedId === space.id ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    {tags.length > 0 && (
                      <div className="flex gap-1.5 px-4 py-2 border-b border-border bg-muted/20 overflow-x-auto scrollbar-hide">
                        {tags.map(tag => (
                          <span key={tag} className="flex items-center gap-0.5 px-2 py-0.5 bg-muted rounded-full text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                            <Hash className="w-2.5 h-2.5" />{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0">
                          {space.host?.avatar_url ? <img src={space.host.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center font-bold text-sm">{space.host?.username?.[0]?.toUpperCase()}</div>}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="font-semibold text-sm truncate">{space.host?.username}</p>
                            {space.host?.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{formatNumber(space.listener_count)} listening</span>
                            {liveViewerCounts[space.id] !== undefined && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px] font-bold">
                                <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />{liveViewerCounts[space.id]} live
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!isOwnSpace && user && (
                          <button onClick={e => toggleFollowHost(hostId, e)} disabled={followingLoading === hostId}
                            className={`flex items-center gap-1 px-3 py-2 rounded-full text-xs font-bold border transition-all ${followingHosts.has(hostId) ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30 hover:text-primary'}`}>
                            {followingLoading === hostId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : followingHosts.has(hostId) ? <><BellOff className="w-3.5 h-3.5" />Following</> : <><Bell className="w-3.5 h-3.5" />Follow</>}
                          </button>
                        )}
                        <Button className="rounded-full" onClick={() => { setSelectedSpaceId(space.id); setShowJoinDialog(true); }}>
                          <Headphones className="w-4 h-4 mr-1.5" />{isSubscriberOnly ? 'Subscribe' : 'Listen'}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── RECORDINGS TAB ── */}
        {activeTab === 'recordings' && (
          filteredRecordings.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4"><Headphones className="w-10 h-10 text-muted-foreground" /></div>
              <h3 className="text-xl font-bold mb-2">No episodes yet</h3>
              <p className="text-muted-foreground text-sm">Recorded spaces will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Controls row */}
              <div className="flex items-center gap-2 pb-1">
                {savedRecordings.size > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary">{savedRecordings.size} saved</span>
                  </div>
                )}
                <button onClick={() => { setPlaylistForRec(null); setShowPlaylistModal(true); }}
                  className="flex items-center gap-1.5 ml-auto px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-bold hover:bg-primary/20 transition-colors">
                  <ListMusic className="w-3.5 h-3.5" />Playlists {playlists.length > 0 ? `(${playlists.length})` : ''}
                </button>
              </div>

              {filteredRecordings.map((rec, i) => {
                const ep = rec.spaces?.episode_number ?? i + 1;
                const cat = rec.spaces?.category;
                const catMeta = CATEGORIES.find(c => c.id === cat);
                const hasVideo = rec.has_video && rec.video_url;
                const isSubscriberOnly = rec.spaces?.subscriber_only;
                const chapters: any[] = rec.spaces?.chapters ?? [];
                const tags: string[] = rec.spaces?.tags ?? [];
                const isSaved = savedRecordings.has(rec.id);
                const isChaptersExpanded = expandedChapters.has(rec.id);
                const hostUsername = rec.spaces?.host?.username ?? rec.user_profiles?.username;
                const hostId = rec.spaces?.host?.id ?? rec.user_id;
                return (
                  <div key={rec.id} className="border border-border rounded-2xl overflow-hidden hover:border-primary/20 transition-colors cursor-pointer bg-card" onClick={() => navigate(`/space-recording/${rec.id}`)}>
                    <div className="flex items-start gap-3 p-4">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-primary/15 to-purple-500/10 flex-shrink-0 shadow-sm">
                        {rec.spaces?.artwork_url ? <img src={rec.spaces.artwork_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">{catMeta?.emoji ?? '🎙️'}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          {catMeta && <span className="text-[10px] text-muted-foreground">{catMeta.emoji} {catMeta.name}</span>}
                          <span className="text-[10px] text-muted-foreground">· Ep. {ep}</span>
                          {hasVideo && <span className="flex items-center gap-0.5 text-[10px] text-primary"><Video className="w-2.5 h-2.5" />Video</span>}
                          {isSubscriberOnly && (
                            <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full font-bold border border-amber-500/20"><Star className="w-2.5 h-2.5" />Subscribers</span>
                          )}
                        </div>
                        <h4 className="font-bold text-sm leading-snug line-clamp-2">{rec.spaces?.title ?? rec.title}</h4>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded-full bg-muted overflow-hidden">
                              {rec.user_profiles?.avatar_url ? <img src={rec.user_profiles.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-[8px] font-bold">{rec.user_profiles?.username?.[0]?.toUpperCase()}</div>}
                            </div>
                            <span>@{hostUsername}</span>
                          </div>
                          {rec.duration > 0 && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{formatDurationSecs(rec.duration)}</span>}
                          {rec.listener_count > 0 && <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{formatNumber(rec.listener_count)}</span>}
                          <span>{formatDistanceToNow(new Date(rec.created_at), { addSuffix: true })}</span>
                        </div>
                        {tags.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {tags.slice(0, 3).map(tag => <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">#{tag}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button onClick={e => { e.stopPropagation(); navigate(`/space-recording/${rec.id}`); }}
                          className="w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors">
                          <Play className="w-4 h-4 text-primary ml-0.5" fill="currentColor" />
                        </button>
                        <button onClick={e => toggleSaveRecording(rec.id, e)}
                          className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${isSaved ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30 hover:text-primary'}`}>
                          <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setPlaylistForRec(rec.id); setShowPlaylistModal(true); }}
                          className="w-10 h-10 rounded-full border border-border text-muted-foreground hover:border-primary/30 hover:text-primary flex items-center justify-center transition-all"
                          title="Add to playlist">
                          <ListMusic className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {user && hostId && user.id !== hostId && (
                      <div className="px-4 pb-3 flex items-center gap-2 border-t border-border pt-2.5">
                        <div className="flex-1 text-xs text-muted-foreground">Hosted by @{hostUsername}</div>
                        <button onClick={e => toggleFollowHost(hostId, e)} disabled={followingLoading === hostId}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${followingHosts.has(hostId) ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/20 hover:text-primary'}`}>
                          {followingLoading === hostId ? <Loader2 className="w-3 h-3 animate-spin" /> : followingHosts.has(hostId) ? <><Check className="w-3 h-3" />Following</> : <><Bell className="w-3 h-3" />Follow</>}
                        </button>
                        <button onClick={e => handleShareSpace(rec.id, rec.spaces?.title ?? rec.title, e)}
                          className="p-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors">
                          {copiedId === rec.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                    {chapters.length > 0 && (
                      <div className="border-t border-border">
                        <button onClick={e => { e.stopPropagation(); setExpandedChapters(prev => { const s = new Set(prev); s.has(rec.id) ? s.delete(rec.id) : s.add(rec.id); return s; }); }}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted/30 transition-colors">
                          <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-primary" />{chapters.length} Chapters</span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isChaptersExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isChaptersExpanded && (
                          <div className="px-4 pb-3 space-y-1.5">
                            {(chapters as any[]).map((ch: any, ci: number) => (
                              <div key={ci} className="flex items-center gap-3 py-1.5 border-t border-border/50 first:border-0">
                                <span className="text-[10px] font-black text-primary bg-primary/10 w-5 h-5 rounded-full flex items-center justify-center shrink-0">{ci + 1}</span>
                                <p className="text-xs font-medium flex-1 truncate">{ch.title ?? `Chapter ${ci + 1}`}</p>
                                {ch.timestamp && <span className="text-[10px] text-muted-foreground font-mono shrink-0">{ch.timestamp}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {rec.audio_url && (
                      <div className="px-4 pb-3" onClick={e => e.stopPropagation()}>
                        <audio controls src={rec.audio_url} className="w-full h-8" controlsList="nodownload" style={{ borderRadius: '0.5rem' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── UPCOMING TAB ── */}
        {activeTab === 'upcoming' && (
          filteredScheduled.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4"><CalendarDays className="w-10 h-10 text-blue-500" /></div>
              <h3 className="text-xl font-bold mb-2">No upcoming spaces</h3>
              <p className="text-muted-foreground text-sm">Scheduled spaces will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 py-1">
                <CalendarDays className="w-4 h-4 text-blue-500" />
                <p className="text-sm font-bold">{filteredScheduled.length} upcoming space{filteredScheduled.length !== 1 ? 's' : ''}</p>
              </div>
              {filteredScheduled.map(space => {
                const catMeta = CATEGORIES.find(c => c.id === (space as any).category);
                const isOwnSpace = user?.id === space.host_id;
                const scheduledFor = space.started_at ? new Date(space.started_at) : null;
                const isStartingSoon = scheduledFor && !isPast(scheduledFor) && (scheduledFor.getTime() - Date.now()) < 3600000;
                return (
                  <div key={space.id} className="border border-blue-500/20 bg-blue-500/5 rounded-2xl overflow-hidden hover:border-blue-500/40 transition-colors">
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500/20 to-primary/20 flex-shrink-0 shadow-sm">
                          {(space as any).artwork_url ? <img src={(space as any).artwork_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">{catMeta?.emoji ?? '🎙️'}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            {isStartingSoon && <span className="flex items-center gap-1 text-[10px] font-black text-orange-500 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full animate-pulse">Starting soon</span>}
                            {catMeta && <span className="text-[10px] text-muted-foreground">{catMeta.emoji} {catMeta.name}</span>}
                          </div>
                          <h3 className="font-bold text-sm leading-snug">{space.title}</h3>
                          {space.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{space.description}</p>}
                          {scheduledFor && (
                            <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                              <CalendarDays className="w-3.5 h-3.5 text-blue-500" />
                              <span className="text-blue-600 dark:text-blue-400 font-semibold">{isPast(scheduledFor) ? 'Was scheduled for' : 'Scheduled for'} {format(scheduledFor, 'MMM d, h:mm a')}</span>
                            </div>
                          )}
                        </div>
                        {!isOwnSpace && user && (
                          <button onClick={e => toggleFollowHost(space.host_id, e)}
                            className={`p-2 rounded-full border transition-all shrink-0 ${followingHosts.has(space.host_id) ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30 hover:text-primary'}`}>
                            <Bell className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-500/15">
                        <div className="w-7 h-7 rounded-full bg-muted overflow-hidden">
                          {space.host?.avatar_url ? <img src={space.host.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center font-bold text-xs">{space.host?.username?.[0]?.toUpperCase()}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-semibold">@{space.host?.username}</p>
                          {space.host?.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary" />}
                        </div>
                        <span className="ml-auto text-[10px] text-muted-foreground">Created {formatDistanceToNow(new Date(space.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── PLAYLISTS TAB ── */}
        {activeTab === 'playlists' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">My Playlists</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Curate your podcast episodes</p>
              </div>
              <button onClick={() => { setPlaylistForRec(null); setShowPlaylistModal(true); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90">
                <Plus className="w-3.5 h-3.5" />New Playlist
              </button>
            </div>

            {playlists.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ListMusic className="w-14 h-14 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">No playlists yet</p>
                <p className="text-sm mt-1">Save episodes and group them into playlists</p>
              </div>
            ) : (
              <div className="space-y-3">
                {playlists.map(pl => {
                  const epList = allRecordings.filter(r => pl.items.includes(r.id));
                  return (
                    <div key={pl.id} className="border border-border rounded-2xl overflow-hidden bg-card">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                            <ListMusic className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-bold text-sm">{pl.name}</p>
                            <p className="text-[10px] text-muted-foreground">{pl.items.length} episode{pl.items.length !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <button onClick={() => deletePlaylist(pl.id)} className="p-2 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {epList.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No episodes yet — add from the Episodes tab</p>
                      ) : (
                        <div className="divide-y divide-border max-h-52 overflow-y-auto">
                          {epList.map((rec: any, idx: number) => (
                            <div key={rec.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                              <span className="text-[10px] font-black text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                              <button onClick={() => navigate(`/space-recording/${rec.id}`)} className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <Play className="w-3.5 h-3.5 text-primary ml-0.5" fill="currentColor" />
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{rec.spaces?.title ?? rec.title}</p>
                                <p className="text-[10px] text-muted-foreground">@{rec.user_profiles?.username}</p>
                              </div>
                              <button onClick={() => removeFromPlaylist(pl.id, rec.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Playlist Modal ── */}
      {showPlaylistModal && (
        <div className="fixed inset-0 z-[200] bg-black/60 flex items-end" onClick={() => setShowPlaylistModal(false)}>
          <div className="w-full bg-background rounded-t-3xl p-5 space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><ListMusic className="w-5 h-5 text-primary" /><h3 className="font-bold text-lg">Playlists</h3></div>
              <button onClick={() => setShowPlaylistModal(false)} className="p-2 rounded-full hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>

            {/* Create new playlist */}
            <div className="flex gap-2">
              <input type="text" value={newPlaylistName} onChange={e => setNewPlaylistName(e.target.value)}
                placeholder="New playlist name…" maxLength={50}
                onKeyDown={e => { if (e.key === 'Enter' && newPlaylistName.trim()) createPlaylist(playlistForRec); }}
                className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40" />
              <button onClick={() => createPlaylist(playlistForRec)} disabled={!newPlaylistName.trim()}
                className="px-4 h-10 bg-primary text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 hover:opacity-90">Create</button>
            </div>

            {/* Existing playlists (for adding an episode) */}
            {playlistForRec && playlists.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Add to existing playlist</p>
                <div className="space-y-2">
                  {playlists.map(pl => (
                    <button key={pl.id} onClick={() => addToPlaylist(pl.id, playlistForRec)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left">
                      <div className="flex items-center gap-2">
                        <ListMusic className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-sm">{pl.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{pl.items.length} ep</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RSS Modal ── */}
      {showRssModal && (
        <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowRssModal(false)}>
          <div className="bg-background border border-border rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center"><Rss className="w-5 h-5 text-orange-500" /></div>
              <div><h3 className="font-bold">Podcast RSS Feed</h3><p className="text-xs text-muted-foreground">Subscribe in any podcast app</p></div>
              <button onClick={() => setShowRssModal(false)} className="ml-auto p-1.5 rounded-full hover:bg-muted text-muted-foreground"><Clock className="w-4 h-4" /></button>
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Username</label>
              <input type="text" value={rssUser} onChange={e => setRssUser(e.target.value)} placeholder="Enter a username…"
                className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/40" />
            </div>
            <div className="bg-muted/30 border border-border rounded-xl p-3 mb-4 font-mono text-xs text-muted-foreground break-all">
              {`${import.meta.env.VITE_SUPABASE_URL?.replace('/v1', '')}/functions/v1/podcast-rss?username=${rssUser || '{username}'}`}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { const url = `${import.meta.env.VITE_SUPABASE_URL?.replace('/v1', '')}/functions/v1/podcast-rss?username=${rssUser}`; navigator.clipboard.writeText(url).then(() => toast.success('RSS URL copied!')); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
                <Copy className="w-4 h-4" /> Copy URL
              </button>
              <button onClick={() => setShowRssModal(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold hover:bg-muted transition-colors">Close</button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-3">Compatible with Apple Podcasts, Spotify, Overcast, Pocket Casts</p>
          </div>
        </div>
      )}

      <StartSpaceDialog open={showStartDialog} onOpenChange={setShowStartDialog} onSuccess={fetchSpaces} />
      <JoinSpaceDialog open={showJoinDialog} onOpenChange={setShowJoinDialog} spaceId={selectedSpaceId} />
      {selectedSpace && (
        <ManageSpaceDialog open={showManageDialog} onOpenChange={setShowManageDialog} space={selectedSpace}
          onSuccess={() => { fetchSpaces(); fetchAllRecordings(); }} />
      )}
    </div>
  );
}
