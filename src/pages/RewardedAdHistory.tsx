import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/layout/TopBar';
import { Gift, Zap, CheckCircle2, Clock, Loader2, Star, Coins } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { AD_REVENUE_SPLIT, ADMOB_CONFIG } from '@/lib/admob';

interface RewardUnlock {
  id: string;
  reward_type: string;
  reward_amount: number;
  ad_unit: string;
  used: boolean;
  expires_at: string | null;
  created_at: string;
}

const REWARD_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  reach_boost: { label: '2× Reach Boost', icon: '🚀', color: 'text-purple-600' },
  extra_impressions: { label: 'Extra Impressions', icon: '👁️', color: 'text-blue-600' },
  analytics_unlock: { label: 'Analytics Unlock', icon: '📊', color: 'text-green-600' },
  featured_boost: { label: 'Featured Spot', icon: '⭐', color: 'text-amber-600' },
  viral_boost: { label: 'Viral Push', icon: '⚡', color: 'text-pink-600' },
};

// Web rewarded ad overlay — always completes successfully
function showWebRewardedAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.95); z-index: 99999;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: system-ui, sans-serif; color: white;
    `;

    let timeLeft = 5;
    overlay.innerHTML = `
      <div style="max-width:360px; width:90%; text-align:center;">
        <div style="background:#1a1a2e; border-radius:16px; padding:24px; border:1px solid #333;">
          <div style="background:linear-gradient(135deg,#f59e0b,#ef4444); border-radius:12px; padding:16px; margin-bottom:16px;">
            <div style="font-size:40px; margin-bottom:8px;">🎁</div>
            <div style="font-size:18px; font-weight:bold;">Advertisement</div>
            <div style="font-size:13px; opacity:0.8; margin-top:4px;">Watch to earn your free reward + 25 credits</div>
          </div>
          <ins class="adsbygoogle"
            style="display:block;min-height:80px;"
            data-ad-client="ca-pub-7234579833875016"
            data-ad-slot="2031881558"
            data-ad-format="auto"
            data-full-width-responsive="true">
          </ins>
          <div style="font-size:13px; color:#22c55e; margin:12px 0; font-weight:600;">+25 credits rewarded</div>
          <div id="ad-countdown" style="font-size:13px; color:#f59e0b; margin-bottom:12px;">
            Please wait <strong id="timer-count">${timeLeft}s</strong>…
          </div>
          <button id="claim-btn" style="
            padding:14px 32px; border-radius:32px; width:100%;
            background:linear-gradient(135deg,#f59e0b,#ef4444); color:white; border:none; cursor:pointer;
            font-size:15px; font-weight:bold; opacity:0.4; transition:opacity 0.3s;
          " disabled>Claim My Reward 🎁</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    try {
      if ((window as any).adsbygoogle) {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      }
    } catch (_) {}

    const timerEl = overlay.querySelector('#timer-count') as HTMLElement;
    const countdownEl = overlay.querySelector('#ad-countdown') as HTMLElement;
    const claimBtn = overlay.querySelector('#claim-btn') as HTMLButtonElement;

    const countdown = setInterval(() => {
      timeLeft--;
      if (timerEl) timerEl.textContent = `${timeLeft}s`;
      if (timeLeft <= 0) {
        clearInterval(countdown);
        if (countdownEl) countdownEl.style.display = 'none';
        if (claimBtn) {
          claimBtn.disabled = false;
          claimBtn.style.opacity = '1';
        }
      }
    }, 1000);

    claimBtn.addEventListener('click', () => {
      clearInterval(countdown);
      document.body.removeChild(overlay);
      resolve(true);
    });
  });
}

export default function RewardedAdHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rewards, setRewards] = useState<RewardUnlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [watching, setWatching] = useState(false);
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    const [rewardsRes, walletRes] = await Promise.all([
      supabase.from('rewarded_ad_unlocks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('user_wallets').select('credits').eq('user_id', user.id).single(),
    ]);
    setRewards(rewardsRes.data || []);
    setCredits(walletRes.data?.credits || 0);
    setLoading(false);
  };

  const handleWatchAd = async () => {
    if (!user) { navigate('/auth'); return; }
    setWatching(true);
    try {
      // Always use web overlay — works on both web and native (native would use AdMob separately)
      const completed = await showWebRewardedAd();

      if (!completed) {
        toast.error('Ad not completed — reward not granted');
        setWatching(false);
        return;
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const CREDITS_PER_AD = 25;

      // Insert reward unlock
      await supabase.from('rewarded_ad_unlocks').insert({
        user_id: user.id,
        reward_type: 'reach_boost',
        reward_amount: 2,
        ad_unit: ADMOB_CONFIG.REWARDED,
        used: false,
        expires_at: expiresAt,
      });

      // Award 25 credits
      const { data: wallet } = await supabase.from('user_wallets').select('credits').eq('user_id', user.id).single();
      const currentCredits = wallet?.credits || 0;

      await supabase.from('user_wallets')
        .upsert({ user_id: user.id, credits: currentCredits + CREDITS_PER_AD }, { onConflict: 'user_id' });

      await supabase.from('credit_transactions').insert({
        user_id: user.id,
        amount: CREDITS_PER_AD,
        reason: 'rewarded_ad_history',
        metadata: { ad_type: 'rewarded' },
      });

      // Track creator ad revenue — 30% to creator
      const estimatedRevenue = AD_REVENUE_SPLIT.ESTIMATED_CPM.rewarded / 1000;
      const creatorShare = estimatedRevenue * AD_REVENUE_SPLIT.CREATOR_SHARE;
      const platformShare = estimatedRevenue * AD_REVENUE_SPLIT.PLATFORM_SHARE;

      await supabase.from('creator_earnings').insert({
        user_id: user.id,
        source: 'rewarded_ads',
        amount: creatorShare,
        status: 'pending',
      });

      // Log platform revenue
      await supabase.from('creator_ad_revenue').insert({
        creator_user_id: user.id,
        ad_type: 'rewarded',
        gross_revenue: estimatedRevenue,
        creator_share: creatorShare,
        platform_share: platformShare,
      });

      setCredits(currentCredits + CREDITS_PER_AD);
      toast.success(`🎉 2× Reach Boost unlocked! +${CREDITS_PER_AD} credits earned!`);
      fetchData();
    } catch (err: any) {
      console.error('[RewardedAdHistory] Error:', err);
      toast.error('Could not process reward. Try again.');
    } finally {
      setWatching(false);
    }
  };

  const activeRewards = rewards.filter(r => !r.used && (!r.expires_at || new Date(r.expires_at) > new Date()));
  const usedOrExpired = rewards.filter(r => r.used || (r.expires_at && new Date(r.expires_at) <= new Date()));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Rewards" showBack />

      <div className="max-w-2xl mx-auto p-4 space-y-6">

        {/* Credits balance */}
        <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
            <Coins className="w-6 h-6 text-yellow-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Your Credits</p>
            <p className="text-2xl font-bold text-yellow-500">{credits.toLocaleString()}</p>
          </div>
        </div>

        {/* Watch Ad CTA */}
        <div className="bg-gradient-to-br from-amber-400/10 via-orange-400/10 to-pink-500/10 border-2 border-amber-400/30 rounded-2xl p-6 text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <Gift className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Watch Ad, Earn Rewards</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Watch a short ad to unlock a free post boost + earn 25 credits
            </p>
          </div>
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-green-600 font-semibold">
              <Coins className="w-4 h-4" />
              <span>+25 credits</span>
            </div>
            <div className="flex items-center gap-1.5 text-purple-600 font-semibold">
              <Zap className="w-4 h-4" />
              <span>2× reach boost</span>
            </div>
          </div>
          <Button
            onClick={handleWatchAd}
            disabled={watching}
            className="bg-gradient-to-r from-amber-400 to-orange-500 text-black font-bold h-12 px-8 hover:opacity-90 w-full"
          >
            {watching ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading Ad…</>
            ) : (
              <><Zap className="w-4 h-4 mr-2" />Watch Ad &amp; Earn</>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">Rewards expire after 24 hours • Max 10 ads/day • 30% of ad revenue goes to you</p>
        </div>

        {/* Active Rewards */}
        {activeRewards.length > 0 && (
          <div>
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Active Rewards ({activeRewards.length})
            </h3>
            <div className="space-y-3">
              {activeRewards.map(reward => {
                const meta = REWARD_LABELS[reward.reward_type] || { label: reward.reward_type, icon: '🎁', color: 'text-primary' };
                const expiresIn = reward.expires_at ? formatDistanceToNow(new Date(reward.expires_at), { addSuffix: true }) : 'No expiry';
                return (
                  <div key={reward.id} className="bg-card border-2 border-amber-400/30 rounded-xl p-4 flex items-center gap-4">
                    <div className="text-2xl shrink-0">{meta.icon}</div>
                    <div className="flex-1">
                      <p className={`font-bold ${meta.color}`}>{meta.label}</p>
                      <p className="text-xs text-muted-foreground">Expires {expiresIn}</p>
                    </div>
                    <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 px-2 py-0.5 rounded-full font-semibold">
                      Active
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* History */}
        <div>
          <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            History ({rewards.length})
          </h3>
          {rewards.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Gift className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No rewards yet</p>
              <p className="text-sm">Watch an ad above to earn your first reward</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rewards.map(reward => {
                const meta = REWARD_LABELS[reward.reward_type] || { label: reward.reward_type, icon: '🎁', color: 'text-primary' };
                const expired = reward.expires_at && new Date(reward.expires_at) <= new Date();
                return (
                  <div key={reward.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                    <div className="text-xl shrink-0">{meta.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{meta.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(reward.created_at), { addSuffix: true })}
                      </p>
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
