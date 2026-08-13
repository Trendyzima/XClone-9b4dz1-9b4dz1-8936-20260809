import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { TopBar } from '@/components/layout/TopBar';
import { Loader2, DollarSign, TrendingUp, Users, Percent, BarChart3, Shield, Video, Repeat2, Heart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { formatNumber } from '@/lib/utils';

// esbuild guard: module-level plain arrays — no 'as const', no Record<>, no typed annotations
const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];
const SOURCE_LABELS = ['video_fund', 'ad_revenue_share', 'tip', 'subscription', 'other'];
const SOURCE_DISPLAY = ['Video CPM', 'Ad Revenue', 'Tips', 'Subscriptions', 'Other'];
const SOURCE_ICONS = ['\uD83C\uDFAC', '\uD83D\uDCE2', '\uD83D\uDC9D', '\uD83D\uDC51', '\uD83D\uDCE6'];

// Platform split rates — parallel plain arrays (esbuild guard)
const SPLIT_SOURCES = ['Video CPM', 'Ad Revenue Share', 'Tips', 'P2P Transfers'];
const SPLIT_PLATFORM_PCT = [60, 60, 15, 5];
const SPLIT_CREATOR_PCT = [40, 40, 85, 95];
const SPLIT_NOTES = [
  '$1.50\u2013$3.50/1k views \u00b7 tier-based',
  'From ad placements pool \u00b7 monthly',
  'Fan-to-creator direct tips',
  'Small 5% transaction fee',
];

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

export default function PlatformRevenueDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [totalGross, setTotalGross] = useState(0);
  const [platformEarnings, setPlatformEarnings] = useState(0);
  const [creatorEarnings, setCreatorEarnings] = useState(0);
  const [totalCreators, setTotalCreators] = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);
  // esbuild guard: no typed useState<{...}[]> generics — use plain useState([])
  const [monthlyData, setMonthlyData] = useState([]);
  const [sourceData, setSourceData] = useState([]);
  const [recentEarnings, setRecentEarnings] = useState([]);
  const [transferFeeTotal, setTransferFeeTotal] = useState(0);
  const [transferCount, setTransferCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user?.id]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const { data: rsData } = await supabase
        .from('revenue_shares')
        .select('total_revenue, platform_share, user_share');
      const totalRev = (rsData ?? []).reduce((s: number, r: any) => s + Number(r.total_revenue ?? 0), 0);
      const platRev  = (rsData ?? []).reduce((s: number, r: any) => s + Number(r.platform_share ?? 0), 0);
      const creatRev = (rsData ?? []).reduce((s: number, r: any) => s + Number(r.user_share ?? 0), 0);
      setTotalGross(totalRev);
      setPlatformEarnings(platRev);
      setCreatorEarnings(creatRev);

      const { count: creatorCount } = await supabase
        .from('user_monetization')
        .select('*', { count: 'exact', head: true })
        .eq('is_monetized', true);
      setTotalCreators(creatorCount ?? 0);

      const { data: earningsData } = await supabase
        .from('creator_earnings')
        .select('source, amount, created_at, user_id, id')
        .order('created_at', { ascending: false })
        .limit(500);

      const allEarnings: any[] = earningsData ?? [];
      setTotalTransactions(allEarnings.length);
      setRecentEarnings(allEarnings.slice(0, 10) as any);

      // Source breakdown — esbuild guard: plain number array, no Record<string,T>
      const srcTotals = SOURCE_LABELS.map(() => 0);
      for (const e of allEarnings) {
        const idx = SOURCE_LABELS.indexOf(e.source ?? 'other');
        const safe = idx >= 0 ? idx : SOURCE_LABELS.length - 1;
        srcTotals[safe] += Number(e.amount ?? 0);
      }
      const pieItems: any[] = SOURCE_LABELS
        .map((src, i) => ({
          name: SOURCE_DISPLAY[i],
          value: parseFloat(srcTotals[i].toFixed(2)),
          icon: SOURCE_ICONS[i],
        }))
        .filter((d: any) => d.value > 0);
      setSourceData(pieItems as any);

      // Monthly aggregation — esbuild guard: plain untyped array, no inline type annotation
      const months: any[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
        const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
        const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
        const monthEarnings = allEarnings.filter((e: any) => e.created_at >= start && e.created_at <= end);
        const gross   = monthEarnings.reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
        const platform = gross * 0.55;
        months.push({
          month: label,
          gross: parseFloat(gross.toFixed(2)),
          platform: parseFloat(platform.toFixed(2)),
          creator: parseFloat((gross - platform).toFixed(2)),
        });
      }
      setMonthlyData(months as any);

      const { data: txData } = await supabase
        .from('wallet_transactions')
        .select('amount')
        .eq('type', 'transfer_out');
      const txTotal = (txData ?? []).reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
      setTransferFeeTotal(parseFloat((txTotal * 0.05).toFixed(2)));
      setTransferCount((txData ?? []).length);
    } catch (err) {
      console.error('PlatformRevenueDashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Pre-compute share percentages before JSX (esbuild guard: no IIFE in render)
  const platformSharePct = totalGross > 0 ? ((platformEarnings / totalGross) * 100).toFixed(1) : '0.0';
  const creatorSharePct  = totalGross > 0 ? ((creatorEarnings / totalGross) * 100).toFixed(1) : '0.0';
  const hasMonthlyData   = (monthlyData as any[]).length > 0;
  const hasSourceData    = (sourceData as any[]).length > 0;
  const hasRecent        = (recentEarnings as any[]).length > 0;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Platform Revenue" showBack />

      <div className="p-4 space-y-5 max-w-2xl mx-auto">

        {/* Header */}
        <div className="bg-gradient-to-br from-violet-500/10 via-primary/5 to-background border border-primary/20 rounded-3xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-black text-xl">Platform Revenue</h1>
              <p className="text-xs text-muted-foreground">Real-time earnings across all monetization channels</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-3 border border-border text-center">
              <p className="text-[10px] text-muted-foreground mb-1">Total Gross</p>
              <p className="text-xl font-black">{formatCurrency(totalGross)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">All time</p>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-3 text-center">
              <p className="text-[10px] text-primary mb-1">\uD83C\uDFE2 Platform Cut</p>
              <p className="text-xl font-black text-primary">{formatCurrency(platformEarnings)}</p>
              <p className="text-[10px] text-primary/70 mt-0.5">{platformSharePct}% share</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-3 text-center">
              <p className="text-[10px] text-green-600 mb-1">\uD83D\uDC64 To Creators</p>
              <p className="text-xl font-black text-green-600">{formatCurrency(creatorEarnings)}</p>
              <p className="text-[10px] text-green-600/70 mt-0.5">{creatorSharePct}% share</p>
            </div>
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monetized Creators</p>
              <p className="text-2xl font-black">{totalCreators}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Earnings Events</p>
              <p className="text-2xl font-black">{formatNumber(totalTransactions)}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
              <Repeat2 className="w-4 h-4 text-cyan-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">P2P Fees (5%)</p>
              <p className="text-2xl font-black text-cyan-600">{formatCurrency(transferFeeTotal)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{transferCount} transfers</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
              <Percent className="w-4 h-4 text-pink-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Platform Take</p>
              <p className="text-2xl font-black text-pink-600">{platformSharePct}%</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">blended rate</p>
            </div>
          </div>
        </div>

        {/* Revenue Split Rules */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-sm">Revenue Split Configuration</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Current platform/creator rate for each revenue type</p>
          </div>
          <div className="divide-y divide-border">
            {SPLIT_SOURCES.map((src, i) => {
              const platPct  = SPLIT_PLATFORM_PCT[i];
              const creatPct = SPLIT_CREATOR_PCT[i];
              const note     = SPLIT_NOTES[i];
              return (
                <div key={src} className="px-4 py-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-bold text-sm">{src}</p>
                      <p className="text-[10px] text-muted-foreground">{note}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold shrink-0">
                      <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full">{platPct}% platform</span>
                      <span className="px-2 py-0.5 bg-green-500/10 text-green-600 rounded-full">{creatPct}% creator</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-muted flex">
                    <div className="h-full bg-primary/70" style={{ width: `${platPct}%` }} />
                    <div className="h-full bg-green-500/70" style={{ width: `${creatPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly bar chart */}
        {hasMonthlyData && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h2 className="font-bold text-sm">Monthly Revenue Trend</h2>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-4 text-xs mb-3">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary/70 inline-block" />Platform</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500/70 inline-block" />Creator payout</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 10 }} width={42} />
                  <Tooltip
                    formatter={(v: number, name: string) => [`$${v.toFixed(2)}`, name === 'platform' ? 'Platform' : 'Creator']}
                    contentStyle={{ fontSize: 11, borderRadius: 10 }}
                  />
                  <Bar dataKey="platform" fill="hsl(var(--primary) / 0.7)" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="creator" fill="rgb(34 197 94 / 0.7)" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Source breakdown pie */}
        {hasSourceData && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-primary" />
                <h2 className="font-bold text-sm">Earnings by Source</h2>
              </div>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {(sourceData as any[]).map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                  <Legend iconType="circle" iconSize={10} formatter={(v: string) => <span style={{ fontSize: 11 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-2">
                {(sourceData as any[]).map((src: any, idx: number) => (
                  <div key={src.name} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                    <span className="text-sm flex-1">{src.icon} {src.name}</span>
                    <span className="font-bold text-sm">{formatCurrency(src.value)}</span>
                    <span className="text-xs text-muted-foreground">
                      {totalGross > 0 ? ((src.value / totalGross) * 100).toFixed(1) : '0'}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent earnings */}
        {hasRecent && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-500" />
                <h2 className="font-bold text-sm">Recent Earning Events</h2>
              </div>
            </div>
            <div className="divide-y divide-border">
              {(recentEarnings as any[]).map((e: any) => {
                const srcIdx = SOURCE_LABELS.indexOf(e.source ?? 'other');
                const label  = srcIdx >= 0 ? SOURCE_DISPLAY[srcIdx] : 'Other';
                const icon   = srcIdx >= 0 ? SOURCE_ICONS[srcIdx] : '\uD83D\uDCE6';
                const amt    = Number(e.amount ?? 0);
                const platCut = e.source === 'tip' ? amt * 0.15 : e.source === 'subscription' ? amt * 0.15 : amt * 0.60;
                const rowKey = e.id ?? `${e.created_at}-${e.source}`;
                return (
                  <div key={rowKey} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-lg shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm text-green-600">{formatCurrency(amt)}</p>
                      <p className="text-[10px] text-primary">+{formatCurrency(platCut)} platform</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!hasSourceData && !hasRecent && (
          <div className="text-center py-12 text-muted-foreground">
            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">No revenue data yet</p>
            <p className="text-sm mt-1">Revenue will appear here as creators earn and users transact</p>
          </div>
        )}
      </div>
    </div>
  );
}
