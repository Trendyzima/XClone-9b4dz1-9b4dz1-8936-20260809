import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface PremiumStatus {
  isActive: boolean;
  plan: 'monthly' | 'annual' | null;
  expiresAt: Date | null;
  loading: boolean;
}

// Global cache so all components share one fetch
let cachedStatus: PremiumStatus | null = null;
let listeners: Array<(s: PremiumStatus) => void> = [];

function notify(s: PremiumStatus) {
  cachedStatus = s;
  listeners.forEach(fn => fn(s));
}

export function usePremium(): PremiumStatus & { refresh: () => Promise<void> } {
  const { user } = useAuth();
  const [status, setStatus] = useState<PremiumStatus>(
    cachedStatus ?? { isActive: false, plan: null, expiresAt: null, loading: true }
  );

  const refresh = useCallback(async () => {
    if (!user) {
      const s = { isActive: false, plan: null, expiresAt: null, loading: false };
      notify(s);
      setStatus(s);
      return;
    }

    // Auto-expire stale subscriptions on check
    await supabase.rpc('expire_premium_subscriptions').catch(() => {});

    const { data } = await supabase
      .from('premium_subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    const isActive = !!data && new Date(data.expires_at) > new Date();
    const s: PremiumStatus = {
      isActive,
      plan: isActive ? (data!.plan as 'monthly' | 'annual') : null,
      expiresAt: isActive ? new Date(data!.expires_at) : null,
      loading: false,
    };
    notify(s);
    setStatus(s);
  }, [user?.id]);

  useEffect(() => {
    const handler = (s: PremiumStatus) => setStatus(s);
    listeners.push(handler);

    // Only fetch if no cache or user changed
    if (!cachedStatus || cachedStatus.loading) {
      refresh();
    } else {
      setStatus(cachedStatus);
    }

    return () => {
      listeners = listeners.filter(l => l !== handler);
    };
  }, [refresh]);

  return { ...status, refresh };
}

// Reset cache on sign-out
export function resetPremiumCache() {
  cachedStatus = null;
}
