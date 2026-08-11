import { useState, useEffect, useCallback } from 'react';
import { useSEO } from '@/hooks/useSEO';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/layout/TopBar';
import {
  Gift, CheckCircle2, Clock, Loader2, Coins,
  TrendingUp, Star, Play, BarChart3, RefreshCw,
  Flame, Shield, ArrowUpRight
} from 'lucide-react';
import { formatDistanceToNow, format, isToday } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { AD_REVENUE_SPLIT, ADMOB_CONFIG, showRewarded, isAdMobSupported } from '@/lib/admob';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_ADS_PER_DAY = 10;
const CREDITS_PER_AD = 25;
const CREDITS_PER_DAY_REWARD = CREDITS_PER_AD;
const STREAK_BONUS_CREDITS = 15; // extra credits on a 3-ad streak

// ── Reward type metadata ──────────────────────────────────────────────────────
const REWARD_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  reach_boost:       { label: '2× Reach Boost',       icon: '🚀', color: 'text-purple-600', bg: 'bg-purple-500/10' },
  extra_impressions: { label: 'Extra Impressions',     icon: '👁️', color: 'text-blue-600',   bg: 'bg-blue-500/10'   },
  analytics_unlock:  { label: 'Analytics Unlock',      icon: '📊', color: 'text-green-600',  bg: 'bg-green-500/10'  },
  featured_boost:    { label: 'Featured Spot',         icon: '⭐', color: 'text-amber-600',  bg: 'bg-amber-500/10'  },
  viral_boost:       { label: 'Viral Push',            icon: '⚡', color: 'text-pink-600',   bg: 'bg-pink-500/10'   },
};

// ── Web ad overlay (AdSense + countdown) ─────────────────────────────────────
function showWebRewardedAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.97);z-index:99999;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:system-ui,sans-serif;color:white;`;

    let timeLeft = 6;
    overlay.innerHTML = `
      <div style="max-width:380px;width:92%;text-align:center;">
        <div style="background:#0f0f1a;border-radius:20px;padding:24px;border:1px solid #2a2a3e;box-shadow:0 0 60px rgba(99,102,241,0.2);">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:14px;padding:16px;margin-bottom:16px;">
            <div style="font-size:42px;margin-bottom:6px;">🎁</div>
            <div style="font-size:17px;font-weight:800;letter-spacing:-0.3px;">Sponsored Content</div>
            <div style="font-size:12px;opacity:0.75;margin-top:3px;">Watch to unlock your reward</div>
          </div>
          <!-- AdSense slot -->
          <div style="min-height:90px;margin-bottom:12px;border-radius:10px;overflow:hidden;background:#1a1a2e;">
            <ins class="adsbygoogle"
              style="display:block;"
              data-ad-client="ca-pub-2458567543017441"
              data-ad-slot="2031881558"
              data-ad-format="auto"
              data-full-width-responsive="true">
            </ins>
          </div>
          <!-- Reward badges -->
          <div style="display:flex;gap:8px;justify-content:center;margin-bottom:14px;">
            <div style="flex:1;background:#1e1b4b;border:1px solid #4338ca;border-radius:10px;padding:10px 6px;">
              <div style="font-size:18px;margin-bottom:3px;">🪙</div>
              <div style="font-size:14px;font-weight:800;color:#a5b4fc;">+${CREDITS_PER_AD}</div>
              <div style="font-size:10px;color:#818cf8;">Credits</div>
            </div>
            <div style="flex:1;background:#1c1917;border:1px solid #a16207;border-radius:10px;padding:10px 6px;">
              <div style="font-size:18px;margin-bottom:3px;">🚀</div>
              <div style="font-size:14px;font-weight:800;color:#fcd34d;">2×</div>
              <div style="font-size:10px;color:#fbbf24;">Reach Boost</div>
            </div>
            <div style="flex:1;background:#042f2e;border:1px solid #065f46;border-radius:10px;padding:10px 6px;">
              <div style="font-size:18px;margin-bottom:3px;">💰</div>
              <div style="font-size:14px;font-weight:800;color:#6ee7b7;">Revenue</div>
              <div style="font-size:10px;color:#34d399;">Share</div>
            </div>
          </div>
          <!-- Countdown -->
          <div id="ad-countdown" style="font-size:13px;color:#f59e0b;margin-bottom:12px;font-weight:600;">
            ⏱ Completing in <strong id="timer-count">${timeLeft}s</strong>…
          </div>
          <!-- CTA button -->
          <button id="claim-btn" style="
            width:100%;padding:15px 32px;border-radius:14px;border:none;cursor:pointer;
            background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;
            font-size:15px;font-weight:800;opacity:0.45;transition:all 0.3s;
            box-shadow:0 4px 20px rgba(99,102,241,0.3);letter-spacing:-0.3px;
          " disabled>🎁 Claim Reward</button>
          <p style="font-size:10px;color:#4b5563;margin-top:10px;">Max ${MAX_ADS_PER_DAY} rewards per day · Revenue shared with you</p>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Push AdSense ad
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (_) {}

    const timerEl = overlay.querySelector('#timer-count') as HTMLElement;
    const countdownEl = overlay.querySelector('#ad-countdown') as HTMLElement;
    const claimBtn = overlay.querySelector('#claim-btn') as HTMLButtonElement;

    const countdown = setInterval(() => {
      timeLeft--;
      if (timerEl) timerEl.textContent = `${timeLeft}s`;
      if (timeLeft <= 0) {
        clearInterval(countdown);
        if (countdownEl) countdownEl.innerHTML = '✅ Ad completed — collect your reward!';
        if (claimBtn) { claimBtn.disabled = false; claimBtn.style.opacity = '1'; }
      }
    }, 1000);

    claimBtn.addEventListener('click', () => {
      clearInterval(countdown);
      document.body.removeChild(overlay);
      resolve(true);
    });
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
interface RewardUnlock {
  id: string;
  reward_type: string;
  reward_amount: number;
  ad_unit: string;
  used: boolean;
  expires_at: string | null;
  created_at: string;
}

export default function RewardedAdHistory() {
  useSEO({ noindex: true, title: 'Rewards & Ad Earnings', url: '/rewards' });
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rewards, setRewards] = useState<RewardUnlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [watching, setWatching] = useState(false);
  const [credits, setCredits] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lifetimeCredits, setLifetimeCredits] = useState(0);

  // ── Data loading ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user) return;

    const [rewardsRes, walletRes, earningsRes] = await Promise.all([
      supabase
        .from('rewarded_ad_unlocks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('user_wallets')
        .select('credits')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('creator_ad_revenue')
        .select('creator_share')
        .eq('creator_user_id', user.id)
        .eq('ad_type', 'rewarded'),
    ]);

    const allRewards: RewardUnlock[] = rewardsRes.data || [];
    setRewards(allRewards);
    setCredits(walletRes.data?.credits || 0);

    // Today's ad count
    const todayRewards = allRewards.filter(r => isToday(new Date(r.created_at)));
    setTodayCount(todayRewards.length);

    // Total revenue earned (creator share)
    const total = (earningsRes.data || []).reduce((s, r) => s + Number(r.creator_share), 0);
    setTotalEarned(total);

    // Streak: consecutive rewards (check last 3)
    const recent3 = allRewards.slice(0, 3);
    setStreak(recent3.length);

    // Lifetime credits from rewarded ads
    setLifetimeCredits(allRewards.length * CREDITS_PER_AD);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    fetchData();
  }, [user, fetchData]);

  // ── Watch ad handler ────────────────────────────────────────────────────────
  const handleWatchAd = async () => {
    if (!user) { navigate('/auth'); return; }

    if (todayCount >= MAX_ADS_PER_DAY) {
      toast.error(`Daily limit reached (${MAX_ADS_PER_DAY} ads/day)`, {
        description: 'Come back tomorrow for more rewards!',
      });
      return;
    }

    setWatching(true);
    try {
      // Native: use AdMob rewarded video. Web: overlay with AdSense
      let completed = false;
      if (isAdMobSupported()) {
        const reward = await showRewarded(ADMOB_CONFIG.REWARDED);
        completed = reward !== null;
      } else {
        completed = await showWebRewardedAd();
      }

      if (!completed) {
        toast.error('Ad skipped — no reward granted');
        return;
      }

      // ── Calculate bonus credits (streak) ────────────────────────────────
      const bonusCredits = streak >= 2 ? STREAK_BONUS_CREDITS : 0;
      const totalCredits = CREDITS_PER_DAY_REWARD + bonusCredits;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // ── Revenue accounting ────────────────────────────────────────────────
      const grossRevenue = AD_REVENUE_SPLIT.ESTIMATED_CPM.rewarded / 1000; // per impression (USD)
      const creatorShare = grossRevenue * AD_REVENUE_SPLIT.CREATOR_SHARE;
      const platformShare = grossRevenue * AD_REVENUE_SPLIT.PLATFORM_SHARE;

      // Run all DB writes in parallel
      const [walletRes] = await Promise.all([
        supabase.from('user_wallets').select('credits').eq('user_id', user.id).single(),
      ]);
      const currentCredits = walletRes.data?.credits || 0;

      await Promise.all([
        // 1. Record reward unlock
        supabase.from('rewarded_ad_unlocks').insert({
          user_id: user.id,
          reward_type: 'reach_boost',
          reward_amount: 2,
          ad_unit: ADMOB_CONFIG.REWARDED,
          used: false,
          expires_at: expiresAt,
        }),
        // 2. Add credits to wallet
        supabase.from('user_wallets').upsert(
          { user_id: user.id, credits: currentCredits + totalCredits },
          { onConflict: 'user_id' }
        ),
        // 3. Record credit transaction
        supabase.from('credit_transactions').insert({
          user_id: user.id,
          amount: totalCredits,
          reason: 'rewarded_ad',
          metadata: {
            ad_type: 'rewarded',
            bonus: bonusCredits,
            streak: streak + 1,
            ad_unit: ADMOB_CONFIG.REWARDED,
          },
        }),
        // 4. Creator earnings (30% of gross)
        supabase.from('creator_earnings').insert({
          user_id: user.id,
          source: 'rewarded_ads',
          amount: creatorShare,
          status: 'pending',
        }),
        // 5. Platform revenue log
        supabase.from('creator_ad_revenue').insert({
          creator_user_id: user.id,
          ad_type: 'rewarded',
          gross_revenue: grossRevenue,
          creator_share: creatorShare,
          platform_share: platformShare,
        }),
      ]);

      // Optimistic UI update
      setCredits(currentCredits + totalCredits);
      setTodayCount(prev => prev + 1);
      setStreak(prev => prev + 1);
      setTotalEarned(prev => prev + creatorShare);

      if (bonusCredits > 0) {
        toast.success(`🔥 Streak bonus! +${totalCredits} credits (${CREDITS_PER_AD} + ${bonusCredits} bonus)`, {
          description: `2× Reach Boost unlocked for 24h. Revenue: $${creatorShare.toFixed(5)} added to earnings.`,
        });
      } else {
        toast.success(`🎉 +${CREDITS_PER_AD} credits earned!`, {
          description: '2× Reach Boost unlocked for 24h · 3 in a row for streak bonus!',
        });
      }

      await fetchData();
    } catch (err: any) {
      console.error('[RewardedAdHistory] Watch ad error:', err);
      toast.error('Could not process reward. Try again.');
    } finally {
      setWatching(false);
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────────
  const activeRewards = rewards.filter(
    r => !r.used && (!r.expires_at || new Date(r.expires_at) > new Date())
  );
  // expired/used rewards shown inline in the full rewards list below
  const adsRemaining = MAX_ADS_PER_DAY - todayCount;
  const progressPct = Math.round((todayCount / MAX_ADS_PER_DAY) * 100);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopBar title="Rewards & Earnings" showBack />

      <div className="max-w-2xl mx-auto p-4 space-y-5">

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: 'Credits',
              value: credits.toLocaleString(),
              icon: <Coins className="w-5 h-5 text-amber-500" />,
              bg: 'from-amber-500/10 to-yellow-500/5 border-amber-500/20',
            },
            {
              label: 'Revenue Earned',
              value: `$${totalEarned.toFixed(4)}`,
              icon: <TrendingUp className="w-5 h-5 text-green-500" />,
              bg: 'from-green-500/10 to-emerald-500/5 border-green-500/20',
            },
            {
              label: 'Streak',
              value: `${streak}🔥`,
              icon: <Flame className="w-5 h-5 text-orange-500" />,
              bg: 'from-orange-500/10 to-red-500/5 border-orange-500/20',
            },
          ].map(({ label, value, icon, bg }) => (
            <div key={label} className={`bg-gradient-to-br ${bg} border rounded-2xl p-3 text-center`}>
              <div className="flex justify-center mb-1">{icon}</div>
              <p className="text-lg font-black leading-tight">{value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Daily progress ── */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm">Today's Progress</span>
            </div>
            <span className="text-xs text-muted-foreground font-medium">
              {todayCount}/{MAX_ADS_PER_DAY} ads · {adsRemaining} left
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-primary via-purple-500 to-pink-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0 ads</span>
            <span className="text-amber-500 font-bold">🔥 3-ad streak bonus: +{STREAK_BONUS_CREDITS} credits</span>
            <span>{MAX_ADS_PER_DAY} ads</span>
          </div>
        </div>

        {/* ── Main Watch CTA ── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600/15 via-purple-600/10 to-pink-500/10 border-2 border-indigo-500/30 rounded-2xl p-6">
          {/* Background decoration */}
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-purple-500/10 blur-xl pointer-events-none" />

          <div className="relative">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
                <Gift className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black leading-tight">Watch Ad → Earn Rewards</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Each ad = credits + 2× reach boost + revenue share
                </p>
              </div>
            </div>

            {/* Reward breakdown */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { icon: '🪙', label: `+${CREDITS_PER_DAY_REWARD} Credits`, sub: '+15 streak bonus' },
                { icon: '🚀', label: '2× Reach Boost', sub: 'Valid 24 hours' },
                { icon: '💰', label: 'Revenue Share', sub: `~$${(AD_REVENUE_SPLIT.ESTIMATED_CPM.rewarded / 1000 * AD_REVENUE_SPLIT.CREATOR_SHARE).toFixed(4)}/ad` },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="bg-background/60 rounded-xl p-3 text-center border border-border">
                  <div className="text-xl mb-1">{icon}</div>
                  <p className="text-xs font-bold leading-tight">{label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            <Button
              onClick={handleWatchAd}
              disabled={watching || adsRemaining <= 0}
              className="w-full h-13 text-base font-black bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-90 text-white shadow-lg shadow-purple-500/25 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {watching ? (
                <><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading Ad…</>
              ) : adsRemaining <= 0 ? (
                <><Shield className="w-5 h-5 mr-2" />Daily Limit Reached</>
              ) : (
                <><Play className="w-5 h-5 mr-2" />Watch Ad &amp; Earn</>
              )}
            </Button>

            {adsRemaining <= 0 && (
              <p className="text-center text-xs text-muted-foreground mt-2">
                Resets at midnight · Come back tomorrow!
              </p>
            )}
            {adsRemaining > 0 && streak >= 2 && (
              <p className="text-center text-xs text-amber-500 font-bold mt-2">
                🔥 {3 - streak} more ad{3 - streak !== 1 ? 's' : ''} to unlock streak bonus!
              </p>
            )}
          </div>
        </div>

        {/* ── AdSense banner slot (web) ── */}
        <div className="rounded-xl overflow-hidden border border-border bg-muted/20">
          <p className="text-[10px] text-muted-foreground px-3 pt-2 uppercase tracking-wider font-medium">Sponsored</p>
          <ins
            className="adsbygoogle"
            style={{ display: 'block', minHeight: 80 }}
            data-ad-client="ca-pub-2458567543017441"
            data-ad-slot="2031881558"
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>

        {/* ── Active rewards ── */}
        {activeRewards.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold">Active Rewards ({activeRewards.length})</h3>
            </div>
            <div className="space-y-2.5">
              {activeRewards.map(reward => {
                const meta = REWARD_META[reward.reward_type] || { label: reward.reward_type, icon: '🎁', color: 'text-primary', bg: 'bg-primary/10' };
                const expiresIn = reward.expires_at
                  ? formatDistanceToNow(new Date(reward.expires_at), { addSuffix: true })
                  : 'No expiry';
                return (
                  <div key={reward.id} className={`flex items-center gap-3 p-4 rounded-xl border-2 border-amber-400/30 ${meta.bg}`}>
                    <div className="text-2xl shrink-0">{meta.icon}</div>
                    <div className="flex-1">
                      <p className={`font-bold ${meta.color}`}>{meta.label}</p>
                      <p className="text-xs text-muted-foreground">Expires {expiresIn}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xs font-bold text-green-600">Active</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Lifetime stats ── */}
        <div className="bg-gradient-to-br from-muted/50 to-background border border-border rounded-2xl p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />Lifetime Stats
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Total Ads Watched', value: rewards.length },
              { label: 'Credits from Ads', value: lifetimeCredits.toLocaleString() },
              { label: 'Revenue Generated', value: `$${totalEarned.toFixed(4)}` },
              { label: 'Active Boosts', value: activeRewards.length },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between border-b border-border pb-2 last:border-0">
                <span className="text-muted-foreground text-xs">{label}</span>
                <span className="font-bold text-xs">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Boost CTA ── */}
        <button
          onClick={() => navigate('/')}
          className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20 rounded-2xl hover:border-primary/40 transition-colors group"
        >
          <div className="text-left">
            <p className="font-bold text-sm">Use Your Reach Boost</p>
            <p className="text-xs text-muted-foreground mt-0.5">Post now to get 2× visibility while your boost is active</p>
          </div>
          <ArrowUpRight className="w-5 h-5 text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </button>

        {/* ── History ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-bold">History ({rewards.length})</h3>
            <button onClick={fetchData} className="ml-auto p-1.5 rounded-full hover:bg-muted transition-colors">
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          {rewards.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground border border-dashed border-border rounded-2xl">
              <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold">No rewards yet</p>
              <p className="text-sm mt-1">Watch your first ad above to get started!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rewards.map(reward => {
                const meta = REWARD_META[reward.reward_type] || { label: reward.reward_type, icon: '🎁', color: 'text-primary', bg: 'bg-primary/10' };
                const expired = reward.expires_at && new Date(reward.expires_at) <= new Date();
                return (
                  <div key={reward.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border/50">
                    <div className="text-xl shrink-0">{meta.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{meta.label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(reward.created_at), 'MMM d, h:mm a')}
                        </p>
                        <span className="text-[10px] text-green-600 font-bold">+{CREDITS_PER_AD} credits</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {reward.used ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-100 dark:bg-green-900/20 px-2 py-0.5 rounded-full font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Used
                        </span>
                      ) : expired ? (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Expired</span>
                      ) : (
                        <span className="text-xs text-amber-700 bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">Active</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


