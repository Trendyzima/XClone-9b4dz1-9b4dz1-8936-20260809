import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { TopBar } from '@/components/layout/TopBar';
import { usePageBanner } from '@/hooks/usePageBanner';
import { ADMOB_CONFIG } from '@/lib/admob';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, DollarSign, Eye, Heart, MessageCircle, Users,
  Video, FileText, BarChart3, Calendar, ShoppingBag, Sparkles,
  ArrowUpRight, Loader2, Play
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';

export default function CreatorStudio() {
  const { user } = useAuth();
  const navigate = useNavigate();

  usePageBanner({ adId: ADMOB_CONFIG.BANNER_PROFILE, margin: 64, delay: 3000 });

  const [stats, setStats] = useState({
    total_followers: 0, total_posts: 0, total_views: 0, total_likes: 0,
    total_earnings: 0, engagement_rate: 0, video_views: 0, article_views: 0
  });
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [earningsHistory, setEarningsHistory] = useState<any[]>([]);
  const [weeklyViews, setWeeklyViews] = useState<any[]>([]);
  const [videoEarnings, setVideoEarnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStudioTab, setActiveStudioTab] = useState<'overview' | 'videos' | 'earnings'>('overview');

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    fetchCreatorStats();
    fetchRecentPosts();
    fetchEarningsHistory();
    fetchVideoEarnings();
  }, [user]);

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

      <div className="p-4 space-y-6">
        {/* Studio tabs */}
        <div className="flex bg-muted/30 rounded-xl p-1 gap-1">
          {(['overview', 'videos', 'earnings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveStudioTab(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                activeStudioTab === tab ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'videos' ? '📹 Videos' : tab === 'earnings' ? '💰 Earnings' : '📊 Overview'}
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

        {/* ── VIDEO REVENUE TAB ── */}
        {activeStudioTab === 'videos' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Play className="w-5 h-5 text-red-500" />
                <h2 className="font-bold text-lg">Video Revenue Dashboard</h2>
              </div>
              <p className="text-sm text-muted-foreground">Pre-roll ads on your videos generate 30% revenue for you</p>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-background/60 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-red-500">{formatNumber(stats.video_views)}</p>
                  <p className="text-xs text-muted-foreground">Video Views</p>
                </div>
                <div className="bg-background/60 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-green-600">${videoEarnings.reduce((s, v) => s + v.earned, 0).toFixed(4)}</p>
                  <p className="text-xs text-muted-foreground">Video Earnings</p>
                </div>
              </div>
            </div>

            {videoEarnings.length > 0 ? (
              <>
                <div className="bg-card border border-border rounded-2xl p-4">
                  <h3 className="font-bold mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-500" />Revenue by Video</h3>
                  <div className="space-y-3">
                    {videoEarnings.map((v, i) => (
                      <div key={v.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                        <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center font-bold text-sm text-red-600 shrink-0">{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">{v.content || 'Video post'}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(v.views_count || 0)} views</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-green-600 text-sm">${v.earned.toFixed(5)}</p>
                          <p className="text-xs text-muted-foreground">your 30%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {videoEarnings.filter(v => v.earned > 0).length > 0 && (
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <h3 className="font-bold mb-3">Top Earning Videos</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={videoEarnings.slice(0, 5).map(v => ({ name: (v.content?.slice(0, 15) || 'Video') + '…', earned: v.earned }))} margin={{ top: 4, right: 4, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${Number(v).toFixed(4)}`} />
                        <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(5)}`, 'Earned']} />
                        <Bar dataKey="earned" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <Video className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No video posts yet</p>
                <p className="text-sm mt-1">Upload videos to start earning from pre-roll ads</p>
              </div>
            )}
          </div>
        )}

        {/* ── EARNINGS TAB ── */}
        {activeStudioTab === 'earnings' && (
          <div className="space-y-4">
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
              <div className="text-center py-16 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No earnings yet</p>
                <p className="text-sm mt-1">Enable creator mode and start posting to earn</p>
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
