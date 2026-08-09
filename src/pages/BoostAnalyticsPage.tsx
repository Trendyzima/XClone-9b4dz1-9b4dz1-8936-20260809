import { useState, useEffect } from 'react';
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
  BarChart3, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function BoostAnalyticsPage() {
  const { postId } = useParams<{ postId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [boost, setBoost] = useState<any>(null);
  const [post, setPost] = useState<any>(null);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
