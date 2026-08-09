import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DollarSign, TrendingUp, Wallet, Loader2, AlertCircle,
  Smartphone, Phone, Clock, CheckCircle2, XCircle, ArrowUpRight,
  RefreshCw, Mail, Download, CalendarClock, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Label } from '@/components/ui/label';

const USD_TO_KES = 130;

type PayoutMethod = 'mpesa' | 'paypal';
type WithdrawStep = 'idle' | 'sending' | 'done' | 'failed';

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly', desc: 'Every Monday' },
  { value: 'biweekly', label: 'Bi-weekly', desc: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly', desc: '1st of every month' },
];

function nextPayoutDate(frequency: string): Date {
  const now = new Date();
  if (frequency === 'weekly') {
    const d = new Date(now);
    d.setDate(d.getDate() + (7 - d.getDay() + 1) % 7 || 7);
    d.setHours(9, 0, 0, 0);
    return d;
  } else if (frequency === 'biweekly') {
    const d = new Date(now);
    d.setDate(d.getDate() + 14);
    d.setHours(9, 0, 0, 0);
    return d;
  } else {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0, 0);
    return d;
  }
}

export default function PayoutsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [monetization, setMonetization] = useState<any>(null);
  const [revenueShare, setRevenueShare] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any>(null);
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);

  // Withdrawal form
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('mpesa');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawStep, setWithdrawStep] = useState<WithdrawStep>('idle');

  // Schedule form
  const [schedFrequency, setSchedFrequency] = useState('monthly');
  const [schedMethod, setSchedMethod] = useState<PayoutMethod>('mpesa');
  const [schedDestination, setSchedDestination] = useState('');
  const [schedMinAmount, setSchedMinAmount] = useState('5');
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [monData, revData, txData, walletData, schedData] = await Promise.all([
        supabase.from('user_monetization').select('*').eq('user_id', user!.id).single(),
        supabase.from('revenue_shares').select('*').eq('user_id', user!.id).single(),
        supabase.from('wallet_transactions').select('*').eq('user_id', user!.id)
          .in('type', ['earnings', 'withdrawal', 'platform_share', 'creator_payout'])
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('user_wallets').select('mpesa_phone,paypal_email').eq('user_id', user!.id).single(),
        supabase.from('payout_schedules').select('*').eq('user_id', user!.id).single(),
      ]);

      setMonetization(monData.data);
      setRevenueShare(revData.data);
      setTransactions(txData.data || []);

      if (walletData.data) {
        setMpesaPhone(walletData.data.mpesa_phone || '');
        setPaypalEmail(walletData.data.paypal_email || '');
        setSchedDestination(walletData.data.mpesa_phone || walletData.data.paypal_email || '');
      }

      if (schedData.data) {
        setSchedule(schedData.data);
        setSchedFrequency(schedData.data.frequency);
        setSchedMethod(schedData.data.payout_method);
        setSchedDestination(schedData.data.payout_destination);
        setSchedMinAmount(String(schedData.data.minimum_amount || 5));
      }
    } catch (err) {
      console.error('fetchData error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Save / Toggle Payout Schedule ──────────────────────────────
  const handleSaveSchedule = async () => {
    if (!schedDestination.trim()) { toast.error('Enter a payout destination'); return; }
    setSavingSchedule(true);
    try {
      const nextPayout = nextPayoutDate(schedFrequency).toISOString();
      const payload = {
        user_id: user!.id,
        frequency: schedFrequency,
        payout_method: schedMethod,
        payout_destination: schedDestination,
        minimum_amount: parseFloat(schedMinAmount) || 5,
        is_active: true,
        next_payout_at: nextPayout,
        updated_at: new Date().toISOString(),
      };

      if (schedule) {
        await supabase.from('payout_schedules').update(payload).eq('id', schedule.id);
      } else {
        await supabase.from('payout_schedules').insert(payload);
      }

      toast.success('Payout schedule saved!');
      fetchData();
      setShowSchedulePanel(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleToggleSchedule = async () => {
    if (!schedule) return;
    const newActive = !schedule.is_active;
    await supabase.from('payout_schedules').update({ is_active: newActive }).eq('id', schedule.id);
    toast.success(newActive ? 'Auto-payouts enabled' : 'Auto-payouts paused');
    fetchData();
  };

  // ── M-Pesa B2C Creator Payout ────────────────────────────────────
  const handleMpesaWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    const available = monetization?.pending_user_payout || 0;
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (amount > available) { toast.error(`Max available: $${available.toFixed(2)}`); return; }
    if (mpesaPhone.replace(/\D/g, '').length < 9) { toast.error('Enter a valid M-Pesa number'); return; }

    setWithdrawStep('sending');
    try {
      const kesAmount = Math.floor(amount * USD_TO_KES);
      const { data, error } = await supabase.functions.invoke('mpesa-b2c-payout', {
        body: { phone: mpesaPhone, amount: kesAmount, purpose: 'creator_payout' },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) { try { msg = await error.context?.text() || msg; } catch {} }
        throw new Error(msg);
      }

      console.log('B2C payout:', data);

      await supabase.from('user_monetization').update({
        pending_user_payout: Math.max(0, available - amount),
      }).eq('user_id', user!.id);

      const { data: wallet } = await supabase.from('user_wallets').select('id').eq('user_id', user!.id).single();
      if (wallet) {
        await supabase.from('wallet_transactions').insert({
          wallet_id: wallet.id,
          user_id: user!.id,
          type: 'withdrawal',
          amount,
          payment_method: 'mpesa',
          status: 'pending',
          description: `Creator payout → ${mpesaPhone} (KES ${kesAmount.toLocaleString()})`,
        });
      }

      // Push notification
      await supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: user!.id,
          title: '💸 Payout Sent!',
          body: `KES ${kesAmount.toLocaleString()} is on its way to ${mpesaPhone}`,
          data: { route: '/payouts' },
        },
      });

      setWithdrawStep('done');
      toast.success(`KES ${kesAmount.toLocaleString()} payout initiated!`);
      setWithdrawAmount('');
      fetchData();
    } catch (err: any) {
      setWithdrawStep('failed');
      toast.error(err.message || 'Payout failed');
    }
  };

  const handlePaypalWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    const available = monetization?.pending_user_payout || 0;
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (amount > available) { toast.error(`Max: $${available.toFixed(2)}`); return; }
    if (!paypalEmail.includes('@')) { toast.error('Enter a valid PayPal email'); return; }

    setWithdrawStep('sending');
    try {
      const { data: wallet } = await supabase.from('user_wallets').select('id').eq('user_id', user!.id).single();
      if (!wallet) throw new Error('Wallet not found');

      await supabase.from('wallet_transactions').insert({
        wallet_id: wallet.id,
        user_id: user!.id,
        type: 'withdrawal',
        amount,
        payment_method: 'paypal',
        status: 'pending',
        description: `PayPal withdrawal → ${paypalEmail}`,
        metadata: { paypal_email: paypalEmail },
      });

      await supabase.from('user_monetization').update({
        pending_user_payout: Math.max(0, available - amount),
      }).eq('user_id', user!.id);

      setWithdrawStep('done');
      toast.success('PayPal withdrawal submitted (2–5 business days)');
      setWithdrawAmount('');
      fetchData();
    } catch (err: any) {
      setWithdrawStep('failed');
      toast.error(err.message || 'Withdrawal failed');
    }
  };

  const handleWithdraw = () => {
    if (payoutMethod === 'mpesa') handleMpesaWithdraw();
    else handlePaypalWithdraw();
  };

  const resetWithdraw = () => setWithdrawStep('idle');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!monetization?.is_monetized) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <TopBar title="Payouts" showBack />
        <div className="max-w-2xl mx-auto p-6 text-center py-20">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-2">Monetization Not Enabled</h2>
          <p className="text-muted-foreground mb-6">Enable monetization to receive ad revenue and creator payouts.</p>
          <Button onClick={() => navigate('/monetization')}>Go to Monetization</Button>
        </div>
      </div>
    );
  }

  // Also allow users with $0 balance to still see their history and set up schedule
  const isEligibleForPayout = available >= 1;

  const available = monetization?.pending_user_payout || 0;
  const userSharePct = monetization?.user_share_percentage || 30;
  const platformSharePct = monetization?.platform_share_percentage || 70;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Payouts & Revenue" showBack />

      <div className="max-w-4xl mx-auto p-4 space-y-6">

        {/* ── Revenue Stats ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-border rounded-2xl p-5 bg-gradient-to-br from-green-500/10 to-emerald-500/10">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-5 h-5 text-green-600" />
              <span className="text-sm text-muted-foreground">Your Share ({userSharePct}%)</span>
            </div>
            <p className="text-3xl font-bold text-green-600">
              ${(revenueShare?.user_share || 0).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Total earned</p>
          </div>

          <div className="border border-border rounded-2xl p-5 bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-muted-foreground">Available Now</span>
            </div>
            <p className="text-3xl font-bold text-blue-600">${available.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">≈ KES {(available * USD_TO_KES).toLocaleString()}</p>
          </div>

          <div className="border border-border rounded-2xl p-5 bg-gradient-to-br from-purple-500/10 to-pink-500/10">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <span className="text-sm text-muted-foreground">Platform ({platformSharePct}%)</span>
            </div>
            <p className="text-3xl font-bold text-purple-600">
              ${(revenueShare?.platform_share || 0).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Platform revenue</p>
          </div>
        </div>

        {/* ── Auto Payout Schedule ── */}
        <div className="border-2 border-primary/20 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowSchedulePanel(!showSchedulePanel)}
            className="w-full flex items-center justify-between p-5 bg-gradient-to-r from-primary/5 to-purple-500/5 hover:from-primary/10 hover:to-purple-500/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <CalendarClock className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-bold">Auto Payout Schedule</p>
                <p className="text-xs text-muted-foreground">
                  {schedule
                    ? `${schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)} via ${schedule.payout_method.toUpperCase()} — ${schedule.is_active ? 'Active' : 'Paused'}`
                    : 'Not configured — set up automatic payouts'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {schedule && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleSchedule(); }}
                  className="flex items-center gap-1.5 text-sm font-medium"
                >
                  {schedule.is_active ? (
                    <ToggleRight className="w-8 h-8 text-green-600" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-muted-foreground" />
                  )}
                </button>
              )}
              {showSchedulePanel ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
            </div>
          </button>

          {showSchedulePanel && (
            <div className="p-5 border-t border-border space-y-4">
              {schedule?.next_payout_at && (
                <div className="flex items-center gap-2 text-sm bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>Next automatic payout: <strong>{new Date(schedule.next_payout_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
                </div>
              )}

              {/* Frequency */}
              <div>
                <Label className="mb-2 block">Payout Frequency</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FREQUENCIES.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setSchedFrequency(f.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        schedFrequency === f.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <p className="font-bold text-sm">{f.label}</p>
                      <p className="text-xs text-muted-foreground">{f.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Method */}
              <div>
                <Label className="mb-2 block">Payout Method</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setSchedMethod('mpesa')}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${schedMethod === 'mpesa' ? 'border-green-500 bg-green-500/10' : 'border-border'}`}>
                    <Smartphone className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-sm">M-Pesa</span>
                  </button>
                  <button onClick={() => setSchedMethod('paypal')}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${schedMethod === 'paypal' ? 'border-blue-500 bg-blue-500/10' : 'border-border'}`}>
                    <Mail className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-sm">PayPal</span>
                  </button>
                </div>
              </div>

              {/* Destination */}
              <div>
                <Label className="mb-1 block">
                  {schedMethod === 'mpesa' ? 'M-Pesa Phone Number' : 'PayPal Email'}
                </Label>
                <Input
                  type={schedMethod === 'mpesa' ? 'tel' : 'email'}
                  placeholder={schedMethod === 'mpesa' ? '+254712345678' : 'you@paypal.com'}
                  value={schedDestination}
                  onChange={(e) => setSchedDestination(e.target.value)}
                  className="h-11"
                />
              </div>

              {/* Min amount */}
              <div>
                <Label className="mb-1 block">Minimum Payout Amount (USD)</Label>
                <Input
                  type="number" min="1" step="0.01"
                  placeholder="5.00"
                  value={schedMinAmount}
                  onChange={(e) => setSchedMinAmount(e.target.value)}
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Payout only triggers when balance ≥ this amount
                </p>
              </div>

              <Button onClick={handleSaveSchedule} disabled={savingSchedule} className="w-full h-12 font-bold">
                {savingSchedule ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CalendarClock className="w-4 h-4 mr-2" />}
                {schedule ? 'Update Schedule' : 'Enable Auto Payouts'}
              </Button>
            </div>
          )}
        </div>

        {/* ── Manual Payout Request ── */}
        <div className="border border-border rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Request Payout</h2>
            <Button variant="ghost" size="icon" onClick={fetchData}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setPayoutMethod('mpesa'); resetWithdraw(); }}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${payoutMethod === 'mpesa' ? 'border-green-500 bg-green-500/10' : 'border-border hover:border-green-300'}`}>
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <p className="font-bold text-sm">M-Pesa</p>
                <p className="text-xs text-muted-foreground">Instant B2C</p>
              </div>
            </button>
            <button onClick={() => { setPayoutMethod('paypal'); resetWithdraw(); }}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${payoutMethod === 'paypal' ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-blue-300'}`}>
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <p className="font-bold text-sm">PayPal</p>
                <p className="text-xs text-muted-foreground">2–5 days</p>
              </div>
            </button>
          </div>

          {(withdrawStep === 'idle' || withdrawStep === 'failed') && (
            <div className="space-y-4">
              {withdrawStep === 'failed' && (
                <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
                  <XCircle className="w-4 h-4 shrink-0" />
                  Payout failed. Check your details and try again.
                </div>
              )}

              <div>
                <Label className="mb-1 block">
                  Amount (USD) — Available: <span className="font-bold text-green-600">${available.toFixed(2)}</span>
                </Label>
                <Input
                  type="number" min="1" step="0.01" max={available}
                  placeholder="10.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="h-12 text-lg"
                />
                {withdrawAmount && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ≈ KES {Math.floor(parseFloat(withdrawAmount || '0') * USD_TO_KES).toLocaleString()}
                  </p>
                )}
              </div>

              {payoutMethod === 'mpesa' ? (
                <div>
                  <Label className="mb-1 block flex items-center gap-2">
                    <Phone className="w-4 h-4 text-green-600" />M-Pesa Phone
                  </Label>
                  <Input type="tel" placeholder="+254712345678" value={mpesaPhone}
                    onChange={(e) => setMpesaPhone(e.target.value)} className="h-12" />
                </div>
              ) : (
                <div>
                  <Label className="mb-1 block">PayPal Email</Label>
                  <Input type="email" placeholder="you@paypal.com" value={paypalEmail}
                    onChange={(e) => setPaypalEmail(e.target.value)} className="h-12" />
                </div>
              )}

              {!isEligibleForPayout && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Minimum payout is $1.00. Keep creating content to earn more!</span>
                </div>
              )}
              <Button
                onClick={handleWithdraw}
                disabled={!isEligibleForPayout || !withdrawAmount || parseFloat(withdrawAmount) > available || parseFloat(withdrawAmount) <= 0}
                className={`w-full h-12 font-bold text-white ${payoutMethod === 'mpesa' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                <ArrowUpRight className="w-4 h-4 mr-2" />
                {payoutMethod === 'mpesa' ? 'Send via M-Pesa B2C' : 'Request PayPal Payout'}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Min $1 · Split: {userSharePct}% yours / {platformSharePct}% platform
              </p>
            </div>
          )}

          {withdrawStep === 'sending' && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="w-12 h-12 animate-spin text-green-600 mx-auto" />
              <p className="font-semibold">Processing payout…</p>
              <p className="text-sm text-muted-foreground">Initiating transfer</p>
            </div>
          )}

          {withdrawStep === 'done' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 bg-green-600/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <p className="font-bold text-lg text-green-600">Payout Initiated!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {payoutMethod === 'mpesa' ? 'Funds arrive in your M-Pesa within minutes.' : 'PayPal transfer completes in 2–5 business days.'}
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={resetWithdraw}>
                Request Another Payout
              </Button>
            </div>
          )}
        </div>

        {/* ── Payout History ── */}
        <div className="border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Payout History</h2>
            <Button variant="ghost" size="sm" onClick={() => {
              const csv = [
                'Date,Type,Amount,Status,Method',
                ...transactions.map(t =>
                  `"${new Date(t.created_at).toLocaleString()}","${t.type}","${t.amount}","${t.status}","${t.payment_method || ''}"`
                )
              ].join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'payouts.csv'; a.click();
              URL.revokeObjectURL(url);
            }}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No payout transactions yet</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      tx.type === 'earnings' ? 'bg-green-100 text-green-600 dark:bg-green-900/20' : 'bg-orange-100 text-orange-600 dark:bg-orange-900/20'
                    }`}>
                      {tx.type === 'earnings' ? <DollarSign className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm capitalize">{tx.type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.payment_method?.toUpperCase() || 'N/A'} · {new Date(tx.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${tx.type === 'earnings' ? 'text-green-600' : 'text-orange-500'}`}>
                      {tx.type === 'earnings' ? '+' : '-'}${Number(tx.amount).toFixed(2)}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      tx.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                      tx.status === 'pending'   ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                                   'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                      {tx.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
