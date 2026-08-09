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
  Phone, Zap, ArrowDownLeft, X
} from 'lucide-react';
import { Input } from '@/components/ui/input';

const USD_TO_KES = 130;

type TopUpStep = 'idle' | 'sending' | 'polling' | 'success' | 'failed';

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

  // Pre-fill phone from saved wallet info
  useEffect(() => {
    if (wallet?.mpesa_phone && !phone) setPhone(wallet.mpesa_phone);
  }, [wallet]);

  useEffect(() => {
    showBanner(ADMOB_CONFIG.BANNER_FEED, BannerAdPosition.TOP_CENTER);
    return () => {
      hideBanner();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPoll = (checkoutId: string) => {
    let elapsed = 0;
    setPollSecs(0);
    setPollMsg('Check your phone and enter your M-Pesa PIN…');
    setStep('polling');

    pollRef.current = setInterval(async () => {
      elapsed += 5;
      setPollSecs(elapsed);

      if (elapsed >= 90) {
        clearInterval(pollRef.current!);
        setStep('failed');
        setPollMsg('Verification timed out. If you paid, funds will appear shortly.');
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('mpesa-stk-status', {
          body: { checkout_request_id: checkoutId },
        });

        if (data?.status === 'completed') {
          clearInterval(pollRef.current!);
          // Credit wallet via RPC
          await supabase.rpc('add_to_wallet', {
            p_user_id: user!.id,
            p_amount: parseFloat(amount),
          }).catch(() => {});
          await fetchWallet();
          setStep('success');
          setPollMsg(`KES ${Math.ceil(parseFloat(amount) * USD_TO_KES).toLocaleString()} received! Your wallet has been topped up.`);
          toast.success(`Wallet topped up! +$${parseFloat(amount).toFixed(2)}`);
          setAmount('');
        } else if (data?.status === 'failed' || data?.status === 'cancelled') {
          clearInterval(pollRef.current!);
          setStep('failed');
          setPollMsg('Payment was cancelled or failed. Please try again.');
        }
      } catch { /* keep polling */ }
    }, 5000);
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
      startPoll(data.checkout_request_id);
    } catch (err: any) {
      setStep('failed');
      setPollMsg(err.message || 'Failed to initiate top-up. Try again.');
      toast.error(err.message || 'Failed to initiate top-up');
    }
  };

  const resetTopUp = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep('idle');
    setPollMsg('');
    setPollSecs(0);
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
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {[5, 10, 20, 50].map(v => (
                        <button
                          key={v}
                          onClick={() => setAmount(String(v))}
                          className={`py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                            amount === String(v)
                              ? 'border-green-600 bg-green-600/10 text-green-700 dark:text-green-400'
                              : 'border-border hover:border-green-600/40 hover:bg-green-600/5'
                          }`}
                        >
                          ${v}
                        </button>
                      ))}
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
                    <p className="text-xs text-muted-foreground">{pollSecs}s elapsed · checking every 5s</p>
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

        {/* ── Full Wallet Dashboard ─────────────────────────────────────── */}
        <WalletDashboard />
      </div>
    </div>
  );
}
