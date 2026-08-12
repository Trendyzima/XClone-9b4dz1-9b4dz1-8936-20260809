import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Shield, X, Loader2, CheckCircle2, Smartphone,
  BarChart3, Star, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';

// ── Shared helpers (re-imported from parent scope via props) ─────────────
const USD_TO_KES = 130;

// ── esbuild-safe module-level constants ──────────────────────────────────
const TWO_FA_DEFAULT_THRESHOLD = 10;
const TWO_FA_AMOUNTS = [5, 10, 25, 50];

const BUDGET_CATEGORIES_LIST = ['deposits','withdrawals','transfers','boosts','other'] as const;

const SAVINGS_TIERS = [
  { min: 40, label: 'Super Saver',   emoji: '🌟', color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', msg: "You're in the top tier of savers!" },
  { min: 25, label: 'Great Saver',   emoji: '💚', color: 'text-green-600',   bg: 'bg-green-500/10',   border: 'border-green-500/20',   msg: 'You save a quarter of your deposits. Excellent!' },
  { min: 15, label: 'Good Saver',    emoji: '👍', color: 'text-blue-600',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    msg: 'Consistent saving. Try to push above 25%.' },
  { min: 5,  label: 'Getting There', emoji: '📈', color: 'text-amber-600',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   msg: "You've started saving. Aim for 15% of deposits." },
  { min: 0,  label: 'New Saver',     emoji: '🌱', color: 'text-muted-foreground', bg: 'bg-muted/40', border: 'border-border', msg: 'Move some funds to Savings Pocket to get started!' },
];

type CurrencyCode = 'USD' | 'KES' | 'EUR';

function fmtAmt(usd: number, cur: CurrencyCode): string {
  const rates: Record<CurrencyCode, number> = { USD: 1, KES: 130, EUR: 0.92 };
  const symbols: Record<CurrencyCode, string> = { USD: '$', KES: 'KES ', EUR: '€' };
  const v = usd * (rates[cur] ?? 1);
  return cur === 'KES'
    ? `KES ${Math.round(v).toLocaleString()}`
    : `${symbols[cur]}${v.toFixed(2)}`;
}

// ── Two-Factor Auth Modal ─────────────────────────────────────────────────
export function TwoFAModal({ code, expiry, onVerified, onCancel }: {
  code: string; expiry: number; onVerified: () => void; onCancel: () => void;
}) {
  const [input,     setInput]     = useState('');
  const [countdown, setCountdown] = useState(Math.max(0, Math.ceil((expiry - Date.now()) / 1000)));
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    cdRef.current = setInterval(() => {
      const r = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
      setCountdown(r);
      if (r <= 0) { if (cdRef.current) clearInterval(cdRef.current); onCancel(); }
    }, 1000);
    return () => { if (cdRef.current) clearInterval(cdRef.current); };
  }, [expiry, onCancel]);
  const verify = () => {
    if (Date.now() > expiry) { toast.error('Code expired'); onCancel(); return; }
    if (input.trim() === code) { onVerified(); }
    else { toast.error('Incorrect code. Check your Wallet Notifications.'); setInput(''); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-card border border-border rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0"><Shield className="w-5 h-5 text-blue-600" /></div>
          <div className="flex-1">
            <p className="font-bold text-sm">Two-Factor Verification</p>
            <p className="text-xs text-muted-foreground">Check Wallet Notifications for your 6-digit code</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-full hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4">
          <div className="text-center p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <p className="text-xs text-blue-600 font-semibold">Expires in {Math.floor(countdown/60)}:{String(countdown%60).padStart(2,'0')}</p>
          </div>
          <input type="text" inputMode="numeric" maxLength={6} placeholder="000000"
            value={input} onChange={e => setInput(e.target.value.replace(/\D/g,'').slice(0,6))}
            onKeyDown={e => { if (e.key === 'Enter' && input.length === 6) verify(); }}
            className="w-full h-12 px-3 rounded-xl border border-border bg-background text-xl font-mono font-black text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30 tracking-widest" />
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onCancel} className="py-3 border border-border rounded-xl font-semibold text-sm hover:bg-muted">Cancel</button>
            <button onClick={verify} disabled={input.length !== 6}
              className="py-3 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors">Verify</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Two-Factor Auth Setup Card ────────────────────────────────────────────
export function TwoFASetupCard({ userId }: { userId: string }) {
  const key2fa = useMemo(() => `ts-2fa-${userId}`, [userId]);
  const [enabled,   setEnabled]   = useState(false);
  const [threshold, setThreshold] = useState(TWO_FA_DEFAULT_THRESHOLD);
  const [saved,     setSaved]     = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key2fa);
      if (raw) { const v = JSON.parse(raw); setEnabled(v.enabled ?? false); setThreshold(v.threshold ?? TWO_FA_DEFAULT_THRESHOLD); }
    } catch { /* ignore */ }
  }, [key2fa]);
  const save = () => {
    localStorage.setItem(key2fa, JSON.stringify({ enabled, threshold }));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    toast.success(enabled ? `2FA enabled for withdrawals over $${threshold}` : '2FA disabled');
  };
  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className={`w-4 h-4 ${enabled ? 'text-blue-600' : 'text-muted-foreground'}`} />
            <h3 className="font-bold text-sm">Two-Factor Auth (2FA)</h3>
            {enabled && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-bold border border-blue-500/20">Active</span>}
          </div>
          <button onClick={() => setEnabled(v => !v)} className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
        {enabled ? (
          <>
            <p className="text-xs text-muted-foreground mb-3">A 6-digit code is sent to Wallet Notifications before large withdrawals.</p>
            <div className="mb-3">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Trigger threshold (USD)</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {TWO_FA_AMOUNTS.map(v => (
                  <button key={v} onClick={() => setThreshold(v)}
                    className={`py-2 rounded-xl font-bold text-xs border-2 transition-all ${threshold === v ? 'border-blue-600 bg-blue-600/10 text-blue-700' : 'border-border hover:border-blue-600/30'}`}>${v}</button>
                ))}
              </div>
              <input type="number" min="1" step="1" placeholder="Custom…"
                value={!TWO_FA_AMOUNTS.includes(threshold) ? threshold : ''}
                onChange={e => setThreshold(parseFloat(e.target.value) || TWO_FA_DEFAULT_THRESHOLD)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground mb-3">Require a one-time code (sent to Wallet Notifications) before large withdrawals.</p>
        )}
        <button onClick={save} className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
          {saved ? <CheckCircle2 className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save 2FA Settings'}
        </button>
      </div>
    </div>
  );
}

// ── M-Pesa Payment History Tab ────────────────────────────────────────────
interface ReceiptModalProps { tx: any; currency: CurrencyCode; onClose: () => void; }
function InlineReceiptModal({ tx, currency, onClose }: ReceiptModalProps) {
  const [copied, setCopied] = useState(false);
  const kesAmount = useMemo(() => Math.round(Number(tx.amount) * USD_TO_KES), [tx.amount]);
  const copyReceipt = () => {
    const text = ['M-Pesa Receipt', `Amount: KES ${kesAmount.toLocaleString()} (${fmtAmt(Number(tx.amount), currency)})`,
      tx.reference ? `Receipt: ${tx.reference}` : '', `Date: ${new Date(tx.created_at).toLocaleString()}`, `Status: ${tx.status}`].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text).then(() => { setCopied(true); toast.success('Copied!'); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-green-600" /></div>
            <div><p className="font-bold text-sm">M-Pesa Receipt</p><p className="text-xs text-muted-foreground">Deposit confirmation</p></div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="text-center py-3 bg-green-500/5 border border-green-500/20 rounded-2xl mb-4">
          <p className="text-xs text-muted-foreground mb-1">Amount Deposited</p>
          <p className="text-3xl font-black text-green-600">+{fmtAmt(Number(tx.amount), currency)}</p>
          <p className="text-sm text-muted-foreground mt-0.5">KES {kesAmount.toLocaleString()}</p>
        </div>
        <div className="space-y-2.5 divide-y divide-border mb-4">
          {tx.reference && (
            <div className="flex justify-between items-center pt-2.5">
              <span className="text-xs text-muted-foreground">Safaricom Receipt</span>
              <span className="font-mono text-xs font-black">{tx.reference}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2.5">
            <span className="text-xs text-muted-foreground">Date &amp; Time</span>
            <span className="text-xs font-semibold">{new Date(tx.created_at).toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center pt-2.5">
            <span className="text-xs text-muted-foreground">Status</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${tx.status === 'completed' ? 'bg-green-500/10 text-green-600' : 'bg-orange-500/10 text-orange-600'}`}>{tx.status}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={copyReceipt} className="flex-1 flex items-center justify-center gap-2 py-3 border border-border rounded-xl font-semibold text-sm hover:bg-muted transition-colors">
            {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <span className="text-sm">📋</span>}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={onClose} className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">Done</button>
        </div>
      </div>
    </div>
  );
}

export function MpesaPaymentHistory({ userId, currency }: { userId: string; currency: CurrencyCode }) {
  const [txns,     setTxns]     = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  useEffect(() => {
    setLoading(true);
    supabase.from('wallet_transactions').select('*')
      .eq('user_id', userId).eq('type', 'deposit').eq('payment_method', 'mpesa')
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { setTxns(data ?? []); setLoading(false); });
  }, [userId]);
  const { totalKes, totalUsd } = useMemo(() => ({
    totalKes: Math.round(txns.reduce((s, t) => s + Number(t.amount), 0) * USD_TO_KES),
    totalUsd: txns.reduce((s, t) => s + Number(t.amount), 0),
  }), [txns]);
  return (
    <div className="space-y-4">
      {selected && <InlineReceiptModal tx={selected} currency={currency} onClose={() => setSelected(null)} />}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20">
          <p className="text-xs text-muted-foreground mb-1">Total via M-Pesa</p>
          <p className="text-xl font-black text-green-600">{fmtAmt(totalUsd, currency)}</p>
          <p className="text-[10px] text-muted-foreground">KES {totalKes.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
          <p className="text-xs text-muted-foreground mb-1">Transactions</p>
          <p className="text-xl font-black text-blue-600">{txns.length}</p>
          <p className="text-[10px] text-muted-foreground">M-Pesa deposits</p>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : txns.length === 0 ? (
        <div className="text-center py-12">
          <Smartphone className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="font-semibold text-sm">No M-Pesa deposits yet</p>
          <p className="text-xs text-muted-foreground mt-1">Deposit via M-Pesa to see receipts here</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">M-Pesa Deposits ({txns.length})</p>
          {txns.map(tx => (
            <button key={tx.id} onClick={() => setSelected(tx)}
              className="w-full p-4 border border-border rounded-2xl bg-card hover:border-green-500/40 hover:bg-green-500/5 transition-all text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm text-green-700 dark:text-green-400">+{fmtAmt(Number(tx.amount), currency)}</p>
                    {tx.reference && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 font-bold border border-green-500/20">Receipt</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">KES {Math.round(Number(tx.amount) * USD_TO_KES).toLocaleString()} · {new Date(tx.created_at).toLocaleDateString()}</p>
                  {tx.reference && <p className="text-[10px] font-mono text-muted-foreground/70">{tx.reference}</p>}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${tx.status === 'completed' ? 'bg-green-500/10 text-green-600' : 'bg-orange-500/10 text-orange-600'}`}>{tx.status}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Wallet Budget Planner ─────────────────────────────────────────────────
export function WalletBudgetPlanner({ userId, currency }: { userId: string; currency: CurrencyCode }) {
  const budgetKey = useMemo(() => `ts-budget-${userId}`, [userId]);
  const [budgets,    setBudgets]    = useState<Record<string, number>>({});
  const [txns,       setTxns]       = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editVal,    setEditVal]    = useState('');
  useEffect(() => {
    try { const raw = localStorage.getItem(budgetKey); if (raw) setBudgets(JSON.parse(raw)); } catch { /* ignore */ }
  }, [budgetKey]);
  useEffect(() => {
    setLoading(true);
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    supabase.from('wallet_transactions').select('type,amount,description').eq('user_id', userId)
      .gte('created_at', since.toISOString())
      .then(({ data }) => { setTxns(data ?? []); setLoading(false); });
  }, [userId]);
  const spending = useMemo(() => {
    const map: Record<string, number> = { deposits: 0, withdrawals: 0, transfers: 0, boosts: 0, other: 0 };
    txns.forEach(t => {
      const amt = Number(t.amount);
      if      (t.type === 'deposit')                                            map.deposits    += amt;
      else if (t.type === 'withdrawal')                                         map.withdrawals += amt;
      else if (t.type === 'transfer')                                           map.transfers   += amt;
      else if ((t.description ?? '').toLowerCase().includes('boost'))          map.boosts      += amt;
      else                                                                      map.other       += amt;
    });
    return map;
  }, [txns]);
  const monthLabel = useMemo(() => new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' }), []);
  const saveBudget = (cat: string, val: string) => {
    const v = parseFloat(val);
    if (isNaN(v) || v < 0) { setEditingCat(null); return; }
    const next = { ...budgets, [cat]: v };
    setBudgets(next); localStorage.setItem(budgetKey, JSON.stringify(next));
    setEditingCat(null); setEditVal('');
    toast.success(`Budget for ${cat}: ${fmtAmt(v, currency)}/month`);
    const spent = spending[cat] ?? 0;
    if (v > 0 && spent >= v * 0.9) {
      supabase.from('platform_inbox').insert({ user_id: userId,
        subject: `Budget Alert: ${cat} at ${Math.round((spent/v)*100)}%`,
        body: `You've spent ${fmtAmt(spent, currency)} of your ${fmtAmt(v, currency)} ${cat} budget this month.`,
        type: 'warning', icon_emoji: '⚠️',
      }).then(() => {});
    }
  };
  return (
    <div className="border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-border">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="font-bold text-sm">Budget Planner</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">{monthLabel}</span>
      </div>
      {loading ? (<div className="flex justify-center p-5"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>) : (
        <div className="divide-y divide-border">
          {BUDGET_CATEGORIES_LIST.map(cat => {
            const spent = spending[cat] ?? 0;
            const limit = budgets[cat] ?? 0;
            const pct  = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
            const over = limit > 0 && spent >= limit;
            const near = limit > 0 && pct >= 90 && !over;
            return (
              <div key={cat} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="font-semibold text-sm capitalize">{cat}</p>
                  <div className="flex items-center gap-2">
                    {limit > 0 && <span className={`text-xs font-bold ${over ? 'text-red-500' : near ? 'text-amber-500' : 'text-muted-foreground'}`}>{fmtAmt(spent, currency)} / {fmtAmt(limit, currency)}</span>}
                    <button onClick={() => { setEditingCat(editingCat === cat ? null : cat); setEditVal(limit > 0 ? String(limit) : ''); }}
                      className="text-[10px] text-primary font-semibold hover:underline">{limit > 0 ? 'Edit' : 'Set'}</button>
                  </div>
                </div>
                {editingCat === cat && (
                  <div className="flex gap-2 mb-2">
                    <input type="number" min="0" step="0.01" placeholder="Monthly limit (USD)…" value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveBudget(cat, editVal); if (e.key === 'Escape') setEditingCat(null); }}
                      className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40" />
                    <button onClick={() => saveBudget(cat, editVal)} className="px-3 h-9 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90">Save</button>
                    <button onClick={() => setEditingCat(null)} className="px-2 h-9 border border-border rounded-lg text-xs hover:bg-muted">✕</button>
                  </div>
                )}
                {limit > 0 ? (
                  <div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : near ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {over && <p className="text-[10px] text-red-500 font-semibold mt-0.5">Over budget!</p>}
                    {near && !over && <p className="text-[10px] text-amber-500 font-semibold mt-0.5">90% of budget used</p>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{fmtAmt(spent, currency)} spent · no limit set</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Friend Balance Comparison (Savings Score) ─────────────────────────────
export function FriendBalanceComparison({ savingsBalance, totalDeposited, currency }: {
  savingsBalance: number; totalDeposited: number; currency: CurrencyCode;
}) {
  const { tier, rate, tips } = useMemo(() => {
    const rate = totalDeposited > 0 ? (savingsBalance / totalDeposited) * 100 : 0;
    const tier = SAVINGS_TIERS.find(t => rate >= t.min) ?? SAVINGS_TIERS[SAVINGS_TIERS.length - 1];
    const tipList = [
      rate < 15 ? `Save 15% of deposits (${fmtAmt(totalDeposited * 0.15, currency)})` : null,
      rate < 25 ? 'Auto-transfer a fixed amount to Savings Pocket after each deposit' : null,
      savingsBalance < 50 ? 'Build a $50 savings buffer first' : null,
      rate >= 25 ? 'Link your Savings Pocket to a Goal for structured saving' : null,
    ].filter(Boolean) as string[];
    return { tier, rate, tips: tipList };
  }, [savingsBalance, totalDeposited, currency]);
  return (
    <div className={`rounded-2xl border ${tier.border} overflow-hidden`}>
      <div className={`px-4 py-3 flex items-center gap-2 border-b ${tier.border} ${tier.bg}`}>
        <span className="text-xl">{tier.emoji}</span>
        <div><h3 className="font-bold text-sm">Savings Score</h3><p className={`text-xs font-bold ${tier.color}`}>{tier.label}</p></div>
        <div className="ml-auto text-right">
          <p className={`text-2xl font-black ${tier.color}`}>{rate.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground">of deposits saved</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Savings rate</span>
            <span className={`font-bold ${tier.color}`}>{rate.toFixed(1)}%{rate >= 25 ? ' ✓' : ''}</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${rate >= 25 ? 'bg-emerald-500' : rate >= 15 ? 'bg-blue-500' : rate >= 5 ? 'bg-amber-500' : 'bg-muted-foreground'}`}
              style={{ width: `${Math.min(rate * 2, 100)}%` }} />
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
            <span>0%</span><span>15%</span><span>25%</span><span>50%</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{tier.msg}</p>
        {tips.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold">Tips to improve:</p>
            {tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="text-primary shrink-0 mt-0.5">→</span><span>{tip}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="p-2.5 bg-muted/30 rounded-xl text-center">
            <p className="text-xs text-muted-foreground">Saved</p>
            <p className="font-black text-sm text-emerald-600">{fmtAmt(savingsBalance, currency)}</p>
          </div>
          <div className="p-2.5 bg-muted/30 rounded-xl text-center">
            <p className="text-xs text-muted-foreground">Total Deposited</p>
            <p className="font-black text-sm">{fmtAmt(totalDeposited, currency)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 2FA check helper (OTP_EXPIRY_MS for WalletPage) ──────────────────────
export const WALLET_EXTRAS_OTP_EXPIRY_MS = 5 * 60 * 1000;
