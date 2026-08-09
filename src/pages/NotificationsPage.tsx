
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import {
  Heart, Repeat2, UserPlus, MessageCircle, AtSign,
  BadgeCheck, Loader2, DollarSign, CheckCircle2, Smartphone,
  TrendingUp, Bell, CreditCard, ArrowDownLeft, Globe, UserCheck,
  Star, ExternalLink, RefreshCw, Flame, Trophy, Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useFediversePolling } from '@/hooks/useFediversePolling';

const PAGE_SIZE = 20;

type NotifTab = 'all' | 'mentions' | 'payments' | 'fediverse';

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NotifTab>('all');
  const [page, setPage] = useState(0);

  // Live Fediverse inbox polling (30s interval)
  const { notifs: fedNotifs, loading: fedLoading, lastPolled, refresh: refreshFed } =
    useFediversePolling(activeTab === 'fediverse' ? user?.id : null);

  const fetchNotifications = async (pageNum = 0) => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('notifications')
        .select('*, from_user:user_profiles!notifications_from_user_id_fkey(*), post:posts(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (activeTab === 'mentions') {
        query = query.eq('type', 'mention');
      } else if (activeTab === 'payments') {
        query = query.in('type', [
          'payment_success', 'payment_sent', 'payment_failed',
          'payout_sent', 'deposit_confirmed', 'boost_activated',
        ]);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (pageNum === 0) setNotifications(data ?? []);
      else setNotifications(prev => [...prev, ...(data ?? [])]);
      setPage(pageNum);
    } catch (err) {
      console.error('[notifications] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    if (!user) return;
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (activeTab !== 'fediverse') {
      fetchNotifications(0);
      markAsRead();
    }
  }, [user, activeTab, navigate]); // Added navigate to dependency array

  const loadMore = async (): Promise<boolean> => {
    if (activeTab === 'fediverse') return false;
    const nextPage = page + 1;
    await fetchNotifications(nextPage);
    // The original code was `return notifications.length % PAGE_SIZE === 0;` which is likely incorrect
    // as `notifications` is state from *before* `fetchNotifications` resolves.
    // It should check the *newly fetched* data or rely on a different condition.
    // However, since the error is about a missing ESLint rule definition and not runtime logic,
    // I'm preserving the original logic here, but noting its potential issue.
    // A more robust check might involve comparing `data.length` from `fetchNotifications`
    // or passing the new page's data length back.
    return notifications.length % PAGE_SIZE === 0;
  };

  const { lastElementRef, loading: loadingMore } = useInfiniteScroll(loadMore);

  // ── Icon helpers ────────────────────────────────────────────────────────────
  const getIcon = (type: string) => {
    switch (type) {
      case 'like':              return <Heart className="w-8 h-8 text-pink-600" fill="currentColor" />;
      case 'repost':            return <Repeat2 className="w-8 h-8 text-green-500" />;
      case 'follow':            return <UserPlus className="w-8 h-8 text-primary" />;
      case 'reply':             return <MessageCircle className="w-8 h-8 text-primary" />;
      case 'mention':           return <AtSign className="w-8 h-8 text-primary" />;
      case 'payment_success':
      case 'deposit_confirmed': return <CheckCircle2 className="w-8 h-8 text-green-600" />;
      case 'payment_sent':
      case 'payout_sent':       return <ArrowDownLeft className="w-8 h-8 text-blue-600" />;
      case 'payment_failed':    return <CreditCard className="w-8 h-8 text-destructive" />;
      case 'boost_activated':   return <TrendingUp className="w-8 h-8 text-purple-600" />;
      case 'streak_milestone':    return <Flame className="w-8 h-8 text-orange-500" />;
      default:                  return <Bell className="w-8 h-8 text-muted-foreground" />;
    }
  };

  const getText = (n: any) => {
    const username = n.from_user?.username ?? 'Someone';
    const meta = n.metadata ?? {};
    switch (n.type) {
      case 'like':              return `${username} liked your post`;
      case 'repost':            return `${username} reposted your post`;
      case 'follow':            return `${username} followed you`;
      case 'reply':             return `${username} replied to your post`;
      case 'mention':           return `${username} mentioned you`;
      case 'payment_success':
        return meta.message ?? `M-Pesa payment of KES ${meta.amount ?? ''} confirmed`;
      case 'deposit_confirmed':
        return `Deposit of KES ${meta.kes_amount ?? meta.amount ?? ''} confirmed · Receipt: ${meta.receipt ?? ''}`;
      case 'payment_sent':
        if (meta.purpose === 'creator_payout')
          return `Creator payout of $${meta.amount} (KES ${meta.kes_amount}) sent to ${meta.phone}`;
        if (meta.purpose === 'paypal_withdrawal')
          return `PayPal withdrawal of $${meta.amount} submitted to ${meta.email}`;
        return `Payment of $${meta.amount} sent`;
      case 'payout_sent':
        return `Payout of $${meta.amount} sent via ${meta.method ?? 'M-Pesa'}`;
      case 'payment_failed':
        return `Payment failed — ${meta.reason ?? 'please try again'}`;
      case 'boost_activated':
        return `Your post boost is now active · Est. reach: ${(meta.estimated_reach ?? 0).toLocaleString()}`;
      case 'streak_milestone': {
        const day = meta?.streak_day ?? n.from_user_id ? undefined : undefined;
        if (n.from_user_id === user?.id) {
          // Self-generated milestone
          return day === 7
            ? '🏆 You hit a 7-day max streak! Keep it going!'
            : `🔥 You hit a ${day ?? ''}‑day streak milestone! Congrats!`;
        }
        return '🔥 Streak milestone reached!';
      }
      default:                  return 'New notification';
    }
  };

  const isPaymentType = (type: string) =>
    ['payment_success', 'payment_sent', 'payment_failed', 'payout_sent', 'deposit_confirmed', 'boost_activated'].includes(type);

  const getStreakMilestoneDay = (n: any): number => {
    // Infer milestone from the notification row; we stored type='streak_milestone'
    // and from_user_id === user.id so we check the daily_rewards table lazily via metadata
    return n.metadata?.streak_day ?? 0;
  };

  const getNotifBg = (type: string) => {
    if (['payment_success', 'deposit_confirmed'].includes(type)) return 'bg-green-50/50 dark:bg-green-900/10';
    if (['payment_sent', 'payout_sent'].includes(type)) return 'bg-blue-50/50 dark:bg-blue-900/10';
    if (type === 'payment_failed') return 'bg-red-50/50 dark:bg-red-900/10';
    if (type === 'boost_activated') return 'bg-purple-50/50 dark:bg-purple-900/10';
    if (type === 'streak_milestone') return 'bg-orange-50/60 dark:bg-orange-900/10';
    return '';
  };

  // ── Fediverse notification helpers ──────────────────────────────────────────
  const getFedIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'follow':    return <UserCheck className="w-6 h-6 text-purple-500" />;
      case 'like':
      case 'favourite': return <Star className="w-6 h-6 text-yellow-500" />;
      case 'boost':
      case 'announce':  return <Repeat2 className="w-6 h-6 text-green-500" />;
      case 'mention':   return <AtSign className="w-6 h-6 text-primary" />;
      case 'create':    return <MessageCircle className="w-6 h-6 text-primary" />;
      default:          return <Globe className="w-6 h-6 text-purple-400" />;
    }
  };

  const getFedText = (n: any) => {
    const actor = n.actor_url ?? n.account?.url ?? 'A remote user';
    const actorShort = actor.replace(/https?:\/\//, '').split('/').pop() ?? actor;
    const type = (n.activity_type ?? n.type ?? '').toLowerCase();
    switch (type) {
      case 'follow':    return `${actorShort} followed you from the Fediverse`;
      case 'like':
      case 'favourite': return `${actorShort} favourited your post`;
      case 'boost':
      case 'announce':  return `${actorShort} boosted your post`;
      case 'mention':   return `${actorShort} mentioned you`;
      case 'create':    return `${actorShort} replied to your post`;
      default:          return `${actorShort} interacted with you`;
    }
  };

  if (!user) return null;

  const tabs: { key: NotifTab; label: string }[] = [
    { key: 'all',       label: 'All'       },
    { key: 'mentions',  label: 'Mentions'  },
    { key: 'payments',  label: 'Payments'  },
    { key: 'fediverse', label: 'Fediverse' },
  ];

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Notifications" />

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="flex items-center">
          <div className="flex flex-1 overflow-x-auto scrollbar-hide">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 min-w-[80px] py-4 font-semibold transition-colors border-b-2 text-sm whitespace-nowrap ${
                  activeTab === key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {activeTab !== 'fediverse' && notifications.some(n => !n.read) && (
            <button
              onClick={markAllAsRead}
              className="shrink-0 px-3 mr-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 rounded-full transition-colors whitespace-nowrap flex items-center gap-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {(activeTab === 'fediverse' ? fedLoading && fedNotifs.length === 0 : loading) ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : activeTab === 'fediverse' ? (
        /* ── Fediverse Notifications (live polled) ── */
        <div>
          {/* Polling status bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-purple-500/5 border-b border-purple-500/10 text-xs text-purple-500">
            <span className="flex items-center gap-1.5">
              <Globe className="w-3 h-3" />
              Live · polls every 30s
              {lastPolled && (
                <span className="text-muted-foreground">
                  · last {formatDistanceToNow(lastPolled, { addSuffix: true })}
                </span>
              )}
            </span>
            <button
              onClick={refreshFed}
              className="flex items-center gap-1 hover:text-purple-700 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${fedLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {fedNotifs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground px-6">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No Fediverse notifications yet</p>
              <p className="text-sm mt-1">Follows, likes, and boosts from Mastodon/Misskey appear here</p>
              <button
                onClick={() => navigate('/fediverse')}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium"
              >
                Go to Fediverse
              </button>
            </div>
          ) : (
            fedNotifs.map((n: any, idx: number) => (
              <div
                key={n.id ?? idx}
                className="border-b border-border p-4 hover:bg-purple-500/5 transition-colors"
              >
                <div className="flex gap-3 items-start">
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    {getFedIcon(n.activity_type ?? n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{getFedText(n)}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-purple-500">
                        <Globe className="w-3 h-3" />
                        Fediverse
                      </span>
                      {n.created_at && (
                        <span className="text-xs text-muted-foreground">
                          · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    {(n.actor_url ?? n.account?.url) && (
                      <a
                        href={n.actor_url ?? n.account?.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View actor
                      </a>
                    )}
                  </div>
                  {!n.processed && (
                    <div className="w-2.5 h-2.5 bg-purple-500 rounded-full flex-shrink-0 mt-1" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── Local Notifications ── */
        notifications.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            {activeTab === 'payments' ? (
              <>
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="font-semibold">No payment notifications yet</p>
                <p className="text-sm mt-1">Deposits, payouts, and boosts will appear here</p>
              </>
            ) : (
              <>
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="font-semibold">No notifications yet</p>
                <p className="text-sm mt-1">When you get notifications, they'll show up here</p>
              </>
            )}
          </div>
        ) : (
          <div>
            {notifications.map((n: any, idx: number) =>
              n.type === 'streak_milestone' ? (
                <div
                  key={n.id}
                  ref={idx === notifications.length - 1 ? lastElementRef : null}
                  onClick={() => navigate('/daily-rewards')}
                  className="border-b border-orange-200/40 dark:border-orange-900/20 p-4 cursor-pointer transition-colors bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent hover:from-orange-500/15"
                >
                  <div className="flex gap-3 items-start">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-orange-500/20">
                      <Flame className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                        <span className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wide">Streak Milestone</span>
                        {!n.read && <span className="ml-auto w-2 h-2 bg-orange-500 rounded-full" />}
                      </div>
                      <p className="font-semibold text-sm text-foreground">{getText(n)}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500/15 border border-orange-500/20">
                          <Zap className="w-3 h-3 text-orange-500" />
                          <span className="text-xs font-bold text-orange-600 dark:text-orange-400">Keep it up!</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  key={n.id}
                  ref={idx === notifications.length - 1 ? lastElementRef : null}
                  onClick={() => {
                    if (n.post_id) navigate(`/post/${n.post_id}`);
                    else if (n.from_user_id && !isPaymentType(n.type))
                      navigate(`/profile/${n.from_user?.username}`);
                    else if (isPaymentType(n.type)) navigate('/wallet');
                  }}
                  className={`border-b border-border p-4 hover:bg-muted/5 cursor-pointer transition-colors ${getNotifBg(n.type)}`}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 pt-1">{getIcon(n.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        {isPaymentType(n.type) ? (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            ['payment_success', 'deposit_confirmed'].includes(n.type)
                              ? 'bg-green-100 dark:bg-green-900/30'
                              : n.type === 'boost_activated'
                              ? 'bg-purple-100 dark:bg-purple-900/30'
                              : 'bg-blue-100 dark:bg-blue-900/30'
                          }`}>
                            <Smartphone className="w-4 h-4 text-green-600" />
                          </div>
                        ) : n.from_user?.avatar_url ? (
                          <img
                            src={n.from_user.avatar_url}
                            alt={n.from_user.username}
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                            {n.from_user?.username?.[0]?.toUpperCase() ?? '?'}
                          </div>
                        )}
                        <div className="flex-1">
                          {!isPaymentType(n.type) && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="font-bold">{n.from_user?.username}</span>
                              {n.from_user?.verified && (
                                <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />
                              )}
                            </div>
                          )}
                          <p className={`text-sm ${isPaymentType(n.type) ? 'font-medium' : 'text-muted-foreground'}`}>
                            {getText(n)}
                          </p>
                          {n.post?.content && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {n.post.content}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {!n.read && (
                          <div className="w-2.5 h-2.5 bg-primary rounded-full shrink-0 mt-1" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}
            {loadingMore && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
