import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  DollarSign, Users, TrendingUp, Star, Lock, Zap, Play, Heart,
  Plus, X, CheckCircle2, Loader2, BarChart3, Gift, Edit3,
  CreditCard, Bell, ArrowUpRight, Coins,
} from 'lucide-react';

// ── esbuild-safe module-level constants ─────────────────────────────────────
const HUB_PIE_COLORS   = ['#f59e0b', '#6366f1', '#22c55e', '#ec4899', '#94a3b8'] as const;
const HUB_TIER_PRESETS = ['Basic', 'Pro', 'Premium'] as const;
const HUB_PERK_PRESETS = [
  'Exclusive posts',
  'Behind-the-scenes content',
  'Early access to videos',
  'Direct message access',
  'Monthly shoutout',
  'Member badge',
  'Discord access',
  'Priority replies',
] as const;
const HUB_TABS = ['overview', 'tiers', 'content', 'tips', 'analytics'] as const;
const HUB_TIP_AMOUNTS  = [1, 2, 5, 10, 25, 50] as const;
const HUB_FUND_CPM     = 0.0015; // $0.0015 per view ≈ $1.50 CPM creator share

type HubTab = typeof HUB_TABS[number];

// ── Currency helper (local copy to avoid cross-file collision) ───────────
const HUB_SYMBOLS: Record<string, string> = { USD: '$', KES: 'KES ', EUR: '€' };
function hfmt(usd: number): string { return `$${usd.toFixed(2)}`; }

// ── Tip Button (exported for PostCard) ───────────────────────────────────
export function TipButton({ postId, creatorId, creatorUsername, senderId, senderUsername, disabled }: {
  postId: string; creatorId: string; creatorUsername: string;
  senderId: string; senderUsername: string; disabled?: boolean;
}) {
  const [open,    setOpen]    = useState(false);
  const [amount,  setAmount]  = useState<number>(1);
  const [custom,  setCustom]  = useState('');
  const [note,    setNote]    = useState('');
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);

  const finalAmt = useMemo(() => {
    if (custom && parseFloat(custom) > 0) return parseFloat(custom);
    return amount;
  }, [custom, amount]);

  const send = async () => {
    if (creatorId === senderId) { toast.error("You can't tip yourself"); return; }
    if (finalAmt <= 0) { toast.error('Enter a valid amount'); return; }
    setSending(true);
    const { error: walletErr } = await supabase.rpc('p2p_wallet_transfer', {
      p_from_user_id: senderId,
      p_to_user_id:   creatorId,
      p_amount:       finalAmt,
      p_note:         note.trim() || `Tip on post`,
    });
    if (walletErr) { setSending(false); toast.error(walletErr.message || 'Transfer failed'); return; }
    await Promise.allSettled([
      supabase.from('tips').insert({
        from_user_id: senderId, to_user_id: creatorId,
        amount: finalAmt, message: note.trim() || null, post_id: postId,
      }),
      supabase.from('creator_earnings').insert({
        user_id: creatorId, source: 'tips', amount: finalAmt, post_id: postId, status: 'completed',
      }),
      supabase.rpc('increment', { table_name: 'posts', row_id: postId, column_name: 'tips_count', amount: 1 }),
      supabase.from('platform_inbox').insert({
        user_id: creatorId,
        subject: `@${senderUsername} tipped you ${hfmt(finalAmt)}!`,
        body: `You received a ${hfmt(finalAmt)} tip from @${senderUsername}${note.trim() ? ` — "${note.trim()}"` : ''}. Funds have been added to your wallet.`,
        type: 'payment', icon_emoji: '💸',
        cta_label: 'View Wallet', cta_url: '/wallet',
      }),
    ]);
    setSending(false);
    setDone(true);
    toast.success(`${hfmt(finalAmt)} tipped to @${creatorUsername}!`);
    setTimeout(() => { setOpen(false); setDone(false); setNote(''); setCustom(''); setAmount(1); }, 2000);
  };

  return (
    <>
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); if (!disabled) setOpen(true); }}
        disabled={disabled}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-500 transition-colors disabled:opacity-40"
        title="Tip creator"
      >
        <Gift className="w-4 h-4" />
        <span>Tip</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {done ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center">
                  <Heart className="w-8 h-8 text-amber-500 fill-amber-500" />
                </div>
                <p className="font-black text-lg text-amber-600">Tip Sent!</p>
                <p className="text-sm text-muted-foreground">{hfmt(finalAmt)} sent to @{creatorUsername}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="font-bold text-sm">Tip @{creatorUsername}</p>
                    <p className="text-xs text-muted-foreground">Support their work directly</p>
                  </div>
                  <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-muted">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  {HUB_TIP_AMOUNTS.map(a => (
                    <button
                      key={a}
                      onClick={() => { setAmount(a); setCustom(''); }}
                      className={`py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                        amount === a && !custom
                          ? 'border-amber-500 bg-amber-500/10 text-amber-600'
                          : 'border-border hover:border-amber-500/40'
                      }`}
                    >${a}</button>
                  ))}
                </div>

                <input
                  type="number" min="0.01" step="0.01" placeholder="Custom amount (USD)…"
                  value={custom} onChange={e => setCustom(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 mb-3"
                />

                <input
                  type="text" maxLength={80} placeholder="Leave a message (optional)…"
                  value={note} onChange={e => setNote(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 mb-4"
                />

                <button
                  onClick={send}
                  disabled={sending || finalAmt <= 0}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-400 text-white rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gift className="w-5 h-5" />}
                  {sending ? 'Sending…' : `Send ${hfmt(finalAmt)}`}
                </button>
                <p className="text-[10px] text-muted-foreground text-center mt-2">Deducted from your wallet balance instantly</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Paywall Gate (exported for PostCard) ─────────────────────────────────
export function PaywallGate({ post, viewerId, onUnlocked }: {
  post: any; viewerId: string; onUnlocked: () => void;
}) {
  const [purchasing, setPurchasing] = useState(false);
  const [unlocked,   setUnlocked]   = useState(false);

  useEffect(() => {
    if (post.user_id === viewerId) { setUnlocked(true); return; }
    supabase.from('payment_transactions')
      .select('id').eq('user_id', viewerId).eq('type', 'content_purchase')
      .eq('reference_id', post.id).eq('status', 'completed')
      .maybeSingle()
      .then(({ data }) => { if (data) setUnlocked(true); });
  }, [post.id, viewerId]);

  if (unlocked) return null;

  const purchase = async () => {
    const price = Number(post.price ?? 0);
    if (price <= 0) { setUnlocked(true); onUnlocked(); return; }
    setPurchasing(true);
    const { error: deductErr } = await supabase.rpc('deduct_from_wallet', {
      p_user_id: viewerId, p_amount: price,
    });
    if (deductErr) { setPurchasing(false); toast.error(deductErr.message || 'Insufficient balance'); return; }
    await Promise.allSettled([
      supabase.rpc('add_to_wallet', { p_user_id: post.user_id, p_amount: price * 0.8 }),
      supabase.from('payment_transactions').insert({
        user_id: viewerId, type: 'content_purchase', amount: price,
        status: 'completed', reference_id: post.id,
        metadata: { post_id: post.id, creator_id: post.user_id },
      }),
      supabase.from('creator_earnings').insert({
        user_id: post.user_id, source: 'content_sales',
        amount: price * 0.8, post_id: post.id, status: 'completed',
      }),
    ]);
    setPurchasing(false);
    setUnlocked(true);
    onUnlocked();
    toast.success('Content unlocked!');
  };

  return (
    <div className="relative rounded-2xl overflow-hidden border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5">
      <div className="absolute inset-0 backdrop-blur-md" />
      <div className="relative flex flex-col items-center gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
          <Lock className="w-8 h-8 text-amber-500" />
        </div>
        <div>
          <p className="font-black text-lg">Premium Content</p>
          <p className="text-sm text-muted-foreground mt-1">Unlock this post for a one-time payment</p>
        </div>
        <div className="text-3xl font-black text-amber-600">{hfmt(Number(post.price ?? 0))}</div>
        <button
          onClick={purchase}
          disabled={purchasing}
          className="px-8 py-3 bg-amber-500 text-white rounded-full font-bold text-sm hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {purchasing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {purchasing ? 'Processing…' : `Unlock for ${hfmt(Number(post.price ?? 0))}`}
        </button>
        <p className="text-[10px] text-muted-foreground">80% goes to the creator · Secured by Testagram Wallet</p>
      </div>
    </div>
  );
}

// ── Subscription Tier Card (public view) ─────────────────────────────────
export function SubscriptionTiersDisplay({ creatorId, viewerId, creatorUsername }: {
  creatorId: string; viewerId: string; creatorUsername: string;
}) {
  const [tiers,       setTiers]       = useState<any[]>([]);
  const [subscribed,  setSubscribed]  = useState<Set<string>>(new Set());
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('creator_subscription_tiers').select('*')
        .eq('creator_id', creatorId).eq('is_active', true)
        .order('price_usd', { ascending: true }),
      supabase.from('creator_subscriptions').select('tier')
        .eq('creator_id', creatorId).eq('subscriber_id', viewerId).eq('status', 'active'),
    ]).then(([{ data: t }, { data: s }]) => {
      setTiers(t ?? []);
      setSubscribed(new Set((s ?? []).map((x: any) => x.tier)));
      setLoading(false);
    });
  }, [creatorId, viewerId]);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (tiers.length === 0) return null;

  const subscribe = async (tier: any) => {
    if (viewerId === creatorId) { toast.error("You can't subscribe to yourself"); return; }
    setSubscribing(tier.id);
    const { error: deductErr } = await supabase.rpc('deduct_from_wallet', {
      p_user_id: viewerId, p_amount: tier.price_usd,
    });
    if (deductErr) { setSubscribing(null); toast.error(deductErr.message || 'Insufficient balance'); return; }
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    await Promise.allSettled([
      supabase.from('creator_subscriptions').upsert({
        creator_id: creatorId, subscriber_id: viewerId,
        tier: tier.tier_name, price: tier.price_usd, status: 'active',
        started_at: new Date().toISOString(), expires_at: expiresAt.toISOString(),
      }, { onConflict: 'creator_id,subscriber_id' }),
      supabase.rpc('add_to_wallet', { p_user_id: creatorId, p_amount: tier.price_usd * 0.85 }),
      supabase.from('creator_earnings').insert({
        user_id: creatorId, source: 'subscriptions',
        amount: tier.price_usd * 0.85, status: 'completed',
      }),
      supabase.from('platform_inbox').insert({
        user_id: creatorId,
        subject: `New subscriber on ${tier.tier_name} tier!`,
        body: `Someone subscribed to your ${tier.tier_name} plan at ${hfmt(tier.price_usd)}/month. You earned ${hfmt(tier.price_usd * 0.85)}.`,
        type: 'payment', icon_emoji: '🌟',
        cta_label: 'View Earnings', cta_url: '/monetization',
      }),
    ]);
    setSubscribed(prev => new Set([...prev, tier.tier_name]));
    setSubscribing(null);
    toast.success(`Subscribed to @${creatorUsername}'s ${tier.tier_name} tier!`);
  };

  return (
    <div className="space-y-3">
      <p className="font-bold text-sm flex items-center gap-2">
        <Star className="w-4 h-4 text-amber-500" />
        Support @{creatorUsername}
      </p>
      {tiers.map(tier => {
        const isSubscribed = subscribed.has(tier.tier_name);
        const perks = Array.isArray(tier.perks) ? tier.perks : [];
        return (
          <div key={tier.id} className={`border rounded-2xl overflow-hidden ${isSubscribed ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-bold text-sm">{tier.tier_name}</p>
                  {tier.description && <p className="text-xs text-muted-foreground">{tier.description}</p>}
                </div>
                <div className="text-right">
                  <p className="font-black text-lg text-primary">{hfmt(tier.price_usd)}</p>
                  <p className="text-[10px] text-muted-foreground">per month</p>
                </div>
              </div>
              {perks.length > 0 && (
                <ul className="space-y-1 mb-3">
                  {perks.map((perk: string, i: number) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                      {perk}
                    </li>
                  ))}
                </ul>
              )}
              {isSubscribed ? (
                <div className="flex items-center gap-2 py-2 text-sm text-primary font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Subscribed
                </div>
              ) : (
                <button
                  onClick={() => subscribe(tier)}
                  disabled={subscribing === tier.id}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  {subscribing === tier.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                  {subscribing === tier.id ? 'Processing…' : `Subscribe · ${hfmt(tier.price_usd)}/mo`}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Creator Monetization Hub (full management dashboard) ─────────────────
export default function CreatorMonetizationHub({ userId }: { userId: string }) {
  const [activeTab, setActiveTab] = useState<HubTab>('overview');
  const [monetization, setMonetization] = useState<any>(null);
  const [tiers,    setTiers]    = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [tips,     setTips]     = useState<any[]>([]);
  const [subs,     setSubs]     = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Tier editor state
  const [editingTier, setEditingTier]   = useState<any | null>(null);
  const [tierName,    setTierName]      = useState('');
  const [tierPrice,   setTierPrice]     = useState('');
  const [tierDesc,    setTierDesc]      = useState('');
  const [tierPerks,   setTierPerks]     = useState<string[]>([]);
  const [savingTier,  setSavingTier]    = useState(false);
  const [newPerk,     setNewPerk]       = useState('');

  // Content pricing state
  const [pricedPosts, setPricedPosts]   = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  useEffect(() => { loadAll(); }, [userId]);

  const loadAll = async () => {
    setLoading(true);
    const [monRes, tiersRes, earningsRes, tipsRes, subsRes] = await Promise.all([
      supabase.from('user_monetization').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('creator_subscription_tiers').select('*').eq('creator_id', userId).order('price_usd'),
      supabase.from('creator_earnings').select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('tips').select('*, from_user:user_profiles!tips_from_user_id_fkey(username,avatar_url)')
        .eq('to_user_id', userId).order('created_at', { ascending: false }).limit(20),
      supabase.from('creator_subscriptions').select('*, subscriber:user_profiles!creator_subscriptions_subscriber_id_fkey(username,avatar_url)')
        .eq('creator_id', userId).eq('status', 'active').limit(50),
    ]);
    setMonetization(monRes.data);
    setTiers(tiersRes.data ?? []);
    setEarnings(earningsRes.data ?? []);
    setTips(tipsRes.data ?? []);
    setSubs(subsRes.data ?? []);
    setLoading(false);
  };

  const loadPricedPosts = async () => {
    setLoadingPosts(true);
    const { data } = await supabase.from('posts')
      .select('id,content,is_monetized,price,views_count,likes_count,is_video,created_at')
      .eq('user_id', userId).eq('is_monetized', true)
      .order('created_at', { ascending: false }).limit(30);
    setPricedPosts(data ?? []);
    setLoadingPosts(false);
  };

  useEffect(() => {
    if (activeTab === 'content') loadPricedPosts();
  }, [activeTab]);

  const { totalEarnings, totalTips, totalSubs, monthlyData } = useMemo(() => {
    const totalEarnings = earnings.reduce((s, e) => s + Number(e.amount), 0);
    const totalTips     = tips.reduce((s, t) => s + Number(t.amount), 0);
    const totalSubs     = subs.reduce((s, sub) => s + Number(sub.price ?? 0), 0);
    const bySource: Record<string, number> = {};
    earnings.forEach(e => { bySource[e.source] = (bySource[e.source] ?? 0) + Number(e.amount); });
    const monthlyData = Object.entries(bySource).map(([name, value], i) => ({
      name: name.replace(/_/g, ' '),
      value: parseFloat(value.toFixed(4)),
      fill: HUB_PIE_COLORS[i % HUB_PIE_COLORS.length],
    }));
    return { totalEarnings, totalTips, totalSubs, monthlyData };
  }, [earnings, tips, subs]);

  const openNewTier = () => {
    setEditingTier(null);
    setTierName(''); setTierPrice(''); setTierDesc(''); setTierPerks([]);
  };

  const openEditTier = (tier: any) => {
    setEditingTier(tier);
    setTierName(tier.tier_name); setTierPrice(String(tier.price_usd));
    setTierDesc(tier.description ?? ''); setTierPerks(Array.isArray(tier.perks) ? tier.perks : []);
  };

  const saveTier = async () => {
    if (!tierName.trim() || !tierPrice || parseFloat(tierPrice) < 0) {
      toast.error('Name and valid price required'); return;
    }
    setSavingTier(true);
    const payload = {
      creator_id: userId, tier_name: tierName.trim(),
      price_usd: parseFloat(tierPrice), description: tierDesc.trim() || null,
      perks: tierPerks, is_active: true,
    };
    let err;
    if (editingTier) {
      const { error } = await supabase.from('creator_subscription_tiers').update(payload).eq('id', editingTier.id);
      err = error;
    } else {
      const { error } = await supabase.from('creator_subscription_tiers').insert(payload);
      err = error;
    }
    setSavingTier(false);
    if (err) { toast.error(err.message); return; }
    toast.success(editingTier ? 'Tier updated!' : 'Tier created!');
    setEditingTier(undefined);
    setTierName(''); setTierPrice(''); setTierDesc(''); setTierPerks([]);
    loadAll();
  };

  const deleteTier = async (id: string) => {
    await supabase.from('creator_subscription_tiers').update({ is_active: false }).eq('id', id);
    toast.success('Tier deactivated');
    loadAll();
  };

  const updatePostPrice = async (postId: string, price: number | null) => {
    await supabase.from('posts').update({
      is_monetized: price !== null && price > 0,
      price: price ?? 0,
    }).eq('id', postId).eq('user_id', userId);
    toast.success(price && price > 0 ? `Post priced at ${hfmt(price)}` : 'Paywall removed');
    loadPricedPosts();
  };

  const claimVideoFundEarnings = async () => {
    const { data: videos } = await supabase.from('posts')
      .select('id,views_count').eq('user_id', userId)
      .eq('is_video', true).eq('fund_earnings_paid', false)
      .gt('views_count', 1000);
    if (!videos || videos.length === 0) { toast.info('No new video fund earnings to claim'); return; }
    let total = 0;
    for (const v of videos) {
      const earned = Math.floor(v.views_count / 1000) * HUB_FUND_CPM * 1000;
      total += earned;
      await supabase.from('creator_earnings').insert({
        user_id: userId, source: 'video_fund', amount: earned,
        post_id: v.id, status: 'completed',
      });
      await supabase.from('posts').update({ fund_earnings_paid: true }).eq('id', v.id);
    }
    await supabase.rpc('add_to_wallet', { p_user_id: userId, p_amount: total });
    toast.success(`Claimed ${hfmt(total)} from Video Creator Fund (${videos.length} videos)`);
    loadAll();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const isMonetized = monetization?.is_monetized;

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 overflow-x-auto">
        {HUB_TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-shrink-0 flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              activeTab === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}>{t}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <>
          {!isMonetized && (
            <div className="p-4 border border-amber-500/30 bg-amber-500/5 rounded-2xl text-center">
              <Lock className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="font-bold text-sm">Monetization not enabled</p>
              <p className="text-xs text-muted-foreground mt-1">Go to Monetization Dashboard to check eligibility</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Earnings',  val: hfmt(totalEarnings), sub: 'all sources', color: 'text-primary',   bg: 'bg-primary/10 border-primary/20'       },
              { label: 'Active Subs',     val: String(subs.length), sub: hfmt(totalSubs) + '/mo', color: 'text-blue-600', bg: 'bg-blue-500/10 border-blue-500/20'   },
              { label: 'Tips Received',   val: hfmt(totalTips),     sub: `from ${tips.length} tips`, color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/20' },
              { label: 'Paid Content',    val: String(pricedPosts.length || '—'), sub: 'monetized posts', color: 'text-green-600', bg: 'bg-green-500/10 border-green-500/20' },
            ].map(s => (
              <div key={s.label} className={`p-4 rounded-2xl border ${s.bg}`}>
                <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Video Creator Fund */}
          <div className="p-4 border border-purple-500/30 bg-purple-500/5 rounded-2xl">
            <div className="flex items-center gap-2 mb-2">
              <Play className="w-4 h-4 text-purple-600" />
              <p className="font-bold text-sm">Video Creator Fund</p>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 font-bold border border-purple-500/20">
                {hfmt(HUB_FUND_CPM * 1000)} per 1k views
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Earn from your video views. We pay creators ${(HUB_FUND_CPM * 1000).toFixed(2)} per 1,000 views.
              Claims are processed for videos with 1,000+ views not yet paid.
            </p>
            <button
              onClick={claimVideoFundEarnings}
              className="w-full py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              <Zap className="w-4 h-4" /> Claim Video Fund Earnings
            </button>
          </div>

          {/* Recent earnings */}
          {earnings.length > 0 && (
            <div className="border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <p className="font-bold text-sm">Recent Earnings</p>
              </div>
              <div className="divide-y divide-border">
                {earnings.slice(0, 8).map(e => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="font-semibold text-xs capitalize">{e.source.replace(/_/g, ' ')}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-sm text-green-600">+{hfmt(Number(e.amount))}</p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        e.status === 'completed' ? 'bg-green-500/10 text-green-600' : 'bg-orange-500/10 text-orange-600'
                      }`}>{e.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TIERS ── */}
      {activeTab === 'tiers' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-sm">Subscription Tiers</p>
              <p className="text-xs text-muted-foreground">Earn recurring monthly income from fans</p>
            </div>
            <button
              onClick={openNewTier}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-xs hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" /> New Tier
            </button>
          </div>

          {/* Tier editor */}
          {(editingTier !== undefined) && (
            <div className="p-4 border border-primary/30 bg-primary/5 rounded-2xl space-y-3">
              <p className="font-bold text-sm">{editingTier ? 'Edit Tier' : 'Create Tier'}</p>
              <div className="grid grid-cols-2 gap-2">
                {HUB_TIER_PRESETS.map(p => (
                  <button key={p} onClick={() => setTierName(p)}
                    className={`py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                      tierName === p ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'
                    }`}>{p}</button>
                ))}
                <input
                  type="text" placeholder="Custom name…" value={tierName}
                  onChange={e => setTierName(e.target.value)}
                  className="col-span-2 h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Price (USD/mo)</label>
                  <input type="number" min="0.99" step="0.01" placeholder="e.g. 4.99" value={tierPrice}
                    onChange={e => setTierPrice(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Short description</label>
                  <input type="text" maxLength={60} placeholder="e.g. Supporter access" value={tierDesc}
                    onChange={e => setTierDesc(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-2">Perks</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {HUB_PERK_PRESETS.map(p => (
                    <button key={p} onClick={() => {
                      setTierPerks(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
                    }}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                        tierPerks.includes(p)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/30 text-muted-foreground'
                      }`}>{p}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" placeholder="Custom perk…" value={newPerk}
                    onChange={e => setNewPerk(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newPerk.trim()) {
                        setTierPerks(prev => [...prev, newPerk.trim()]); setNewPerk('');
                      }
                    }}
                    className="flex-1 h-9 px-2.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
                  <button onClick={() => { if (newPerk.trim()) { setTierPerks(prev => [...prev, newPerk.trim()]); setNewPerk(''); } }}
                    className="px-3 h-9 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90">Add</button>
                </div>
                {tierPerks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tierPerks.map((p, i) => (
                      <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold">
                        {p}
                        <button onClick={() => setTierPerks(prev => prev.filter((_, j) => j !== i))}
                          className="ml-0.5 opacity-60 hover:opacity-100">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingTier(undefined)}
                  className="flex-1 py-2.5 border border-border rounded-xl font-semibold text-sm hover:bg-muted">Cancel</button>
                <button onClick={saveTier} disabled={savingTier}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90">
                  {savingTier ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {savingTier ? 'Saving…' : editingTier ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          )}

          {tiers.length === 0 && editingTier === undefined && (
            <div className="text-center py-10">
              <Star className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-semibold text-sm">No subscription tiers yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create tiers to earn recurring income from fans</p>
            </div>
          )}

          <div className="space-y-3">
            {tiers.map(tier => (
              <div key={tier.id} className="border border-border rounded-2xl overflow-hidden bg-card">
                <div className="px-4 py-3 flex items-center justify-between border-b border-border">
                  <div>
                    <p className="font-bold text-sm">{tier.tier_name}</p>
                    <p className="text-xs text-muted-foreground">{tier.description ?? 'No description'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-primary">{hfmt(tier.price_usd)}<span className="text-[10px] text-muted-foreground font-normal">/mo</span></p>
                    <button onClick={() => openEditTier(tier)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteTier(tier.id)} className="p-1.5 rounded-full hover:bg-red-500/10 text-muted-foreground hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {Array.isArray(tier.perks) && tier.perks.length > 0 && (
                  <div className="px-4 py-2 flex flex-wrap gap-1">
                    {(tier.perks as string[]).map((p: string, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{p}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Revenue info */}
          <div className="p-3 bg-muted/30 rounded-2xl text-xs text-muted-foreground">
            <p><strong>Revenue split:</strong> You keep 85% · Platform takes 15%. Payouts go directly to your wallet monthly.</p>
          </div>

          {/* Active subscribers */}
          {subs.length > 0 && (
            <div className="border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <p className="font-bold text-sm">Active Subscribers ({subs.length})</p>
              </div>
              <div className="divide-y divide-border max-h-60 overflow-y-auto">
                {subs.map(sub => (
                  <div key={sub.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-muted overflow-hidden flex items-center justify-center font-bold text-xs shrink-0">
                      {sub.subscriber?.avatar_url
                        ? <img src={sub.subscriber.avatar_url} alt="" className="w-full h-full object-cover" />
                        : sub.subscriber?.username?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-xs truncate">@{sub.subscriber?.username ?? 'Unknown'}</p>
                      <p className="text-[10px] text-muted-foreground">{sub.tier}</p>
                    </div>
                    <p className="font-black text-xs text-green-600">{hfmt(Number(sub.price ?? 0))}/mo</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CONTENT ── */}
      {activeTab === 'content' && (
        <>
          <div>
            <p className="font-bold text-sm">Paid Content</p>
            <p className="text-xs text-muted-foreground mt-0.5">Lock posts behind a paywall — you earn 80% of each purchase</p>
          </div>
          <div className="p-4 border border-amber-500/20 bg-amber-500/5 rounded-2xl text-xs text-muted-foreground">
            <p><strong>How it works:</strong> Set a price on any post. Viewers who don't follow you see a locked preview and must pay to see the full content. You receive 80% instantly to your wallet.</p>
          </div>
          {loadingPosts ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : pricedPosts.length === 0 ? (
            <div className="text-center py-10">
              <Lock className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-semibold text-sm">No paid posts yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add a price to your posts from this tab to start earning</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pricedPosts.map(post => (
                <PostPriceCard key={post.id} post={post} onUpdate={updatePostPrice} />
              ))}
            </div>
          )}
          <AddPaidPostCard userId={userId} onAdded={loadPricedPosts} />
        </>
      )}

      {/* ── TIPS ── */}
      {activeTab === 'tips' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-muted-foreground mb-1">Total Tips</p>
              <p className="text-xl font-black text-amber-600">{hfmt(totalTips)}</p>
              <p className="text-[10px] text-muted-foreground">{tips.length} tips</p>
            </div>
            <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20">
              <p className="text-xs text-muted-foreground mb-1">Avg Tip</p>
              <p className="text-xl font-black text-green-600">
                {tips.length > 0 ? hfmt(totalTips / tips.length) : '$0.00'}
              </p>
              <p className="text-[10px] text-muted-foreground">per tipper</p>
            </div>
          </div>
          {tips.length === 0 ? (
            <div className="text-center py-10">
              <Gift className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-semibold text-sm">No tips yet</p>
              <p className="text-xs text-muted-foreground mt-1">Tips appear as Gift buttons on your posts for viewers</p>
            </div>
          ) : (
            <div className="border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Gift className="w-4 h-4 text-amber-500" />
                <p className="font-bold text-sm">Tip History</p>
              </div>
              <div className="divide-y divide-border max-h-96 overflow-y-auto">
                {tips.map(tip => (
                  <div key={tip.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-amber-500/10 overflow-hidden flex items-center justify-center font-bold text-sm shrink-0">
                      {tip.from_user?.avatar_url
                        ? <img src={tip.from_user.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <Heart className="w-4 h-4 text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-xs">@{tip.from_user?.username ?? 'Anonymous'}</p>
                      {tip.message && <p className="text-[10px] text-muted-foreground truncate">"{tip.message}"</p>}
                      <p className="text-[10px] text-muted-foreground">{new Date(tip.created_at).toLocaleDateString()}</p>
                    </div>
                    <p className="font-black text-sm text-amber-600">+{hfmt(Number(tip.amount))}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── ANALYTICS ── */}
      {activeTab === 'analytics' && (
        <>
          {monthlyData.length === 0 ? (
            <div className="text-center py-10">
              <BarChart3 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-semibold text-sm">No earnings data yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start earning to see analytics</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border border-border rounded-2xl p-4">
                <p className="font-bold text-sm mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />Earnings by Source
                </p>
                <div className="space-y-2">
                  {monthlyData.map(d => (
                    <div key={d.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize font-semibold">{d.name}</span>
                        <span className="font-black text-green-600">{hfmt(d.value)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min((d.value / (totalEarnings || 1)) * 100, 100)}%`,
                          background: d.fill,
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revenue split info */}
              <div className="border border-border rounded-2xl p-4">
                <p className="font-bold text-sm mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />Revenue Split Breakdown
                </p>
                <div className="space-y-2.5">
                  {[
                    { label: 'Tips',            pct: '100%', note: 'Full amount via wallet transfer' },
                    { label: 'Subscriptions',   pct: '85%',  note: 'Platform fee: 15%' },
                    { label: 'Paid Content',     pct: '80%',  note: 'Platform fee: 20%' },
                    { label: 'Video Fund',       pct: '100%', note: `${hfmt(HUB_FUND_CPM * 1000)} per 1k views` },
                    { label: 'Ad Revenue Share', pct: '30%',  note: 'Platform keeps 70%' },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-xs">{r.label}</p>
                        <p className="text-[10px] text-muted-foreground">{r.note}</p>
                      </div>
                      <span className="font-black text-sm text-green-600">{r.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Post Price Card (inline price editor) ────────────────────────────────
function PostPriceCard({ post, onUpdate }: { post: any; onUpdate: (id: string, price: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [price,   setPrice]   = useState(String(post.price ?? ''));

  return (
    <div className="border border-border rounded-2xl bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-xs truncate">
            {post.is_video ? '🎥' : '📝'} {post.content?.slice(0, 60) ?? 'Post'}…
          </p>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
            <span>{post.views_count?.toLocaleString() ?? 0} views</span>
            <span>{post.likes_count ?? 0} likes</span>
            <span>{new Date(post.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {post.is_monetized && post.price > 0
            ? <span className="text-xs font-black text-amber-600">{hfmt(Number(post.price))}</span>
            : <span className="text-[10px] text-muted-foreground">Free</span>}
          <button onClick={() => setEditing(v => !v)} className="p-1 rounded-full hover:bg-muted text-muted-foreground">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          {post.is_monetized && (
            <button onClick={() => onUpdate(post.id, null)} className="p-1 rounded-full hover:bg-red-500/10 text-muted-foreground hover:text-red-500">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {editing && (
        <div className="px-4 pb-3 flex gap-2 border-t border-border pt-3">
          <input
            type="number" min="0.01" step="0.01" placeholder="Price (USD)…"
            value={price} onChange={e => setPrice(e.target.value)}
            className="flex-1 h-9 px-2.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/40"
          />
          <button onClick={() => { onUpdate(post.id, parseFloat(price) || null); setEditing(false); }}
            className="px-3 h-9 bg-amber-500 text-white rounded-lg text-xs font-bold hover:opacity-90">Set</button>
          <button onClick={() => setEditing(false)} className="px-2 h-9 border border-border rounded-lg text-xs hover:bg-muted">✕</button>
        </div>
      )}
    </div>
  );
}

// ── Add Paid Post Card ────────────────────────────────────────────────────
function AddPaidPostCard({ userId, onAdded }: { userId: string; onAdded: () => void }) {
  const [open,    setOpen]    = useState(false);
  const [search,  setSearch]  = useState('');
  const [posts,   setPosts]   = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState<{ [id: string]: string }>({});
  const [saving,  setSaving]  = useState<string | null>(null);

  const searchPosts = async (q: string) => {
    setSearch(q);
    if (q.trim().length < 2) { setPosts([]); return; }
    setLoading(true);
    const { data } = await supabase.from('posts')
      .select('id,content,is_video,views_count,is_monetized,price')
      .eq('user_id', userId).ilike('content', `%${q}%`).limit(10);
    setPosts(data ?? []);
    setLoading(false);
  };

  const setPostPrice = async (postId: string) => {
    const price = parseFloat(pricing[postId] ?? '0');
    if (!price || price <= 0) { toast.error('Enter a valid price'); return; }
    setSaving(postId);
    await supabase.from('posts').update({ is_monetized: true, price }).eq('id', postId).eq('user_id', userId);
    setSaving(null);
    toast.success(`Post priced at ${hfmt(price)}`);
    setOpen(false); setSearch(''); setPosts([]);
    onAdded();
  };

  return (
    <div>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-2xl text-sm font-semibold text-muted-foreground hover:border-amber-500/40 hover:text-amber-600 hover:bg-amber-500/5 transition-all">
        <Plus className="w-4 h-4" /> Price an existing post
      </button>
      {open && (
        <div className="mt-3 p-4 border border-border rounded-2xl bg-card space-y-3">
          <p className="font-bold text-sm">Search your posts</p>
          <input type="text" value={search} onChange={e => searchPosts(e.target.value)}
            placeholder="Search post content…"
            className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/40" />
          {loading && <div className="flex justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>}
          {posts.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 border border-border rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{p.is_video ? '🎥' : '📝'} {p.content?.slice(0, 50)}…</p>
                {p.is_monetized && <p className="text-[10px] text-amber-600">Currently {hfmt(Number(p.price))}</p>}
              </div>
              <input type="number" min="0.01" step="0.01" placeholder="$"
                value={pricing[p.id] ?? ''}
                onChange={e => setPricing(prev => ({ ...prev, [p.id]: e.target.value }))}
                className="w-16 h-8 px-2 rounded-lg border border-border bg-background text-xs text-center focus:outline-none" />
              <button onClick={() => setPostPrice(p.id)} disabled={saving === p.id}
                className="px-3 h-8 bg-amber-500 text-white rounded-lg text-xs font-bold disabled:opacity-50 hover:opacity-90">
                {saving === p.id ? '…' : 'Set'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick Tip Stats Widget ────────────────────────────────────────────────
export function TipGoalWidget({ creatorId }: { creatorId: string }) {
  const [goal,   setGoal]   = useState<number | null>(null);
  const [earned, setEarned] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('user_monetization').select('monthly_tip_goal').eq('user_id', creatorId).maybeSingle(),
      supabase.from('tips').select('amount').eq('to_user_id', creatorId)
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]).then(([{ data: mon }, { data: tips }]) => {
      setGoal(mon?.monthly_tip_goal ?? null);
      setEarned((tips ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0));
      setLoading(false);
    });
  }, [creatorId]);

  if (loading || !goal) return null;
  const pct = Math.min((earned / goal) * 100, 100);

  return (
    <div className="mt-2 px-1">
      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
        <span className="flex items-center gap-1"><Coins className="w-3 h-3 text-amber-500" /> Monthly Tip Goal</span>
        <span>{hfmt(earned)} / {hfmt(goal)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Subscriber Count Badge ────────────────────────────────────────────────
export function SubscriberBadge({ creatorId }: { creatorId: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    supabase.from('creator_subscriptions').select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId).eq('status', 'active')
      .then(({ count: c }) => setCount(c ?? 0));
  }, [creatorId]);

  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20 text-[10px] font-bold">
      <Users className="w-2.5 h-2.5" />
      {count} subscriber{count !== 1 ? 's' : ''}
    </span>
  );
}
