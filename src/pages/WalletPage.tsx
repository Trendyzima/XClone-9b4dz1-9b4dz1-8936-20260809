import { useState, useEffect, useRef } from 'react';
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
  Send, Search, UserCheck, Copy, CreditCard, PlusCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';

const USD_TO_KES = 130;

type TopUpStep = 'idle' | 'sending' | 'polling' | 'success' | 'failed';
type WithdrawStep = 'idle' | 'sending' | 'polling' | 'success' | 'failed';
type ActiveTab = 'wallet' | 'history' | 'send';

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

  // ── Receipt screen ────────────────────────────────────────────────────────
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
          <div className="flex items-center gap-3 bg-muted/40 rounded-2xl px-4 py-3 w-full">
            <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
              {receipt.recipient.avatar_url
                ? <img src={receipt.recipient.avatar_url} alt={receipt.recipient.username} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center font-bold">{receipt.recipient.username[0]?.toUpperCase()}</div>}
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-sm">@{receipt.recipient.username}</p>
              {receipt.note && <p className="text-xs text-muted-foreground truncate">Note: {receipt.note}</p>}
            </div>
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
                const text = `Transfer Receipt\nRef: ${receipt.ref}\nAmount: $${receipt.amount.toFixed(2)}\nTo: @${receipt.recipient.username}\nNote: ${receipt.note || 'N/A'}\nTime: ${new Date(receipt.timestamp).toLocaleString()}`;
                navigator.clipboard.writeText(text).then(() => toast.success('Receipt copied!'));
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 border border-border rounded-xl font-semibold text-sm hover:bg-muted transition-colors"
            >
              <Copy className="w-4 h-4" /> Copy Receipt
            </button>
            <button
              onClick={() => setReceipt(null)}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Balance reminder */}
      <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
        <p className="text-sm font-semibold text-muted-foreground">Available to send</p>
        <p className="text-3xl font-black text-primary">${walletBalance.toFixed(2)}</p>
      </div>

      {!selectedUser ? (
        <div className="space-y-3">
          <label className="text-sm font-semibold">Send to user</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={e => searchUsers(e.target.value)}
              placeholder="Search by username…"
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
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
            <input
              type="number" min="0.01" step="0.01"
              placeholder="Custom amount…"
              value={amount && ![1,5,10,25].map(String).includes(amount) ? amount : ''}
              onChange={e => setAmount(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block">Note (optional)</label>
            <input
              type="text" maxLength={100}
              placeholder="What's this for?"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={sending || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > walletBalance}
            className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {sending ? 'Sending…' : `Send $${parseFloat(amount || '0').toFixed(2)} to @${selectedUser.username}`}
          </button>
          {amount && parseFloat(amount) > walletBalance && (
            <p className="text-xs text-red-500 text-center">Amount exceeds your balance of ${walletBalance.toFixed(2)}</p>
          )}
        </div>
      )}

      <div className="bg-muted/30 rounded-2xl p-4 text-xs text-muted-foreground">
        <p><strong>Instant transfers</strong> — funds arrive immediately worldwide. Platform may take a small fee on some transfer types. Transfers cannot be reversed.</p>
      </div>
    </div>
  );
}

// ── Transaction History Tab ───────────────────────────────────────────────
function TransactionHistoryTab({ userId }: { userId: string }) { // Moved TransactionHistoryTab into a function component
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'deposit' | 'withdrawal' | 'earnings'>('all');

  useEffect(() => { fetchTxns(); }, [userId, filter]);

  const fetchTxns = async () => {
    setLoading(true);
    let q = supabase.from('wallet_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
    if (filter !== 'all') q = q.eq('type', filter);
    const { data } = await q;
    setTxns(data ?? []);
    setLoading(false);
  };

  const downloadCSV = () => {
    const headers = ['Date', 'Type', 'Amount', 'Status', 'Method', 'Description'];
    const rows = txns.map(t => [
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

  const totalIn = txns.filter(t => t.type === 'deposit' || t.type === 'earnings').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = txns.filter(t => t.type === 'withdrawal').reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20">
          <p className="text-xs text-muted-foreground mb-1">Total Received</p>
          <p className="text-xl font-black text-green-600">${totalIn.toFixed(2)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-muted-foreground mb-1">Total Sent</p>
          <p className="text-xl font-black text-red-500">${totalOut.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-muted rounded-xl p-1 flex-1">
          {(['all', 'deposit', 'withdrawal', 'earnings'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                filter === f ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}>{f}</button>
          ))}
        </div>
        <button onClick={downloadCSV} className="p-2 border border-border rounded-xl hover:bg-muted transition-colors text-muted-foreground">
          <Download className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : txns.length === 0 ? (
        <div className="text-center py-12">
          <Wallet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold text-sm">No transactions{filter !== 'all' ? ` in "${filter}"` : ''}</p>
          <p className="text-xs text-muted-foreground mt-1">Your transaction history will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {txns.map(tx => {
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
                    tx.status === 'pending' ? 'bg-orange-500/10 text-orange-600' :
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

// ── Direct Card Top-Up (no external payment) ─────────────────────────────
function DirectTopUpCard({ userId, onComplete }: { userId: string; onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const PRESETS = [5, 10, 25, 50];

  const handleAdd = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (amt > 500) { toast.error('Maximum single top-up is $500'); return; }
    setLoading(true);
    const { error } = await supabase.rpc('add_to_wallet', { p_user_id: userId, p_amount: amt });
    setLoading(false);
    if (error) { toast.error(error.message || 'Top-up failed'); return; }
    const { data: w } = await supabase.from('user_wallets').select('id').eq('user_id', userId).single();
    await supabase.from('wallet_transactions').insert({
      wallet_id: w?.id ?? null,
      user_id: userId,
      type: 'deposit',
      amount: amt,
      payment_method: 'card',
      status: 'completed',
      description: `Card top-up — $${amt.toFixed(2)}`,
    });
    toast.success(`$${amt.toFixed(2)} added to your wallet!`);
    onComplete();
    setDone(true);
    setAmount('');
    setTimeout(() => { setDone(false); setOpen(false); }, 2500);
  };

  return (
    <div className="bg-gradient-to-br from-blue-600/10 via-indigo-500/5 to-transparent border border-blue-600/20 rounded-2xl overflow-hidden">
      <button
        onClick={() => { setOpen(v => !v); setDone(false); }}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-blue-500/5 transition-colors"
      >
        <div className="w-10 h-10 rounded-full bg-blue-600/15 flex items-center justify-center shrink-0">
          <CreditCard className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1 text-left">
          <p className="font-bold text-base">Add Funds via Card</p>
          <p className="text-xs text-muted-foreground">Instant deposit — credited immediately to your wallet</p>
        </div>
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-transform ${
          open ? 'border-blue-600 rotate-45' : 'border-muted-foreground/40'
        }`}>
          <span className="text-lg leading-none text-muted-foreground">+</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-blue-600/15 pt-4 space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <p className="font-bold text-green-600">Funds Added!</p>
              <p className="text-sm text-muted-foreground">Your wallet balance has been updated.</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Select Amount</p>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {PRESETS.map(p => (
                    <button
                      key={p}
                      onClick={() => setAmount(String(p))}
                      className={`py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                        amount === String(p)
                          ? 'border-blue-600 bg-blue-600/10 text-blue-700 dark:text-blue-400'
                          : 'border-border hover:border-blue-600/40 hover:bg-blue-600/5'
                      }`}
                    >${p}</button>
                  ))}
                </div>
                <input
                  type="number" min="1" max="500" step="0.01"
                  placeholder="Custom amount (max $500)…"
                  value={amount && !PRESETS.map(String).includes(amount) ? amount : ''}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={loading || !amount || parseFloat(amount) <= 0}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-500 text-white rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                {loading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing…</>
                  : <><PlusCircle className="w-5 h-5" /> Add ${parseFloat(amount || '0').toFixed(2)} to Wallet</>}
              </button>
              <p className="text-[10px] text-muted-foreground text-center">
                Funds are credited instantly. Secure &amp; encrypted.
              </p>
            </>
          )}
        </div>
      )}
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
    if (tab === 'send') return 'send';
    if (tab === 'history') return 'history';
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
  const wPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (wallet?.mpesa_phone) {
      if (!phone)  setPhone(wallet.mpesa_phone);
      if (!wPhone) setWPhone(wallet.mpesa_phone);
    }
  }, [wallet]);

  useEffect(() => {
    return () => { // Cleanup function for effect
      if (pollRef.current)  clearInterval(pollRef.current);
      if (wPollRef.current) clearInterval(wPollRef.current);
      stopBalancePoll();
    };
  }, []);

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
          if (rpcErr) console.warn('[wallet] add_to_wallet RPC error:', rpcErr.message);
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
      if (deductErr) console.warn('[wallet] deduct_from_wallet error:', deductErr.message);
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
          setWPollMsg(`KES ${Math.floor(kesAmt).toLocaleString()} is being sent to your M-Pesa number.`);
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

      {/* ── AdSense banner — wallet page ── */}
      <WalletAdBanner />

      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex max-w-2xl mx-auto">
          {(['wallet', 'send', 'history'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-1 py-3.5 font-semibold text-sm capitalize border-b-2 transition-colors ${
                activeTab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted/40'
              }`}>{t === 'wallet' ? '💳 Wallet' : t === 'send' ? '💸 Send' : '📋 History'}</button>
          ))}
        </div>
      </div>

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
      </div>

      {activeTab === 'wallet' && (
        <div className="max-w-2xl mx-auto p-4 space-y-5">

          {/* ── Instant Card Top-Up (direct RPC, no M-Pesa needed) ───────── */}
          <DirectTopUpCard userId={user!.id} onComplete={fetchWallet} />

          {/* ── Quick Top-Up Card ─────────────────────────────────────────── */}
          <div className="bg-gradient-to-br from-green-600/10 via-emerald-500/5 to-transparent border border-green-600/20 rounded-2xl overflow-hidden">
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
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Amount (USD)</p>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {[
                          { kes: 100, usd: (100 / USD_TO_KES) }, { kes: 500, usd: (500 / USD_TO_KES) },
                          { kes: 1000, usd: (1000 / USD_TO_KES) }, { kes: 5000, usd: (5000 / USD_TO_KES) },
                        ].map(({ kes, usd }) => {
                          const val = usd.toFixed(2);
                          return (
                            <button key={kes} onClick={() => setAmount(val)}
                              className={`py-2.5 rounded-xl font-bold text-xs border-2 transition-all flex flex-col items-center ${
                                amount === val ? 'border-green-600 bg-green-600/10 text-green-700 dark:text-green-400' : 'border-border hover:border-green-600/40 hover:bg-green-600/5'
                              }`}>
                              <span className="text-[11px] font-black">KES {kes.toLocaleString()}</span>
                              <span className="text-[9px] font-normal opacity-60">${usd.toFixed(2)}</span>
                            </button>
                          );
                        })}
                      </div>
                      <Input type="number" min="1" step="0.01" placeholder="Custom amount…" value={amount} onChange={e => setAmount(e.target.value)} className="h-11" />
                      {amount && parseFloat(amount) > 0 && (
                        <p className="text-xs text-green-600 font-semibold mt-1">≈ KES {Math.ceil(parseFloat(amount) * USD_TO_KES).toLocaleString()}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                        <Phone className="w-3 h-3" />M-Pesa Number
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
                      Send STK Push · ${parseFloat(amount || '0').toFixed(2)}
                    </button>
                  </>
                )}
                {step === 'sending' && (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <Loader2 className="w-10 h-10 animate-spin text-green-600" />
                    <p className="font-semibold text-sm">Sending STK Push…</p>
                    <p className="text-xs text-muted-foreground text-center">Connecting to M-Pesa servers</p>
                  </div>
                )}
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

          {/* ── M-Pesa Withdrawal Card ───────────────────────────────────── */}
          <div className="bg-gradient-to-br from-orange-600/10 via-red-500/5 to-transparent border border-orange-600/20 rounded-2xl overflow-hidden">
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
                        <p className="text-xs text-orange-600 font-semibold mt-1">≈ ${(parseFloat(wKes) / USD_TO_KES).toFixed(2)} will be deducted from wallet</p>
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
        </div>
      )}
    </div>
  );
}


