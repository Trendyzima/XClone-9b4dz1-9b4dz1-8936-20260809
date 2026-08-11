import { useState, useEffect } from 'react';
import { useSEO } from '@/hooks/useSEO';
import { TopBar } from '@/components/layout/TopBar';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Bell, Lock, Shield, HelpCircle, FileText, LogOut,
  Moon, Sun, Palette, User, ChevronRight, Smartphone, Monitor, Check,
  Sparkles, Heart, Volume2, VolumeX, Play
} from 'lucide-react';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { applyTheme, getStoredThemeChoice } from '@/components/layout/ThemeToggle';
import { authService } from '@/lib/auth';

type ThemeChoice = 'light' | 'dark' | 'system';

export default function SettingsPage() {
  useSEO({ noindex: true, title: 'Settings', url: '/settings' });
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(true);
  const [privateAccount, setPrivateAccount] = useState(false);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(getStoredThemeChoice);
  const { play: playSound, isEnabled: isSoundEnabled, setEnabled: setSoundEnabled } = useNotificationSound();
  const [soundsOn, setSoundsOn] = useState(isSoundEnabled());

  const toggleSounds = (v: boolean) => {
    setSoundEnabled(v);
    setSoundsOn(v);
    if (v) playSound('dm');
  };

  // Listen for OS preference changes when in System mode
  useEffect(() => {
    if (themeChoice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themeChoice]);

  if (!user) {
    navigate('/auth');
    return null;
  }

  const handleLogout = async () => {
    await authService.signOut();
    logout();
    navigate('/');
  };

  const selectTheme = (choice: ThemeChoice) => {
    setThemeChoice(choice);
    applyTheme(choice);
  };

  // Detect effective theme for display
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveTheme = themeChoice === 'system' ? (systemDark ? 'dark' : 'light') : themeChoice;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <TopBar title="Settings" showBack />

      <div className="divide-y divide-border">
        {/* Account */}
        <div className="p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Account</h2>
          <div className="space-y-1">
            <button
              onClick={() => navigate(`/profile/${user.username}`)}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">View Profile</p>
                  <p className="text-xs text-muted-foreground">@{user.username}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <div className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-xl transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Private Account</p>
                  <p className="text-xs text-muted-foreground">Only followers see your posts</p>
                </div>
              </div>
              <Switch checked={privateAccount} onCheckedChange={setPrivateAccount} />
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Appearance</h2>

          {/* Theme row label */}
          <div className="flex items-center gap-3 p-3 rounded-xl mb-2">
            <div className="w-9 h-9 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
              <Palette className="w-4 h-4 text-purple-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Theme</p>
              <p className="text-xs text-muted-foreground">
                {themeChoice === 'system'
                  ? `System (${effectiveTheme} mode)`
                  : `${themeChoice.charAt(0).toUpperCase() + themeChoice.slice(1)} mode active`}
              </p>
            </div>
          </div>

          {/* 3-pill selector */}
          <div className="grid grid-cols-3 gap-2 px-3 pb-1">
            {([
              { id: 'light'  as ThemeChoice, label: 'Light',  Icon: Sun,     cls: 'text-yellow-500'  },
              { id: 'dark'   as ThemeChoice, label: 'Dark',   Icon: Moon,    cls: 'text-slate-400'   },
              { id: 'system' as ThemeChoice, label: 'System', Icon: Monitor, cls: 'text-blue-400'    },
            ] as const).map(({ id, label, Icon, cls }) => {
              const active = themeChoice === id;
              return (
                <button
                  key={id}
                  onClick={() => selectTheme(id)}
                  className={`relative flex flex-col items-center gap-2 p-3.5 border-2 rounded-2xl transition-all ${
                    active
                      ? 'border-primary bg-primary/8 shadow-sm'
                      : 'border-border hover:border-muted-foreground/30 hover:bg-muted/40'
                  }`}
                >
                  <Icon className={`w-6 h-6 ${active ? 'text-primary' : cls}`} />
                  <span className={`font-semibold text-xs ${active ? 'text-primary' : 'text-foreground'}`}>
                    {label}
                  </span>
                  {active && (
                    <span className="absolute top-2 right-2 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-primary-foreground" />
                    </span>
                  )}
                  {id === 'system' && (
                    <span className="text-[9px] text-muted-foreground leading-none">
                      {effectiveTheme === 'dark' ? '(dark)' : '(light)'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Personalisation */}
        <div className="p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Feed & Personalisation</h2>
          <div className="space-y-1">
            <button
              onClick={() => navigate('/interests')}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">My Interests</p>
                  <p className="text-xs text-muted-foreground">Personalise your For You feed</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => navigate('/wishlist')}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-rose-500/10 flex items-center justify-center">
                  <Heart className="w-4 h-4 text-rose-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Wishlist</p>
                  <p className="text-xs text-muted-foreground">Products you've saved</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Notifications</h2>
          <div className="space-y-1">
            <div className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-xl transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Push Notifications</p>
                  <p className="text-xs text-muted-foreground">Likes, replies, follows & more</p>
                </div>
              </div>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </div>
          </div>
        </div>

        {/* Sound Settings */}
        <div className="p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Notification Sounds</h2>
          {/* Master toggle */}
          <div className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-xl transition-colors mb-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-violet-500/10 flex items-center justify-center">
                {soundsOn ? <Volume2 className="w-4 h-4 text-violet-500" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div>
                <p className="font-semibold text-sm">Notification Sounds</p>
                <p className="text-xs text-muted-foreground">{soundsOn ? 'Distinct sounds per event' : 'All sounds muted'}</p>
              </div>
            </div>
            <Switch checked={soundsOn} onCheckedChange={toggleSounds} />
          </div>

          {/* Per-type preview */}
          {soundsOn && (
            <div className="bg-muted/30 rounded-2xl p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 mb-2">Preview sounds</p>
              {([
                { type: 'like'    as const, label: 'Like',    emoji: '❤️', desc: 'Soft two-tone chime'        },
                { type: 'follow'  as const, label: 'Follow',  emoji: '👤', desc: 'Rising three-note fanfare'  },
                { type: 'tip'     as const, label: 'Tip',     emoji: '💰', desc: 'Warm coin-drop jingle'      },
                { type: 'comment' as const, label: 'Comment', emoji: '💬', desc: 'Subtle pop'                 },
                { type: 'repost'  as const, label: 'Repost',  emoji: '🔁', desc: 'Double-tap click'           },
                { type: 'dm'      as const, label: 'DM',      emoji: '✉️',  desc: 'Friendly ping'              },
                { type: 'group'   as const, label: 'Group',   emoji: '👥', desc: 'Richer group chime'         },
              ]).map(({ type, label, emoji, desc }) => (
                <button
                  key={type}
                  onClick={() => playSound(type)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-background/70 active:scale-[0.98] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg leading-none w-7 text-center">{emoji}</span>
                    <div className="text-left">
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-violet-500/10 group-hover:bg-violet-500/20 flex items-center justify-center transition-colors">
                    <Play className="w-3 h-3 text-violet-500" fill="currentColor" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Privacy & Security */}
        <div className="p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Privacy & Security</h2>
          <div className="space-y-1">
            <button className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-xl transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Privacy Policy</p>
                  <p className="text-xs text-muted-foreground">How we protect your data</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-xl transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-500/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Terms of Service</p>
                  <p className="text-xs text-muted-foreground">Read our terms</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Help & Support */}
        <div className="p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Help & Support</h2>
          <button
            onClick={() => navigate('/help')}
            className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-xl transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-teal-500/10 flex items-center justify-center">
                <HelpCircle className="w-4 h-4 text-teal-500" />
              </div>
              <div>
                <p className="font-semibold text-sm">Help Center</p>
                <p className="text-xs text-muted-foreground">Get help with T Social</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* About */}
        <div className="p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">About</h2>
          <div className="p-3 bg-muted/30 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">T Social v2.0.0</p>
            </div>
            <p className="text-xs text-muted-foreground pl-6">© 2025 T Social. All rights reserved.</p>
            <p className="text-xs text-muted-foreground pl-6">Built with ❤️ for the community</p>
          </div>
        </div>

        {/* Logout */}
        <div className="p-4">
          <Button
            onClick={handleLogout}
            variant="destructive"
            className="w-full rounded-xl py-5"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Log Out
          </Button>
        </div>
      </div>
    </div>
  );
}
