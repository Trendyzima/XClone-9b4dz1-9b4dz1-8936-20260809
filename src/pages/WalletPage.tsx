import { useState, useEffect, useRef } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { WalletDashboard } from '@/components/features/WalletDashboard';
import { showBanner, hideBanner, ADMOB_CONFIG } from '@/lib/admob';
import { BannerAdPosition } from '@/lib/capacitor-stub';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  Smartphone, Loader2, CheckCircle2, Clock, AlertCircle,
  Phone, Zap, ArrowDownLeft, X, ArrowUpRight, Wallet
} from 'lucide-react';
import { Input } from '@/components/ui/input';

const USD_TO_KES = 130;

type TopUpStep = 'idle' | 'sending' | 'polling' | 'success' | 'failed';
type WithdrawStep = 'idle' | 'sending' | 'polling' | 'success' | 'failed';

export default function WalletPage() {
  const { user } = useAuth();
  const { wallet, fetchWallet } = useWallet();

  // Top-up state
  const [phone, setPhone]         = useState('');
  const [amount, setAmount]       = useState('');
  const [step, setStep]           = useState<TopUpStep>('idle');
  const [pollSecs, setPollSecs]   = useState(0);
  const [pollMsg, setPollMsg]     = useState('');
  const [showTopUp, setShowTopUp] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Withdrawal state
  const [wPhone, setWPhone]             = useState('');
  const [wKes, setWKes]                 = useState('');
  const [wStep, setWStep]               = useState<WithdrawStep>('idle');
  const [wPollSecs, setWPollSecs]       = useState(0);
  const [wPollMsg, setWPollMsg]         = useState('');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const wPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-fill phone from saved wallet info
  useEffect(() => {
    if (wallet?.mpesa_phone) {
      if (!phone)  setPhone(wallet.mpesa_phone);
      if (!wPhone) setWPhone(wallet.mpesa_phone);
    }
  }, [wallet]);

  useEffect(() => {
    showBanner(ADMOB_CONFIG.BANNER_FEED, BannerAdPosition.TOP_CENTER);
    return () => {
      hideBanner();
      if (pollRef.current)  clearInterval(pollRef.current);
      if (wPollRef.current) clearInterval(wPollRef.current);
      stopBalancePoll();
    };
  }, []);

  // Live wallet balance polling (every 8s during active transactions)
  const balancePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startBalancePoll = () => {
    if (balancePollRef.current) clearInterval(balancePollRef.current);
    balancePollRef.current = setInterval(async () => {
      await fetchWallet();
    }, 8000);
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
        // Fetch final wallet state — payment may have completed server-side
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
          // Credit wallet — only if not already credited server-side (idempotent via RPC)
          const { error: rpcErr } = await supabase.rpc('add_to_wallet', {
            p_user_id: user!.id,
            p_amount: depositAmountUsd,
          });
          if (rpcErr) console.warn('[wallet] add_to_wallet RPC error:', rpcErr.message);
          // Always re-fetch authoritative balance from DB
          await fetchWallet();
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
          // Still pending — refresh balance in case server updated it already
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
        body: {
          phone,
          amount: kesAmount,
          purpose: 'wallet_topup',
          metadata: { wallet_id: wallet?.id, user_id: user.id },
        },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { msg = (await error.context?.text()) || msg; } catch { /* */ }
        }
        throw new Error(msg);
      }

      toast.success(data.customer_message || 'STK Push sent — check your phone!');
      const capturedAmount = parseFloat(amount);
      startPoll(data.checkout_request_id, capturedAmount);
    } catch (err: any) {
      setStep('failed');
      setPollMsg(err.message || 'Failed to initiate top-up. Try again.');
      toast.error(err.message || 'Failed to initiate top-up');
    }
  };

  const resetTopUp = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    stopBalancePoll();
    setStep('idle');
    setPollMsg('');
    setPollSecs(0);
  };

  const resetWithdraw = () => {
    if (wPollRef.current) clearInterval(wPollRef.current);
    stopBalancePoll();
    setWStep('idle');
    setWPollMsg('');
    setWPollSecs(0);
  };

  const handleWithdraw = async () => {
    if (!user) return;
    const kesAmt  = parseFloat(wKes);
    if (!kesAmt || kesAmt < 10) { toast.error('Minimum withdrawal is KES 10'); return; }
    const usdAmt  = kesAmt / USD_TO_KES;
    const balance = Number(wallet?.balance ?? 0);
    if (usdAmt > balance) { toast.error(`Insufficient balance — available $${balance.toFixed(2)}`); return; }
    const phoneCleaned = wPhone.replace(/\D/g, '');
    if (phoneCleaned.length < 9) { toast.error('Enter a valid M-Pesa phone number'); return; }

    setWStep('sending');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const backendUrl = import.meta.env.VITE_SUPABASE_URL;

      // Verify balance one more time before deducting
      await fetchWallet();

      const res = await fetch(`${backendUrl}/functions/v1/mpesa-b2c-payout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone: wPhone, amount: Math.floor(kesAmt), purpose: 'creator_payout' }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'B2C request failed');

      toast.success('Payout initiated — check your phone!');
      const conversationId = payload.conversation_id;

      // Deduct from wallet — only after B2C request confirmed
      const { error: deductErr } = await supabase.rpc('deduct_from_wallet', { p_user_id: user.id, p_amount: usdAmt });
      if (deductErr) console.warn('[wallet] deduct_from_wallet error:', deductErr.message);
      await fetchWallet();
      startBalancePoll();

      // Poll mpesa_transactions for completion
      let elapsed = 0;
      setWPollSecs(0);
      setWPollMsg('Your M-Pesa payment is on its way…');
      setWStep('polling');

      wPollRef.current = setInterval(async () => {
        elapsed += 3;
        setWPollSecs(elapsed);
        // Refresh balance on every poll tick
        await fetchWallet();
        if (elapsed >= 120) {
          clearInterval(wPollRef.current!);
          stopBalancePoll();
          setWStep('success'); // B2C is fire-and-forget; assume success after 2min
          setWPollMsg(`KES ${Math.floor(kesAmt).toLocaleString()} is being sent to your M-Pesa number.`);
          return;
        }
        const { data: txn } = await supabase
          .from('mpesa_transactions')
          .select('status, result_code')
          .eq('checkout_request_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
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
          // Refund wallet on confirmed failure
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

      <div className="max-w-2xl mx-auto p-4 space-y-5">

        {/* ── Quick Top-Up Card ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-green-600/10 via-emerald-500/5 to-transparent border border-green-600/20 rounded-2xl overflow-hidden">
          {/* Header row */}
          <button
            onClick={() => { resetTopUp(); setShowTopUp(v => !v); }}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-green-500/5 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-green-600/15 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-base">Quick M-Pesa Top-Up</p>
              <p className="text-xs text-muted-foreground">Instant STK Push — funds credited automatically</p>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-transform ${
              showTopUp ? 'border-green-600 rotate-45' : 'border-muted-foreground/40'
            }`}>
              <span className="text-lg leading-none text-muted-foreground">+</span>
            </div>
          </button>

          {/* Expandable form */}
          {showTopUp && (
            <div className="px-5 pb-5 space-y-4 border-t border-green-600/15 pt-4">

              {/* Idle / input state */}
              {(step === 'idle' || step === 'failed') && (
                <>
                  {step === 'failed' && pollMsg && (
                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{pollMsg}</span>
                    </div>
                  )}

                  {/* Amount presets */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Amount (USD)</p>
                    {/* KES quick-pick presets */}
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {[
                        { kes: 100,  usd: (100  / USD_TO_KES) },
                        { kes: 500,  usd: (500  / USD_TO_KES) },
                        { kes: 1000, usd: (1000 / USD_TO_KES) },
                        { kes: 5000, usd: (5000 / USD_TO_KES) },
                      ].map(({ kes, usd }) => {
                        const val = usd.toFixed(2);
                        return (
                          <button
                            key={kes}
                            onClick={() => setAmount(val)}
                            className={`py-2.5 rounded-xl font-bold text-xs border-2 transition-all flex flex-col items-center ${
                              amount === val
                                ? 'border-green-600 bg-green-600/10 text-green-700 dark:text-green-400'
                                : 'border-border hover:border-green-600/40 hover:bg-green-600/5'
                            }`}
                          >
                            <span className="text-[11px] font-black">KES {kes.toLocaleString()}</span>
                            <span className="text-[9px] font-normal opacity-60">${usd.toFixed(2)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <Input
                      type="number"
                      min="1"
                      step="0.01"
                      placeholder="Custom amount…"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="h-11"
                    />
                    {amount && parseFloat(amount) > 0 && (
                      <p className="text-xs text-green-600 font-semibold mt-1">
                        ≈ KES {Math.ceil(parseFloat(amount) * USD_TO_KES).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {/* Phone */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                      <Phone className="w-3 h-3" />M-Pesa Number
                    </p>
                    <Input
                      type="tel"
                      placeholder="0712 345 678"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="h-11"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Format: 07XX XXX XXX or +254 7XX XXX XXX</p>
                  </div>

                  <button
                    onClick={handleTopUp}
                    disabled={!amount || !phone || parseFloat(amount) <= 0}
                    className="w-full py-3.5 bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  >
                    <Smartphone className="w-5 h-5" />
                    Send STK Push · ${parseFloat(amount || '0').toFixed(2)}
                  </button>
                </>
              )}

              {/* Sending */}
              {step === 'sending' && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 className="w-10 h-10 animate-spin text-green-600" />
                  <p className="font-semibold text-sm">Sending STK Push…</p>
                  <p className="text-xs text-muted-foreground text-center">Connecting to M-Pesa servers</p>
                </div>
              )}

              {/* Polling */}
              {step === 'polling' && (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-16 h-16 rounded-full bg-green-600/10 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-green-600 animate-pulse" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="font-bold text-base text-green-700 dark:text-green-400">Awaiting payment…</p>
                    <p className="text-sm text-muted-foreground">{pollMsg}</p>
                    <p className="text-xs text-muted-foreground">{pollSecs}s elapsed · checking every 3s</p>
                  </div>
                  {/* Animated progress bar */}
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-1000"
                      style={{ width: `${Math.min((pollSecs / 90) * 100, 100)}%` }}
                    />
                  </div>
                  <button
                    onClick={resetTopUp}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              )}

              {/* Success */}
              {step === 'success' && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9 text-green-500" />
                  </div>
                  <p className="font-bold text-lg text-green-600 dark:text-green-400">Payment Confirmed!</p>
                  <p className="text-sm text-muted-foreground text-center">{pollMsg}</p>
                  <button
                    onClick={() => { resetTopUp(); setShowTopUp(false); }}
                    className="px-6 py-2.5 bg-green-600 text-white rounded-full font-semibold text-sm hover:bg-green-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── M-Pesa Withdrawal Card ───────────────────────────────────── */}
        <div className="bg-gradient-to-br from-orange-600/10 via-red-500/5 to-transparent border border-orange-600/20 rounded-2xl overflow-hidden">
          {/* Header row */}
          <button
            onClick={() => { resetWithdraw(); setShowWithdraw(v => !v); }}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-orange-500/5 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-orange-600/15 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-base">Withdraw via M-Pesa</p>
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
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{wPollMsg}</span>
                    </div>
                  )}

                  {/* KES presets */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Amount (KES)</p>
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {[500, 1000, 2500, 5000].map(kes => {
                        const maxKes = Math.floor(Number(wallet?.balance ?? 0) * USD_TO_KES);
                        const disabled = kes > maxKes;
                        return (
                          <button
                            key={kes}
                            onClick={() => !disabled && setWKes(String(kes))}
                            disabled={disabled}
                            className={`py-2.5 rounded-xl font-bold text-xs border-2 transition-all flex flex-col items-center ${
                              wKes === String(kes)
                                ? 'border-orange-600 bg-orange-600/10 text-orange-700 dark:text-orange-400'
                                : disabled
                                  ? 'border-border opacity-30 cursor-not-allowed'
                                  : 'border-border hover:border-orange-600/40 hover:bg-orange-600/5'
                            }`}
                          >
                            <span className="text-[11px] font-black">KES {kes.toLocaleString()}</span>
                            <span className="text-[9px] font-normal opacity-60">${(kes / USD_TO_KES).toFixed(2)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="number"
                      min="10"
                      step="10"
                      placeholder="Custom KES amount…"
                      value={wKes}
                      onChange={e => setWKes(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                    {wKes && parseFloat(wKes) > 0 && (
                      <p className="text-xs text-orange-600 font-semibold mt-1">
                        ≈ ${(parseFloat(wKes) / USD_TO_KES).toFixed(2)} will be deducted from wallet
                      </p>
                    )}
                  </div>

                  {/* Phone */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                      <Phone className="w-3 h-3" />Recipient M-Pesa Number
                    </p>
                    <input
                      type="tel"
                      placeholder="0712 345 678"
                      value={wPhone}
                      onChange={e => setWPhone(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Funds sent directly to this M-Pesa number</p>
                  </div>

                  <button
                    onClick={handleWithdraw}
                    disabled={!wKes || !wPhone || parseFloat(wKes) < 10}
                    className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-red-500 text-white rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  >
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
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-red-400 rounded-full transition-all duration-1000"
                      style={{ width: `${Math.min((wPollSecs / 90) * 100, 100)}%` }}
                    />
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
                  <button
                    onClick={() => { resetWithdraw(); setShowWithdraw(false); setWKes(''); }}
                    className="px-6 py-2.5 bg-green-600 text-white rounded-full font-semibold text-sm hover:bg-green-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Full Wallet Dashboard ─────────────────────────────────────── */}
        <WalletDashboard />
      </div>
    </div>
  );
}
