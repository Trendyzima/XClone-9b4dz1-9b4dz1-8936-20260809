import { useState, useEffect, useRef } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { Space } from '@/types/app-types';
import { Radio, Users, Mic, Loader2, Headphones, Video, Settings, BadgeCheck, Lock, Play, Clock, Hash, Rss } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, intervalToDuration } from 'date-fns';
import { formatNumber } from '@/lib/utils';
import { StartSpaceDialog } from '@/components/features/StartSpaceDialog';
import { JoinSpaceDialog } from '@/components/features/JoinSpaceDialog';
import { ManageSpaceDialog } from '@/components/features/ManageSpaceDialog';
import { toast } from 'sonner';
import { useSEO } from '@/hooks/useSEO';

const CATEGORIES = [
  { id: 'all', name: 'All', emoji: '🎙️' },
  { id: 'technology', name: 'Tech', emoji: '💻' },
  { id: 'business', name: 'Business', emoji: '💼' },
  { id: 'entertainment', name: 'Entertainment', emoji: '🎭' },
  { id: 'education', name: 'Education', emoji: '📚' },
  { id: 'news', name: 'News', emoji: '📰' },
  { id: 'comedy', name: 'Comedy', emoji: '😂' },
  { id: 'music', name: 'Music', emoji: '🎵' },
  { id: 'health', name: 'Health', emoji: '🏃' },
  { id: 'sports', name: 'Sports', emoji: '⚽' },
];

function formatDurationSecs(secs: number) {
  const d = intervalToDuration({ start: 0, end: secs * 1000 });
  if ((d.hours ?? 0) > 0) return `${d.hours}h ${d.minutes ?? 0}m`;
  return `${d.minutes ?? 0}m ${d.seconds ?? 0}s`;
}

export default function SpacesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'recordings'>('live');
  const [allRecordings, setAllRecordings] = useState<any[]>([]);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [liveViewerCounts, setLiveViewerCounts] = useState<Record<string, number>>({});
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── SEO — dynamic title reflects live spaces count ──────────────────────
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
    structuredData: liveSpaces.length > 0 ? {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Live Spaces on Testagram',
      description: `${liveSpaces.length} live audio rooms currently active on Testagram`,
      url: 'https://testagram.site/spaces',
      numberOfItems: Math.min(liveSpaces.length, 5),
      itemListElement: liveSpaces.slice(0, 5).map((space: any, i: number) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: space.title,
        url: `https://testagram.site/spaces`,
        description: `Live space with ${space.listener_count ?? 0} listeners — ${space.category ?? 'general'}`,
      })),
    } : {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Spaces — Live Audio on Testagram',
      description: 'Join live audio rooms, podcast episodes, and creator conversations on Testagram.',
      url: 'https://testagram.site/spaces',
    },
  });

  useEffect(() => {
    fetchSpaces();
    fetchAllRecordings();
    if (user) fetchUserProfile();
  }, [user]);

  useEffect(() => {
    if (spaces.length === 0) return;
    const pollViewers = async () => {
      const ids = spaces.map(s => s.id);
      const { data } = await supabase.from('space_participants').select('space_id').in('space_id', ids);
      if (!data) return;
      const counts: Record<string, number> = {};
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
    const { data } = await supabase
      .from('user_profiles')
      .select('verified, subscriber_count, followers_count, creator_tier')
      .eq('id', user.id)
      .single();
    if (data) setUserProfile(data);
  };

  const fetchSpaces = async () => {
    try {
      const { data, error } = await supabase
        .from('spaces')
        .select('*, host:user_profiles!spaces_host_id_fkey(*)')
        .eq('is_live', true)
        .order('listener_count', { ascending: false });
      if (error) throw error;
      setSpaces(data || []);
    } catch { } finally { setLoading(false); }
  };

  const fetchAllRecordings = async () => {
    const { data } = await supabase
      .from('space_recordings')
      .select('*, user_profiles(*), spaces(title, description, category, artwork_url, episode_number, host:user_profiles!spaces_host_id_fkey(*))')
      .order('created_at', { ascending: false })
      .limit(40);
    if (data) setAllRecordings(data);
  };

  const handleStartSpace = () => {
    if (!user) { navigate('/auth'); return; }
    if (!userProfile?.verified) {
      toast.error('Only verified users can start Audio Spaces', {
        description: 'Get your account verified to host live spaces.',
      });
      return;
    }
    setShowStartDialog(true);
  };

  // Filter spaces
  const filteredSpaces = spaces.filter(s => {
    const matchCat = activeCategory === 'all' || (s as any).category === activeCategory;
    const matchSearch = !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  // ── AdSense push when tab changes ────────────────────────────────────────
  const adPushedRef = useRef(false);
  useEffect(() => {
    if (adPushedRef.current) return;
    adPushedRef.current = true;
    try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch (_) {}
  }, [activeTab]);

  const filteredRecordings = allRecordings.filter(r => {
    const matchCat = activeCategory === 'all' || r.spaces?.category === activeCategory;
    const matchSearch = !searchQuery || r.spaces?.title?.toLowerCase().includes(searchQuery.toLowerCase()) || r.title?.toLowerCase().includes(searchQuery.toLowerCase());
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

      {/* Hero banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-background to-purple-500/10 border-b border-border px-4 py-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2">
              <Radio className="w-6 h-6 text-primary" />
              Audio Spaces
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Live podcasts, panels & conversations</p>
          </div>
          {user && (
            <Button className="rounded-full shadow-lg shadow-primary/20" onClick={handleStartSpace}>
              <Mic className="w-4 h-4 mr-1.5" />
              Go Live
            </Button>
          )}
        </div>

        {/* Live stats strip */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <strong className="text-foreground">{spaces.length}</strong> live now
          </span>
          <span className="flex items-center gap-1.5">
            <Headphones className="w-3.5 h-3.5" />
            <strong className="text-foreground">{allRecordings.length}</strong> recordings
          </span>
          {user && (
            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/functions/v1/podcast-rss?username=${userProfile?.username ?? ''}`); toast.success('RSS feed URL copied!'); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-orange-500 transition-colors ml-auto" title="Copy RSS feed URL">
              <Rss className="w-3.5 h-3.5" /> RSS
            </button>
          )}
          {/* Removed the empty <span> here */}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-border">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search spaces & podcasts…"
          className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Category pills */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-border">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              activeCategory === cat.id
                ? 'bg-primary text-white shadow-sm shadow-primary/20'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <span>{cat.emoji}</span>{cat.name}
          </button>
        ))}
      </div>

      {/* AdSense banner — spaces page */}
      <div className="px-4 pt-3">
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

      {/* Verified badge info */}
      {user && !userProfile?.verified && (
        <div className="mx-4 mt-4 flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
          <Lock className="w-5 h-5 text-orange-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-700 dark:text-orange-400">Verified accounts only</p>
            <p className="text-xs text-orange-600 dark:text-orange-500">Get verified to host live audio spaces</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="sticky top-0 z-30 bg-background border-b border-border">
        <div className="flex">
          <button
            onClick={() => setActiveTab('live')}
            className={`flex-1 py-3 font-semibold text-sm border-b-2 transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'live' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
            }`}
          >
            <Radio className="w-4 h-4" />
            Live Now {spaces.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-red-500/10 text-red-500 text-xs rounded-full font-bold">{spaces.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab('recordings')}
            className={`flex-1 py-3 font-semibold text-sm border-b-2 transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'recordings' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
            }`}
          >
            <Headphones className="w-4 h-4" /> Episodes
          </button>
        </div>
      </div>

      <div className="p-4">
        {activeTab === 'live' && (
          filteredSpaces.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Radio className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">No live Spaces</h3>
              <p className="text-muted-foreground text-sm mb-6">Check back later for live conversations</p>
              {user && userProfile?.verified && (
                <Button className="rounded-full" onClick={handleStartSpace}>
                  <Radio className="w-4 h-4 mr-2" />
                  Start a Space
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSpaces.map(space => {
                const ep = (space as any).episode_number;
                const cats = (space as any).category;
                const catMeta = CATEGORIES.find(c => c.id === cats);
                const tags: string[] = (space as any).tags ?? [];
                return (
                  <div key={space.id} className="border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-colors">
                    {/* Podcast-style header with artwork */}
                    <div className="relative bg-gradient-to-br from-primary/8 to-purple-500/5 p-4">
                      <div className="flex items-start gap-3">
                        {/* Artwork */}
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-primary/20 to-purple-500/20 flex-shrink-0 shadow-md">
                          {(space as any).artwork_url ? (
                            <img src={(space as any).artwork_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">
                              {catMeta?.emoji ?? '🎙️'}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className="flex items-center gap-1 text-red-500 font-bold text-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />LIVE
                            </span>
                            {catMeta && <span className="text-xs text-muted-foreground">{catMeta.emoji} {catMeta.name}</span>}
                            {ep && <span className="text-xs text-muted-foreground">· Ep. {ep}</span>}
                            {(space as any).has_video && <span className="flex items-center gap-0.5 text-xs text-primary"><Video className="w-3 h-3" />Video</span>}
                          </div>
                          <h3 className="font-bold text-base leading-snug">{space.title}</h3>
                          {space.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{space.description}</p>}
                        </div>
                        {user?.id === space.host_id && (
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedSpace(space); setShowManageDialog(true); }}
                            className="p-2 hover:bg-muted rounded-lg"
                          >
                            <Settings className="w-4 h-4 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tags */}
                    {tags.length > 0 && (
                      <div className="flex gap-1.5 px-4 py-2 border-b border-border bg-muted/20 overflow-x-auto scrollbar-hide">
                        {tags.map(tag => (
                          <span key={tag} className="flex items-center gap-0.5 px-2 py-0.5 bg-muted rounded-full text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                            <Hash className="w-2.5 h-2.5" />{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Stats & join */}
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-muted overflow-hidden">
                          {space.host?.avatar_url ? (
                            <img src={space.host.avatar_url} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                              {space.host?.username?.[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1">
                            <p className="font-semibold text-sm">{space.host?.username}</p>
                            {space.host?.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary" />}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{formatNumber(space.listener_count)} listening</span>
                            {liveViewerCounts[space.id] !== undefined && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px] font-bold">
                                <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                                {liveViewerCounts[space.id]} live
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        className="rounded-full"
                        onClick={() => { setSelectedSpaceId(space.id); setShowJoinDialog(true); }}
                      >
                        <Headphones className="w-4 h-4 mr-1.5" />
                        Listen
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {activeTab === 'recordings' && (
          filteredRecordings.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Headphones className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-2">No episodes yet</h3>
              <p className="text-muted-foreground text-sm">Recorded spaces will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecordings.map((rec, i) => {
                const ep = rec.spaces?.episode_number ?? i + 1;
                const cat = rec.spaces?.category;
                const catMeta = CATEGORIES.find(c => c.id === cat);
                const hasVideo = rec.has_video && rec.video_url;
                return (
                  <div key={rec.id}
                    className="border border-border rounded-2xl overflow-hidden hover:border-primary/20 transition-colors cursor-pointer"
                    onClick={() => navigate(`/space-recording/${rec.id}`)}
                  >
                    <div className="flex items-start gap-3 p-4">
                      {/* Episode artwork */}
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-primary/15 to-purple-500/10 flex-shrink-0 shadow-sm">
                        {rec.spaces?.artwork_url ? (
                          <img src={rec.spaces.artwork_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">
                            {catMeta?.emoji ?? '🎙️'}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          {catMeta && <span className="text-[10px] text-muted-foreground">{catMeta.emoji} {catMeta.name}</span>}
                          <span className="text-[10px] text-muted-foreground">· Ep. {ep}</span>
                          {hasVideo && <span className="flex items-center gap-0.5 text-[10px] text-primary"><Video className="w-2.5 h-2.5" />Video</span>}
                        </div>
                        <h4 className="font-bold text-sm leading-snug line-clamp-2">{rec.spaces?.title ?? rec.title}</h4>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded-full bg-muted overflow-hidden">
                              {rec.user_profiles?.avatar_url
                                ? <img src={rec.user_profiles.avatar_url} className="w-full h-full object-cover" alt="" />
                                : <div className="w-full h-full flex items-center justify-center text-[8px] font-bold">{rec.user_profiles?.username?.[0]?.toUpperCase()}</div>}
                            </div>
                            <span>@{rec.user_profiles?.username}</span>
                          </div>
                          {rec.duration > 0 && (
                            <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{formatDurationSecs(rec.duration)}</span>
                          )}
                          {rec.listener_count > 0 && (
                            <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{formatNumber(rec.listener_count)}</span>
                          )}
                          <span>{formatDistanceToNow(new Date(rec.created_at), { addSuffix: true })}</span>
                        </div>
                      </div>

                      {/* Play button */}
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/space-recording/${rec.id}`); }}
                        className="w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center shrink-0 transition-colors mt-1"
                      >
                        <Play className="w-4 h-4 text-primary ml-0.5" fill="currentColor" />
                      </button>
                    </div>

                    {/* Audio player preview */}
                    {rec.audio_url && (
                      <div className="px-4 pb-3" onClick={e => e.stopPropagation()}>
                        <audio
                          controls
                          src={rec.audio_url}
                          className="w-full h-8"
                          controlsList="nodownload"
                          style={{ borderRadius: '0.5rem' }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      <StartSpaceDialog open={showStartDialog} onOpenChange={setShowStartDialog} onSuccess={fetchSpaces} />
      <JoinSpaceDialog open={showJoinDialog} onOpenChange={setShowJoinDialog} spaceId={selectedSpaceId} />
      {selectedSpace && (
        <ManageSpaceDialog
          open={showManageDialog}
          onOpenChange={setShowManageDialog}
          space={selectedSpace}
          onSuccess={() => { fetchSpaces(); fetchAllRecordings(); }}
        />
      )}
    </div>
  );
}
