import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
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

  useEffect(() => {
    if (user) {
      fetchWallet();
    }
  }, [user]);

  const fetchWallet = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('user_wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (fetchError) {
        // If wallet doesn't exist, create one
        if (fetchError.code === 'PGRST116') {
          const { data: newWallet, error: createError } = await supabase
            .from('user_wallets')
            .insert({ user_id: user.id, balance: 0 })
            .select()
            .single();

          if (createError) throw createError;
          setWallet(newWallet);
        } else {
          throw fetchError;
        }
      } else {
        setWallet(data);
      }
    } catch (err: any) {
      console.error('Wallet error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updatePaymentMethods = async (mpesaPhone: string, paypalEmail: string) => {
    if (!user || !wallet) return { success: false, error: 'No wallet found' };

    try {
      const { error: updateError } = await supabase
        .from('user_wallets')
        .update({
          mpesa_phone: mpesaPhone || null,
          paypal_email: paypalEmail || null,
        })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      setWallet(prev => prev ? { ...prev, mpesa_phone: mpesaPhone, paypal_email: paypalEmail } : null);
      return { success: true };
    } catch (err: any) {
      console.error('Update payment methods error:', err);
      return { success: false, error: err.message };
    }
  };

  return {
    wallet,
    loading,
    error,
    fetchWallet,
    updatePaymentMethods,
  };
}
