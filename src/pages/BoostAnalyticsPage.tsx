import { useState, useEffect, useRef } from 'react';
import { useSEO } from '@/hooks/useSEO';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  TrendingUp, Eye, MousePointerClick, DollarSign, Users,
  Loader2, AlertCircle, Calendar, Zap, Target, ArrowUpRight,
  BarChart3, RefreshCw, List, Clock, CheckCircle2, XCircle, Tag, Hash,
  Pause, Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

import { PageAdBanner } from '@/components/features/AdSenseAd';
function BoostAnalyticsAdBanner() { return <PageAdBanner />; }

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function BoostAnalyticsPage() {
  useSEO({ noindex: true, title: 'Boost Analytics', url: '/boost-analytics' });
  const { postId } = useParams<{ postId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [boost, setBoost] = useState<any>(null);
  const [allBoosts, setAllBoosts] = useState<any[]>([]);
  const [post, setPost] = useState<any>(null);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingPause, setTogglingPause] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    if (postId) fetchBoostData();
  }, [postId, user]);

  const fetchBoostData = async () => {
    try {
      // Fetch active boost for this post
      const { data: boostData } = await supabase
        .from('boosted_posts')
        .select('*')
        .eq('post_id', postId)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      setBoost(boostData);

      // Fetch ALL boosts for history list
      const { data: allBoostsData } = await supabase
        .from('boosted_posts').select('*, posts(content)').eq('user_id', user!.id)
        .order('created_at', { ascending: false }).limit(20);
      setAllBoosts(allBoostsData ?? []);

      // Fetch the post
      const { data: postData } = await supabase
        .from('posts')
        .select('*, user_profiles(*)')
        .eq('id', postId)
        .single();

      setPost(postData);

      // Build daily analytics from ad impressions
      if (boostData) {
        const { data: impressions } = await supabase
          .from('ad_impressions')
          .select('created_at, clicked')
          .eq('ad_id', boostData.id)
          .gte('created_at', boostData.start_date || boostData.created_at)
          .order('created_at', { ascending: true });

        // Aggregate by day
        const byDay: Record<string, { date: string; impressions: number; clicks: number; ctr: number; spend: number }> = {};
        (impressions || []).forEach(imp => {
          const day = imp.created_at.split('T')[0];
          if (!byDay[day]) byDay[day] = { date: day, impressions: 0, clicks: 0, ctr: 0, spend: 0 };
          byDay[day].impressions++;
          if (imp.clicked) byDay[day].clicks++;
        });

        // Calculate CTR + estimated spend per day
        const budgetPerDay = boostData.budget / Math.max(1, Math.ceil(
          (new Date(boostData.end_date || Date.now()).getTime() - new Date(boostData.created_at).getTime()) / 86400000
        ));
        Object.values(byDay).forEach(d => {
          d.ctr = d.impressions > 0 ? parseFloat(((d.clicks / d.impressions) * 100).toFixed(2)) : 0;
          d.spend = parseFloat(budgetPerDay.toFixed(2));
        });

        setDailyData(Object.values(byDay).slice(-14)); // last 14 days
      }
    } catch (err) {
      console.error('fetchBoostData error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBoostData();
  };

  const handleTogglePause = async (boostId: string, currentIsActive: boolean) => {
    setTogglingPause(boostId);
    const newIsActive = !currentIsActive;
    // Optimistic UI update
    setAllBoosts(prev => prev.map(b => b.id === boostId ? { ...b, is_active: newIsActive } : b));
    if (boost?.id === boostId) setBoost((prev: any) => prev ? { ...prev, is_active: newIsActive } : prev);
    const { error } = await supabase
      .from('boosted_posts')
      .update({ is_active: newIsActive })
      .eq('id', boostId);
    if (error) {
      // Revert on failure
      setAllBoosts(prev => prev.map(b => b.id === boostId ? { ...b, is_active: currentIsActive } : b));
      if (boost?.id === boostId) setBoost((prev: any) => prev ? { ...prev, is_active: currentIsActive } : prev);
      toast.error(error.message);
    } else {
      toast.success(newIsActive ? 'Campaign resumed ▶' : 'Campaign paused ⏸');
    }
    setTogglingPause(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!boost) {
    return (
      <div className="min-h-screen bg-background pb-16">
        <TopBar title="Boost Analytics" showBack />
      <BoostAnalyticsAdBanner />
        <div className="max-w-2xl mx-auto p-6 text-center py-20">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-bold mb-2">No Active Boost</h2>
          <p className="text-muted-foreground mb-6">This post doesn't have an active boost campaign.</p>
          <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    );
  }

  const ctr = boost.impressions > 0
    ? ((boost.clicks / boost.impressions) * 100).toFixed(2)
    : '0.00';

  const budgetUsedPct = boost.budget > 0
    ? Math.min(100, Math.round((boost.spent / boost.budget) * 100))
    : 0;

  const campaignDays = boost.end_date
    ? Math.ceil((new Date(boost.end_date).getTime() - new Date(boost.created_at).getTime()) / 86400000)
    : 7;

  const daysPassed = Math.min(campaignDays,
    Math.ceil((Date.now() - new Date(boost.created_at).getTime()) / 86400000)
  );

  const pieData = [
    { name: 'Spent', value: boost.spent || 0 },
    { name: 'Remaining', value: Math.max(0, (boost.budget || 0) - (boost.spent || 0)) },
  ];

  const audienceData = [
    { name: '18–24', value: 28 },
    { name: '25–34', value: 42 },
    { name: '35–44', value: 18 },
    { name: '45+', value: 12 },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Boost Analytics" showBack />
      <BoostAnalyticsAdBanner />

      <div className="max-w-4xl mx-auto p-4 space-y-5">

        {/* ── Campaign Header ── */}
        <div className="bg-gradient-to-br from-purple-600/10 via-blue-500/10 to-primary/5 border border-primary/20 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className={`h-2.5 w-2.5 rounded-full ${boost.is_active ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                <span className={`text-sm font-semibold ${boost.is_active ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {boost.is_active ? 'Campaign Active' : 'Campaign Ended'}
                </span>
              </div>
              <h1 className="text-xl font-bold mb-1 line-clamp-2">{post?.content?.substring(0, 80)}…</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Started {formatDistanceToNow(new Date(boost.created_at), { addSuffix: true })}
                </span>
                <span className="flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" />
                  {boost.boost_type?.replace(/_/g, ' ') || 'Promoted'}
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Budget progress */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">Budget Used</span>
              <span className="font-bold">${boost.spent?.toFixed(2) || '0.00'} / ${boost.budget?.toFixed(2)}</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                style={{ width: `${budgetUsedPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{budgetUsedPct}% spent</span>
              <span>Day {daysPassed} of {campaignDays}</span>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'Impressions', value: formatNumber(boost.impressions || 0),
              icon: <Eye className="w-5 h-5 text-blue-500" />,
              sub: `${formatNumber(boost.daily_reach || 0)}/day`,
              color: 'from-blue-500/10 to-cyan-500/5 border-blue-500/20'
            },
            {
              label: 'Clicks', value: formatNumber(boost.clicks || 0),
              icon: <MousePointerClick className="w-5 h-5 text-green-500" />,
              sub: `CTR ${ctr}%`,
              color: 'from-green-500/10 to-emerald-500/5 border-green-500/20'
            },
            {
              label: 'Total Reach', value: formatNumber(boost.total_reach || 0),
              icon: <Users className="w-5 h-5 text-purple-500" />,
              sub: 'Unique users',
              color: 'from-purple-500/10 to-pink-500/5 border-purple-500/20'
            },
            {
              label: 'Spent', value: `$${boost.spent?.toFixed(2) || '0.00'}`,
              icon: <DollarSign className="w-5 h-5 text-amber-500" />,
              sub: `of $${boost.budget?.toFixed(2)} budget`,
              color: 'from-amber-500/10 to-orange-500/5 border-amber-500/20'
            },
          ].map(({ label, value, icon, sub, color }) => (
            <div key={label} className={`bg-gradient-to-br ${color} border rounded-2xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-xs text-muted-foreground font-medium">{label}</span>
              </div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Daily Impressions & Clicks Chart ── */}
        {dailyData.length > 0 && (
          <div className="border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-lg">Daily Performance</h2>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend />
                <Bar dataKey="impressions" name="Impressions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="clicks" name="Clicks" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── CTR Trend ── */}
        {dailyData.length > 0 && (
          <div className="border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <h2 className="font-bold text-lg">Click-Through Rate (%)</h2>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} unit="%" />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  formatter={(v: any) => [`${v}%`, 'CTR']}
                />
                <Line
                  type="monotone" dataKey="ctr" stroke="#10b981" strokeWidth={2.5}
                  dot={{ fill: '#10b981', r: 3 }} activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Budget + Audience Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Budget Pie */}
          <div className="border border-border rounded-2xl p-5">
            <h2 className="font-bold text-lg mb-4">Budget Allocation</h2>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                  paddingAngle={3} dataKey="value"
                >
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  formatter={(v: any) => [`$${Number(v).toFixed(2)}`, '']}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Audience Breakdown */}
          <div className="border border-border rounded-2xl p-5">
            <h2 className="font-bold text-lg mb-4">Audience Age Split</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={audienceData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={40} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  formatter={(v: any) => [`${v}%`, 'Share']}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {audienceData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Boost History List ── */}
        <div className="border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
            <List className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">My Boost History</h2>
            <span className="ml-auto text-xs text-muted-foreground">{allBoosts.length} campaigns</span>
          </div>
          {allBoosts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No boost campaigns yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {allBoosts.map((b) => {
                const bCtr = b.impressions > 0 ? ((b.clicks / b.impressions) * 100).toFixed(1) : '0.0';
                const bBudgetPct = b.budget > 0 ? Math.min(100, Math.round((b.spent / b.budget) * 100)) : 0;
                const bAudience = b.target_audience ?? {};
                const bAgeRange = bAudience.age_min && bAudience.age_max ? `${bAudience.age_min}–${bAudience.age_max}` : null;
                const bInterests: string[] = bAudience.interests ?? [];
                const OBJECTIVE_BADGE: Record<string, { label: string; cls: string }> = {
                  reach:       { label: '📡 Reach',       cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30' },
                  engagement:  { label: '💬 Engagement',  cls: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30' },
                  conversions: { label: '🎯 Conversions', cls: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30' },
                  video_views: { label: '🎬 Video Views', cls: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30' },
                };
                const objBadge = OBJECTIVE_BADGE[b.boost_type] ?? { label: b.boost_type?.replace(/_/g, ' ') ?? 'Promoted', cls: 'bg-muted text-muted-foreground border-border' };
                return (
                  <div key={b.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Status icon */}
                      <div className={`mt-0.5 shrink-0 ${b.is_active ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {b.is_active
                          ? <CheckCircle2 className="w-5 h-5" />
                          : <XCircle className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          {/* Status badge */}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            b.is_active ? 'bg-green-500/10 text-green-600 border-green-500/30' : 'bg-muted text-muted-foreground border-border'
                          }`}>{b.is_active ? '● Active' : '○ Ended'}</span>
                          {/* Objective badge */}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${objBadge.cls}`}>
                            {objBadge.label}
                          </span>
                          {/* Audience chips */}
                          {bAgeRange && (
                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                              <Tag className="w-2.5 h-2.5" />{bAgeRange} yrs
                            </span>
                          )}
                          {bInterests.slice(0, 2).map((interest: string) => (
                            <span key={interest} className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                              <Hash className="w-2.5 h-2.5" />{interest}
                            </span>
                          ))}
                        </div>
                        <p className="text-sm font-medium line-clamp-1 mb-2">
                          {b.posts?.content?.slice(0, 80) || 'Post boost'}
                        </p>
                        {/* Stats row */}
                        <div className="grid grid-cols-4 gap-2 mb-2">
                          {[
                            { label: 'Impressions', value: formatNumber(b.impressions || 0), icon: <Eye className="w-3 h-3" /> },
                            { label: 'Clicks', value: formatNumber(b.clicks || 0), icon: <MousePointerClick className="w-3 h-3" /> },
                            { label: 'CTR', value: `${bCtr}%`, icon: <TrendingUp className="w-3 h-3" /> },
                            { label: 'Spent', value: `$${(b.spent || 0).toFixed(2)}`, icon: <DollarSign className="w-3 h-3" /> },
                          ].map(({ label, value, icon }) => (
                            <div key={label} className="bg-muted/30 rounded-lg p-2 text-center">
                              <div className="flex items-center justify-center gap-0.5 text-muted-foreground mb-0.5">{icon}</div>
                              <p className="text-xs font-bold">{value}</p>
                              <p className="text-[9px] text-muted-foreground">{label}</p>
                            </div>
                          ))}
                        </div>
                        {/* Budget bar */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full" style={{ width: `${bBudgetPct}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">${(b.budget || 0).toFixed(2)} budget · {bBudgetPct}% used</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                        </div>
                      </div>
                          {/* Pause / Resume button */}
                          <button
                            onClick={e => { e.stopPropagation(); handleTogglePause(b.id, !!b.is_active); }}
                            disabled={togglingPause === b.id}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all disabled:opacity-50 ${
                              b.is_active
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
                                : 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20'
                            }`}
                            title={b.is_active ? 'Pause campaign' : 'Resume campaign'}
                          >
                            {togglingPause === b.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : b.is_active
                                ? <><Pause className="w-3 h-3" /> Pause</>
                                : <><Play className="w-3 h-3" /> Resume</>}
                              </button>
                          <button
                            onClick={() => navigate(`/boost-analytics/${b.post_id}`)}
                        className="shrink-0 p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                        title="View details"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                          </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Quick Actions ── */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-12 font-semibold"
            onClick={() => navigate(`/post/${postId}`)}
          >
            <Eye className="w-4 h-4 mr-2" />
            View Post
          </Button>
          <Button
            className="h-12 font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
            onClick={() => navigate('/')}
          >
            <Zap className="w-4 h-4 mr-2" />
            Boost Another
          </Button>
        </div>

        {/* ── Performance Tips ── */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-amber-900 dark:text-amber-100">Performance Tips</h3>
          </div>
          <ul className="space-y-2 text-sm text-amber-800 dark:text-amber-200">
            {Number(ctr) < 1 && <li>• CTR below 1% — try a more engaging image or stronger call-to-action</li>}
            {Number(ctr) >= 1 && Number(ctr) < 3 && <li>• Good CTR! Consider increasing budget to reach more users</li>}
            {Number(ctr) >= 3 && <li>• Excellent CTR! This content resonates — consider a higher budget next boost</li>}
            {budgetUsedPct > 80 && <li>• Budget almost exhausted — plan your next boost campaign</li>}
            <li>• Post consistently to build organic reach alongside paid boosts</li>
            <li>• Boosts with video content get 3× more engagement on average</li>
          </ul>
        </div>

      </div>
    </div>
  );
}
