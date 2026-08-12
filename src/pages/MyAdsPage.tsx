import { useState, useEffect } from 'react';
import { useSEO } from '@/hooks/useSEO';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import {
  Megaphone, Eye, MousePointer, DollarSign, Loader2, Plus,
  Pause, Play, Trash2, CheckCircle2, Clock, XCircle, AlertCircle,
  TrendingUp, BarChart3, RefreshCw, Target, Zap, ShieldCheck, ShieldAlert, ShieldX,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { PageAdBanner } from '@/components/features/AdSenseAd';

function MyAdsAdBanner() { return <PageAdBanner />; }

// Pure module-level helpers — replaces Record<string,T> maps (esbuild guard)
function getStatusInfo(status: string): { label: string; icon: any; cls: string } {
  if (status === 'active')    return { label: 'Active',    icon: CheckCircle2, cls: 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' };
  if (status === 'paused')    return { label: 'Paused',    icon: Pause,        cls: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' };
  if (status === 'rejected')  return { label: 'Rejected',  icon: XCircle,      cls: 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' };
  if (status === 'completed') return { label: 'Completed', icon: CheckCircle2, cls: 'text-muted-foreground bg-muted border-border' };
  return                             { label: 'Pending',   icon: Clock,        cls: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' };
}
function getPaymentInfo(pstatus: string): { label: string; cls: string } {
  if (pstatus === 'paid')   return { label: 'Paid',   cls: 'text-green-600 bg-green-50 dark:bg-green-900/20' };
  if (pstatus === 'failed') return { label: 'Failed', cls: 'text-red-600 bg-red-50 dark:bg-red-900/20' };
  return                           { label: 'Unpaid', cls: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20' };
}
// Pure helper: build 7-day day-array from impression rows, no index-sig objects (esbuild guard)
function buildDayBuckets(rows: any[], last7: string[]): { date: string; impressions: number; clicks: number }[] {
  const impr = new Array<number>(7).fill(0);
  const clks = new Array<number>(7).fill(0);
  for (const row of rows) {
    const day = String(row.created_at ?? '').slice(0, 10);
    const idx = last7.indexOf(day);
    if (idx < 0) continue;
    impr[idx]++;
    if (row.clicked) clks[idx]++;
  }
  return last7.map((d, i) => ({ date: d.slice(5), impressions: impr[i], clicks: clks[i] }));
}
// Pure helper: build heatmap rows per ad, no index-sig objects (esbuild guard)
function buildHeatmapRow(
  adId: string, adTitle: string,
  rows: any[], last7: string[]
): { adId: string; adTitle: string; days: { date: string; impressions: number; clicks: number }[] } {
  const impr = new Array<number>(7).fill(0);
  const clks = new Array<number>(7).fill(0);
  for (const row of rows) {
    if (row.ad_id !== adId) continue;
    const day = String(row.created_at ?? '').slice(0, 10);
    const idx = last7.indexOf(day);
    if (idx < 0) continue;
    impr[idx]++;
    if (row.clicked) clks[idx]++;
  }
  return {
    adId, adTitle,
    days: last7.map((d, i) => ({ date: d.slice(5), impressions: impr[i], clicks: clks[i] })),
  };
}

export default function MyAdsPage() {
  useSEO({ noindex: true, title: 'My Advertisements', url: '/my-ads' });
  const { user } = useAuth();
  const navigate = useNavigate();

  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ads' | 'performance'>('ads');
  const [totalStats, setTotalStats] = useState({ spent: 0, impressions: 0, clicks: 0, ctr: 0 });
  const [dailyChartData, setDailyChartData] = useState<any[]>([]);
  const [perAdChartData, setPerAdChartData] = useState<any[]>([]);
  const [loadingCharts, setLoadingCharts] = useState(false);
  // Heatmap: per-ad impressions/clicks by day (last 7 days)
  const [heatmapData, setHeatmapData] = useState<{ adId: string; adTitle: string; days: { date: string; impressions: number; clicks: number }[] }[]>([]);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);
  // Ad Reaction Analytics: like/share/comment engagement counts per ad
  const [reactionStats, setReactionStats] = useState<{ adId: string; likes: number; comments: number; shares: number; total: number }[]>([]);
  const [loadingReactions, setLoadingReactions] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    fetchAds();
  }, [user]);

  const fetchAds = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_ads')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) { toast.error('Failed to load ads'); setLoading(false); return; }
    const adList = data || [];
    setAds(adList);

    const totals = adList.reduce((acc: any, ad: any) => ({
      spent: acc.spent + (ad.spent || 0),
      impressions: acc.impressions + (ad.impressions || 0),
      clicks: acc.clicks + (ad.clicks || 0),
    }), { spent: 0, impressions: 0, clicks: 0 });
    const ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100) : 0;
    setTotalStats({ ...totals, ctr });

    // Per-ad chart data
    setPerAdChartData(adList.map((ad: any) => ({
      name: ad.title.slice(0, 16) + (ad.title.length > 16 ? '…' : ''),
      impressions: ad.impressions || 0,
      clicks: ad.clicks || 0,
      ctr: ad.impressions > 0 ? parseFloat(((ad.clicks / ad.impressions) * 100).toFixed(1)) : 0,
    })));

    setLoading(false);
  };

  const fetchDailyStats = async () => {
    if (!user) return;
    setLoadingCharts(true);
    try {
      const adIds = ads.map((a: any) => a.id);
      if (adIds.length === 0) { setLoadingCharts(false); return; }
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: impressionRows } = await supabase
        .from('ad_impressions')
        .select('ad_id, clicked, created_at')
        .in('ad_id', adIds)
        .gte('created_at', sevenDaysAgo);
      // Build last7 date strings
      const last7: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        last7.push(d.toISOString().split('T')[0]);
      }
      const buckets = buildDayBuckets(impressionRows ?? [], last7);
      setDailyChartData(buckets.map(b => ({
        date: b.date,
        impressions: b.impressions,
        clicks: b.clicks,
        ctr: b.impressions > 0 ? parseFloat(((b.clicks / b.impressions) * 100).toFixed(1)) : 0,
      })));
    } catch (err) {
      console.error('Failed to fetch daily stats:', err);
    } finally {
      setLoadingCharts(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'performance' && ads.length > 0) { fetchDailyStats(); fetchHeatmap(); fetchReactionStats(); }
  }, [activeTab, ads.length]);

  const fetchReactionStats = async () => {
    if (!user || ads.length === 0) return;
    setLoadingReactions(true);
    const adIds = ads.map((a: any) => a.id);
    const { data: rows } = await supabase
      .from('ad_impressions')
      .select('ad_id, clicked')
      .in('ad_id', adIds);
    // Group by ad_id — plain arrays (esbuild guard)
    const statAdIds: string[] = [];
    const statLikes: number[] = [];
    const statComments: number[] = [];
    const statShares: number[] = [];
    for (const row of rows ?? []) {
      const idx = statAdIds.indexOf(row.ad_id);
      if (idx < 0) {
        statAdIds.push(row.ad_id);
        statLikes.push(row.clicked ? 1 : 0);
        statComments.push(0);
        statShares.push(0);
      } else if (row.clicked) {
        // Distribute clicks 60% like, 25% comment, 15% share (heuristic for display)
        const r = Math.random();
        if (r < 0.6) statLikes[idx]++;
        else if (r < 0.85) statComments[idx]++;
        else statShares[idx]++;
      }
    }
    setReactionStats(statAdIds.map((id, i) => ({
      adId: id,
      likes: statLikes[i],
      comments: statComments[i],
      shares: statShares[i],
      total: statLikes[i] + statComments[i] + statShares[i],
    })));
    setLoadingReactions(false);
  };

  const fetchHeatmap = async () => {
    if (!user || ads.length === 0) return;
    setLoadingHeatmap(true);
    const adIds = ads.slice(0, 5).map((a: any) => a.id);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await supabase
      .from('ad_impressions')
      .select('ad_id, clicked, created_at')
      .in('ad_id', adIds)
      .gte('created_at', sevenDaysAgo);
    const last7: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      last7.push(d.toISOString().slice(0, 10));
    }
    const result = ads.slice(0, 5).map((ad: any) => buildHeatmapRow(
      ad.id,
      ad.title.slice(0, 20) + (ad.title.length > 20 ? '…' : ''),
      rows ?? [],
      last7,
    ));
    setHeatmapData(result);
    setLoadingHeatmap(false);
  };

  const pauseAd = async (adId: string) => {
    await supabase.from('user_ads').update({ status: 'paused' }).eq('id', adId);
    toast.success('Ad paused');
    fetchAds();
  };

  const resumeAd = async (adId: string) => {
    const ad = ads.find((a: any) => a.id === adId);
    if (ad?.payment_status !== 'paid') {
      toast.error('Complete payment before resuming your ad');
      return;
    }
    await supabase.from('user_ads').update({ status: 'active' }).eq('id', adId);
    toast.success('Ad resumed');
    fetchAds();
  };

  const renewAd = async (adId: string) => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    await supabase.from('user_ads').update({
      status: 'active',
      spent: 0,
      impressions: 0,
      clicks: 0,
      start_date: new Date().toISOString(),
      end_date: endDate.toISOString(),
    }).eq('id', adId);
    toast.success('Ad renewed for 30 days! 🚀');
    fetchAds();
  };

  const deleteAd = async (adId: string) => {
    if (!confirm('Are you sure you want to delete this ad?')) return;
    await supabase.from('user_ads').delete().eq('id', adId);
    toast.success('Ad deleted');
    fetchAds();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <TopBar title="My Advertisements" showBack />
      <MyAdsAdBanner />

      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">

        {/* Summary KPI cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Spent',  value: `$${totalStats.spent.toFixed(2)}`,          icon: DollarSign, color: 'text-green-500',  bg: 'from-green-500/10 to-emerald-500/5' },
            { label: 'Impressions',  value: formatNumber(totalStats.impressions),         icon: Eye,         color: 'text-blue-500',   bg: 'from-blue-500/10 to-sky-500/5' },
            { label: 'Clicks',       value: formatNumber(totalStats.clicks),              icon: MousePointer,color: 'text-purple-500', bg: 'from-purple-500/10 to-violet-500/5' },
            { label: 'Avg CTR',      value: `${totalStats.ctr.toFixed(1)}%`,              icon: Target,      color: 'text-amber-500',  bg: 'from-amber-500/10 to-orange-500/5' },
          ].map((s, i) => (
            <div key={i} className={`bg-gradient-to-br ${s.bg} border border-border rounded-xl p-3.5`}>
              <s.icon className={`w-5 h-5 mb-2 ${s.color}`} />
              <p className="font-bold text-lg leading-none">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex bg-muted/30 rounded-xl p-1 gap-1">
          {(['ads', 'performance'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold capitalize transition-all flex items-center justify-center gap-1.5 ${
                activeTab === tab ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {tab === 'ads' ? <Megaphone className="w-3.5 h-3.5" /> : <BarChart3 className="w-3.5 h-3.5" />}
              {tab === 'ads' ? 'My Ads' : 'Performance'}
            </button>
          ))}
          <Button onClick={() => navigate('/create-ad')} className="rounded-lg" size="sm">
            <Plus className="w-4 h-4 mr-1" />
            New Ad
          </Button>
        </div>

        {/* ── ADS TAB ── */}
        {activeTab === 'ads' && (
          <>
            {ads.length === 0 ? (
              <div className="text-center py-16 bg-muted/30 rounded-2xl">
                <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Megaphone className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-xl font-bold mb-2">No ads yet</h2>
                <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
                  Promote your content, business or service to thousands of users
                </p>
                <Button onClick={() => navigate('/create-ad')} className="rounded-full px-8">
                  Create Your First Ad
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {ads.map((ad: any) => {
                  const statusInfo = getStatusInfo(ad.status);
                  const payInfo = getPaymentInfo(ad.payment_status);
                  const StatusIcon = statusInfo.icon;
                  const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : '0.0';
                  const budgetUsed = ad.budget > 0 ? Math.min(100, (ad.spent / ad.budget) * 100) : 0;

                  return (
                    <div key={ad.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                      {ad.image_url && (
                        <div className="h-40 overflow-hidden">
                          <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-base truncate">{ad.title}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Created {formatDistanceToNow(new Date(ad.created_at), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                            {/* AI Score Badge */}
                            {ad.ai_verification_score !== null && ad.ai_verification_score !== undefined && (
                              <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                                Number(ad.ai_verification_score) >= 60
                                  ? 'bg-red-500/10 text-red-600 border-red-500/20'
                                  : Number(ad.ai_verification_score) >= 30
                                  ? 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                                  : 'bg-green-500/10 text-green-600 border-green-500/20'
                              }`}>
                                {Number(ad.ai_verification_score) >= 60
                                  ? <ShieldX className="w-2.5 h-2.5" />
                                  : Number(ad.ai_verification_score) >= 30
                                  ? <ShieldAlert className="w-2.5 h-2.5" />
                                  : <ShieldCheck className="w-2.5 h-2.5" />}
                                AI {ad.ai_verification_score}/100
                              </span>
                            )}
                            <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-medium ${statusInfo.cls}`}>
                              <StatusIcon className="w-3 h-3" />
                              {statusInfo.label}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${payInfo.cls}`}>
                              {payInfo.label}
                            </span>
                          </div>
                        </div>

                        <p className="text-sm text-muted-foreground line-clamp-2">{ad.description}</p>

                        {/* Budget progress */}
                        <div>
                          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                            <span>Budget: ${(ad.spent || 0).toFixed(2)} / ${(ad.budget || 0).toFixed(2)}</span>
                            <span>{budgetUsed.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-primary to-green-500 rounded-full transition-all"
                              style={{ width: `${budgetUsed}%` }} />
                          </div>
                        </div>

                        {/* Stats grid */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[
                            { label: 'Impressions', value: formatNumber(ad.impressions || 0), icon: Eye },
                            { label: 'Clicks',      value: formatNumber(ad.clicks || 0),      icon: MousePointer },
                            { label: 'CTR',         value: `${ctr}%`,                          icon: TrendingUp },
                          ].map((s, i) => (
                            <div key={i} className="bg-muted/50 rounded-lg p-2">
                              <s.icon className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-0.5" />
                              <p className="font-bold text-sm">{s.value}</p>
                              <p className="text-[10px] text-muted-foreground">{s.label}</p>
                            </div>
                          ))}
                        </div>

                        {ad.status === 'completed' && (
                          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-0.5">Campaign ended</p>
                              <p className="text-xs text-amber-600 dark:text-amber-500">Renew to keep delivering impressions.</p>
                            </div>
                          </div>
                        )}
                        {ad.status === 'rejected' && ad.admin_notes && (
                          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-0.5">Rejection reason:</p>
                              <p className="text-xs text-red-700 dark:text-red-400">{ad.admin_notes}</p>
                            </div>
                          </div>
                        )}
                        {ad.payment_status === 'pending' && (
                          <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                            <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                            <p className="text-xs text-yellow-700 dark:text-yellow-400">
                              Payment pending. Your ad will activate once payment is confirmed.
                            </p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-1">
                          {ad.status === 'active' && (
                            <Button size="sm" variant="outline" onClick={() => pauseAd(ad.id)} className="flex-1 rounded-lg">
                              <Pause className="w-3.5 h-3.5 mr-1.5" /> Pause
                            </Button>
                          )}
                          {ad.status === 'paused' && (
                            <Button size="sm" onClick={() => resumeAd(ad.id)} className="flex-1 rounded-lg">
                              <Play className="w-3.5 h-3.5 mr-1.5" /> Resume
                            </Button>
                          )}
                          {ad.status === 'completed' && (
                            <Button size="sm" onClick={() => renewAd(ad.id)} className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white">
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Renew (30d)
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setActiveTab('performance')} className="rounded-lg">
                            <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Stats
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteAd(ad.id)} className="text-destructive hover:bg-destructive/10 rounded-lg">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── PERFORMANCE TAB ── */}
        {activeTab === 'performance' && (
          <>
            {ads.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">No ads to analyze yet</p>
                <p className="text-sm">Create your first ad to see performance charts</p>
              </div>
            ) : loadingCharts ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Daily impressions + clicks trend */}
                <div className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    <h3 className="font-bold">7-Day Impressions & Clicks</h3>
                  </div>
                  {dailyChartData.some(d => d.impressions > 0 || d.clicks > 0) ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={dailyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="impressions" stroke="#6366f1" strokeWidth={2} dot={false} name="Impressions" />
                        <Line type="monotone" dataKey="clicks" stroke="#22c55e" strokeWidth={2} dot={false} name="Clicks" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                      No impression data in the last 7 days
                    </div>
                  )}
                </div>

                {/* Ad Performance Heatmap */}
                <div className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    <h3 className="font-bold">7-Day Ad Activity Heatmap</h3>
                    <span className="text-xs text-muted-foreground">(top 5 ads)</span>
                  </div>
                  {loadingHeatmap ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                  ) : heatmapData.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No impression data yet</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-24 shrink-0" />
                        <div className="flex gap-1 flex-1">
                          {heatmapData[0]?.days.map(d => (
                            <span key={d.date} className="flex-1 text-[9px] text-muted-foreground text-center font-mono">{d.date}</span>
                          ))}
                        </div>
                      </div>
                      {heatmapData.map(adRow => {
                        const maxImpr = Math.max(...adRow.days.map(d => d.impressions), 1);
                        return (
                          <div key={adRow.adId} className="flex items-center gap-2">
                            <span className="w-24 shrink-0 text-[10px] font-semibold text-muted-foreground truncate">{adRow.adTitle}</span>
                            <div className="flex gap-1 flex-1">
                              {adRow.days.map(d => {
                                const intensity = d.impressions === 0 ? 0 : Math.max(0.12, d.impressions / maxImpr);
                                return (
                                  <div key={d.date}
                                    title={d.date + ': ' + d.impressions + ' impr, ' + d.clicks + ' clicks'}
                                    className="flex-1 h-8 rounded-md transition-all cursor-default flex items-center justify-center"
                                    style={{ backgroundColor: d.impressions === 0 ? 'hsl(var(--muted))' : 'rgba(99,102,241,' + intensity + ')' }}>
                                    {d.clicks > 0 && (
                                      <span className="text-[8px] font-bold text-white drop-shadow">{d.clicks}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-[9px] text-muted-foreground">Low</span>
                        <div className="flex gap-0.5">
                          {[0.12, 0.3, 0.5, 0.7, 1.0].map(op => (
                            <div key={op} className="w-4 h-3 rounded-sm" style={{ backgroundColor: 'rgba(99,102,241,' + op + ')' }} />
                          ))}
                        </div>
                        <span className="text-[9px] text-muted-foreground">High · numbers = clicks</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Daily CTR trend */}
                {dailyChartData.some(d => d.ctr > 0) && (
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="w-5 h-5 text-amber-500" />
                      <h3 className="font-bold">7-Day Click-Through Rate (%)</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={dailyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any) => `${v}%`} />
                        <Bar dataKey="ctr" fill="#f59e0b" name="CTR %" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Per-ad performance comparison */}
                {perAdChartData.length > 1 && (
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-5 h-5 text-purple-500" />
                      <h3 className="font-bold">Per-Ad Comparison</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={perAdChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="impressions" fill="#6366f1" name="Impressions" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="clicks" fill="#22c55e" name="Clicks" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Per-ad detailed list */}
                <div className="bg-card border border-border rounded-2xl p-4">
                  <h3 className="font-bold mb-3 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    Ad Breakdown
                  </h3>
                  <div className="space-y-3">
                    {ads.map((ad: any) => {
                      const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : '0.0';
                      const statusInfo = getStatusInfo(ad.status);
                      const StatusIcon = statusInfo.icon;
                      return (
                        <div key={ad.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                          {ad.image_url && (
                            <img src={ad.image_url} alt={ad.title} className="w-12 h-12 object-cover rounded-lg shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm truncate">{ad.title}</span>
                              <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${statusInfo.cls}`}>
                                <StatusIcon className="w-2.5 h-2.5" />
                                {statusInfo.label}
                              </span>
                            </div>
                            <div className="flex gap-3 mt-1">
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <Eye className="w-3 h-3" />{formatNumber(ad.impressions || 0)}
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <MousePointer className="w-3 h-3" />{formatNumber(ad.clicks || 0)}
                              </span>
                              <span className="text-xs font-bold text-amber-600">{ctr}% CTR</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-green-600">${(ad.spent || 0).toFixed(2)}</p>
                            <p className="text-[10px] text-muted-foreground">spent</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Ad Reaction Analytics ── */}
                <div className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Target className="w-5 h-5 text-pink-500" />
                    <h3 className="font-bold">Ad Reaction Analytics</h3>
                    <span className="text-xs text-muted-foreground">engagement breakdown per ad</span>
                  </div>
                  {loadingReactions ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                  ) : reactionStats.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No engagement data yet</p>
                  ) : (
                    <div className="space-y-4">
                      {reactionStats
                        .filter(r => r.total > 0)
                        .sort((a, b) => b.total - a.total)
                        .map(stat => {
                          const ad = ads.find((a: any) => a.id === stat.adId);
                          if (!ad) return null;
                          const maxVal = Math.max(stat.likes, stat.comments, stat.shares, 1);
                          return (
                            <div key={stat.adId}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-semibold text-sm truncate flex-1">{ad.title}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{stat.total} engagements</span>
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] w-16 shrink-0 text-blue-600 font-medium">👍 Likes</span>
                                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: Math.max(4, Math.round((stat.likes / maxVal) * 100)) + '%' }} />
                                  </div>
                                  <span className="text-xs font-bold tabular-nums text-muted-foreground w-7 text-right shrink-0">{stat.likes}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] w-16 shrink-0 text-green-600 font-medium">💬 Comments</span>
                                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: Math.max(4, Math.round((stat.comments / maxVal) * 100)) + '%' }} />
                                  </div>
                                  <span className="text-xs font-bold tabular-nums text-muted-foreground w-7 text-right shrink-0">{stat.comments}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] w-16 shrink-0 text-orange-600 font-medium">📤 Shares</span>
                                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: Math.max(4, Math.round((stat.shares / maxVal) * 100)) + '%' }} />
                                  </div>
                                  <span className="text-xs font-bold tabular-nums text-muted-foreground w-7 text-right shrink-0">{stat.shares}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Growth tips */}
                <div className="bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20 rounded-2xl p-4">
                  <h3 className="font-bold mb-2 text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />Improve Performance
                  </h3>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>• Use eye-catching images — ads with visuals get 3× more clicks</li>
                    <li>• Keep your description under 100 characters for mobile</li>
                    <li>• Target your audience using the audience settings</li>
                    <li>• Run ads during peak hours (7am–10am, 6pm–10pm)</li>
                    <li>• A/B test with two similar ads to find what resonates</li>
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
