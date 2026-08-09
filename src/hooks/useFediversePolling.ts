/**
 * useFediversePolling — polls the TestagramGateway for new federated
 * notifications every 30 seconds. Uses local DB as fallback.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import * as federation from '@/api/federation';

export interface FediverseNotif {
  id: string;
  activity_type: string;
  actor_url: string;
  object_url?: string;
  processed: boolean;
  created_at: string;
  // gateway-side fields
  type?: string;
  account?: any;
  status?: any;
}

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export function useFediversePolling(userId: string | undefined | null) {
  const [notifs, setNotifs] = useState<FediverseNotif[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastPolled, setLastPolled] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Try gateway
      const res: any = await federation.getNotifications({ limit: 50 });
      const items: FediverseNotif[] = Array.isArray(res)
        ? res
        : res?.notifications ?? res?.data ?? [];
      setNotifs(items);
    } catch {
      // 2. Fallback: local activitypub_inbox table
      try {
        const { data } = await supabase
          .from('activitypub_inbox')
          .select('*')
          .eq('local_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);
        setNotifs((data ?? []) as FediverseNotif[]);
      } catch {
        // silently ignore
      }
    } finally {
      setLoading(false);
      setLastPolled(new Date());
    }
  }, [userId]);

  // Initial poll + interval
  useEffect(() => {
    if (!userId) return;
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [userId, poll]);

  const unreadCount = notifs.filter(n => !n.processed).length;

  return { notifs, loading, lastPolled, unreadCount, refresh: poll };
}
