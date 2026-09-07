import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  currency: string;
  total_deposited: number;
  total_withdrawn: number;
  mpesa_phone: string | null;
  paypal_email: string | null;
  created_at: string;
  updated_at: string;
}

export function useWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    if (!user) { setWallet(null); setLoading(false); return; }
    try {
      setLoading(true); setError(null);
      const { data, error: fetchError } = await supabase.from('wallets').select('id,user_id,balance,currency,total_deposited,total_withdrawn,mpesa_phone,paypal_email,created_at,updated_at').eq('user_id', user.id).maybeSingle();
      if (fetchError) throw fetchError;
      if (!data) {
        const { data: created, error: createError } = await supabase.rpc('ensure_user_wallet', { p_user_id: user.id, p_currency: 'USD' });
        if (createError) throw createError;
        setWallet(created as Wallet);
      } else setWallet(data as Wallet);
    } catch (err: any) { console.error('Wallet error:', err); setError(err?.message || 'Wallet unavailable'); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { void fetchWallet(); }, [fetchWallet]);

  const updatePaymentMethods = async (mpesaPhone: string, paypalEmail: string) => {
    if (!user || !wallet) return { success: false, error: 'No wallet found' };
    try {
      const { data, error: updateError } = await supabase.rpc('update_wallet_payment_methods', { p_mpesa_phone: mpesaPhone || null, p_paypal_email: paypalEmail || null });
      if (updateError) throw updateError;
      setWallet(data as Wallet);
      return { success: true };
    } catch (err: any) { console.error('Update payment methods error:', err); return { success: false, error: err?.message || 'Unable to update payment methods' }; }
  };

  return { wallet, loading, error, fetchWallet, updatePaymentMethods };
}
