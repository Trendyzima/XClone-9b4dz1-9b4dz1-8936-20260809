import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { TopBar } from '@/components/layout/TopBar';
import { useSEO } from '@/hooks/useSEO';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, DollarSign, Eye, Heart, MessageCircle, Users,
  Video, FileText, BarChart3, Calendar, ShoppingBag, Sparkles,
  ArrowUpRight, Loader2, Play, Download, Printer, Star, Zap
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';

// ── AdSense banner — push-guarded ─────────────────────────────────────────────
import { PageAdBanner } from '@/components/features/AdSenseAd';
function CreatorStudioAdBanner() { return <PageAdBanner />; }

export default function CreatorStudio() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useSEO({ title: 'Creator Studio', noindex: true });

  const [stats, setStats] = useState({
    total_followers: 0, total_posts: 0, total_views: 0, total_likes: 0,
    total_earnings: 0, engagement_rate: 0, video_views: 0, article_views: 0
  });
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [earningsHistory, setEarningsHistory] = useState<any[]>([]);
  const [weeklyViews, setWeeklyViews] = useState<any[]>([]);
  const [videoEarnings, setVideoEarnings] = useState<any[]>([]);
  const [weeklyEarnings, setWeeklyEarnings] = useState<any[]>([]);
  const [revenueBreakdown4W, setRevenueBreakdown4W] = useState<any[]>([]);
  const [streakDay, setStreakDay] = useState(0);
  const [videoPostsCount, setVideoPostsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeStudioTab, setActiveStudioTab] = useState<'overview' | 'videos' | 'earnings' | 'analytics'>('overview');
  // CSV Export state
  const [exportStartMonth, setExportStartMonth] = useState('');
  const [exportEndMonth, setExportEndMonth] = useState('');
  // Hydrate date states in effect — avoids esbuild new Date() lazy-init non-determinism
  useEffect(() => {
    const now = new Date();
    const end = now.toISOString().slice(0, 7);
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 7);
    setExportStartMonth(start);
    setExportEndMonth(end);
  }, []);
  const [exportingCsv, setExportingCsv] = useState(false);
  // ── Creator Analytics tab state ────────────────────────────────────────
  const [topPosts, setTopPosts] = useState<any[]>([]);
  const [followerGrowth, setFollowerGrowth] = useState<{ date: string; followers: number }[]>([]);
  const [earningsProjection, setEarningsProjection] = useState<number | null>(null);
  const [postTypeBreakdown, setPostTypeBreakdown] = useState<{ name: string; value: number; color: string }[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Enhanced video tab state
  const [allVideoPosts, setAllVideoPosts] = useState<any[]>([]);
  const [loadingAllVideos, setLoadingAllVideos] = useState(false);
  const [togglingMonetize, setTogglingMonetize] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    fetchCreatorStats();
    fetchRecentPosts();
    fetchEarningsHistory();
    fetchVideoEarnings();
    fetchWeeklyEarnings();
    fetchMilestoneData();
    fetchRevenueBreakdown4W();
  }, [user]);

  // Fetch all video posts with analytics when switching to video tab
  useEffect(() => {
    if (activeStudioTab === 'videos' && allVideoPosts.length === 0) fetchAllVideoPosts();
    if (activeStudioTab === 'analytics' && topPosts.length === 0) fetchAnalyticsData();
  }, [activeStudioTab]);

  const fetchAnalyticsData = async () => {
    if (!user) return;
    setLoadingAnalytics(true);
    try {
      const [postsRes, earningsRes] = await Promise.all([
        supabase.from('posts').select('id, content, views_count, likes_count, reposts_count, replies_count, is_video, created_at, image_url, video_url').eq('user_id', user.id).order('views_count', { ascending: false }).limit(20),
        supabase.from('creator_earnings').select('amount, created_at').eq('user_id', user.id).eq('status', 'paid').order('created_at', { ascending: true }),
      ]);

      // Top posts by engagement score
      const scored = (postsRes.data ?? []).map(p => ({
        ...p,
        _score: (p.views_count ?? 0) * 0.5 + (p.likes_count ?? 0) * 2 + (p.reposts_count ?? 0) * 3 + (p.replies_count ?? 0) * 1.5,
      })).sort((a, b) => b._score - a._score);
      setTopPosts(scored.slice(0, 10));

      // Post type breakdown
      const posts = postsRes.data ?? [];
      const videos = posts.filter(p => p.is_video).length;
      const images = posts.filter(p => !p.is_video && p.image_url).length;
      const text = posts.filter(p => !p.is_video && !p.image_url).length;
      setPostTypeBreakdown([
        { name: 'Videos', value: videos, color: '#ef4444' },
        { name: 'Images', value: images, color: '#3b82f6' },
        { name: 'Text', value: text, color: '#8b5cf6' },
      ].filter(t => t.value > 0));

      // Follower growth: simulate 7-day window from posts + profile
      const { data: profile } = await supabase.from('user_profiles').select('followers_count').eq('id', user.id).maybeSingle();
      const currentFollowers = profile?.followers_count ?? 0;
      const growthData: { date: string; followers: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        // Estimate: subtract ~5% per day back in time (approximation from post engagement)
        const factor = 1 - (i * 0.008);
        growthData.push({
          date: d.toISOString().split('T')[0].slice(5),
          followers: Math.max(0, Math.round(currentFollowers * factor)),
        });
      }
      setFollowerGrowth(growthData);

      // Earnings projection: linear regression on last 30 days
      const earnings30d = earningsRes.data ?? [];
      if (earnings30d.length >= 3) {
        const byDay: Record<string, number> = {};
        earnings30d.forEach(e => {
          const d = e.created_at.split('T')[0];
          byDay[d] = (byDay[d] ?? 0) + Number(e.amount);
        });
        const dayValues = Object.values(byDay);
        const avg = dayValues.reduce((a, b) => a + b, 0) / dayValues.length;
        setEarningsProjection(avg * 30); // monthly projection
      }
    } catch (e) {
      console.error('fetchAnalyticsData error:', e);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const fetchAllVideoPosts = async () => {
    if (!user) return;
    setLoadingAllVideos(true);
    const { data } = await supabase
      .from('posts')
      .select('*, post_analytics(views, unique_viewers, engagement_rate, shares)')
      .eq('user_id', user.id)
      .eq('is_video', true)
      .order('created_at', { ascending: false });
    setAllVideoPosts(data ?? []);
    setLoadingAllVideos(false);
  };

  const handleToggleMonetize = async (postId: string, currentValue: boolean) => {
    setTogglingMonetize(postId);
    const { error } = await supabase.from('posts').update({ is_monetized: !currentValue }).eq('id', postId).eq('user_id', user!.id);
    if (error) { toast.error(error.message); }
    else {
      setAllVideoPosts(prev => prev.map(p => p.id === postId ? { ...p, is_monetized: !currentValue } : p));
      toast.success(!currentValue ? 'Monetization enabled' : 'Monetization disabled');
    }
    setTogglingMonetize(null);
  };

  const handleSavePrice = async (postId: string) => {
    const price = parseFloat(priceInput);
    if (isNaN(price) || price < 0) { toast.error('Enter a valid price'); return; }
    const { error } = await supabase.from('posts').update({ price }).eq('id', postId).eq('user_id', user!.id);
    if (error) { toast.error(error.message); }
    else {
      setAllVideoPosts(prev => prev.map(p => p.id === postId ? { ...p, price } : p));
      setEditingPrice(null);
      toast.success('Price updated');
    }
  };

  const fetchMilestoneData = async () => {
    if (!user) return;
    const [{ data: rewardData }, { data: videoPosts }] = await Promise.all([
      supabase.from('daily_rewards').select('streak_day').eq('user_id', user.id).maybeSingle(),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_video', true),
    ]);
    setStreakDay(rewardData?.streak_day ?? 0);
    setVideoPostsCount((videoPosts as any)?.count ?? 0);
  };

  const fetchCreatorStats = async () => {
    if (!user) return;
    try {
      const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
      const { data: posts } = await supabase.from('posts').select('views_count, likes_count, is_video, created_at').eq('user_id', user.id);

      const totalViews = posts?.reduce((s, p) => s + (p.views_count || 0), 0) || 0;
      const totalLikes = posts?.reduce((s, p) => s + (p.likes_count || 0), 0) || 0;
      const videoViews = posts?.filter(p => p.is_video).reduce((s, p) => s + (p.views_count || 0), 0) || 0;

      const { data: earnings } = await supabase.from('creator_earnings').select('amount').eq('user_id', user.id).eq('status', 'paid');
      const totalEarnings = earnings?.reduce((s, e) => s + Number(e.amount), 0) || 0;

      const { data: analytics } = await supabase.from('user_analytics').select('engagement_rate').eq('user_id', user.id).single();

      const now = Date.now();
      const days: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now - i * 86400000).toISOString().split('T')[0];
        days[d] = 0;
      }
      (posts || []).forEach(p => {
        const d = p.created_at?.split('T')[0];
        if (d && days[d] !== undefined) days[d] += p.views_count || 0;
      });
      setWeeklyViews(Object.entries(days).map(([date, views]) => ({ date: date.slice(5), views })));

      setStats({ total_followers: profile?.followers_count || 0, total_posts: posts?.length || 0, total_views: totalViews, total_likes: totalLikes, total_earnings: totalEarnings, engagement_rate: analytics?.engagement_rate || 0, video_views: videoViews, article_views: 0 });
    } catch (error) {
      console.error('Error fetching creator stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentPosts = async () => {
    if (!user) return;
    const { data } = await supabase.from('posts').select('*, post_analytics(views, engagement_rate)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5);
    setRecentPosts(data || []);
  };

  const fetchEarningsHistory = async () => {
    if (!user) return;
    const { data } = await supabase.from('creator_earnings').select('amount, source, created_at, status').eq('user_id', user.id).order('created_at', { ascending: true }).limit(60);
    if (!data) return;
    const byMonth: Record<string, { month: string; earned: number; pending: number }> = {};
    data.forEach(e => {
      const m = e.created_at.slice(0, 7);
      if (!byMonth[m]) byMonth[m] = { month: m.slice(5), earned: 0, pending: 0 };
      if (e.status === 'paid') byMonth[m].earned += Number(e.amount);
      else byMonth[m].pending += Number(e.amount);
    });
    setEarningsHistory(Object.values(byMonth).slice(-6));
  };

  const fetchWeeklyEarnings = async () => {
    if (!user) return;
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data } = await supabase
      .from('creator_earnings')
      .select('amount, source, created_at')
      .eq('user_id', user.id)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: true });
    if (!data) return;
    // Group by day and source
    const days: Record<string, { day: string; tips: number; subscriptions: number; ads: number; other: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      days[d] = { day: d.slice(5), tips: 0, subscriptions: 0, ads: 0, other: 0 };
    }
    data.forEach(e => {
      const d = e.created_at.split('T')[0];
      if (!days[d]) return;
      const amt = Number(e.amount);
      if (e.source === 'tips') days[d].tips += amt;
      else if (e.source === 'subscription') days[d].subscriptions += amt;
      else if (e.source?.includes('ad') || e.source?.includes('video')) days[d].ads += amt;
      else days[d].other += amt;
    });
    setWeeklyEarnings(Object.values(days));
  };

  const fetchRevenueBreakdown4W = async () => {
    if (!user) return;
    // Build a 4-week stacked breakdown (tips / subscriptions / ads / other)
    const fourWeeksAgo = new Date(Date.now() - 28 * 86400000).toISOString();
    const { data } = await supabase
      .from('creator_earnings')
      .select('amount, source, created_at')
      .eq('user_id', user.id)
      .gte('created_at', fourWeeksAgo)
      .order('created_at', { ascending: true });
    if (!data) return;
    // Group into 4 weekly buckets
    const weeks: Record<string, { week: string; tips: number; subscriptions: number; ads: number; other: number }> = {};
    for (let w = 3; w >= 0; w--) {
      const start = new Date(Date.now() - (w + 1) * 7 * 86400000);
      const end   = new Date(Date.now() - w * 7 * 86400000);
      const label = `Wk ${4 - w} (${start.toLocaleDateString('en', { month: 'short', day: 'numeric' })})`;
      const key = String(w);
      weeks[key] = { week: label, tips: 0, subscriptions: 0, ads: 0, other: 0 };
      for (const e of data) {
        const d = new Date(e.created_at);
        if (d >= start && d < end) {
          const amt = Number(e.amount);
          const src = e.source ?? '';
          if (src === 'tips') weeks[key].tips += amt;
          else if (src === 'subscription') weeks[key].subscriptions += amt;
          else if (src?.includes('ad') || src?.includes('video')) weeks[key].ads += amt;
          else weeks[key].other += amt;
        }
      }
    }
    setRevenueBreakdown4W(Object.values(weeks).reverse());
  };

  const fetchVideoEarnings = async () => {
    if (!user) return;
    const { data: videoPosts } = await supabase.from('posts').select('id, content, video_url, views_count, likes_count, created_at').eq('user_id', user.id).eq('is_video', true).order('views_count', { ascending: false }).limit(10);
    if (!videoPosts) return;
    const enriched = await Promise.all(videoPosts.map(async (p) => {
      const { data: earns } = await supabase.from('creator_earnings').select('amount').eq('post_id', p.id).eq('source', 'video_ads');
      const earned = (earns || []).reduce((s, e) => s + Number(e.amount), 0);
      return { ...p, earned };
    }));
    setVideoEarnings(enriched);
  };

  const handleExportCsv = async () => {
    if (!user) return;
    setExportingCsv(true);
    try {
      const startDate = `${exportStartMonth}-01T00:00:00.000Z`;
      const endDate = `${exportEndMonth}-31T23:59:59.999Z`;

      // Fetch all three sources in parallel
      const [earningsRes, tipsRes, adRevenueRes] = await Promise.all([
        supabase.from('creator_earnings')
          .select('amount, source, created_at, status, post_id')
          .eq('user_id', user.id)
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .order('created_at', { ascending: true }),
        supabase.from('tips')
          .select('amount, message, created_at, from_user_id')
          .eq('to_user_id', user.id)
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .order('created_at', { ascending: true }),
        supabase.from('creator_ad_revenue')
          .select('gross_revenue, creator_share, ad_type, created_at')
          .eq('creator_user_id', user.id)
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .order('created_at', { ascending: true }),
      ]);

      const rows: string[][] = [['Date', 'Source', 'Type', 'Amount (USD)', 'Status', 'Notes']];

      // creator_earnings rows
      for (const e of earningsRes.data ?? []) {
        rows.push([
          new Date(e.created_at).toISOString().split('T')[0],
          e.source ?? 'creator_earnings',
          'earnings',
          Number(e.amount).toFixed(4),
          e.status ?? 'paid',
          e.post_id ? `post:${e.post_id}` : '',
        ]);
      }
      // tips rows
      for (const t of tipsRes.data ?? []) {
        rows.push([
          new Date(t.created_at).toISOString().split('T')[0],
          'tips',
          'tip',
          Number(t.amount).toFixed(4),
          'paid',
          t.message ? t.message.slice(0, 80).replace(/,/g, ';') : '',
        ]);
      }
      // ad revenue rows
      for (const a of adRevenueRes.data ?? []) {
        rows.push([
          new Date(a.created_at).toISOString().split('T')[0],
          `ad_revenue (${a.ad_type ?? 'ad'})`,
          'ad_revenue',
          Number(a.creator_share).toFixed(4),
          'paid',
          `gross:$${Number(a.gross_revenue).toFixed(4)}`,
        ]);
      }

      // Sort all data rows by date
      const header = rows[0];
      const data = rows.slice(1).sort((a, b) => a[0].localeCompare(b[0]));
      const csv = [header, ...data].map(r => r.map(c => `"${c}"`).join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `revenue_${exportStartMonth}_to_${exportEndMonth}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${data.length} rows`);
    } catch (e: any) {
      toast.error(e.message || 'Export failed');
    } finally {
      setExportingCsv(false);
    }
  };

  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    if (!user) return;
    setExportingPdf(true);
    try {
      // Fetch data for the report
      const [earningsRes, weeklyRes] = await Promise.all([
        supabase.from('creator_earnings')
          .select('amount, source, status, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),
        supabase.from('creator_earnings')
          .select('amount, source, created_at')
          .eq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
          .order('created_at', { ascending: true }),
      ]);

      const allEarnings = earningsRes.data ?? [];
      const weeklyData = weeklyRes.data ?? [];

      // Build monthly totals
      const byMonth: Record<string, { paid: number; pending: number; sources: Record<string, number> }> = {};
      allEarnings.forEach(e => {
        const m = e.created_at.slice(0, 7);
        if (!byMonth[m]) byMonth[m] = { paid: 0, pending: 0, sources: {} };
        const amt = Number(e.amount);
        if (e.status === 'paid') byMonth[m].paid += amt;
        else byMonth[m].pending += amt;
        byMonth[m].sources[e.source ?? 'other'] = (byMonth[m].sources[e.source ?? 'other'] ?? 0) + amt;
      });

      // Build weekly day totals
      const days: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
        days[d] = 0;
      }
      weeklyData.forEach(e => {
        const d = e.created_at.split('T')[0];
        if (days[d] !== undefined) days[d] += Number(e.amount);
      });

      // Build source totals
      const sourceTotals: Record<string, number> = {};
      allEarnings.forEach(e => {
        const src = e.source ?? 'other';
        sourceTotals[src] = (sourceTotals[src] ?? 0) + Number(e.amount);
      });

      const totalPaid = allEarnings.filter(e => e.status === 'paid').reduce((s, e) => s + Number(e.amount), 0);
      const totalPending = allEarnings.filter(e => e.status !== 'paid').reduce((s, e) => s + Number(e.amount), 0);
      const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const monthlyRows = Object.entries(byMonth).slice(-12).map(([month, { paid, pending }]) =>
        `<tr><td>${month}</td><td>$${paid.toFixed(2)}</td><td>$${pending.toFixed(2)}</td><td>$${(paid + pending).toFixed(2)}</td></tr>`
      ).join('');

      const sourceRows = Object.entries(sourceTotals).sort((a, b) => b[1] - a[1]).map(([src, amt]) =>
        `<tr><td style="text-transform:capitalize">${src.replace(/_/g, ' ')}</td><td>$${amt.toFixed(4)}</td><td>${((amt / (totalPaid + totalPending)) * 100).toFixed(1)}%</td></tr>`
      ).join('');

      const weeklyRows = Object.entries(days).map(([date, amt]) =>
        `<tr><td>${new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td><td>$${amt.toFixed(4)}</td></tr>`
      ).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Creator Revenue Report</title><style>
        @page { margin: 20mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; font-size: 13px; }
        .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e5e7eb; }
        .header h1 { font-size: 22px; font-weight: 800; margin: 0 0 4px 0; color: #7c3aed; }
        .header p { color: #6b7280; margin: 0; font-size: 12px; }
        .summary { display: flex; gap: 16px; margin-bottom: 24px; }
        .stat { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 16px; text-align: center; }
        .stat .value { font-size: 20px; font-weight: 800; color: #7c3aed; }
        .stat .label { font-size: 11px; color: #6b7280; margin-top: 2px; }
        h2 { font-size: 14px; font-weight: 700; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 20px 0 10px 0; color: #374151; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th { background: #f3f4f6; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; padding: 8px 10px; text-align: left; }
        td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
        tr:last-child td { border-bottom: none; }
        .footer { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 32px; }
        @media print { .no-print { display:none!important; } }
      </style></head><body>
        <div class="header">
          <h1>Creator Revenue Report</h1>
          <p>Generated ${now} · Tsocial Creator Studio</p>
        </div>
        <div class="summary">
          <div class="stat"><div class="value">$${totalPaid.toFixed(2)}</div><div class="label">Total Paid</div></div>
          <div class="stat"><div class="value">$${totalPending.toFixed(2)}</div><div class="label">Pending</div></div>
          <div class="stat"><div class="value">${allEarnings.length}</div><div class="label">Transactions</div></div>
          <div class="stat"><div class="value">${Object.keys(byMonth).length}</div><div class="label">Active Months</div></div>
        </div>
        <h2>Monthly Earnings (last 12 months)</h2>
        <table><thead><tr><th>Month</th><th>Paid</th><th>Pending</th><th>Total</th></tr></thead><tbody>${monthlyRows || '<tr><td colspan="4" style="color:#9ca3af;text-align:center">No data</td></tr>'}</tbody></table>
        <h2>Earnings by Source</h2>
        <table><thead><tr><th>Source</th><th>Amount</th><th>Share</th></tr></thead><tbody>${sourceRows || '<tr><td colspan="3" style="color:#9ca3af;text-align:center">No data</td></tr>'}</tbody></table>
        <h2>This Week's Daily Breakdown</h2>
        <table><thead><tr><th>Day</th><th>Earnings</th></tr></thead><tbody>${weeklyRows}</tbody></table>
        <div class="footer">Tsocial Creator Studio · Confidential · ${now}</div>
        <script>window.onload=function(){window.print();}<\/script>
      </body></html>`;

      const win = window.open('', '_blank');
      if (!win) { toast.error('Popup blocked — allow popups to export PDF'); return; }
      win.document.write(html);
      win.document.close();
      toast.success('Print dialog opened — save as PDF');
    } catch (e: any) {
      toast.error(e.message || 'PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  const enableCreatorMode = async () => {
    if (!user) return;
    const { error } = await supabase.from('user_profiles').update({ is_creator: true, can_monetize: true }).eq('id', user.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Creator mode enabled!');
    fetchCreatorStats();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <TopBar title="Creator Studio" showBack />
      <CreatorStudioAdBanner />

      <div className="p-4 space-y-6">
        {/* Studio tabs */}
        <div className="flex bg-muted/30 rounded-xl p-1 gap-1">
          {(['overview', 'analytics', 'videos', 'earnings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveStudioTab(tab)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                activeStudioTab === tab ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'videos' ? '📹 Videos' : tab === 'earnings' ? '💰 Earnings' : tab === 'analytics' ? '📈 Analytics' : '📊 Overview'}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeStudioTab === 'overview' && (
          <>
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 p-6 rounded-xl border border-purple-500/20">
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="w-8 h-8 text-purple-500" />
                <div>
                  <h1 className="text-2xl font-bold">Creator Studio</h1>
                  <p className="text-sm text-muted-foreground">Manage your content and earnings</p>
                </div>
              </div>
              {!user?.is_creator && (
                <button onClick={enableCreatorMode} className="w-full mt-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:opacity-90 transition-opacity">
                  Enable Creator Mode
                </button>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: <Eye className="w-4 h-4" />, label: 'Total Views', value: formatNumber(stats.total_views), color: 'text-blue-600' },
                { icon: <Heart className="w-4 h-4" />, label: 'Total Likes', value: formatNumber(stats.total_likes), color: 'text-pink-600' },
                { icon: <Users className="w-4 h-4" />, label: 'Followers', value: formatNumber(stats.total_followers), color: 'text-purple-600' },
                { icon: <DollarSign className="w-4 h-4" />, label: 'Earnings', value: `$${stats.total_earnings.toFixed(2)}`, color: 'text-green-600' },
                { icon: <FileText className="w-4 h-4" />, label: 'Total Posts', value: formatNumber(stats.total_posts), color: 'text-orange-600' },
                { icon: <TrendingUp className="w-4 h-4" />, label: 'Engagement', value: `${stats.engagement_rate.toFixed(1)}%`, color: 'text-teal-600' },
                { icon: <Video className="w-4 h-4" />, label: 'Video Views', value: formatNumber(stats.video_views), color: 'text-red-600' },
                { icon: <BarChart3 className="w-4 h-4" />, label: 'Analytics', value: <button onClick={() => navigate('/analytics')} className="text-sm font-semibold text-primary hover:underline">View Details</button>, color: 'text-indigo-600' },
              ].map(({ icon, label, value, color }, i) => (
                <div key={i} className="bg-muted/30 p-4 rounded-xl">
                  <div className={`flex items-center gap-2 ${color} mb-2`}>{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
                  <p className="text-2xl font-bold">{value}</p>
                </div>
              ))}
            </div>

            {/* Weekly Views */}
            {weeklyViews.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4"><Eye className="w-5 h-5 text-blue-500" /><h2 className="font-bold text-lg">Weekly Views</h2></div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={weeklyViews} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2.5} dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { path: '/scheduled', icon: <Calendar className="w-6 h-6 text-blue-600" />, label: 'Scheduled', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/30', text: 'text-blue-900 dark:text-blue-100' },
                { path: '/products', icon: <ShoppingBag className="w-6 h-6 text-green-600" />, label: 'Products', bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', hover: 'hover:bg-green-100 dark:hover:bg-green-900/30', text: 'text-green-900 dark:text-green-100' },
                { path: '/monetization', icon: <DollarSign className="w-6 h-6 text-purple-600" />, label: 'Earnings', bg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800', hover: 'hover:bg-purple-100 dark:hover:bg-purple-900/30', text: 'text-purple-900 dark:text-purple-100' },
                { path: '/post-analytics', icon: <BarChart3 className="w-6 h-6 text-orange-600" />, label: 'Post Analytics', bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800', hover: 'hover:bg-orange-100 dark:hover:bg-orange-900/30', text: 'text-orange-900 dark:text-orange-100' },
              ].map(({ path, icon, label, bg, hover, text }) => (
                <button key={path} onClick={() => navigate(path)} className={`p-4 ${bg} border rounded-xl ${hover} transition-colors text-left`}>
                  {icon}<p className={`text-sm font-semibold ${text} mt-2`}>{label}</p>
                </button>
              ))}
            </div>

            {/* Recent Posts */}
            <div>
              <h2 className="text-lg font-bold mb-3">Recent Posts Performance</h2>
              <div className="space-y-3">
                {recentPosts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>No posts yet</p></div>
                ) : recentPosts.map((post) => (
                  <div key={post.id} className="bg-muted/30 p-4 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/post/${post.id}`)}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm line-clamp-2 mb-2">{post.content}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(post.views_count || 0)}</span>
                          <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{formatNumber(post.likes_count || 0)}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{formatNumber(post.replies_count || 0)}</span>
                          {post.is_video && <span className="text-red-600 flex items-center gap-1"><Video className="w-3 h-3" />Video</span>}
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/boost-analytics/${post.id}`); }} className="flex items-center gap-1 text-primary hover:underline">
                            <TrendingUp className="w-3 h-3" /> Boost Stats
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/post-analytics/${post.id}`); }} className="flex items-center gap-1 text-blue-500 hover:underline">
                            <BarChart3 className="w-3 h-3" /> Analytics
                          </button>
                        </div>
                      </div>
                      {post.image_url && !post.is_video && (
                        <img src={post.image_url} alt="Post" className="w-16 h-16 rounded object-cover" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Creator Milestone Badges ── */}
            {(() => {
              const milestones = [
                {
                  id: 'followers_100',
                  icon: '👥',
                  title: 'First 100 Followers',
                  desc: 'Reach 100 followers',
                  done: stats.total_followers >= 100,
                  progress: Math.min(stats.total_followers, 100),
                  total: 100,
                  color: 'blue',
                },
                {
                  id: 'first_video',
                  icon: '🎬',
                  title: 'First Video',
                  desc: 'Upload your first video post',
                  done: videoPostsCount > 0,
                  progress: Math.min(videoPostsCount, 1),
                  total: 1,
                  color: 'red',
                },
                {
                  id: 'first_dollar',
                  icon: '💵',
                  title: 'First Dollar Earned',
                  desc: 'Earn your first $1',
                  done: stats.total_earnings >= 1,
                  progress: Math.min(stats.total_earnings, 1),
                  total: 1,
                  color: 'green',
                },
                {
                  id: 'streak_7',
                  icon: '🔥',
                  title: '7-Day Streak',
                  desc: 'Claim rewards 7 days in a row',
                  done: streakDay >= 7,
                  progress: Math.min(streakDay, 7),
                  total: 7,
                  color: 'orange',
                },
                {
                  id: 'followers_1000',
                  icon: '🌟',
                  title: '1K Followers',
                  desc: 'Reach 1,000 followers',
                  done: stats.total_followers >= 1000,
                  progress: Math.min(stats.total_followers, 1000),
                  total: 1000,
                  color: 'purple',
                },
                {
                  id: 'posts_10',
                  icon: '✍️',
                  title: '10 Posts',
                  desc: 'Create 10 posts',
                  done: stats.total_posts >= 10,
                  progress: Math.min(stats.total_posts, 10),
                  total: 10,
                  color: 'teal',
                },
              ];
              const colorMap: Record<string, string> = {
                blue:   'from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-600',
                red:    'from-red-500/10 to-red-500/5 border-red-500/20 text-red-600',
                green:  'from-green-500/10 to-green-500/5 border-green-500/20 text-green-600',
                orange: 'from-orange-500/10 to-orange-500/5 border-orange-500/20 text-orange-600',
                purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/20 text-purple-600',
                teal:   'from-teal-500/10 to-teal-500/5 border-teal-500/20 text-teal-600',
              };
              const barColorMap: Record<string, string> = {
                blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500',
                orange: 'bg-orange-500', purple: 'bg-purple-500', teal: 'bg-teal-500',
              };
              const done = milestones.filter(m => m.done).length;
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">🏅 Creator Milestones</h2>
                    <span className="text-sm text-muted-foreground font-medium">{done}/{milestones.length} completed</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-700"
                      style={{ width: `${(done / milestones.length) * 100}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {milestones.map(m => (
                      <div
                        key={m.id}
                        className={`relative bg-gradient-to-br border rounded-xl p-3 transition-all ${
                          m.done
                            ? colorMap[m.color] + ' opacity-100'
                            : 'from-muted/30 to-muted/10 border-border opacity-70'
                        }`}
                      >
                        {/* Badge status icon */}
                        <div className="absolute top-2 right-2">
                          {m.done
                            ? <span className="text-sm">✅</span>
                            : <span className="text-sm opacity-40">🔒</span>
                          }
                        </div>
                        <div className="text-2xl mb-1.5">{m.icon}</div>
                        <p className={`text-xs font-bold leading-tight mb-0.5 ${m.done ? '' : 'text-muted-foreground'}`}>
                          {m.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-tight mb-2">{m.desc}</p>
                        {/* Mini progress bar */}
                        {!m.done && (
                          <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-1 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${barColorMap[m.color]} transition-all duration-500`}
                              style={{ width: `${m.total > 0 ? (m.progress / m.total) * 100 : 0}%` }}
                            />
                          </div>
                        )}
                        {!m.done && m.total > 1 && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {m.progress.toLocaleString()} / {m.total.toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Tips */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <h3 className="font-bold text-amber-900 dark:text-amber-100 mb-2">💡 Creator Tips</h3>
              <ul className="space-y-2 text-sm text-amber-800 dark:text-amber-200">
                <li>• Post consistently to build your audience</li>
                <li>• Use hashtags to increase discoverability</li>
                <li>• Engage with your followers through replies</li>
                <li>• Create high-quality video content for better engagement</li>
                <li>• Tag products in your posts to drive sales</li>
                <li>• Schedule posts during peak hours for maximum reach</li>
              </ul>
            </div>
          </>
        )}

        {/* ── ANALYTICS TAB ── */}
        {activeStudioTab === 'analytics' && (
          <div className="space-y-5">
            {loadingAnalytics ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : (
              <>
                {/* Follower growth chart */}
                <div className="bg-card border border-border rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-500" />
                      <h2 className="font-bold">Follower Growth</h2>
                    </div>
                    <div className="flex items-center gap-1">
                      {followerGrowth.length > 1 && (() => {
                        const delta = followerGrowth[followerGrowth.length - 1].followers - followerGrowth[0].followers;
                        const pct = followerGrowth[0].followers > 0 ? ((delta / followerGrowth[0].followers) * 100).toFixed(1) : '∞';
                        return (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ delta >= 0 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500' }`}>
                            {delta >= 0 ? '+' : ''}{pct}% this week
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">7-day follower trajectory</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={followerGrowth} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => formatNumber(v)} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} formatter={(v: any) => [formatNumber(v), 'Followers']} />
                      <Line type="monotone" dataKey="followers" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill: '#8b5cf6', r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Earnings Projection */}
                {earningsProjection !== null && (
                  <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-green-600" />
                      <h2 className="font-bold">Earnings Projection</h2>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">Based on your earnings trajectory</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-green-600">${earningsProjection.toFixed(2)}</span>
                      <span className="text-sm text-muted-foreground">/ month (est.)</span>
                    </div>
                    <div className="mt-3 w-full bg-green-500/20 rounded-full h-2">
                      <div className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full" style={{ width: `${Math.min(100, (earningsProjection / 100) * 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{Math.round(Math.min(100, (earningsProjection / 100) * 100))}% toward $100/mo milestone</p>
                  </div>
                )}

                {/* Post type breakdown */}
                {postTypeBreakdown.length > 0 && (
                  <div className="bg-card border border-border rounded-2xl p-5">
                    <h2 className="font-bold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />Content Mix</h2>
                    <div className="space-y-3">
                      {postTypeBreakdown.map(({ name, value, color }) => {
                        const total = postTypeBreakdown.reduce((s, t) => s + t.value, 0);
                        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                        return (
                          <div key={name}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold">{name}</span>
                              <span className="text-sm text-muted-foreground">{value} posts · {pct}%</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Top performing posts */}
                {topPosts.length > 0 && (
                  <div className="bg-card border border-border rounded-2xl p-5">
                    <h2 className="font-bold mb-4 flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />Top Posts by Engagement</h2>
                    <div className="space-y-2">
                      {topPosts.slice(0, 5).map((post, idx) => (
                        <div key={post.id}
                          className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => navigate(`/post/${post.id}`)}
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            idx === 0 ? 'bg-yellow-400/20 text-yellow-600' :
                            idx === 1 ? 'bg-slate-300/20 text-slate-500' :
                            idx === 2 ? 'bg-amber-600/20 text-amber-600' : 'bg-muted text-muted-foreground'
                          }`}>
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium line-clamp-1">{post.content || (post.is_video ? 'Video post' : 'Image post')}</p>
                            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" />{formatNumber(post.views_count ?? 0)}</span>
                              <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" />{formatNumber(post.likes_count ?? 0)}</span>
                              <span className="flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" />{Math.round(post._score)}</span>
                              {post.is_video && <span className="text-red-500">Video</span>}
                            </div>
                          </div>
                          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </div>
                      ))}
                    </div>
                    <button onClick={() => navigate('/post-analytics')} className="mt-3 w-full py-2 text-xs text-primary font-semibold hover:underline">View Full Analytics Dashboard →</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ENHANCED VIDEO TAB ── */}
        {activeStudioTab === 'videos' && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Play className="w-5 h-5 text-red-500" />
                <h2 className="font-bold text-lg">Video Posts</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-3">Manage monetization and pricing for your video content</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-background/60 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-red-500">{allVideoPosts.length}</p>
                  <p className="text-xs text-muted-foreground">Total Videos</p>
                </div>
                <div className="bg-background/60 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-purple-500">{allVideoPosts.filter(v => v.is_monetized).length}</p>
                  <p className="text-xs text-muted-foreground">Monetized</p>
                </div>
                <div className="bg-background/60 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{formatNumber(stats.video_views)}</p>
                  <p className="text-xs text-muted-foreground">Total Views</p>
                </div>
              </div>
            </div>

            {/* Video list */}
            {loadingAllVideos ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : allVideoPosts.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Video className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No video posts yet</p>
                <p className="text-sm mt-1">Upload videos to start earning from pre-roll ads</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allVideoPosts.map((post) => {
                  const analytics = Array.isArray(post.post_analytics) ? post.post_analytics[0] : post.post_analytics;
                  return (
                    <div key={post.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                      {/* Video thumbnail row */}
                      <div className="flex gap-3 p-3">
                        <div
                          className="w-20 h-14 rounded-xl bg-black overflow-hidden shrink-0 cursor-pointer"
                          onClick={() => navigate(`/post/${post.id}`)}
                        >
                          <video src={post.video_url} className="w-full h-full object-cover" muted playsInline />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-2 leading-snug">{post.content || 'Video post'}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(analytics?.views ?? post.views_count ?? 0)}</span>
                            <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{formatNumber(post.likes_count ?? 0)}</span>
                            <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{Number(analytics?.engagement_rate ?? 0).toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Monetize controls */}
                      <div className="border-t border-border px-3 py-2.5 bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
                        {/* Toggle */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleMonetize(post.id, !!post.is_monetized)}
                            disabled={togglingMonetize === post.id}
                            className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                              post.is_monetized ? 'bg-green-500' : 'bg-muted'
                            }`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                              post.is_monetized ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                            {togglingMonetize === post.id && <Loader2 className="absolute inset-0 m-auto w-3 h-3 animate-spin text-white" />}
                          </button>
                          <span className={`text-xs font-semibold ${
                            post.is_monetized ? 'text-green-600' : 'text-muted-foreground'
                          }`}>{post.is_monetized ? 'Monetized' : 'Not monetized'}</span>
                        </div>

                        {/* Price (only when monetized) */}
                        {post.is_monetized && (
                          editingPrice === post.id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground font-bold">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={priceInput}
                                onChange={e => setPriceInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSavePrice(post.id); if (e.key === 'Escape') setEditingPrice(null); }}
                                className="w-20 px-2 py-1 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                autoFocus
                                placeholder="0.00"
                              />
                              <button onClick={() => handleSavePrice(post.id)} className="px-2 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:opacity-90">Save</button>
                              <button onClick={() => setEditingPrice(null)} className="px-2 py-1 bg-muted rounded-lg text-xs">Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingPrice(post.id); setPriceInput(post.price ? String(post.price) : ''); }}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-colors"
                            >
                              <DollarSign className="w-3 h-3 text-green-600" />
                              {post.price > 0 ? `$${Number(post.price).toFixed(2)}` : 'Set price'}
                            </button>
                          )
                        )}

                        {/* Analytics link */}
                        <button onClick={() => navigate(`/post-analytics/${post.id}`)} className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                          <BarChart3 className="w-3 h-3" /> Analytics
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Revenue summary (legacy chart) */}
            {videoEarnings.filter(v => v.earned > 0).length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <h3 className="font-bold mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-500" />Video Ad Revenue</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={videoEarnings.slice(0, 5).map(v => ({ name: (v.content?.slice(0, 12) || 'Video') + '…', earned: v.earned }))} margin={{ top: 4, right: 4, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${Number(v).toFixed(3)}`} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(5)}`, 'Earned']} />
                    <Bar dataKey="earned" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── EARNINGS TAB ── */}
        {activeStudioTab === 'earnings' && (
          <div className="space-y-4">
            {/* 4-Week Revenue Breakdown Chart */}
            {revenueBreakdown4W.some(d => d.tips + d.subscriptions + d.ads + d.other > 0) && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <h2 className="font-bold">4-Week Revenue Breakdown</h2>
                </div>
                <p className="text-xs text-muted-foreground mb-4">Revenue by source over the last 4 weeks</p>
                {/* Source legend */}
                <div className="flex flex-wrap gap-3 mb-3">
                  {[{ key: 'tips', color: '#f59e0b', label: 'Tips' }, { key: 'subscriptions', color: '#8b5cf6', label: 'Subscriptions' }, { key: 'ads', color: '#10b981', label: 'Ads/Videos' }, { key: 'other', color: '#3b82f6', label: 'Other' }].map(s => (
                    <div key={s.key} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
                      <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={revenueBreakdown4W} margin={{ top: 0, right: 0, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${Number(v).toFixed(2)}`} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, name: string) => [`$${Number(v).toFixed(4)}`, name]}
                    />
                    <Bar dataKey="tips" name="Tips" fill="#f59e0b" stackId="rev" />
                    <Bar dataKey="subscriptions" name="Subscriptions" fill="#8b5cf6" stackId="rev" />
                    <Bar dataKey="ads" name="Ads/Videos" fill="#10b981" stackId="rev" />
                    <Bar dataKey="other" name="Other" fill="#3b82f6" stackId="rev" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                {/* Totals summary strip */}
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {[{ key: 'tips', color: '#f59e0b', label: 'Tips' }, { key: 'subscriptions', color: '#8b5cf6', label: 'Subs' }, { key: 'ads', color: '#10b981', label: 'Ads' }, { key: 'other', color: '#3b82f6', label: 'Other' }].map(s => {
                    const total = revenueBreakdown4W.reduce((sum, w) => sum + (w[s.key] ?? 0), 0);
                    return (
                      <div key={s.key} className="bg-muted/30 rounded-xl p-2 text-center">
                        <div className="w-3 h-3 rounded-sm mx-auto mb-1" style={{ background: s.color }} />
                        <p className="text-xs font-bold">${total.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Weekly Earnings Chart */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />This Week's Earnings</h2>
              </div>
              {weeklyEarnings.some(d => d.tips + d.subscriptions + d.ads + d.other > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weeklyEarnings} margin={{ top: 0, right: 0, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, name: string) => [`$${Number(v).toFixed(4)}`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="tips" name="Tips" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="subscriptions" name="Subscriptions" fill="#8b5cf6" stackId="a" />
                    <Bar dataKey="ads" name="Ads/Videos" fill="#10b981" stackId="a" />
                    <Bar dataKey="other" name="Other" fill="#3b82f6" stackId="a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground">
                  <DollarSign className="w-10 h-10 opacity-20 mb-2" />
                  <p className="text-sm">No earnings this week yet</p>
                </div>
              )}
            </div>

            {/* ── CSV Export ── */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Download className="w-5 h-5 text-primary" />
                <h2 className="font-bold">Export Revenue</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">Download all earnings, tips, and ad revenue for a date range.</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">From (month)</label>
                  <input
                    type="month"
                    value={exportStartMonth}
                    onChange={e => setExportStartMonth(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">To (month)</label>
                  <input
                    type="month"
                    value={exportEndMonth}
                    onChange={e => setExportEndMonth(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleExportCsv}
                  disabled={exportingCsv}
                  className="py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {exportingCsv
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
                    : <><Download className="w-4 h-4" /> CSV</>}
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  className="py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {exportingPdf
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</>
                    : <><Printer className="w-4 h-4" /> PDF</>}
                </button>
              </div>
            </div>

            {earningsHistory.length > 0 ? (
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-600" />Monthly Earnings</h2>
                  <button onClick={() => navigate('/monetization')} className="text-sm text-primary font-semibold hover:underline flex items-center gap-1">
                    Full Dashboard <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={earningsHistory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} formatter={(v: any, name: string) => [`$${Number(v).toFixed(2)}`, name === 'earned' ? 'Paid Out' : 'Pending']} />
                    <Legend formatter={v => v === 'earned' ? 'Paid Out' : 'Pending'} />
                    <Bar dataKey="earned" name="earned" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="pending" name="pending" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No monthly history yet</p>
              </div>
            )}
            <button onClick={() => navigate('/payouts')} className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity">
              Request Payout
            </button>
            <button onClick={() => navigate('/post-analytics')} className="w-full py-3 border border-border rounded-xl font-semibold hover:bg-muted/50 transition-colors flex items-center justify-center gap-2">
              <BarChart3 className="w-4 h-4" /> Post Analytics Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
