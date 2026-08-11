import { useState, useEffect, useRef } from 'react';
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

function NotifPrefsAdBanner() {
  const pushed = useRef(false);
  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch (_) {}
  }, []);
  return (
    <div className="mx-4 mt-2 mb-1 rounded-xl overflow-hidden border border-border bg-muted/5">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pt-2 mb-1">Sponsored</p>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: 60 }}
        data-ad-client="ca-pub-2458567543017441"
        data-ad-slot="2031881558"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface NotifPref {
  notif_type: string;
  in_app: boolean;
  push: boolean;
  email: boolean;
}

type Channel = 'in_app' | 'push' | 'email';

interface NotifTypeMeta {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const NOTIF_GROUPS: { label: string; color: string; types: NotifTypeMeta[] }[] = [
  {
    label: 'Social',
    color: 'from-primary/10 to-primary/5 border-primary/20',
    types: [
      { key: 'like',    label: 'Likes',         description: 'When someone likes your post',       icon: <Heart className="w-4 h-4" />,       color: 'text-pink-500'   },
      { key: 'repost',  label: 'Reposts',        description: 'When someone reposts your content',  icon: <Repeat2 className="w-4 h-4" />,     color: 'text-green-500'  },
      { key: 'follow',  label: 'New Followers',  description: 'When someone follows you',           icon: <UserPlus className="w-4 h-4" />,    color: 'text-primary'    },
      { key: 'reply',   label: 'Replies',        description: 'When someone replies to your post',  icon: <MessageCircle className="w-4 h-4" />, color: 'text-blue-500' },
      { key: 'mention', label: 'Mentions',       description: 'When someone @mentions you',         icon: <AtSign className="w-4 h-4" />,      color: 'text-violet-500' },
    ],
  },
  {
    label: 'Payments & Earnings',
    color: 'from-green-600/10 to-green-500/5 border-green-600/20',
    types: [
      { key: 'deposit_confirmed', label: 'Deposits',        description: 'M-Pesa top-up confirmed',              icon: <DollarSign className="w-4 h-4" />,   color: 'text-green-600' },
      { key: 'payment_sent',      label: 'Payouts sent',    description: 'When a payout is sent to you',         icon: <Smartphone className="w-4 h-4" />,  color: 'text-blue-600'  },
      { key: 'payment_failed',    label: 'Payment failures',description: 'When a payment or payout fails',       icon: <ShieldCheck className="w-4 h-4" />, color: 'text-red-500'   },
      { key: 'boost_activated',   label: 'Boost activated', description: 'When your post boost goes live',       icon: <TrendingUp className="w-4 h-4" />,  color: 'text-purple-600'},
    ],
  },
  {
    label: 'Creator & Ads',
    color: 'from-orange-600/10 to-amber-500/5 border-orange-600/20',
    types: [
      { key: 'ad_active',    label: 'Ad approved',   description: 'Your ad is now live',        icon: <Megaphone className="w-4 h-4" />, color: 'text-green-600' },
      { key: 'ad_rejected',  label: 'Ad rejected',   description: 'Your ad was rejected',       icon: <Megaphone className="w-4 h-4" />, color: 'text-red-500'   },
      { key: 'tip_received', label: 'Tips received', description: 'When someone tips you',      icon: <Gift className="w-4 h-4" />,     color: 'text-amber-500' },
    ],
  },
  {
    label: 'Milestones & Rewards',
    color: 'from-yellow-600/10 to-amber-500/5 border-yellow-600/20',
    types: [
      { key: 'streak_milestone', label: 'Daily streak',  description: 'Daily check-in streak milestones',    icon: <Flame className="w-4 h-4" />,  color: 'text-orange-500' },
      { key: 'leaderboard',      label: 'Leaderboard',   description: 'Ranking changes and top-10 alerts',   icon: <Trophy className="w-4 h-4" />, color: 'text-yellow-500' },
      { key: 'verification',     label: 'Verification',  description: 'Account verification updates',         icon: <Star className="w-4 h-4" />,   color: 'text-primary'    },
    ],
  },
  {
    label: 'Fediverse',
    color: 'from-purple-600/10 to-purple-500/5 border-purple-600/20',
    types: [
      { key: 'fediverse_follow',  label: 'Fediverse follows',  description: 'Remote followers from Mastodon etc.', icon: <Globe className="w-4 h-4" />, color: 'text-purple-500' },
      { key: 'fediverse_mention', label: 'Fediverse mentions', description: 'Mentions from remote instances',       icon: <AtSign className="w-4 h-4" />, color: 'text-purple-400'},
    ],
  },
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
  const [prefs, setPrefs] = useState<Record<string, NotifPref>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [masterMute, setMasterMute] = useState(false);

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
    setSaving(null);
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
    setSaving(null);
    if (error) { toast.error('Failed to save preferences'); return; }
    toast.success('Notification preferences saved!');
  };

  if (!user) return null;

  const CHANNELS: { key: Channel; label: string; icon: React.ReactNode }[] = [
    { key: 'in_app', label: 'In-App', icon: <Bell className="w-3.5 h-3.5" /> },
    { key: 'push',   label: 'Push',   icon: <BellRing className="w-3.5 h-3.5" /> },
    { key: 'email',  label: 'Email',  icon: <Mail className="w-3.5 h-3.5" /> },
  ];

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
            <div className="grid grid-cols-2 gap-2">
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
                      <div className={`shrink-0 ${type.color}`}>{type.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight">{type.label}</p>
                        <p className="text-xs text-muted-foreground leading-tight mt-0.5">{type.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {CHANNELS.map(ch => {
                          const isOn = pref[ch.key as Channel];
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
