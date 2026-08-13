import { useState, useEffect } from 'react';
import { useSEO } from '@/hooks/useSEO';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bell, Heart, Repeat2, UserPlus, MessageCircle, AtSign,
  DollarSign, TrendingUp, Zap, Globe, Megaphone, Flame,
  Smartphone, Mail, BellRing, Loader2, CheckCircle2, Volume2,
  ShieldCheck, Star, Trophy, Gift,
} from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { PageAdBanner } from '@/components/features/AdSenseAd';

function NotifPrefsAdBanner() { return <PageAdBanner />; }

// ─── Types ────────────────────────────────────────────────────────────────────
interface NotifPref {
  notif_type: string;
  in_app: boolean;
  push: boolean;
  email: boolean;
}

type Channel = 'in_app' | 'push' | 'email';

// esbuild guard: module-level icon helpers — no inline JSX in data arrays
function iconHeart()       { return <Heart       className="w-4 h-4" />; }
function iconRepeat()      { return <Repeat2      className="w-4 h-4" />; }
function iconUserPlus()    { return <UserPlus     className="w-4 h-4" />; }
function iconMessage()     { return <MessageCircle className="w-4 h-4" />; }
function iconAtSign()      { return <AtSign       className="w-4 h-4" />; }
function iconDollar()      { return <DollarSign   className="w-4 h-4" />; }
function iconSmartphone()  { return <Smartphone   className="w-4 h-4" />; }
function iconShield()      { return <ShieldCheck  className="w-4 h-4" />; }
function iconTrending()    { return <TrendingUp   className="w-4 h-4" />; }
function iconMegaphone()   { return <Megaphone    className="w-4 h-4" />; }
function iconGift()        { return <Gift         className="w-4 h-4" />; }
function iconFlame()       { return <Flame        className="w-4 h-4" />; }
function iconTrophy()      { return <Trophy       className="w-4 h-4" />; }
function iconStar()        { return <Star         className="w-4 h-4" />; }
function iconGlobe()       { return <Globe        className="w-4 h-4" />; }
function iconBell()        { return <Bell         className="w-3.5 h-3.5" />; }
function iconBellRing()    { return <BellRing     className="w-3.5 h-3.5" />; }
function iconMail()        { return <Mail         className="w-3.5 h-3.5" />; }

// esbuild guard: module-level group/type data — no inline JSX
const NOTIF_GROUPS = [
  {
    label: 'Social',
    color: 'from-primary/10 to-primary/5 border-primary/20',
    types: [
      { key: 'like',    label: 'Likes',         description: 'When someone likes your post',       iconFn: iconHeart,    color: 'text-pink-500'   },
      { key: 'repost',  label: 'Reposts',        description: 'When someone reposts your content',  iconFn: iconRepeat,   color: 'text-green-500'  },
      { key: 'follow',  label: 'New Followers',  description: 'When someone follows you',           iconFn: iconUserPlus, color: 'text-primary'    },
      { key: 'reply',   label: 'Replies',        description: 'When someone replies to your post',  iconFn: iconMessage,  color: 'text-blue-500'   },
      { key: 'mention', label: 'Mentions',       description: 'When someone @mentions you',         iconFn: iconAtSign,   color: 'text-violet-500' },
    ],
  },
  {
    label: 'Payments & Earnings',
    color: 'from-green-600/10 to-green-500/5 border-green-600/20',
    types: [
      { key: 'deposit_confirmed', label: 'Deposits',         description: 'M-Pesa top-up confirmed',          iconFn: iconDollar,     color: 'text-green-600' },
      { key: 'payment_sent',      label: 'Payouts sent',     description: 'When a payout is sent to you',     iconFn: iconSmartphone, color: 'text-blue-600'  },
      { key: 'payment_failed',    label: 'Payment failures', description: 'When a payment or payout fails',   iconFn: iconShield,     color: 'text-red-500'   },
      { key: 'boost_activated',   label: 'Boost activated',  description: 'When your post boost goes live',   iconFn: iconTrending,   color: 'text-purple-600'},
    ],
  },
  {
    label: 'Creator & Ads',
    color: 'from-orange-600/10 to-amber-500/5 border-orange-600/20',
    types: [
      { key: 'ad_active',    label: 'Ad approved',   description: 'Your ad is now live',        iconFn: iconMegaphone, color: 'text-green-600' },
      { key: 'ad_rejected',  label: 'Ad rejected',   description: 'Your ad was rejected',       iconFn: iconMegaphone, color: 'text-red-500'   },
      { key: 'tip_received', label: 'Tips received', description: 'When someone tips you',      iconFn: iconGift,      color: 'text-amber-500' },
    ],
  },
  {
    label: 'Milestones & Rewards',
    color: 'from-yellow-600/10 to-amber-500/5 border-yellow-600/20',
    types: [
      { key: 'streak_milestone', label: 'Daily streak',  description: 'Daily check-in streak milestones',   iconFn: iconFlame,  color: 'text-orange-500' },
      { key: 'leaderboard',      label: 'Leaderboard',   description: 'Ranking changes and top-10 alerts',  iconFn: iconTrophy, color: 'text-yellow-500' },
      { key: 'verification',     label: 'Verification',  description: 'Account verification updates',        iconFn: iconStar,   color: 'text-primary'    },
    ],
  },
  {
    label: 'Fediverse',
    color: 'from-purple-600/10 to-purple-500/5 border-purple-600/20',
    types: [
      { key: 'fediverse_follow',  label: 'Fediverse follows',  description: 'Remote followers from Mastodon etc.', iconFn: iconGlobe,   color: 'text-purple-500' },
      { key: 'fediverse_mention', label: 'Fediverse mentions', description: 'Mentions from remote instances',       iconFn: iconAtSign,  color: 'text-purple-400' },
    ],
  },
];

// esbuild guard: module-level channels — no inline JSX
const CHANNELS = [
  { key: 'in_app' as Channel, label: 'In-App', iconFn: iconBell     },
  { key: 'push'   as Channel, label: 'Push',   iconFn: iconBellRing },
  { key: 'email'  as Channel, label: 'Email',  iconFn: iconMail     },
];

const ALL_TYPES = NOTIF_GROUPS.flatMap(g => g.types.map(t => t.key));

function buildDefaults(): NotifPref[] {
  return ALL_TYPES.map(key => ({
    notif_type: key,
    in_app: true,
    push: ['like', 'follow', 'mention', 'reply', 'deposit_confirmed', 'payment_sent'].includes(key),
    email: ['deposit_confirmed', 'payment_failed'].includes(key),
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NotificationPreferencesPage() {
  const { user } = useAuth();
  useSEO({ noindex: true, title: 'Notification Preferences', url: '/notification-preferences' });
  const navigate = useNavigate();
  // esbuild guard: no explicit generics on useState
  const [prefs, setPrefs] = useState({} as Record<string, NotifPref>);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');   // esbuild guard: string not string|null
  const [masterMute, setMasterMute] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    loadPrefs();
  }, [user]);

  const loadPrefs = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id);
      const map: Record<string, NotifPref> = {};
      buildDefaults().forEach(d => { map[d.notif_type] = d; });
      (data ?? []).forEach((row: any) => {
        map[row.notif_type] = { notif_type: row.notif_type, in_app: row.in_app, push: row.push, email: row.email };
      });
      setPrefs(map);
    } finally {
      setLoading(false);
    }
  };

  const togglePref = async (type: string, channel: Channel) => {
    if (!user) return;
    setSaving(`${type}-${channel}`);
    const current = prefs[type] ?? { notif_type: type, in_app: true, push: false, email: false };
    const updated = { ...current, [channel]: !current[channel] };
    setPrefs(prev => ({ ...prev, [type]: updated }));
    const { error } = await supabase.from('notification_preferences').upsert({
      user_id: user.id, notif_type: type,
      in_app: updated.in_app, push: updated.push, email: updated.email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,notif_type' });
    if (error) { setPrefs(prev => ({ ...prev, [type]: current })); toast.error('Failed to save preference'); }
    setSaving('');
  };

  const toggleMasterMute = async () => {
    if (!user) return;
    const next = !masterMute;
    setMasterMute(next);
    const updates = ALL_TYPES.map(type => {
      const current = prefs[type] ?? { notif_type: type, in_app: true, push: false, email: false };
      return { user_id: user.id, notif_type: type, in_app: current.in_app, push: next ? false : current.push, email: current.email, updated_at: new Date().toISOString() };
    });
    await supabase.from('notification_preferences').upsert(updates, { onConflict: 'user_id,notif_type' });
    if (next) {
      setPrefs(prev => { const clone = { ...prev }; ALL_TYPES.forEach(t => { clone[t] = { ...clone[t], push: false }; }); return clone; });
      toast.success('Push notifications muted');
    } else {
      toast.success('Push notifications restored');
    }
  };

  const saveAll = async () => {
    if (!user) return;
    setSaving('all');
    const rows = Object.values(prefs).map(p => ({
      user_id: user.id, notif_type: p.notif_type,
      in_app: p.in_app, push: p.push, email: p.email,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('notification_preferences').upsert(rows, { onConflict: 'user_id,notif_type' });
    setSaving('');
    if (error) { toast.error('Failed to save preferences'); return; }
    toast.success('Notification preferences saved!');
  };

  const handleTestNotification = async () => {
    if (!user) return;
    setTesting(true);
    const { data: fcmRow } = await supabase.from('fcm_tokens').select('token').eq('user_id', user.id).limit(1).maybeSingle();
    const { error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: user.id,
        token: fcmRow?.token ?? null,
        title: '\uD83D\uDD14 Test Notification',
        body: 'Push notifications are working correctly on this device.',
        data: { route: '/notifications', type: 'test' },
      },
    });
    setTesting(false);
    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try { msg = (await error.context?.text()) || msg; } catch { /* */ }
      }
      toast.error(`Test failed: ${msg}`);
      return;
    }
    toast.success('Test notification sent! Check your notifications.');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <TopBar title="Notification Preferences" showBack />
      <NotifPrefsAdBanner />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="max-w-2xl mx-auto p-4 space-y-5">
          {/* Master controls */}
          <div className="bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-primary/15 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Volume2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-bold">Notification Controls</p>
                <p className="text-xs text-muted-foreground">Manage all notification channels at once</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button onClick={toggleMasterMute}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${masterMute ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border hover:border-primary/30 hover:bg-primary/5'}`}>
                <BellRing className="w-4 h-4" />
                {masterMute ? 'Push Muted' : 'Mute Push'}
              </button>
              <button onClick={saveAll} disabled={saving === 'all'}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-60">
                {saving === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save All
              </button>
            </div>
            {/* Send Test Notification */}
            <button
              onClick={handleTestNotification}
              disabled={testing}
              className="w-full flex items-center justify-center gap-2 py-2.5 mt-1 border border-border rounded-xl font-semibold text-sm hover:bg-muted transition-colors disabled:opacity-60"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-primary" />}
              {testing ? 'Sending test\u2026' : 'Send Test Notification'}
            </button>
          </div>

          {/* Groups */}
          {NOTIF_GROUPS.map(group => (
            <div key={group.label} className={`bg-gradient-to-br ${group.color} border rounded-2xl overflow-hidden`}>
              <div className="px-4 py-3 border-b border-inherit">
                <h3 className="font-bold text-sm">{group.label}</h3>
              </div>
              <div className="divide-y divide-border/40">
                {group.types.map(type => {
                  const pref = prefs[type.key] ?? { notif_type: type.key, in_app: true, push: false, email: false };
                  return (
                    <div key={type.key} className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors">
                      <div className={`shrink-0 ${type.color}`}>{type.iconFn()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight">{type.label}</p>
                        <p className="text-xs text-muted-foreground leading-tight mt-0.5">{type.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {CHANNELS.map(ch => {
                          const isOn = pref[ch.key];
                          const isSaving = saving === `${type.key}-${ch.key}`;
                          return (
                            <button key={ch.key} onClick={() => togglePref(type.key, ch.key)} disabled={!!saving} title={`${isOn ? 'Disable' : 'Enable'} ${ch.label}`}
                              className={`relative w-10 h-6 rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${isOn ? 'bg-primary' : 'bg-muted'}`}>
                              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 flex items-center justify-center ${isOn ? 'translate-x-4' : 'translate-x-0'}`}>
                                {isSaving && <Loader2 className="w-2.5 h-2.5 text-primary animate-spin" />}
                              </span>
                              <span className="sr-only">{ch.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="text-center text-xs text-muted-foreground pb-4">
            <p>Push notifications require browser permission.</p>
            <p className="mt-0.5">Email notifications are sent to your registered address.</p>
          </div>
        </div>
      )}
    </div>
  );
}
