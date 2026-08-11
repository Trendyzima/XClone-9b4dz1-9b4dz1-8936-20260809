import { useState, useEffect, useRef, useMemo } from 'react';
import { PageAdBanner } from '@/components/features/AdSenseAd';
import { useSEO } from '@/hooks/useSEO';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { WalletDashboard } from '@/components/features/WalletDashboard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  Smartphone, Loader2, CheckCircle2, Clock, AlertCircle,
  Phone, Zap, ArrowDownLeft, X, ArrowUpRight, Wallet, Download,
  Send, Search, UserCheck, Copy, TrendingUp, BarChart3, PieChart as LucidePieChart,
  Shield, Bell, BellOff, Settings2, QrCode, Calendar, RefreshCw, ChevronDown,
  ExternalLink, Key, Filter
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const USD_TO_KES = 130;
const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

type TopUpStep = 'idle' | 'sending' | 'polling' | 'success' | 'failed';
type WithdrawStep = 'idle' | 'sending' | 'polling' | 'success' | 'failed';
type ActiveTab = 'wallet' | 'history' | 'send' | 'receive' | 'analytics';

// ── M-Pesa Secrets Setup Guide ────────────────────────────────────────────
const MPESA_SECRETS = [
    {
      key: 'MPESA_CONSUMER_KEY',
      desc: 'OAuth consumer key from Safaricom Developer portal',
      where: 'Safaricom Developer Portal → My Apps → App Details → Consumer Key',
    },
    {
      key: 'MPESA_CONSUMER_SECRET',
      desc: 'OAuth consumer secret paired with the consumer key',
      where: 'Safaricom Developer Portal → My Apps → App Details → Consumer Secret',
    },
    {
      key: 'MPESA_SHORTCODE',
      desc: 'Your M-Pesa till/paybill number (sandbox: 174379)',
      where: 'Safaricom Business → Account → Business Short Code',
    },
    {
      key: 'MPESA_PASSKEY',
      desc: 'STK Push passkey (sandbox has a default test passkey)',
      where: 'Safaricom Developer Portal → Test Credentials → LipaNaMpesa Online Passkey',
    },
    {
      key: 'MPESA_B2C_SHORTCODE',
      desc: 'B2C payout shortcode (can be same as MPESA_SHORTCODE)',
      where: 'Safaricom Developer Portal → B2C Test Credentials',
    },
    {
      key: 'MPESA_INITIATOR_NAME',
      desc: 'B2C initiator username (sandbox: testapi)',
      where: 'Safaricom Developer Portal → B2C Test Credentials → Initiator Name',
    },
    {
      key: 'MPESA_SECURITY_CRED',
      desc: 'B2C encrypted security credential',
      where: 'Safaricom Developer Portal → B2C Test Credentials → Security Credential',
    },
];

function MpesaSecretsGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
          <Key className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm">M-Pesa Setup Guide</p>
          <p className="text-xs text-muted-foreground">Configure secrets in Cloud → Secrets</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3 bg-amber-500/3">
          <p className="text-xs text-muted-foreground">
            Add each secret in{' '}
            <strong className="text-foreground">OnSpace Cloud → Secrets</strong> tab.
            Use sandbox values for testing, then switch to production after going live.
          </p>
          <div className="space-y-2">
            {MPESA_SECRETS.map(s => (
              <div key={s.key} className="p-3 bg-background border border-border rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-[11px] font-mono font-bold text-primary bg-primary/8 px-1.5 py-0.5 rounded">{s.key}</code>
                </div>
                <p className="text-xs text-foreground mb-0.5">{s.desc}</p>
                <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                  <ExternalLink className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                  {s.where}
                </p>
              </div>
            ))}
          </div>
          <a
            href="https://developer.safaricom.co.ke"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400 rounded-xl font-semibold text-xs hover:bg-amber-500/10 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Safaricom Developer Portal
          </a>
          <p className="text-[10px] text-muted-foreground text-center">
            Switch MPESA_BASE URL in edge functions from <code className="font-mono">sandbox.safaricom.co.ke</code> to <code className="font-mono">api.safaricom.co.ke</code> for production.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Receive Money Tab (QR Code) ───────────────────────────────────────────
function ReceiveMoneyTab({ username, walletBalance }: { username: string; walletBalance: number }) {
  const [copied, setCopied] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestNote, setRequestNote] = useState('');

  const { payUrl, qrImageUrl } = useMemo(() => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({ tab: 'send', to: username });
    if (requestAmount && parseFloat(requestAmount) > 0) params.set('amount', requestAmount);
    if (requestNote.trim()) params.set('note', requestNote.trim());
    const url = `${baseUrl}/wallet?${params.toString()}`;
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000&qzone=2&format=png`;
    return { payUrl: url, qrImageUrl: qr };
  }, [username, requestAmount, requestNote]);

  const copyLink = () => {
    navigator.clipboard.writeText(payUrl).then(() => {
      setCopied(true);
      toast.success('Payment link copied!');
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({ title: `Pay @${username}`, url: payUrl });
    } else {
      copyLink();
    }
  };

  return (
    <div className="space-y-5">
      {/* Balance header */}
      <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
        <p className="text-sm font-semibold text-muted-foreground">Your Balance</p>
        <p className="text-3xl font-black text-primary">${walletBalance.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">≈ KES {Math.floor(walletBalance * USD_TO_KES).toLocaleString()}</p>
      </div>

      {/* Request amount (optional) */}
      <div className="space-y-3">
        <div>
          <label className="text-sm font-semibold mb-1.5 block">Request a specific amount (optional)</label>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {[1, 5, 10, 25].map(a => (
              <button key={a} onClick={() => setRequestAmount(requestAmount === String(a) ? '' : String(a))}
                className={`py-2 rounded-xl font-bold text-sm border-2 transition-all ${
                  requestAmount === String(a) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'
                }`}>
                ${a}
              </button>
            ))}
          </div>
          <input type="number" min="0.01" step="0.01" placeholder="Custom amount (USD)…"
            value={requestAmount && !['1','5','10','25'].includes(requestAmount) ? requestAmount : ''}
            onChange={e => setRequestAmount(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-sm font-semibold mb-1.5 block">Note (optional)</label>
          <input type="text" maxLength={80} placeholder="What's it for?" value={requestNote} onChange={e => setRequestNote(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-4 p-6 border border-border rounded-2xl bg-card">
        <div className="flex items-center gap-2 mb-1">
          <QrCode className="w-4 h-4 text-primary" />
          <p className="font-bold text-sm">Scan to pay @{username}</p>
        </div>
        <div className="p-3 bg-white rounded-2xl shadow-sm border border-border">
          <img
            src={qrImageUrl}
            alt={`QR code to pay @${username}`}
            width={220}
            height={220}
            className="rounded-xl"
          />
        </div>
        {requestAmount && parseFloat(requestAmount) > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
            <span className="text-sm font-black text-primary">Requesting ${parseFloat(requestAmount).toFixed(2)}</span>
            {requestNote && <span className="text-xs text-muted-foreground">· {requestNote}</span>}
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          Show this QR code to anyone — they'll be taken directly to the Send Money page pre-filled with your username.
        </p>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={copyLink}
          className="flex items-center justify-center gap-2 py-3 border border-border rounded-xl font-semibold text-sm hover:bg-muted transition-colors">
          {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        <button onClick={shareLink}
          className="flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">
          <Send className="w-4 h-4" />
          Share Link
        </button>
      </div>

      <div className="bg-muted/30 rounded-2xl p-3 text-xs text-muted-foreground">
        <strong>Payment link:</strong>{' '}
        <span className="break-all font-mono text-[10px]">{payUrl.length > 80 ? payUrl.slice(0, 80) + '…' : payUrl}</span>
      </div>
    </div>
  );
}

// ── Payout Schedule Card ──────────────────────────────────────────────────
function PayoutScheduleCard({ userId, defaultPhone }: { userId: string; defaultPhone: string | null }) {
  const [schedule, setSchedule] = useState<any | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [enabled, setEnabled]   = useState(false);
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly');
  const [minAmount, setMinAmount] = useState('5');
  const [phone, setPhone]         = useState(defaultPhone ?? '');

  useEffect(() => { fetchSchedule(); }, [userId]);
  useEffect(() => { if (defaultPhone && !phone) setPhone(defaultPhone); }, [defaultPhone]);

  const fetchSchedule = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payout_schedules')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (data) {
      setSchedule(data);
      setEnabled(data.is_active);
      setFrequency(data.frequency ?? 'monthly');
      setMinAmount(String(data.minimum_amount ?? 5));
      setPhone(data.payout_destination ?? defaultPhone ?? '');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    const phoneTrimmed = phone.trim();
    if (enabled && phoneTrimmed.replace(/\D/g, '').length < 9) {
      toast.error('Enter a valid M-Pesa phone number');
      return;
    }
    setSaving(true);

    const nextPayout = new Date();
    if (frequency === 'weekly') {
      nextPayout.setDate(nextPayout.getDate() + 7);
    } else {
      nextPayout.setMonth(nextPayout.getMonth() + 1);
    }
    nextPayout.setHours(9, 0, 0, 0);

    const payload = {
      user_id: userId,
      frequency,
      payout_method: 'mpesa',
      payout_destination: phoneTrimmed,
      minimum_amount: parseFloat(minAmount) || 5,
      is_active: enabled,
      next_payout_at: enabled ? nextPayout.toISOString() : null,
    };

    let err;
    if (schedule) {
      const { error } = await supabase
        .from('payout_schedules')
        .update(payload)
        .eq('id', schedule.id);
      err = error;
    } else {
      const { error } = await supabase
        .from('payout_schedules')
        .insert(payload);
      err = error;
    }

    setSaving(false);
    if (err) { toast.error('Failed to save schedule'); return; }
    toast.success(enabled ? `Auto-payout scheduled ${frequency}` : 'Auto-payout disabled');
    fetchSchedule();
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border p-5 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm">Auto-Payout Schedule</h3>
          </div>
          <button
            onClick={() => setEnabled(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {enabled ? (
          <div className="space-y-4">
            {/* Frequency */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block font-semibold uppercase tracking-wide">Frequency</label>
              <div className="grid grid-cols-2 gap-2">
                {(['weekly', 'monthly'] as const).map(f => (
                  <button key={f} onClick={() => setFrequency(f)}
                    className={`py-2.5 rounded-xl font-bold text-sm border-2 capitalize transition-all ${
                      frequency === f ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'
                    }`}>{f}</button>
                ))}
              </div>
            </div>

            {/* Minimum amount */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block font-semibold uppercase tracking-wide">Minimum payout (USD)</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {['5', '10', '25', '50'].map(v => (
                  <button key={v} onClick={() => setMinAmount(v)}
                    className={`py-2 rounded-xl font-bold text-xs border-2 transition-all ${
                      minAmount === v ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'
                    }`}>${v}</button>
                ))}
              </div>
              <input type="number" min="1" step="0.01" placeholder="Custom minimum…"
                value={!['5','10','25','50'].includes(minAmount) ? minAmount : ''}
                onChange={e => setMinAmount(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <p className="text-[10px] text-muted-foreground mt-1">
                Payout only runs when your balance ≥ ${parseFloat(minAmount || '0').toFixed(2)}
              </p>
            </div>

            {/* M-Pesa destination */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block font-semibold uppercase tracking-wide flex items-center gap-1.5">
                <Phone className="w-3 h-3" />M-Pesa destination
              </label>
              <input type="tel" placeholder="0712 345 678" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            {/* Next payout info */}
            {schedule?.next_payout_at && (
              <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/15 rounded-xl">
                <RefreshCw className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <p className="text-xs font-semibold">Next scheduled payout</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(schedule.next_payout_at).toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mb-4">
            Automatically withdraw your earnings to M-Pesa on a weekly or monthly schedule when your balance reaches a minimum threshold.
          </p>
        )}

        <button onClick={handleSave} disabled={saving}
          className="w-full mt-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
          {saving ? 'Saving…' : enabled ? 'Save Schedule' : 'Save (Disabled)'}
        </button>
      </div>
    </div>
  );
}

// ── Spending Analytics Tab ────────────────────────────────────────────────
function SpendingAnalyticsTab({ userId }: { userId: string }) {
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month');

  useEffect(() => { fetchTxns(); }, [userId, period]);

  const fetchTxns = async () => {
    setLoading(true);
    let q = supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (period === 'week') {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      q = q.gte('created_at', since);
    } else if (period === 'month') {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      q = q.gte('created_at', since);
    }
    const { data } = await q;
    setTxns(data ?? []);
    setLoading(false);
  };

  const { barData, pieData, totalIn, totalOut, totalBoosts, avgTxn, recentDeposits } = useMemo(() => {
    const days = period === 'week' ? 7 : 14;
    const now = Date.now();
    const dailyMap: Record<string, { in: number; out: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      dailyMap[key] = { in: 0, out: 0 };
    }
    txns.forEach(t => {
      const key = new Date(t.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' });
      if (!dailyMap[key]) return;
      if (t.type === 'deposit' || t.type === 'earnings') dailyMap[key].in += Number(t.amount);
      else dailyMap[key].out += Number(t.amount);
    });
    const barData = Object.entries(dailyMap).map(([date, v]) => ({
      date, In: parseFloat(v.in.toFixed(2)), Out: parseFloat(v.out.toFixed(2)),
    }));
    const typeMap: Record<string, number> = {};
    txns.forEach(t => {
      const label = t.type.replace(/_/g, ' ');
      typeMap[label] = (typeMap[label] || 0) + Number(t.amount);
    });
    const pieData = Object.entries(typeMap).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
    const totalIn = txns.filter(t => t.type === 'deposit' || t.type === 'earnings').reduce((s, t) => s + Number(t.amount), 0);
    const totalOut = txns.filter(t => t.type === 'withdrawal').reduce((s, t) => s + Number(t.amount), 0);
    const totalBoosts = txns.filter(t => (t.description ?? '').toLowerCase().includes('boost')).reduce((s, t) => s + Number(t.amount), 0);
    const avgTxn = txns.length > 0 ? (txns.reduce((s, t) => s + Number(t.amount), 0) / txns.length) : 0;
    const recentDeposits = txns.filter(t => t.type === 'deposit').slice(0, 3);
    return { barData, pieData, totalIn, totalOut, totalBoosts, avgTxn, recentDeposits };
  }, [txns, period]);

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {(['week', 'month', 'all'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              period === p ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}>{p === 'all' ? 'All time' : `Last ${p}`}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Deposited', value: `$${totalIn.toFixed(2)}`, sub: `KES ${Math.round(totalIn * USD_TO_KES).toLocaleString()}`, color: 'text-green-600', bg: 'bg-green-500/10 border-green-500/20' },
              { label: 'Total Withdrawn', value: `$${totalOut.toFixed(2)}`, sub: `KES ${Math.round(totalOut * USD_TO_KES).toLocaleString()}`, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20' },
              { label: 'Avg Transaction', value: `$${avgTxn.toFixed(2)}`, sub: `over ${txns.length} transactions`, color: 'text-blue-600', bg: 'bg-blue-500/10 border-blue-500/20' },
              { label: 'Boost Spending', value: `$${totalBoosts.toFixed(2)}`, sub: 'on ad campaigns', color: 'text-purple-600', bg: 'bg-purple-500/10 border-purple-500/20' },
            ].map(s => (
              <div key={s.label} className={`p-4 rounded-2xl border ${s.bg}`}>
                <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {barData.length > 0 && (
            <div className="border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-sm">Daily Cash Flow</h3>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any) => [`$${v}`, '']}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="In" name="Deposits" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Out" name="Withdrawals" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {pieData.length > 0 && (
            <div className="border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <LucidePieChart className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-sm">Transaction Breakdown</h3>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any) => [`$${v}`, '']}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => v.charAt(0).toUpperCase() + v.slice(1)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {recentDeposits.length > 0 && (
            <div className="border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <h3 className="font-bold text-sm">Recent Top-ups</h3>
              </div>
              <div className="space-y-2">
                {recentDeposits.map(d => (
                  <div key={d.id} className="flex items-center gap-3 p-3 bg-green-500/5 border border-green-500/15 rounded-xl">
                    <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                      <ArrowDownLeft className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-green-700 dark:text-green-400">+${Number(d.amount).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {d.payment_method ? d.payment_method.toUpperCase() : 'M-Pesa'} · {new Date(d.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      d.status === 'completed' ? 'bg-green-500/10 text-green-600' : 'bg-orange-500/10 text-orange-600'
                    }`}>{d.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {txns.length === 0 && (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-semibold text-sm">No transactions yet</p>
              <p className="text-xs text-muted-foreground mt-1">Make your first deposit to see analytics</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── P2P Send Money Tab ────────────────────────────────────────────────────
function SendMoneyTab({ userId, walletBalance, onComplete, prefillUsername }: {
  userId: string; walletBalance: number; onComplete: () => void; prefillUsername?: string;
}) {
  const [query, setQuery] = useState(prefillUsername ?? '');
  const [users, setUsers] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<{
    recipient: any; amount: number; note: string; ref: string; timestamp: string;
  } | null>(null);

  useEffect(() => {
    if (prefillUsername && prefillUsername.length >= 2) searchUsers(prefillUsername);
  }, [prefillUsername]);

  const searchUsers = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setUsers([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url, verified')
      .ilike('username', `%${q.trim()}%`)
      .neq('id', userId)
      .limit(8);
    setUsers(data ?? []);
    setSearching(false);
  };

  const handleSend = async () => {
    if (!selectedUser || !amount || parseFloat(amount) <= 0) return;
    const amt = parseFloat(amount);
    if (amt > walletBalance) { toast.error('Insufficient balance'); return; }
    setSending(true);
    const { error } = await supabase.rpc('p2p_wallet_transfer', {
      p_from_user_id: userId,
      p_to_user_id: selectedUser.id,
      p_amount: amt,
      p_note: note.trim() || null,
    });
    setSending(false);
    if (error) { toast.error(error.message || 'Transfer failed'); return; }
    toast.success(`$${amt.toFixed(2)} sent to @${selectedUser.username}!`);
    setReceipt({
      recipient: selectedUser,
      amount: amt,
      note: note.trim() || '',
      ref: `TXN${Date.now().toString(36).toUpperCase().slice(-8)}`,
      timestamp: new Date().toISOString(),
    });
    setSelectedUser(null);
    setAmount('');
    setNote('');
    setQuery('');
    onComplete();
  };

  if (receipt) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-4 p-6 bg-gradient-to-br from-green-500/10 to-emerald-400/5 border border-green-500/20 rounded-2xl text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
            <CheckCircle2 className="w-9 h-9 text-green-500" />
          </div>
          <div>
            <p className="text-lg font-black text-green-600">Transfer Complete!</p>
            <p className="text-3xl font-black mt-1">${receipt.amount.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-0.5">sent to @{receipt.recipient.username}</p>
          </div>
          <div className="w-full space-y-2 text-sm">
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-mono font-bold text-xs">{receipt.ref}</span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Timestamp</span>
              <span className="font-semibold text-xs">{new Date(receipt.timestamp).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="font-bold text-green-600 text-xs">✅ Completed</span>
            </div>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => {
                const text = `Transfer Receipt\nRef: ${receipt.ref}\nAmount: $${receipt.amount.toFixed(2)}\nTo: @${receipt.recipient.username}\nTime: ${new Date(receipt.timestamp).toLocaleString()}`;
                navigator.clipboard.writeText(text).then(() => toast.success('Receipt copied!'));
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 border border-border rounded-xl font-semibold text-sm hover:bg-muted transition-colors"
            >
              <Copy className="w-4 h-4" /> Copy Receipt
            </button>
            <button onClick={() => setReceipt(null)}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
        <p className="text-sm font-semibold text-muted-foreground">Available to send</p>
        <p className="text-3xl font-black text-primary">${walletBalance.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">≈ KES {Math.floor(walletBalance * USD_TO_KES).toLocaleString()}</p>
      </div>

      {!selectedUser ? (
        <div className="space-y-3">
          <label className="text-sm font-semibold">Send to user</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={query} onChange={e => searchUsers(e.target.value)}
              placeholder="Search by username…"
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {users.length > 0 && (
            <div className="space-y-1">
              {users.map(u => (
                <button key={u.id} onClick={() => { setSelectedUser(u); setUsers([]); setQuery(''); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left">
                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt={u.username} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center font-bold text-sm">{u.username[0]?.toUpperCase()}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-bold text-sm truncate">@{u.username}</p>
                      {u.verified && <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </div>
                  </div>
                  <Send className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
          {query.length >= 2 && users.length === 0 && !searching && (
            <p className="text-sm text-muted-foreground text-center py-4">No users found for "{query}"</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl">
            <div className="w-12 h-12 rounded-full bg-muted overflow-hidden shrink-0">
              {selectedUser.avatar_url
                ? <img src={selectedUser.avatar_url} alt={selectedUser.username} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center font-bold">{selectedUser.username[0]?.toUpperCase()}</div>}
            </div>
            <div className="flex-1">
              <p className="font-bold">@{selectedUser.username}</p>
              <p className="text-xs text-muted-foreground">Recipient</p>
            </div>
            <button onClick={() => setSelectedUser(null)} className="p-2 rounded-full hover:bg-muted text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="text-sm font-semibold mb-2 block">Amount (USD)</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[1, 5, 10, 25].map(a => (
                <button key={a} onClick={() => setAmount(String(a))}
                  className={`py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${amount === String(a) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'}`}>
                  ${a}
                </button>
              ))}
            </div>
            <input type="number" min="0.01" step="0.01" placeholder="Custom amount…"
              value={amount && ![1,5,10,25].map(String).includes(amount) ? amount : ''}
              onChange={e => setAmount(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-sm font-semibold mb-2 block">Note (optional)</label>
            <input type="text" maxLength={100} placeholder="What's this for?" value={note} onChange={e => setNote(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <button onClick={handleSend} disabled={sending || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > walletBalance}
            className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {sending ? 'Sending…' : `Send $${parseFloat(amount || '0').toFixed(2)} to @${selectedUser.username}`}
          </button>
          {amount && parseFloat(amount) > walletBalance && (
            <p className="text-xs text-red-500 text-center">Amount exceeds your balance of ${walletBalance.toFixed(2)}</p>
          )}
        </div>
      )}
      <div className="bg-muted/30 rounded-2xl p-4 text-xs text-muted-foreground">
        <p><strong>Instant transfers</strong> — funds arrive immediately. Transfers cannot be reversed.</p>
      </div>
    </div>
  );
}

// ── Transaction History Tab ───────────────────────────────────────────────
function TransactionHistoryTab({ userId }: { userId: string }) {
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'deposit' | 'withdrawal' | 'earnings'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => { fetchTxns(); }, [userId, filter]);

  const fetchTxns = async () => {
    setLoading(true);
    let q = supabase.from('wallet_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200);
    if (filter !== 'all') q = q.eq('type', filter);
    const { data } = await q;
    setTxns(data ?? []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return txns;
    const q = search.trim().toLowerCase();
    return txns.filter(t =>
      (t.description ?? '').toLowerCase().includes(q) ||
      (t.type ?? '').toLowerCase().includes(q) ||
      (t.payment_method ?? '').toLowerCase().includes(q) ||
      (t.reference ?? '').toLowerCase().includes(q) ||
      String(t.amount).includes(q)
    );
  }, [txns, search]);

  const downloadCSV = () => {
    const headers = ['Date', 'Type', 'Amount', 'Status', 'Method', 'Description'];
    const rows = filtered.map(t => [
      new Date(t.created_at).toLocaleString(), t.type, t.amount, t.status,
      t.payment_method ?? '', t.description ?? ''
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const totalIn  = txns.filter(t => t.type === 'deposit' || t.type === 'earnings').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = txns.filter(t => t.type === 'withdrawal').reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20">
          <p className="text-xs text-muted-foreground mb-1">Total Received</p>
          <p className="text-xl font-black text-green-600">${totalIn.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">≈ KES {Math.round(totalIn * USD_TO_KES).toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-muted-foreground mb-1">Total Withdrawn</p>
          <p className="text-xl font-black text-red-500">${totalOut.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">≈ KES {Math.round(totalOut * USD_TO_KES).toLocaleString()}</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by description, method, amount, ref…"
          className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-muted rounded-xl p-1 flex-1 overflow-x-auto">
          {(['all', 'deposit', 'withdrawal', 'earnings'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-shrink-0 flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                filter === f ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}>{f}</button>
          ))}
        </div>
        <button onClick={downloadCSV} className="p-2 border border-border rounded-xl hover:bg-muted transition-colors text-muted-foreground shrink-0" title="Download CSV">
          <Download className="w-4 h-4" />
        </button>
      </div>

      {search && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Filter className="w-3 h-3" />
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Wallet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold text-sm">
            {search ? `No results for "${search}"` : `No transactions${filter !== 'all' ? ` in "${filter}"` : ''}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? 'Try a different search term' : 'Your transaction history will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(tx => {
            const isIn = tx.type === 'deposit' || tx.type === 'earnings';
            return (
              <div key={tx.id} className="flex items-center gap-3 p-3.5 bg-card border border-border rounded-2xl hover:bg-muted/30 transition-colors">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  isIn ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'
                }`}>
                  {isIn ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm capitalize">{tx.type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {tx.payment_method ? `${tx.payment_method.toUpperCase()} · ` : ''}
                    {tx.description || new Date(tx.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-black text-base ${isIn ? 'text-green-600' : 'text-red-500'}`}>
                    {isIn ? '+' : '-'}${Number(tx.amount).toFixed(2)}
                  </p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    tx.status === 'completed' ? 'bg-green-500/10 text-green-600' :
                    tx.status === 'pending'   ? 'bg-orange-500/10 text-orange-600' :
                    'bg-red-500/10 text-red-500'
                  }`}>{tx.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Spend Limit Controls ────────────────────────────────────────────────
function SpendLimitCard({ userId, wallet, onSaved }: {
  userId: string;
  wallet: any;
  onSaved: () => void;
}) {
  const [enabled, setEnabled]   = useState<boolean>(wallet?.spend_limit_enabled ?? false);
  const [limitUsd, setLimitUsd] = useState<string>(wallet?.daily_spend_limit ? String(wallet.daily_spend_limit) : '');
  const [saving, setSaving]     = useState(false);
  const [todaySpent, setTodaySpent] = useState<number>(0);

  useEffect(() => { fetchTodaySpend(); }, [userId]);

  const fetchTodaySpend = async () => {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('wallet_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'withdrawal')
      .gte('created_at', since.toISOString());
    const total = (data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
    setTodaySpent(total);
  };

  const handleSave = async () => {
    setSaving(true);
    const limit = limitUsd ? parseFloat(limitUsd) : null;
    const { error } = await supabase
      .from('user_wallets')
      .update({ spend_limit_enabled: enabled, daily_spend_limit: limit })
      .eq('user_id', userId);
    setSaving(false);
    if (error) { toast.error('Failed to save spend limit'); return; }
    toast.success(enabled ? `Daily limit set to $${limit?.toFixed(2)}` : 'Spend limit disabled');
    onSaved();
  };

  const limitVal = parseFloat(limitUsd || '0');
  const progress = enabled && limitVal > 0 ? Math.min((todaySpent / limitVal) * 100, 100) : 0;
  const nearLimit = progress >= 80;
  const atLimit   = progress >= 100;

  return (
    <div className={`rounded-2xl border overflow-hidden ${
      atLimit   ? 'border-red-500/40 bg-red-500/5' :
      nearLimit ? 'border-orange-500/40 bg-orange-500/5' :
                  'border-border'
    }`}>
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className={`w-4 h-4 ${enabled ? 'text-primary' : 'text-muted-foreground'}`} />
            <h3 className="font-bold text-sm">Daily Spend Limit</h3>
          </div>
          <button
            onClick={() => setEnabled(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {enabled ? (
          <>
            <div className="mb-3">
              <label className="text-xs text-muted-foreground mb-1.5 block">Limit per day (USD)</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[10, 25, 50, 100].map(v => (
                  <button key={v} onClick={() => setLimitUsd(String(v))}
                    className={`py-2 rounded-xl font-bold text-xs border-2 transition-all ${
                      limitUsd === String(v) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'
                    }`}>${v}</button>
                ))}
              </div>
              <input type="number" min="1" step="1" placeholder="Custom limit…"
                value={limitUsd && !['10','25','50','100'].includes(limitUsd) ? limitUsd : ''}
                onChange={e => setLimitUsd(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            {limitVal > 0 && (
              <div className="mb-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className={nearLimit ? (atLimit ? 'text-red-500 font-bold' : 'text-orange-500 font-bold') : 'text-muted-foreground'}>
                    {atLimit ? '🚫 Limit reached' : nearLimit ? '⚠️ Near limit' : 'Spent today'}
                  </span>
                  <span className="font-semibold">${todaySpent.toFixed(2)} / ${limitVal.toFixed(2)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${
                    atLimit ? 'bg-red-500' : nearLimit ? 'bg-orange-500' : 'bg-primary'
                  }`} style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mb-3">
              Withdrawals exceeding this limit will be blocked until midnight (server time).
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground mb-4">
            Set a daily spend limit to control how much you can withdraw per day.
          </p>
        )}

        <button onClick={handleSave} disabled={saving || (enabled && !limitUsd)}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save Limit'}
        </button>
      </div>
    </div>
  );
}

function WalletAdBanner() { return <PageAdBanner />; }
export default function WalletPage() {
  useSEO({ noindex: true, title: 'Wallet', url: '/wallet' });
  const { user } = useAuth();
  const { wallet, fetchWallet } = useWallet();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const tab = searchParams.get('tab');
    if (tab === 'send')      return 'send';
    if (tab === 'history')   return 'history';
    if (tab === 'analytics') return 'analytics';
    if (tab === 'receive')   return 'receive';
    return 'wallet';
  });
  const prefillTo = searchParams.get('to') ?? '';

  const [phone, setPhone]         = useState('');
  const [amount, setAmount]       = useState('');
  const [step, setStep]           = useState<TopUpStep>('idle');
  const [pollSecs, setPollSecs]   = useState(0);
  const [pollMsg, setPollMsg]     = useState('');
  const [showTopUp, setShowTopUp] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [wPhone, setWPhone]             = useState('');
  const [wKes, setWKes]                 = useState('');
  const [wStep, setWStep]               = useState<WithdrawStep>('idle');
  const [wPollSecs, setWPollSecs]       = useState(0);
  const [wPollMsg, setWPollMsg]         = useState('');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const wPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const [lastTopUpAmount, setLastTopUpAmount] = useState<number | null>(null);

  useEffect(() => {
    if (wallet?.mpesa_phone) {
      if (!phone)  setPhone(wallet.mpesa_phone);
      if (!wPhone) setWPhone(wallet.mpesa_phone);
    }
  }, [wallet]);

  useEffect(() => {
    if (user) fetchLastTopUp();
  }, [user]);

  useEffect(() => {
    return () => {
      if (pollRef.current)  clearInterval(pollRef.current);
      if (wPollRef.current) clearInterval(wPollRef.current);
      stopBalancePoll();
    };
  }, []);

  const fetchLastTopUp = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('wallet_transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('type', 'deposit')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setLastTopUpAmount(Number(data.amount));
  };

  const balancePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startBalancePoll = () => {
    if (balancePollRef.current) clearInterval(balancePollRef.current);
    balancePollRef.current = setInterval(async () => { await fetchWallet(); }, 8000);
  };
  const stopBalancePoll = () => {
    if (balancePollRef.current) { clearInterval(balancePollRef.current); balancePollRef.current = null; }
  };

  const startPoll = (checkoutId: string, depositAmountUsd: number) => {
    let elapsed = 0;
    setPollSecs(0);
    setPollMsg('Check your phone and enter your M-Pesa PIN…');
    setStep('polling');
    startBalancePoll();

    pollRef.current = setInterval(async () => {
      elapsed += 3;
      setPollSecs(elapsed);
      if (elapsed >= 120) {
        clearInterval(pollRef.current!);
        stopBalancePoll();
        await fetchWallet();
        setStep('failed');
        setPollMsg('Verification timed out. If you paid, funds will appear shortly.');
        return;
      }
      try {
        const { data } = await supabase.functions.invoke('mpesa-stk-status', {
          body: { checkout_request_id: checkoutId },
        });
        if (data?.status === 'completed') {
          clearInterval(pollRef.current!);
          stopBalancePoll();
          const { error: rpcErr } = await supabase.rpc('add_to_wallet', { p_user_id: user!.id, p_amount: depositAmountUsd });
          if (rpcErr) console.warn('[wallet] add_to_wallet error:', rpcErr.message);
          const { data: w } = await supabase.from('user_wallets').select('id').eq('user_id', user!.id).single();
          await supabase.from('wallet_transactions').insert({
            wallet_id: w?.id ?? null,
            user_id: user!.id,
            type: 'deposit',
            amount: depositAmountUsd,
            payment_method: 'mpesa',
            status: 'completed',
            description: `M-Pesa top-up — KES ${Math.ceil(depositAmountUsd * USD_TO_KES).toLocaleString()}`,
          });
          await fetchWallet();
          setLastTopUpAmount(depositAmountUsd);
          setStep('success');
          setPollMsg(`KES ${Math.ceil(depositAmountUsd * USD_TO_KES).toLocaleString()} received! Your wallet has been topped up.`);
          toast.success(`Wallet topped up! +$${depositAmountUsd.toFixed(2)}`);
          setAmount('');
        } else if (data?.status === 'failed' || data?.status === 'cancelled') {
          clearInterval(pollRef.current!);
          stopBalancePoll();
          await fetchWallet();
          setStep('failed');
          setPollMsg('Payment was cancelled or failed. Please try again.');
        } else {
          await fetchWallet();
        }
      } catch { /* keep polling */ }
    }, 3000);
  };

  const handleTopUp = async () => {
    if (!user) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    const phoneCleaned = phone.replace(/\D/g, '');
    if (phoneCleaned.length < 9) { toast.error('Enter a valid M-Pesa phone number'); return; }
    setStep('sending');
    try {
      const kesAmount = Math.ceil(amt * USD_TO_KES);
      const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
        body: { phone, amount: kesAmount, purpose: 'wallet_topup', metadata: { wallet_id: wallet?.id, user_id: user.id } },
      });
      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { msg = (await error.context?.text()) || msg; } catch { /* */ }
        }
        throw new Error(msg);
      }
      toast.success(data.customer_message || 'STK Push sent — check your phone!');
      startPoll(data.checkout_request_id, parseFloat(amount));
    } catch (err: any) {
      setStep('failed');
      setPollMsg(err.message || 'Failed to initiate top-up. Try again.');
      toast.error(err.message || 'Failed to initiate top-up');
    }
  };

  const resetTopUp = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    stopBalancePoll();
    setStep('idle'); setPollMsg(''); setPollSecs(0);
  };

  const resetWithdraw = () => {
    if (wPollRef.current) clearInterval(wPollRef.current);
    stopBalancePoll();
    setWStep('idle'); setWPollMsg(''); setWPollSecs(0);
  };

  const handleWithdraw = async () => {
    if (!user) return;
    const kesAmt = parseFloat(wKes);
    if (!kesAmt || kesAmt < 10) { toast.error('Minimum withdrawal is KES 10'); return; }
    const usdAmt = kesAmt / USD_TO_KES;
    const balance = Number(wallet?.balance ?? 0);
    if (usdAmt > balance) { toast.error(`Insufficient balance — available $${balance.toFixed(2)}`); return; }
    const phoneCleaned = wPhone.replace(/\D/g, '');
    if (phoneCleaned.length < 9) { toast.error('Enter a valid M-Pesa phone number'); return; }
    setWStep('sending');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const backendUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetchWallet();
      const res = await fetch(`${backendUrl}/functions/v1/mpesa-b2c-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: wPhone, amount: Math.floor(kesAmt), purpose: 'creator_payout' }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'B2C request failed');
      toast.success('Payout initiated — check your phone!');
      const conversationId = payload.conversation_id;
      const { error: deductErr } = await supabase.rpc('deduct_from_wallet', { p_user_id: user.id, p_amount: usdAmt });
      if (deductErr) console.warn('[wallet] deduct error:', deductErr.message);
      await fetchWallet();
      startBalancePoll();
      let elapsed = 0;
      setWPollSecs(0);
      setWPollMsg('Your M-Pesa payment is on its way…');
      setWStep('polling');
      wPollRef.current = setInterval(async () => {
        elapsed += 3;
        setWPollSecs(elapsed);
        await fetchWallet();
        if (elapsed >= 120) {
          clearInterval(wPollRef.current!);
          stopBalancePoll();
          setWStep('success');
          setWPollMsg(`KES ${Math.floor(kesAmt).toLocaleString()} is being sent to your M-Pesa.`);
          return;
        }
        const { data: txn } = await supabase
          .from('mpesa_transactions').select('status, result_code')
          .eq('checkout_request_id', conversationId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (txn?.status === 'completed' || txn?.status === 'success') {
          clearInterval(wPollRef.current!);
          stopBalancePoll();
          await fetchWallet();
          setWStep('success');
          setWPollMsg(`KES ${Math.floor(kesAmt).toLocaleString()} sent to your M-Pesa!`);
          toast.success('Withdrawal complete!');
        } else if (txn?.status === 'failed') {
          clearInterval(wPollRef.current!);
          stopBalancePoll();
          const { error: refundErr } = await supabase.rpc('add_to_wallet', { p_user_id: user.id, p_amount: usdAmt });
          if (refundErr) console.warn('[wallet] refund error:', refundErr.message);
          await fetchWallet();
          setWStep('failed');
          setWPollMsg('Payout failed — your balance has been restored.');
          toast.error('Payout failed. Balance restored.');
        }
      }, 3000);
    } catch (err: any) {
      setWStep('failed');
      setWPollMsg(err.message || 'Failed to initiate withdrawal. Try again.');
      toast.error(err.message || 'Withdrawal failed');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="My Wallet" showBack />
      <WalletAdBanner />

      {/* ── Tab bar ── */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex max-w-2xl mx-auto overflow-x-auto scrollbar-hide">
          {([
            { key: 'wallet',    label: '💳 Wallet' },
            { key: 'send',      label: '💸 Send' },
            { key: 'receive',   label: '📥 Receive' },
            { key: 'history',   label: '📋 History' },
            { key: 'analytics', label: '📊 Analytics' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex-shrink-0 flex-1 py-3.5 font-semibold text-sm border-b-2 transition-colors relative ${
                activeTab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted/40'
              }`}>
              {t.label}
              {t.key === 'wallet' && lastTopUpAmount !== null && (
                <span className="absolute top-1.5 right-1 text-[8px] font-black bg-green-500 text-white px-1 py-0.5 rounded-full leading-none">
                  +${lastTopUpAmount.toFixed(0)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Non-wallet tabs ── */}
      <div className="max-w-2xl mx-auto p-4 space-y-5">
        {activeTab === 'history' && user && (
          <TransactionHistoryTab userId={user.id} />
        )}
        {activeTab === 'send' && user && (
          <SendMoneyTab
            userId={user.id}
            walletBalance={Number(wallet?.balance ?? 0)}
            onComplete={fetchWallet}
            prefillUsername={prefillTo}
          />
        )}
        {activeTab === 'receive' && user && (
          <ReceiveMoneyTab
            username={user.username ?? user.email?.split('@')[0] ?? 'me'}
            walletBalance={Number(wallet?.balance ?? 0)}
          />
        )}
        {activeTab === 'analytics' && user && (
          <SpendingAnalyticsTab userId={user.id} />
        )}
      </div>

      {/* ── Wallet tab ── */}
      {activeTab === 'wallet' && (
        <div className="max-w-2xl mx-auto p-4 space-y-5">

          {/* Balance summary */}
          <div className="bg-gradient-to-br from-primary/10 to-purple-500/5 border border-primary/20 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-muted-foreground">Wallet Balance</p>
              {lastTopUpAmount !== null && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                  <TrendingUp className="w-2.5 h-2.5" /> Last top-up +${lastTopUpAmount.toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-4xl font-black">${Number(wallet?.balance ?? 0).toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              ≈ KES {Math.floor(Number(wallet?.balance ?? 0) * USD_TO_KES).toLocaleString()}
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setActiveTab('receive')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary/10 border border-primary/20 rounded-xl text-primary font-semibold text-xs hover:bg-primary/15 transition-colors">
                <QrCode className="w-3.5 h-3.5" /> Receive
              </button>
              <button onClick={() => setActiveTab('send')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-xs hover:opacity-90 transition-opacity">
                <Send className="w-3.5 h-3.5" /> Send
              </button>
            </div>
          </div>

          {/* M-Pesa Top-Up */}
          <div className="bg-gradient-to-br from-green-600/10 via-emerald-500/5 to-transparent border border-green-600/20 rounded-2xl overflow-hidden">
            <button
              onClick={() => { resetTopUp(); setShowTopUp(v => !v); }}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-green-500/5 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-green-600/15 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-base">Deposit via M-Pesa</p>
                <p className="text-xs text-muted-foreground">STK Push — funds credited automatically after payment</p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-transform ${
                showTopUp ? 'border-green-600 rotate-45' : 'border-muted-foreground/40'
              }`}>
                <span className="text-lg leading-none text-muted-foreground">+</span>
              </div>
            </button>

            {showTopUp && (
              <div className="px-5 pb-5 space-y-4 border-t border-green-600/15 pt-4">
                {(step === 'idle' || step === 'failed') && (
                  <>
                    {step === 'failed' && pollMsg && (
                      <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{pollMsg}</span>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Select Amount</p>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {[
                          { kes: 100, usd: (100 / USD_TO_KES) },
                          { kes: 500, usd: (500 / USD_TO_KES) },
                          { kes: 1000, usd: (1000 / USD_TO_KES) },
                          { kes: 5000, usd: (5000 / USD_TO_KES) },
                        ].map(({ kes, usd }) => {
                          const val = usd.toFixed(2);
                          return (
                            <button key={kes} onClick={() => setAmount(val)}
                              className={`py-2.5 rounded-xl font-bold text-xs border-2 transition-all flex flex-col items-center ${
                                amount === val
                                  ? 'border-green-600 bg-green-600/10 text-green-700 dark:text-green-400'
                                  : 'border-border hover:border-green-600/40 hover:bg-green-600/5'
                              }`}>
                              <span className="text-[11px] font-black">KES {kes.toLocaleString()}</span>
                              <span className="text-[9px] font-normal opacity-60">${usd.toFixed(2)}</span>
                            </button>
                          );
                        })}
                      </div>
                      <Input type="number" min="1" step="0.01" placeholder="Custom USD amount…" value={amount} onChange={e => setAmount(e.target.value)} className="h-11" />
                      {amount && parseFloat(amount) > 0 && (
                        <p className="text-xs text-green-600 font-semibold mt-1">
                          ≈ KES {Math.ceil(parseFloat(amount) * USD_TO_KES).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                        <Phone className="w-3 h-3" />M-Pesa Phone Number
                      </p>
                      <Input type="tel" placeholder="0712 345 678" value={phone} onChange={e => setPhone(e.target.value)} className="h-11" />
                      <p className="text-[10px] text-muted-foreground mt-1">Format: 07XX XXX XXX or +254 7XX XXX XXX</p>
                    </div>
                    <button
                      onClick={handleTopUp}
                      disabled={!amount || !phone || parseFloat(amount) <= 0}
                      className="w-full py-3.5 bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                    >
                      <Smartphone className="w-5 h-5" />
                      Send M-Pesa Request · KES {amount && parseFloat(amount) > 0 ? Math.ceil(parseFloat(amount) * USD_TO_KES).toLocaleString() : '—'}
                    </button>
                    <div className="flex items-center gap-3 bg-muted/40 rounded-xl p-3 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <p>Funds are credited to your wallet instantly after M-Pesa confirmation. Secure &amp; encrypted.</p>
                    </div>
                  </>
                )}
                {step === 'sending' && (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <Loader2 className="w-10 h-10 animate-spin text-green-600" />
                    <p className="font-semibold text-sm">Sending M-Pesa request…</p>
                    <p className="text-xs text-muted-foreground text-center">Connecting to Safaricom servers</p>
                  </div>
                )}
                {step === 'polling' && (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="w-16 h-16 rounded-full bg-green-600/10 flex items-center justify-center">
                      <Clock className="w-8 h-8 text-green-600 animate-pulse" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-bold text-base text-green-700 dark:text-green-400">Awaiting M-Pesa PIN…</p>
                      <p className="text-sm text-muted-foreground">{pollMsg}</p>
                      <p className="text-xs text-muted-foreground">{pollSecs}s elapsed · checking every 3s</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min((pollSecs / 90) * 100, 100)}%` }} />
                    </div>
                    <button onClick={resetTopUp} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                )}
                {step === 'success' && (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                      <CheckCircle2 className="w-9 h-9 text-green-500" />
                    </div>
                    <p className="font-bold text-lg text-green-600 dark:text-green-400">Payment Confirmed!</p>
                    <p className="text-sm text-muted-foreground text-center">{pollMsg}</p>
                    <button onClick={() => { resetTopUp(); setShowTopUp(false); }}
                      className="px-6 py-2.5 bg-green-600 text-white rounded-full font-semibold text-sm hover:bg-green-700 transition-colors">
                      Done
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* M-Pesa Withdrawal */}
          <div className="bg-gradient-to-br from-orange-600/10 via-red-500/5 to-transparent border border-orange-600/20 rounded-2xl overflow-hidden">
            <button
              onClick={() => { resetWithdraw(); setShowWithdraw(v => !v); }}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-orange-500/5 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-orange-600/15 flex items-center justify-center shrink-0">
                <ArrowUpRight className="w-5 h-5 text-orange-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-base">Withdraw to M-Pesa</p>
                <p className="text-xs text-muted-foreground">
                  Available: <span className="font-semibold text-foreground">${Number(wallet?.balance ?? 0).toFixed(2)}</span>
                  {' '}(≈ KES {Math.floor(Number(wallet?.balance ?? 0) * USD_TO_KES).toLocaleString()})
                </p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-transform ${
                showWithdraw ? 'border-orange-600 rotate-45' : 'border-muted-foreground/40'
              }`}>
                <span className="text-lg leading-none text-muted-foreground">+</span>
              </div>
            </button>

            {showWithdraw && (
              <div className="px-5 pb-5 space-y-4 border-t border-orange-600/15 pt-4">
                {(wStep === 'idle' || wStep === 'failed') && (
                  <>
                    {wStep === 'failed' && wPollMsg && (
                      <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{wPollMsg}</span>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Amount (KES)</p>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {[500, 1000, 2500, 5000].map(kes => {
                          const maxKes = Math.floor(Number(wallet?.balance ?? 0) * USD_TO_KES);
                          const disabled = kes > maxKes;
                          return (
                            <button key={kes} onClick={() => !disabled && setWKes(String(kes))} disabled={disabled}
                              className={`py-2.5 rounded-xl font-bold text-xs border-2 transition-all flex flex-col items-center ${
                                wKes === String(kes) ? 'border-orange-600 bg-orange-600/10 text-orange-700 dark:text-orange-400' :
                                disabled ? 'border-border opacity-30 cursor-not-allowed' :
                                'border-border hover:border-orange-600/40 hover:bg-orange-600/5'
                              }`}>
                              <span className="text-[11px] font-black">KES {kes.toLocaleString()}</span>
                              <span className="text-[9px] font-normal opacity-60">${(kes / USD_TO_KES).toFixed(2)}</span>
                            </button>
                          );
                        })}
                      </div>
                      <input type="number" min="10" step="10" placeholder="Custom KES amount…" value={wKes} onChange={e => setWKes(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                      {wKes && parseFloat(wKes) > 0 && (
                        <p className="text-xs text-orange-600 font-semibold mt-1">
                          ≈ ${(parseFloat(wKes) / USD_TO_KES).toFixed(2)} will be deducted from wallet
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                        <Phone className="w-3 h-3" />Recipient M-Pesa Number
                      </p>
                      <input type="tel" placeholder="0712 345 678" value={wPhone} onChange={e => setWPhone(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                      <p className="text-[10px] text-muted-foreground mt-1">Funds sent directly to this M-Pesa number</p>
                    </div>
                    <button onClick={handleWithdraw} disabled={!wKes || !wPhone || parseFloat(wKes) < 10}
                      className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-red-500 text-white rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                      <Wallet className="w-5 h-5" />
                      Withdraw KES {parseInt(wKes || '0').toLocaleString() || '—'}
                    </button>
                  </>
                )}
                {wStep === 'sending' && (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <Loader2 className="w-10 h-10 animate-spin text-orange-600" />
                    <p className="font-semibold text-sm">Initiating payout…</p>
                  </div>
                )}
                {wStep === 'polling' && (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="w-16 h-16 rounded-full bg-orange-600/10 flex items-center justify-center">
                      <Clock className="w-8 h-8 text-orange-600 animate-pulse" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-bold text-base text-orange-700 dark:text-orange-400">Processing payout…</p>
                      <p className="text-sm text-muted-foreground">{wPollMsg}</p>
                      <p className="text-xs text-muted-foreground">{wPollSecs}s elapsed</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-orange-500 to-red-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min((wPollSecs / 90) * 100, 100)}%` }} />
                    </div>
                    <button onClick={resetWithdraw} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                )}
                {wStep === 'success' && (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                      <CheckCircle2 className="w-9 h-9 text-green-500" />
                    </div>
                    <p className="font-bold text-lg text-green-600 dark:text-green-400">Payout Initiated!</p>
                    <p className="text-sm text-muted-foreground text-center">{wPollMsg}</p>
                    <button onClick={() => { resetWithdraw(); setShowWithdraw(false); setWKes(''); }}
                      className="px-6 py-2.5 bg-green-600 text-white rounded-full font-semibold text-sm hover:bg-green-700 transition-colors">
                      Done
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <WalletDashboard />

          {/* Spend Limit Controls */}
          {user && wallet && (
            <SpendLimitCard userId={user.id} wallet={wallet} onSaved={fetchWallet} />
          )}

          {/* Auto-Payout Scheduling */}
          {user && (
            <PayoutScheduleCard userId={user.id} defaultPhone={wallet?.mpesa_phone ?? null} />
          )}

          {/* M-Pesa Setup Guide */}
          <MpesaSecretsGuide />

          {/* Wallet Notifications hint */}
          <div className="flex items-start gap-3 p-4 bg-muted/40 border border-border rounded-2xl">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Bell className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Wallet Notifications</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Deposit confirmations and withdrawal updates are sent to your{' '}
                <button onClick={() => window.location.href='/platform-inbox'}
                  className="text-primary font-semibold hover:underline">Platform Inbox</button>.
              </p>
            </div>
            <BellOff className="w-4 h-4 text-muted-foreground/50 shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}
