import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Loader2, Trophy, Flame, Users, BadgeCheck, Share2, Copy, Check } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';

type Tab = 'followers' | 'earners' | 'streaks';

interface LeaderboardEntry {
  id: string;
  username: string;
  avatar_url?: string;
  verified: boolean;
  value: number;
}

const RANK_EMOJI = ['🥇', '🥈', '🥉'];
const TOP3_CARD = [
  'from-yellow-400/20 via-amber-300/10 to-transparent border-yellow-400/30',
  'from-slate-400/20 via-slate-300/10 to-transparent border-slate-300/30',
  'from-amber-700/20 via-amber-600/10 to-transparent border-amber-600/30',
];
const TOP3_RING = ['ring-yellow-400/50', 'ring-slate-300/50', 'ring-amber-600/50'];

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('followers');
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const shareEntry = async (entry: LeaderboardEntry, rank: number) => {
    const rankLabel = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
    const metricText =
      tab === 'followers' ? `${formatNumber(entry.value)} followers` :
      tab === 'earners'   ? `$${entry.value.toFixed(2)} earned` :
      `Day ${entry.value} streak`;
    const text = `${rankLabel} I'm ranked #${rank} on Tsocial's Leaderboard with ${metricText}! 🚀 Join me at tsocial`;
    if (navigator.share) {
      navigator.share({ title: 'Tsocial Leaderboard', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard!'));
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'followers', label: 'Top Followers', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'earners',   label: 'Top Earners',   icon: <span className="font-bold text-xs leading-none">$</span> },
    { id: 'streaks',   label: 'Streaks',       icon: <Flame className="w-3.5 h-3.5 text-orange-400" /> },
  ];

  useEffect(() => {
    fetchLeaderboard(tab);
  }, [tab]);

  const fetchLeaderboard = async (activeTab: Tab) => {
    setLoading(true);

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

  const formatValue = (val: number) => {
    if (tab === 'earners') return `$${val.toFixed(2)}`;
    if (tab === 'streaks') return `Day ${val}`;
    return formatNumber(val);
  };

  const [leaderboardShared, setLeaderboardShared] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleShare = async (entry: LeaderboardEntry, rank: number) => {
    setCopiedId(entry.id);
    await shareEntry(entry, rank);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const metricLabel = () => {
    if (tab === 'streaks') return '🔥 streak';
    if (tab === 'earners') return 'earned';
    return 'followers';
  };

  const top3 = data.slice(0, 3);
  const rest = data.slice(3);

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
          <p className="text-sm text-muted-foreground">Top users by followers, earnings &amp; streaks</p>
        </div>
        <button
          onClick={async () => {
            const url = `${window.location.origin}/leaderboard`;
            const text = `🏆 Check out the Tsocial Leaderboard! See who's #1 in followers, earnings & streaks → ${url}`;
            if (navigator.share) {
              navigator.share({ title: 'Tsocial Leaderboard', text, url }).catch(() => {});
            } else {
              await navigator.clipboard.writeText(text);
              toast.success('Leaderboard link copied!');
            }
            setLeaderboardShared(true);
            setTimeout(() => setLeaderboardShared(false), 2000);
          }}
          className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
          title="Share leaderboard"
        >
          {leaderboardShared
            ? <Check className="w-5 h-5 text-green-500" />
            : <Share2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Tabs */}
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

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Trophy className="w-16 h-16 mb-4 opacity-20" />
          <p className="font-semibold text-lg">No entries yet</p>
          <p className="text-sm mt-1">Be the first on the leaderboard!</p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {top3.length > 0 && (
            <div className="p-4 space-y-3">
              {top3.map((entry, i) => (
                <div
                  key={entry.id}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border bg-gradient-to-r ${TOP3_CARD[i]} relative overflow-hidden`}
                >
                  <button onClick={() => navigate(`/profile/${entry.username}`)} className="flex items-center gap-4 flex-1 min-w-0 text-left active:scale-[0.99] transition-all">
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
                      {entry.verified && (
                        <BadgeCheck className="w-4 h-4 text-primary shrink-0" fill="currentColor" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">@{entry.username}</p>
                  </div>
                  </button>
                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <p className="text-2xl font-black">{formatValue(entry.value)}</p>
                    <p className={`text-xs font-medium ${
                      tab === 'streaks' ? 'text-orange-500' :
                      tab === 'earners' ? 'text-green-500' :
                      'text-muted-foreground'
                    }`}>
                      {metricLabel()}
                    </p>
                    <button
                      onClick={() => handleShare(entry, i + 1)}
                      className="p-1.5 rounded-full hover:bg-background/50 transition-colors text-muted-foreground mt-1"
                      title="Share rank"
                    >
                      {copiedId === entry.id
                        ? <Check className="w-3.5 h-3.5 text-green-500" />
                        : <Share2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          {rest.length > 0 && (
            <div className="flex items-center gap-3 px-4 pb-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Ranks 4 – {data.length}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          {/* Rest of list */}
          <div className="divide-y divide-border border-t border-border">
            {rest.map((entry, i) => (
              <button
                key={entry.id}
                onClick={() => navigate(`/profile/${entry.username}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
              >
                <span className="w-8 text-center text-sm font-bold text-muted-foreground shrink-0">
                  {i + 4}
                </span>
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
                    {entry.verified && (
                      <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" fill="currentColor" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">@{entry.username}</p>
                </div>
                <p className="font-bold text-sm shrink-0">
                  {tab === 'streaks' ? `🔥 ${formatValue(entry.value)}` : formatValue(entry.value)}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
