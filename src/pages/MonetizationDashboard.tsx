import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { TopBar } from '@/components/layout/TopBar';
import {
  DollarSign, TrendingUp, Users, BarChart3,
  Loader2, ExternalLink, Lock, CheckCircle2, XCircle, Star,
  Coins, Gift, Zap, Play, Trophy, ArrowRight, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';

const MONETIZATION_THRESHOLD = 500;

const CREDIT_PACKAGES = [
  { credits: 500,   price: 4.99,  label: 'Starter', color: 'from-blue-500 to-cyan-500',     popular: false },
  { credits: 2500,  price: 9.99,  label: 'Pro',     color: 'from-purple-500 to-pink-500',    popular: true  },
  { credits: 10000, price: 19.99, label: 'Creator', color: 'from-yellow-500 to-orange-500',  popular: false },
];

const CREDIT_COSTS: Record<string, number> = {
  'AI Reply': 1, 'AI Image': 5, 'AI Video': 20,
  'Profile Boost': 10, 'Post Promotion': 50, 'Verification': 50,
};

export function MonetizationDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalEarnings: 0, videoRevenue: 0, subscriptions: 0,
    tips: 0, videoViews: 0, productSales: 0, rewardedAdEarnings: 0,
  });
  const [earnings, setEarnings]   = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [monetizationStatus, setMonetizationStatus] = useState<any>(null);
  const [userProfile, setUserProfile]   = useState<any>(null);
  const [walletData, setWalletData]     = useState<any>(null);
  const [credits, setCredits]           = useState(0);
  const [dailyReward, setDailyReward]   = useState<any>(null);
  const [claimingReward, setClaimingReward] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'credits' | 'earnings'>('overview');

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    fetchAll();
  }, [user]);

  const fetchAll = async () => {
    if (!user) return;
    try {
      const [monRes, profileRes, earningsRes, subsRes, tipsRes, videosRes, walletRes, dailyRes] = await Promise.all([
        supabase.from('user_monetization').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_profiles').select('subscriber_count, followers_count, is_creator, can_monetize').eq('id', user.id).single(),
        supabase.from('creator_earnings').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('creator_subscriptions').select('*').eq('creator_id', user.id).eq('status', 'active'),
        supabase.from('tips').select('*').eq('to_user_id', user.id),
        supabase.from('posts').select('views_count').eq('user_id', user.id).eq('is_video', true),
        supabase.from('user_wallets').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('daily_rewards').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      setMonetizationStatus(monRes.data);
      setUserProfile(profileRes.data);
      setWalletData(walletRes.data);
      setCredits(walletRes.data?.credits || 0);
      setDailyReward(dailyRes.data);

      const earningsList = earningsRes.data || [];
      setEarnings(earningsList);

      // Build 7-day revenue chart
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
      });
      const byDay: Record<string, number> = {};
      last7.forEach(d => { byDay[d] = 0; });
      earningsList.forEach((e: any) => {
        const day = e.created_at?.split('T')[0];
        if (day && byDay[day] !== undefined) byDay[day] += Number(e.amount);
      });
      setChartData(last7.map(d => ({
        date: d.slice(5),
        creator: parseFloat(byDay[d].toFixed(5)),
        platform: parseFloat((byDay[d] * (70 / 30)).toFixed(5)),
      })));

      const total      = earningsList.reduce((s: number, e: any) => s + Number(e.amount), 0);
      const videoRev   = earningsList.filter((e: any) => e.source === 'video_ads').reduce((s: number, e: any) => s + Number(e.amount), 0);
      const productRev = earningsList.filter((e: any) => e.source === 'product_sales').reduce((s: number, e: any) => s + Number(e.amount), 0);
      const rewardedRev = earningsList.filter((e: any) => e.source === 'rewarded_ads').reduce((s: number, e: any) => s + Number(e.amount), 0);
      const subsRevenue = (subsRes.data || []).reduce((s: number, e: any) => s + Number(e.price), 0);
      const tipsRevenue = (tipsRes.data || []).reduce((s: number, e: any) => s + Number(e.amount), 0);
      const totalViews  = (videosRes.data || []).reduce((s: number, e: any) => s + (e.views_count || 0), 0);

      setStats({
        totalEarnings: total + subsRevenue + tipsRevenue,
        videoRevenue: videoRev, subscriptions: subsRevenue, tips: tipsRevenue,
        videoViews: totalViews, productSales: productRev, rewardedAdEarnings: rewardedRev,
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load monetization data');
    } finally {
      setLoading(false);
    }
  };

  const enableMonetization = async () => {
    if (!user) return;
    const subscriberCount = userProfile?.subscriber_count || userProfile?.followers_count || 0;
    if (subscriberCount < MONETIZATION_THRESHOLD) {
      toast.error(`You need ${MONETIZATION_THRESHOLD.toLocaleString()} followers to monetize`); return;
    }
    try {
      await supabase.from('user_monetization')
        .upsert({ user_id: user.id, is_monetized: true, eligibility_status: 'approved' }, { onConflict: 'user_id' });
      await supabase.from('user_profiles')
        .update({ is_creator: true, can_monetize: true, creator_tier: 'basic' }).eq('id', user.id);
      toast.success('Monetization enabled! Start earning from your content.');
      fetchAll();
    } catch (error: any) { toast.error(error.message || 'Failed to enable monetization'); }
  };

  const claimDailyReward = async () => {
    if (!user) return;
    setClaimingReward(true);
    try {
      const now = new Date();
      const lastClaimed = dailyReward?.last_claimed_at ? new Date(dailyReward.last_claimed_at) : null;
      if (lastClaimed && now.toDateString() === lastClaimed.toDateString()) {
        toast.info('Daily reward already claimed! Come back tomorrow.'); return;
      }
      const streak = dailyReward ? Math.min(dailyReward.streak_day + 1, 7) : 1;
      const creditsEarned = streak * 10;

      await supabase.from('daily_rewards').upsert({
        user_id: user.id, streak_day: streak, credits_earned: creditsEarned,
        last_claimed_at: now.toISOString(),
      }, { onConflict: 'user_id' });
      await supabase.from('user_wallets').upsert({
        user_id: user.id, credits: (walletData?.credits || 0) + creditsEarned,
      }, { onConflict: 'user_id' });
      await supabase.from('credit_transactions').insert({
        user_id: user.id, amount: creditsEarned, reason: 'daily_reward',
        metadata: { streak_day: streak },
      });
      setCredits(prev => prev + creditsEarned);
      setDailyReward({ ...dailyReward, streak_day: streak, last_claimed_at: now.toISOString() });
      toast.success(`Day ${streak} reward claimed! +${creditsEarned} credits`);
    } catch (err: any) { toast.error(err.message || 'Failed to claim reward'); }
    finally { setClaimingReward(false); }
  };

  const canClaimDaily = () => {
    if (!dailyReward?.last_claimed_at) return true;
    return new Date().toDateString() !== new Date(dailyReward.last_claimed_at).toDateString();
  };

  if (!user) return null;
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const subscriberCount = userProfile?.subscriber_count || userProfile?.followers_count || 0;
  const isEligible = subscriberCount >= MONETIZATION_THRESHOLD;
  const progressPct = Math.min(100, (subscriberCount / MONETIZATION_THRESHOLD) * 100);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Monetization" showBack />

      <div className="max-w-2xl mx-auto p-4 space-y-6">

        {/* Tabs */}
        <div className="flex bg-muted/30 rounded-xl p-1 gap-1">
          {(['overview', 'credits', 'earnings'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold capitalize transition-all ${
                activeTab === tab ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}>{tab}</button>
          ))}
        </div>

        {/* ─── OVERVIEW ─── */}
        {activeTab === 'overview' && (
          <>
            {/* Credits */}
            <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-yellow-500" />
                  <h3 className="font-bold">Your Credits</h3>
                </div>
                <Button size="sm" variant="outline" onClick={fetchAll}><RefreshCw className="w-3 h-3" /></Button>
              </div>
              <p className="text-4xl font-bold text-yellow-500 mb-1">{formatNumber(credits)}</p>
              <p className="text-xs text-muted-foreground mb-4">Credits power AI features, boosts, and more</p>

              <div className={`rounded-xl p-3 border ${canClaimDaily() ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-muted/30 border-border'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-yellow-500" />
                    <div>
                      <p className="text-sm font-semibold">Daily Reward</p>
                      <p className="text-xs text-muted-foreground">
                        {dailyReward ? `Day ${dailyReward.streak_day} streak` : 'Start your streak!'}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" onClick={claimDailyReward}
                    disabled={!canClaimDaily() || claimingReward}
                    className={canClaimDaily() ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : ''}>
                    {claimingReward ? <Loader2 className="w-3 h-3 animate-spin" /> : canClaimDaily() ? 'Claim!' : 'Tomorrow'}
                  </Button>
                </div>
                {dailyReward && (
                  <div className="mt-3 grid grid-cols-7 gap-1">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className={`h-1.5 rounded-full ${i < (dailyReward.streak_day || 0) ? 'bg-yellow-500' : 'bg-muted'}`} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => setActiveTab('credits')}>
                  <Play className="w-3 h-3" /> Get Credits
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => navigate('/rewards')}>
                  <Zap className="w-3 h-3" /> Watch Ads
                </Button>
              </div>
            </div>

            {/* Eligibility */}
            {!monetizationStatus?.is_monetized && (
              <div className={`border rounded-2xl p-5 ${isEligible ? 'bg-gradient-to-r from-primary/10 to-green-500/10 border-primary/30' : 'bg-card border-border'}`}>
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${isEligible ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    {isEligible ? <CheckCircle2 className="w-6 h-6" /> : <Lock className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{isEligible ? "You're eligible to monetize!" : 'Unlock Monetization'}</h2>
                    <p className="text-sm text-muted-foreground">
                      {isEligible ? `You've reached ${MONETIZATION_THRESHOLD.toLocaleString()} followers. Start earning!`
                        : `Reach ${MONETIZATION_THRESHOLD.toLocaleString()} followers to unlock monetization`}
                    </p>
                  </div>
                </div>
                {!isEligible && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>{subscriberCount.toLocaleString()} followers</span>
                      <span>{MONETIZATION_THRESHOLD.toLocaleString()} required</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-green-500 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                )}
                <div className="space-y-2 mb-4">
                  {[
                    { label: `${MONETIZATION_THRESHOLD}+ followers`, met: isEligible },
                    { label: 'Active account in good standing', met: true },
                    { label: 'Post original content', met: true },
                  ].map((req, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {req.met ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      <span className={req.met ? 'text-foreground' : 'text-muted-foreground'}>{req.label}</span>
                    </div>
                  ))}
                </div>
                <button onClick={enableMonetization} disabled={!isEligible}
                  className={`w-full py-3 rounded-full font-semibold transition-all ${isEligible ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                  {isEligible ? 'Enable Monetization' : `Need ${(MONETIZATION_THRESHOLD - subscriberCount).toLocaleString()} more followers`}
                </button>
              </div>
            )}

            {monetizationStatus?.is_monetized && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="w-5 h-5 text-primary" />
                      <span className="text-sm text-muted-foreground font-medium">Total Earnings</span>
                    </div>
                    <p className="text-4xl font-bold text-primary">${stats.totalEarnings.toFixed(2)}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Star className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="text-xs text-muted-foreground">Creator since {new Date(monetizationStatus.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {[
                    { label: 'Video Revenue', value: stats.videoRevenue, sub: `${formatNumber(stats.videoViews)} views`, icon: BarChart3, color: 'text-green-500' },
                    { label: 'Subscriptions', value: stats.subscriptions, sub: 'monthly', icon: Users, color: 'text-blue-500' },
                    { label: 'Tips Received', value: stats.tips, sub: 'total', icon: TrendingUp, color: 'text-purple-500' },
                    { label: 'Ad Revenue', value: stats.rewardedAdEarnings, sub: '30% share', icon: Zap, color: 'text-orange-500' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <stat.icon className={`w-4 h-4 ${stat.color}`} />
                        <span className="text-xs text-muted-foreground">{stat.label}</span>
                      </div>
                      <p className="text-xl font-bold">${stat.value.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Button onClick={() => navigate('/payouts')} className="flex-1">Request Payout</Button>
                  <Button onClick={() => navigate('/creator-studio')} variant="outline" className="flex-1">Creator Studio</Button>
                </div>
              </>
            )}

            {/* Revenue streams */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />Revenue Streams
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Watch Rewarded Ads', desc: '+25 credits per ad, +30% ad revenue', action: () => navigate('/rewards'), icon: Play, color: 'text-green-500' },
                  { label: 'Boost Posts', desc: 'Free boosts via rewarded ads', action: () => navigate('/'), icon: Zap, color: 'text-blue-500' },
                  { label: 'Sell Products', desc: 'List items in the marketplace', action: () => navigate('/products'), icon: ExternalLink, color: 'text-purple-500' },
                  { label: 'Premium Badge', desc: 'Get verified + more reach', action: () => navigate('/premium'), icon: Star, color: 'text-yellow-500' },
                ].map((stream, i) => (
                  <button key={i} onClick={stream.action} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                        <stream.icon className={`w-4 h-4 ${stream.color}`} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{stream.label}</p>
                        <p className="text-xs text-muted-foreground">{stream.desc}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── CREDITS ─── */}
        {activeTab === 'credits' && (
          <>
            <div className="text-center py-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 rounded-full border border-yellow-500/30 mb-2">
                <Coins className="w-5 h-5 text-yellow-500" />
                <span className="text-2xl font-bold text-yellow-500">{formatNumber(credits)} credits</span>
              </div>
              <p className="text-sm text-muted-foreground">Use credits for AI features, boosts & promotions</p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-bold mb-3">Credit Costs</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(CREDIT_COSTS).map(([action, cost]) => (
                  <div key={action} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                    <span className="text-sm">{action}</span>
                    <span className="text-sm font-bold text-yellow-500">{cost} cr</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-bold mb-3 flex items-center gap-2"><Gift className="w-5 h-5 text-green-500" />Earn Free Credits</h3>
              <div className="space-y-3">
                {[
                  { label: 'Daily Login', desc: 'Day 1–7 streak: 10–70 credits', icon: Trophy, color: 'text-yellow-500' },
                  { label: 'Watch Rewarded Ad', desc: '+25 credits per ad (10/day max)', icon: Play, color: 'text-blue-500' },
                  { label: 'Refer a Friend', desc: 'Both get 100 credits on signup', icon: Users, color: 'text-purple-500' },
                  { label: 'Post Goes Viral', desc: '+10 credits per 1k views', icon: TrendingUp, color: 'text-green-500' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <item.icon className={`w-4 h-4 ${item.color}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-bold flex items-center gap-2"><DollarSign className="w-5 h-5 text-primary" />Buy Credits</h3>
              {CREDIT_PACKAGES.map(pkg => (
                <div key={pkg.label} className={`relative border-2 rounded-2xl p-4 ${pkg.popular ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
                  {pkg.popular && <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">MOST POPULAR</span>}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${pkg.color} flex items-center justify-center`}>
                        <Coins className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold">{pkg.label} Pack</p>
                        <p className="text-yellow-500 font-semibold">{formatNumber(pkg.credits)} credits</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold">${pkg.price}</p>
                      <Button size="sm" className="mt-1" variant={pkg.popular ? 'default' : 'outline'} onClick={() => navigate('/premium')}>Buy</Button>
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-xs text-center text-muted-foreground">💳 Secure payments via Stripe</p>
            </div>
          </>
        )}

        {/* ─── EARNINGS ─── */}
        {activeTab === 'earnings' && (
          <>
            {/* 7-day revenue chart */}
            {chartData.some(d => d.creator > 0) && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  7-Day Revenue (30% / 70% Split)
                </h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(val: any, name: string) => [
                        `$${Number(val).toFixed(5)}`,
                        name === 'creator' ? 'Your 30%' : 'Platform 70%'
                      ]}
                    />
                    <Legend formatter={v => v === 'creator' ? 'Your 30%' : 'Platform 70%'} />
                    <Bar dataKey="creator"  fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="platform" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {earnings.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="font-semibold">No earnings yet</p>
                <p className="text-sm mt-1">Watch ads, create content, and boost posts to earn</p>
                <Button onClick={() => setActiveTab('credits')} className="mt-4" variant="outline">Get Started</Button>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-4">
                <h3 className="font-bold mb-3">Earnings History</h3>
                <div className="space-y-2">
                  {earnings.slice(0, 20).map(earning => (
                    <div key={earning.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm capitalize">{earning.source.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">{new Date(earning.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">+${Number(earning.amount).toFixed(4)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          earning.status === 'pending' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/20' : 'bg-green-100 text-green-600 dark:bg-green-900/20'
                        }`}>{earning.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Grow tips */}
        <div className="bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20 rounded-2xl p-5">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />Grow Your Audience
          </h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>• Post consistently — at least once per day</li>
            <li>• Upload short videos for maximum reach</li>
            <li>• Use trending hashtags in your posts</li>
            <li>• Engage with comments on your posts</li>
            <li>• Boost posts via rewarded ads (free!)</li>
            <li>• Host audio Spaces to attract followers</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
