import { useState, useEffect, useRef } from 'react';
import { useSEO } from '@/hooks/useSEO';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import {
  Gift,
  Copy,
  Share2,
  CheckCircle2,
  Users,
  Coins,
  ArrowRight,
  PartyPopper,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { subDays, format, startOfDay } from 'date-fns';

// ── AdSense banner — push-guarded ─────────────────────────────────────────────
function ReferralAdBanner() {
  const pushed = useRef(false);
  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch (_) {}
  }, []);
  return (
    <div className="mx-4 mt-2 mb-1 rounded-xl overflow-hidden border border-border bg-muted/5">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pt-2 mb-1">Sponsored</p>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: 60 }}
        data-ad-client="ca-pub-2458567543017441"
        data-ad-slot="2031881558"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

interface ReferralRecord {
  id: string;
  invited_user: string;
  credits_awarded: number;
  created_at: string;
  profile: {
    username: string;
    avatar_url: string | null;
    verified: boolean;
  } | null;
}

export default function ReferralPage() {
  useSEO({ noindex: true, title: 'Referrals', url: '/referrals' });
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [totalCredits, setTotalCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);

  const referralLink = user
    ? `${window.location.origin}/auth?ref=${user.id}`
    : '';

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadReferrals();
  }, [user]);

  const loadReferrals = async () => {
    const { data } = await supabase
      .from('referrals')
      .select(`
        id,
        invited_user,
        credits_awarded,
        created_at,
        profile:user_profiles!referrals_invited_user_fkey(username, avatar_url, verified)
      `)
      .eq('invited_by', user!.id)
      .order('created_at', { ascending: false });

    if (data) {
      const list = data as ReferralRecord[];
      setReferrals(list);
      setTotalCredits(list.reduce((s, r) => s + (r.credits_awarded ?? 0), 0));
      buildChart(list);
    }
    setLoading(false);
  };

  const buildChart = (list: ReferralRecord[]) => {
    // Build 30-day referral timeline
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = subDays(new Date(), 29 - i);
      return { date: format(d, 'MM/dd'), key: format(startOfDay(d), 'yyyy-MM-dd'), referrals: 0, credits: 0 };
    });
    list.forEach(r => {
      const dayKey = format(startOfDay(new Date(r.created_at)), 'yyyy-MM-dd');
      const entry = days.find(d => d.key === dayKey);
      if (entry) { entry.referrals += 1; entry.credits += r.credits_awarded ?? 100; }
    });
    setChartData(days);
  };

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success('Link copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Join me on TSocial!',
        text: "Hey! I'm inviting you to TSocial. Sign up using my link and we both earn 100 credits!",
        url: referralLink,
      });
    } else {
      copyLink();
    }
  };

  const steps = [
    {
      num: '1',
      title: 'Share your link',
      desc: 'Copy and send your unique referral link to friends',
      color: 'bg-blue-500',
    },
    {
      num: '2',
      title: 'Friend signs up',
      desc: 'They create an account using your personal link',
      color: 'bg-purple-500',
    },
    {
      num: '3',
      title: 'Both earn credits',
      desc: 'You both receive 100 credits automatically',
      color: 'bg-primary',
    },
  ];

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="text-xl font-bold">Refer & Earn</h1>
        <p className="text-xs text-muted-foreground">Invite friends, earn credits together</p>
      </div>
      <ReferralAdBanner />

      <div className="px-4 space-y-4 pt-4">
        {/* 30-day timeline chart */}
        {referrals.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm">Referral Activity (30 days)</h3>
              <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {referrals.length} total
              </span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="refGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={6} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(val: any, name: string) => [
                    name === 'referrals' ? `${val} friend${val !== 1 ? 's' : ''}` : `${val} credits`,
                    name === 'referrals' ? 'Referrals' : 'Credits'
                  ]}
                  contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="referrals" stroke="hsl(var(--primary))" fill="url(#refGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            {/* Credit breakdown */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: 'This Week', value: chartData.slice(-7).reduce((s, d) => s + d.referrals, 0), unit: 'friends' },
                { label: 'This Month', value: chartData.reduce((s, d) => s + d.referrals, 0), unit: 'friends' },
                { label: 'Credits 30d', value: chartData.reduce((s, d) => s + d.credits, 0), unit: 'cr' },
              ].map(s => (
                <div key={s.label} className="text-center bg-muted/30 rounded-xl py-2.5">
                  <p className="text-base font-black text-primary">{s.value.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats hero */}
        <div className="rounded-2xl bg-gradient-to-br from-primary/15 via-purple-500/10 to-blue-500/5 border border-primary/20 p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full -translate-y-8 translate-x-8" />
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-purple-500/10 rounded-full translate-y-6 -translate-x-4" />

          <div className="relative">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-3 bg-primary/15 rounded-full">
                <PartyPopper className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total credits earned</p>
                <p className="text-4xl font-black text-primary tabular-nums">
                  {totalCredits.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-primary/15">
              <div className="text-center p-2 rounded-xl bg-background/60">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <p className="text-2xl font-bold">{referrals.length}</p>
                <p className="text-xs text-muted-foreground">Friends invited</p>
              </div>
              <div className="text-center p-2 rounded-xl bg-background/60">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Coins className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-2xl font-bold text-amber-500">100</p>
                <p className="text-xs text-muted-foreground">Credits per invite</p>
              </div>
            </div>
          </div>
        </div>

        {/* Referral link */}
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-sm font-semibold mb-2">Your unique referral link</p>
          <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2.5">
            <p className="text-xs flex-1 truncate font-mono text-muted-foreground">
              {user ? referralLink : '— log in to view your link —'}
            </p>
            <button
              onClick={copyLink}
              disabled={!user}
              className="text-primary hover:text-primary/80 transition-colors flex-shrink-0 p-1"
              title="Copy link"
            >
              {copied ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button
              onClick={copyLink}
              disabled={!user}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Link
            </Button>
            <Button
              onClick={shareLink}
              disabled={!user}
              size="sm"
              className="gap-2"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </Button>
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-xl border border-border p-4">
          <p className="font-semibold mb-4 flex items-center gap-2">
            <Gift className="w-4 h-4 text-primary" />
            How it works
          </p>
          <div className="space-y-4">
            {steps.map((step, idx) => (
              <div key={step.num} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full ${step.color} text-white flex items-center justify-center text-sm font-bold flex-shrink-0`}>
                  {step.num}
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
                {idx < steps.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30 mt-2 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Referrals list */}
      <div className="mt-4">
        <div className="px-4 py-3 border-y border-border">
          <p className="font-semibold text-sm">
            Invited Friends
            <span className="ml-2 text-muted-foreground font-normal">({referrals.length})</span>
          </p>
        </div>

        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border animate-pulse">
              <div className="w-10 h-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/4" />
              </div>
              <div className="h-5 bg-muted rounded w-14" />
            </div>
          ))
        ) : referrals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground px-4 text-center">
            <Users className="w-12 h-12 mb-3 opacity-25" />
            <p className="font-semibold">No referrals yet</p>
            <p className="text-sm mt-1">Share your link above to start earning credits for every friend who joins.</p>
          </div>
        ) : (
          referrals.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
            >
              <Link to={`/profile/${r.profile?.username ?? ''}`} className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center overflow-hidden">
                  {r.profile?.avatar_url ? (
                    <img
                      src={r.profile.avatar_url}
                      alt={r.profile.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold text-primary">
                      {(r.profile?.username ?? 'U')[0].toUpperCase()}
                    </span>
                  )}
                </div>
              </Link>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <Link
                    to={`/profile/${r.profile?.username ?? ''}`}
                    className="font-semibold text-sm hover:underline truncate"
                  >
                    {r.profile?.username ?? 'Unknown user'}
                  </Link>
                  {r.profile?.verified && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Joined {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>

              <div className="flex items-center gap-1 text-amber-500 font-bold text-sm flex-shrink-0">
                <Coins className="w-3.5 h-3.5" />
                +{r.credits_awarded ?? 100}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
