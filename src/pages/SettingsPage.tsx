import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Bell, Lock, Eye, Shield, HelpCircle, FileText, LogOut,
  Moon, Sun, Palette, User, ChevronRight, Smartphone
} from 'lucide-react';
import { authService } from '@/lib/auth';
import { applyTheme } from '@/components/layout/ThemeToggle';

function getStoredTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(true);
  const [privateAccount, setPrivateAccount] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(getStoredTheme);

  if (!user) {
    navigate('/auth');
    return null;
  }

  const handleLogout = async () => {
    await authService.signOut();
    logout();
    navigate('/');
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
  };

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
          <div className="space-y-1">
            {/* Theme Toggle */}
            <div
              onClick={toggleTheme}
              className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-xl transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Palette className="w-4 h-4 text-purple-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Theme</p>
                  <p className="text-xs text-muted-foreground capitalize">{theme} mode active</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  theme === 'dark'
                    ? 'bg-slate-800 border-slate-600 text-slate-200'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                }`}>
                  {theme === 'dark' ? (
                    <><Moon className="w-3.5 h-3.5" /> Dark</>
                  ) : (
                    <><Sun className="w-3.5 h-3.5" /> Light</>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            {/* Theme selection pills */}
            <div className="px-3 pb-1">
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={() => { setTheme('light'); applyTheme('light'); }}
                  className={`flex items-center justify-center gap-2 p-3 border-2 rounded-xl transition-all ${
                    theme === 'light'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <Sun className="w-5 h-5 text-yellow-500" />
                  <span className="font-medium text-sm">Light</span>
                  {theme === 'light' && <span className="text-primary text-xs">✓</span>}
                </button>
                <button
                  onClick={() => { setTheme('dark'); applyTheme('dark'); }}
                  className={`flex items-center justify-center gap-2 p-3 border-2 rounded-xl transition-all ${
                    theme === 'dark'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <Moon className="w-5 h-5 text-slate-400" />
                  <span className="font-medium text-sm">Dark</span>
                  {theme === 'dark' && <span className="text-primary text-xs">✓</span>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Notifications</h2>
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
