import { useState, useEffect, useCallback } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Trophy, Flame, Users, BadgeCheck, Share2, Check,
  DollarSign, Calendar, ChevronLeft, ChevronRight, Crown, Clock
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDistanceToNow, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from 'date-fns';

type Tab = 'followers' | 'earners' | 'streaks' | 'tippers' | 'video';
type SeasonType = 'current' | 'weekly' | 'monthly';

interface LeaderboardEntry {
  id: string;
  username: string;
  avatar_url?: string;
  verified: boolean;
  value: number;
}

interface Season {
  key: string;
  label: string;
  start: Date;
  end: Date;
  type: 'weekly' | 'monthly';
}

const RANK_EMOJI = ['🥇', '🥈', '🥉'];
const TOP3_CARD = [
  'from-yellow-400/20 via-amber-300/10 to-transparent border-yellow-400/30',
  'from-slate-400/20 via-slate-300/10 to-transparent border-slate-300/30',
  'from-amber-700/20 via-amber-600/10 to-transparent border-amber-600/30',
];
const TOP3_RING = ['ring-yellow-400/50', 'ring-slate-300/50', 'ring-amber-600/50'];
const WINNER_CROWN = ['text-yellow-500', 'text-slate-400', 'text-amber-600'];

function buildSeasons(): Season[] {
  const seasons: Season[] = [];
  const now = new Date();
  // Last 4 weekly seasons
  for (let i = 1; i <= 4; i++) {
    const ref = subWeeks(now, i);
    const start = startOfWeek(ref, { weekStartsOn: 1 });
    const end = endOfWeek(ref, { weekStartsOn: 1 });
    seasons.push({
      key: `week-${format(start, 'yyyy-ww')}`,
      label: `Week of ${format(start, 'MMM d')}`,
      start, end, type: 'weekly',
    });
  }
  // Last 3 monthly seasons
  for (let i = 1; i <= 3; i++) {
    const ref = subMonths(now, i);
    const start = startOfMonth(ref);
    const end = endOfMonth(ref);
    seasons.push({
      key: `month-${format(start, 'yyyy-MM')}`,
      label: format(start, 'MMMM yyyy'),
      start, end, type: 'monthly',
    });
  }
  return seasons;
}

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('followers');
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboardShared, setLeaderboardShared] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Season state
  const [seasonView, setSeasonView] = useState<SeasonType>('current');
  const [seasons] = useState<Season[]>(buildSeasons);
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);
  const [seasonData, setSeasonData] = useState<LeaderboardEntry[]>([]);
  const [loadingSeason, setLoadingSeason] = useState(false);
  const [seasonSnapshots, setSeasonSnapshots] = useState<Record<string, LeaderboardEntry[]>>({});

  // Countdown to next week/month reset
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nextMonday = startOfWeek(new Date(now.getTime() + 7 * 86400000), { weekStartsOn: 1 });
      const diff = nextMonday.getTime() - now.getTime();
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(`${d}d ${h}h ${m}m`);
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, []);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'followers', label: 'Followers',   icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'earners',   label: 'Earners',     icon: <span className="font-bold text-xs leading-none">$</span> },
    { id: 'streaks',   label: 'Streaks',     icon: <Flame className="w-3.5 h-3.5 text-orange-400" /> },
    { id: 'tippers',   label: 'Top Tippers', icon: <DollarSign className="w-3.5 h-3.5 text-yellow-500" /> },
    { id: 'video',     label: 'Video',       icon: <span className="text-xs">🎬</span> },
  ];

  useEffect(() => {
    if (seasonView === 'current') fetchLeaderboard(tab);
  }, [tab, seasonView]);

  useEffect(() => {
    if (seasonView !== 'current' && seasons[selectedSeasonIdx]) {
      fetchSeasonData(seasons[selectedSeasonIdx]);
    }
  }, [seasonView, selectedSeasonIdx]);

  const fetchSeasonData = async (season: Season) => {
    // Check cache
    if (seasonSnapshots[season.key]) {
      setSeasonData(seasonSnapshots[season.key]);
      return;
    }
    setLoadingSeason(true);
    try {
      // Try to get saved snapshot
      const { data: snap } = await supabase
        .from('leaderboard_seasons')
        .select('snapshots')
        .eq('season_key', season.key)
        .maybeSingle();

      if (snap?.snapshots?.length > 0) {
        const parsed = snap.snapshots as LeaderboardEntry[];
        setSeasonData(parsed);
        setSeasonSnapshots(prev => ({ ...prev, [season.key]: parsed }));
      } else {
        // Compute from historical data within the date range
        const { data: posts } = await supabase
          .from('posts')
          .select('user_id, likes_count, views_count')
          .gte('created_at', season.start.toISOString())
          .lte('created_at', season.end.toISOString());

        if (posts && posts.length > 0) {
          const totals: Record<string, number> = {};
          posts.forEach((p: any) => {
            totals[p.user_id] = (totals[p.user_id] ?? 0) + (p.likes_count ?? 0);
          });
          const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a).slice(0, 50);
          const uids = sorted.map(([id]) => id);
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, username, avatar_url, verified')
            .in('id', uids);
          const profileMap: Record<string, any> = {};
          (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });
          const result = sorted
            .filter(([id]) => profileMap[id])
            .map(([id, val]) => ({ ...profileMap[id], value: val }));
          setSeasonData(result);
          setSeasonSnapshots(prev => ({ ...prev, [season.key]: result }));
          // Save snapshot for future use
          await supabase.from('leaderboard_seasons').upsert({
            season_type: season.type,
            season_key: season.key,
            start_date: season.start.toISOString(),
            end_date: season.end.toISOString(),
            snapshots: result,
          }, { onConflict: 'season_type,season_key' }).catch(() => {});
        } else {
          setSeasonData([]);
        }
      }
    } catch (e) {
      console.error('fetchSeasonData error:', e);
      setSeasonData([]);
    } finally {
      setLoadingSeason(false);
    }
  };

  const fetchLeaderboard = async (activeTab: Tab) => {
    setLoading(true);

    if (activeTab === 'video') {
      // Rank by total video views across all video posts
      const { data: videoPosts } = await supabase
        .from('posts')
        .select('user_id, views_count')
        .eq('is_video', true);
      if (videoPosts && videoPosts.length > 0) {
        const totals: Record<string, number> = {};
        videoPosts.forEach((p: any) => {
          totals[p.user_id] = (totals[p.user_id] ?? 0) + (p.views_count ?? 0);
        });
        const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a).slice(0, 50);
        const uids = sorted.map(([id]) => id);
        const { data: profiles } = await supabase
          .from('user_profiles').select('id, username, avatar_url, verified').in('id', uids);
        const profileMap: Record<string, any> = {};
        (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });
        setData(sorted.filter(([id]) => profileMap[id]).map(([id, total]) => ({ ...profileMap[id], value: total })));
      } else { setData([]); }
      setLoading(false);
      return;
    }

    if (activeTab === 'tippers') {
      const { data: tips } = await supabase.from('tips').select('from_user_id, amount');
      if (tips && tips.length > 0) {
        const totals: Record<string, number> = {};
        tips.forEach((t: any) => {
          totals[t.from_user_id] = (totals[t.from_user_id] ?? 0) + Number(t.amount);
        });
        const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a).slice(0, 50);
        const uids = sorted.map(([id]) => id);
        const { data: profiles } = await supabase
          .from('user_profiles').select('id, username, avatar_url, verified').in('id', uids);
        const profileMap: Record<string, any> = {};
        (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });
        setData(sorted.filter(([id]) => profileMap[id]).map(([id, total]) => ({ ...profileMap[id], value: total })));
      } else {
        setData([]);
      }
      setLoading(false);
      return;
    }

    if (activeTab === 'followers') {
      const { data: users } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url, verified, followers_count')
        .order('followers_count', { ascending: false })
        .limit(50);
      setData((users || []).map((u: any) => ({ ...u, value: u.followers_count ?? 0 })));
    } else if (activeTab === 'earners') {
      const { data: users } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url, verified, total_earnings')
        .gt('total_earnings', 0)
        .order('total_earnings', { ascending: false })
        .limit(50);
      setData((users || []).map((u: any) => ({ ...u, value: Number(u.total_earnings ?? 0) })));
    } else {
      const { data: rewards } = await supabase
        .from('daily_rewards')
        .select('streak_day, user_profiles(id, username, avatar_url, verified)')
        .order('streak_day', { ascending: false })
        .limit(50);
      setData(
        (rewards || [])
          .filter((r: any) => r.user_profiles)
          .map((r: any) => ({ ...(r.user_profiles as any), value: r.streak_day ?? 0 }))
      );
    }
    setLoading(false);
  };

  const shareEntry = async (entry: LeaderboardEntry, rank: number) => {
    const rankLabel = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
    const metricText =
      tab === 'followers' ? `${formatNumber(entry.value)} followers` :
      tab === 'earners'   ? `$${entry.value.toFixed(2)} earned` :
      `Day ${entry.value} streak`;
    const text = `${rankLabel} I'm ranked #${rank} on Tsocial's Leaderboard with ${metricText}! 🚀`;
    if (navigator.share) navigator.share({ title: 'Tsocial Leaderboard', text }).catch(() => {});
    else { navigator.clipboard.writeText(text); toast.success('Copied!'); }
  };

  const formatValue = (val: number) => {
    if (tab === 'earners') return `$${val.toFixed(2)}`;
    if (tab === 'streaks') return `Day ${val}`;
    if (tab === 'tippers') return `$${val.toFixed(2)}`;
    if (tab === 'video') return formatNumber(val) + ' views';
    return formatNumber(val);
  };

  const metricLabel = () => {
    if (tab === 'streaks') return '🔥 streak';
    if (tab === 'earners') return 'earned';
    if (tab === 'tippers') return '💰 tipped';
    if (tab === 'video') return '🎬 views';
    return 'followers';
  };

  const handleShare = async (entry: LeaderboardEntry, rank: number) => {
    setCopiedId(entry.id);
    await shareEntry(entry, rank);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const displayData = seasonView === 'current' ? data : seasonData;
  const isSeasonLoading = seasonView !== 'current' ? loadingSeason : loading;
  const top3 = displayData.slice(0, 3);
  const rest = displayData.slice(3);
  const selectedSeason = seasons[selectedSeasonIdx];

  const renderPodium = (entries: LeaderboardEntry[], isSeason: boolean) => (
    <>
      {entries.slice(0, 3).map((entry, i) => (
        <div
          key={entry.id}
          className={`w-full flex items-center gap-4 p-4 rounded-2xl border bg-gradient-to-r ${TOP3_CARD[i]} relative overflow-hidden`}
        >
          {isSeason && i === 0 && (
            <div className="absolute top-2 right-3 flex items-center gap-1 bg-yellow-400/20 border border-yellow-400/30 px-2 py-0.5 rounded-full">
              <Crown className="w-3 h-3 text-yellow-500" />
              <span className="text-[10px] font-bold text-yellow-600">Season Winner</span>
            </div>
          )}
          <button onClick={() => navigate(`/profile/${entry.username}`)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
            <span className="text-4xl leading-none">{RANK_EMOJI[i]}</span>
            <div className={`w-14 h-14 rounded-full bg-muted overflow-hidden shrink-0 ring-2 ${TOP3_RING[i]}`}>
              {entry.avatar_url ? (
                <img src={entry.avatar_url} alt={entry.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl font-bold">
                  {entry.username[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-base truncate">{entry.username}</p>
                {entry.verified && <BadgeCheck className="w-4 h-4 text-primary shrink-0" fill="currentColor" />}
                {isSeason && i < 3 && <Crown className={`w-3.5 h-3.5 shrink-0 ${WINNER_CROWN[i]}`} />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">@{entry.username}</p>
            </div>
          </button>
          <div className="flex flex-col items-end shrink-0 gap-1">
            <p className="text-2xl font-black">{isSeason ? formatNumber(entry.value) : formatValue(entry.value)}</p>
            <p className="text-xs font-medium text-muted-foreground">{isSeason ? 'likes' : metricLabel()}</p>
            {!isSeason && (
              <button onClick={() => handleShare(entry, i + 1)} className="p-1.5 rounded-full hover:bg-background/50 text-muted-foreground mt-1">
                {copiedId === entry.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Share2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <TopBar title="Leaderboard" showBack />

      {/* Hero header */}
      <div className="px-4 py-5 bg-gradient-to-br from-yellow-500/10 to-amber-500/5 border-b border-border flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0">
          <Trophy className="w-7 h-7 text-yellow-500" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Leaderboard</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Resets in <span className="font-semibold text-foreground">{countdown}</span></p>
          </div>
        </div>
        <button
          onClick={async () => {
            const url = `${window.location.origin}/leaderboard`;
            const text = `🏆 Check out the Tsocial Leaderboard! → ${url}`;
            if (navigator.share) navigator.share({ title: 'Tsocial Leaderboard', text, url }).catch(() => {});
            else { await navigator.clipboard.writeText(text); toast.success('Copied!'); }
            setLeaderboardShared(true);
            setTimeout(() => setLeaderboardShared(false), 2000);
          }}
          className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
        >
          {leaderboardShared ? <Check className="w-5 h-5 text-green-500" /> : <Share2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Season / Current toggle */}
      <div className="px-4 pt-3 pb-1 flex gap-2 border-b border-border bg-background">
        <button
          onClick={() => setSeasonView('current')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            seasonView === 'current' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          <Trophy className="w-3 h-3" /> Current
        </button>
        <button
          onClick={() => setSeasonView('weekly')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            seasonView === 'weekly' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          <Calendar className="w-3 h-3" /> Weekly
        </button>
        <button
          onClick={() => setSeasonView('monthly')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            seasonView === 'monthly' ? 'bg-purple-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          <Calendar className="w-3 h-3" /> Monthly
        </button>
      </div>

      {/* Season selector (weekly/monthly) */}
      {seasonView !== 'current' && (
        <div className="px-4 py-2 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedSeasonIdx(i => Math.min(i + 1, seasons.filter(s => s.type === seasonView.replace('current','weekly') as any).length - 1))}
              disabled={selectedSeasonIdx >= seasons.filter(s => s.type === (seasonView === 'weekly' ? 'weekly' : 'monthly')).length - 1}
              className="p-1.5 rounded-full hover:bg-muted transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 overflow-x-auto flex gap-1.5 scrollbar-hide py-0.5">
              {seasons
                .map((s, i) => ({ s, i }))
                .filter(({ s }) => s.type === (seasonView === 'weekly' ? 'weekly' : 'monthly'))
                .map(({ s, i }) => (
                  <button
                    key={s.key}
                    onClick={() => setSelectedSeasonIdx(i)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                      selectedSeasonIdx === i
                        ? seasonView === 'weekly' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'
                        : 'bg-background border border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
            </div>
            <button
              onClick={() => setSelectedSeasonIdx(i => Math.max(i - 1, 0))}
              disabled={selectedSeasonIdx === 0}
              className="p-1.5 rounded-full hover:bg-muted transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {selectedSeason && (
            <p className="text-[10px] text-center text-muted-foreground mt-1">
              {format(selectedSeason.start, 'MMM d')} – {format(selectedSeason.end, 'MMM d, yyyy')} · ranked by likes
            </p>
          )}
        </div>
      )}

      {/* Tab bar (current only) */}
      {seasonView === 'current' && (
        <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 px-3 py-3.5 font-semibold transition-colors border-b-2 flex items-center justify-center gap-1.5 text-sm ${
                  tab === t.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {isSeasonLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : displayData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Trophy className="w-16 h-16 mb-4 opacity-20" />
          <p className="font-semibold text-lg">No entries</p>
          <p className="text-sm mt-1">
            {seasonView !== 'current' ? 'No data for this season yet' : 'Be the first on the leaderboard!'}
          </p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {top3.length > 0 && (
            <div className="p-4 space-y-3">
              {seasonView !== 'current' && (
                <div className="flex items-center gap-2 px-1 mb-1">
                  <Crown className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-bold">Season Winners</span>
                  <span className="text-xs text-muted-foreground">· {selectedSeason?.label}</span>
                </div>
              )}
              {renderPodium(top3, seasonView !== 'current')}
            </div>
          )}

          {rest.length > 0 && (
            <div className="flex items-center gap-3 px-4 pb-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Ranks 4 – {displayData.length}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          <div className="divide-y divide-border border-t border-border">
            {rest.map((entry, i) => (
              <button
                key={entry.id}
                onClick={() => navigate(`/profile/${entry.username}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
              >
                <span className="w-8 text-center text-sm font-bold text-muted-foreground shrink-0">{i + 4}</span>
                <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
                  {entry.avatar_url ? (
                    <img src={entry.avatar_url} alt={entry.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                      {entry.username[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-semibold text-sm truncate">{entry.username}</p>
                    {entry.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" fill="currentColor" />}
                  </div>
                  <p className="text-xs text-muted-foreground">@{entry.username}</p>
                </div>
                <p className="font-bold text-sm shrink-0">
                  {seasonView !== 'current' ? formatNumber(entry.value) : (tab === 'streaks' ? `🔥 ${formatValue(entry.value)}` : formatValue(entry.value))}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
