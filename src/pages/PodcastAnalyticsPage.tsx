import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureUnlock } from '@/hooks/useFeatureUnlock';
import { useSEO } from '@/hooks/useSEO';
import { formatNumber } from '@/lib/utils';
import {
  Loader2, Lock, Headphones, Users, Clock, TrendingUp,
  DollarSign, Play, ChevronRight, BarChart3, Mic,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { formatDistanceToNow, subDays, format } from 'date-fns';
import { formatNumber as fmtNum } from '@/lib/utils';
import { PageAdBanner } from '@/components/features/AdSenseAd';

function PodAnalAdBanner() { return <PageAdBanner />; }

// Module-level — esbuild guard
const CHART_DAYS = 30;

function fmtSecs(s: number) {
  if (!s || s < 1) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function PodcastAnalyticsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const unlocked = useFeatureUnlock('podcast_analytics');

  useSEO({ title: 'Podcast Analytics', description: 'Track listener trends, earnings, and episode performance.', url: '/podcasts/analytics' });

  const [loading, setLoading] = useState(true);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [dailyListeners, setDailyListeners] = useState<{ date: string; listeners: number }[]>([]);
  const [totalListeners, setTotalListeners] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [topEpisode, setTopEpisode] = useState<any | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: recs } = await supabase
      .from('space_recordings')
      .select('id, title, duration, listener_count, created_at, audio_url, spaces(title, artwork_url, category, episode_number)')
      .eq('user_id', user.id)
      .order('listener_count', { ascending: false })
      .limit(50);
    const list = recs ?? [];
    setRecordings(list);
    const totL = list.reduce((s: number, r: any) => s + (r.listener_count ?? 0), 0);
    const totD = list.reduce((s: number, r: any) => s + (r.duration ?? 0), 0);
    setTotalListeners(totL);
    setTotalDuration(totD);
    setTopEpisode(list[0] ?? null);

    // Fetch tips received for podcast host
    const { data: tips } = await supabase
      .from('tips')
      .select('amount')
      .eq('to_user_id', user.id)
      .gte('created_at', subDays(new Date(), 30).toISOString());
    const earnings = (tips ?? []).reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
    setTotalEarnings(earnings);

    // Build 30-day chart from recording creation + listener_count distribution
    const days: { date: string; listeners: number }[] = [];
    for (let i = CHART_DAYS - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      days.push({ date: format(d, 'MMM d'), listeners: 0 });
    }
    // Approximate: distribute each recording's listeners across its creation day
    list.forEach((r: any) => {
      const dKey = format(new Date(r.created_at), 'MMM d');
      const entry = days.find(d => d.date === dKey);
      if (entry) entry.listeners += r.listener_count ?? 0;
    });
    setDailyListeners(days);
    setLoading(false);
  }, [user]);

  useEffect(() => { if (user) fetchAnalytics(); }, [user]);

  if (!user) return null;

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <TopBar title="Podcast Analytics" showBack />
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
            <Lock className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-black mb-2">Feature Locked</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Podcast Analytics is locked. Contact the platform regulator (@Shee) to have this feature unlocked for your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Podcast Analytics" showBack />
      <PodAnalAdBanner />

      {/* Hero */}
      <div className="bg-gradient-to-br from-violet-600/12 via-background to-primary/8 border-b border-border px-4 py-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-600/10 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-black">Podcast Analytics</h1>
            <p className="text-xs text-muted-foreground">Last 30 days · {recordings.length} episodes</p>
          </div>
        </div>
        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Total Listeners',  val: formatNumber(totalListeners),  icon: Users,    color: 'text-blue-500' },
            { label: 'Total Duration',   val: fmtSecs(totalDuration),        icon: Clock,    color: 'text-violet-500' },
            { label: 'Episodes',         val: String(recordings.length),     icon: Headphones, color: 'text-primary' },
            { label: 'Tips Earned',      val: `$${totalEarnings.toFixed(2)}`, icon: DollarSign, color: 'text-yellow-600' },
          ].map(m => (
            <div key={m.label} className="p-3 bg-card border border-border rounded-2xl">
              <div className="flex items-center gap-1.5 mb-1">
                <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                <span className="text-[10px] text-muted-foreground">{m.label}</span>
              </div>
              <p className="text-xl font-black">{m.val}</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : (
        <div className="p-4 space-y-5">
          {/* Listener chart */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm">Listener Trend (30 days)</h3>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={dailyListeners} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="podListGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={6} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: any) => [v, 'listeners']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Area type="monotone" dataKey="listeners" stroke="#7c3aed" strokeWidth={2} fill="url(#podListGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Top episode */}
          {topEpisode && (
            <div className="bg-card border border-primary/20 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🏆</span>
                <h3 className="font-bold text-sm">Top Episode</h3>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  {topEpisode.spaces?.artwork_url
                    ? <img src={topEpisode.spaces.artwork_url} className="w-full h-full object-cover rounded-xl" alt="" />
                    : <Mic className="w-5 h-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{topEpisode.spaces?.title ?? topEpisode.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <Users className="w-3 h-3" />{formatNumber(topEpisode.listener_count ?? 0)} listeners
                    <Clock className="w-3 h-3 ml-1" />{fmtSecs(topEpisode.duration)}
                  </p>
                </div>
                <button onClick={() => navigate(`/space-recording/${topEpisode.id}`)}
                  className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 hover:bg-primary/20 transition-colors">
                  <Play className="w-4 h-4 text-primary ml-0.5" fill="currentColor" />
                </button>
              </div>
            </div>
          )}

          {/* Episode performance table */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Headphones className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm">Episode Performance</h3>
            </div>
            {recordings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No episodes yet</p>
            ) : (
              <div className="divide-y divide-border">
                {recordings.slice(0, 20).map((r: any, i: number) => (
                  <button key={r.id} onClick={() => navigate(`/space-recording/${r.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left">
                    <span className="text-xs font-black text-muted-foreground w-5 shrink-0 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{r.spaces?.title ?? r.title}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Users className="w-3 h-3" />{formatNumber(r.listener_count ?? 0)}
                      </span>
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />{fmtSecs(r.duration)}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Listener bar chart per episode */}
          {recordings.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />Listeners by Episode</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={recordings.slice(0, 10).map((r: any, i: number) => ({ name: `Ep${i + 1}`, listeners: r.listener_count ?? 0 }))} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="listeners" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
