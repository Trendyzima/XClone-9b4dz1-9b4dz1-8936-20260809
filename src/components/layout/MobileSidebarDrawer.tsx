import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, Home, Hash, Bell, Mail, Radio, Sparkles, Bookmark, List, History, Briefcase, BarChart3, DollarSign, ShoppingBag, Calendar, Crown, LogOut, Settings, HelpCircle, User, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/lib/auth';

export function MobileSidebarDrawer() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { icon: Home, label: 'Home', path: '/', requireAuth: false },
    { icon: Hash, label: 'Explore', path: '/explore', requireAuth: false },
    { icon: Bell, label: 'Notifications', path: '/notifications', requireAuth: true },
    { icon: Mail, label: 'Messages', path: '/messages', requireAuth: true },
    { icon: Radio, label: 'Spaces', path: '/spaces', requireAuth: false },
    { icon: Sparkles, label: 'AI', path: '/ai', requireAuth: false },
    { icon: FileText, label: 'Threads', path: '/threads', requireAuth: false },
  ];

  const userTools = [
    { icon: Bookmark, label: 'Bookmarks', path: '/bookmarks', requireAuth: true },
    { icon: List, label: 'Lists', path: '/lists', requireAuth: true },
    { icon: History, label: 'History', path: '/history', requireAuth: true },
  ];

  const creatorTools = [
    { icon: Briefcase, label: 'Creator Studio', path: '/creator-studio', requireAuth: true },
    { icon: BarChart3, label: 'Analytics', path: '/analytics', requireAuth: true },
    { icon: DollarSign, label: 'Monetization', path: '/monetization', requireAuth: true },
    { icon: ShoppingBag, label: 'Products', path: '/products', requireAuth: true },
    { icon: Calendar, label: 'Scheduled', path: '/scheduled', requireAuth: true },
  ];

  const handleNavClick = (path: string, requireAuth?: boolean) => {
    if (requireAuth && !user) {
      navigate('/auth');
    } else {
      navigate(path);
    }
    setOpen(false);
  };

  const handleLogout = async () => {
    await authService.signOut();
    logout();
    navigate('/');
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="w-6 h-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-80 overflow-y-auto">
        {/* Logo */}
        <div className="flex items-center space-x-2 p-4 border-b border-border">
          <img src="/tsocial-logo.png" alt="Tsocial" className="w-10 h-10 rounded-xl object-cover" />
          <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Tsocial</span>
        </div>

        {/* Navigation */}
        <nav className="p-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path, item.requireAuth)}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors w-full text-left ${
                    isActive ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {user && (
            <>
              <div className="mt-6 mb-2">
                <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase">Library</h3>
              </div>
              <div className="space-y-1">
                {userTools.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleNavClick(item.path, item.requireAuth)}
                      className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors w-full text-left text-sm ${
                        isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 mb-2">
                <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase">Creator Tools</h3>
              </div>
              <div className="space-y-1">
                {creatorTools.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleNavClick(item.path, item.requireAuth)}
                      className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors w-full text-left text-sm ${
                        isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Premium Banner */}
              <div className="mt-6">
                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl p-4 border border-purple-500/20">
                  <Crown className="w-8 h-8 text-purple-500 mb-2" />
                  <h3 className="font-bold text-sm mb-1">Upgrade to Premium</h3>
                  <p className="text-xs text-muted-foreground mb-3">Get verified and unlock exclusive features</p>
                  <Button
                    onClick={() => {
                      navigate('/premium');
                      setOpen(false);
                    }}
                    size="sm"
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
                  >
                    Get Premium
                  </Button>
                </div>
              </div>
            </>
          )}
        </nav>

        {/* User Profile / Actions */}
        <div className="p-4 border-t border-border mt-auto">
          {user ? (
            <div className="space-y-2">
              <button
                onClick={() => {
                  navigate(`/profile/${user.username}`);
                  setOpen(false);
                }}
                className="flex items-center gap-3 w-full p-3 hover:bg-muted rounded-lg text-left"
              >
                <User className="w-5 h-5" />
                <span>Profile</span>
              </button>
              <button
                onClick={() => {
                  navigate('/settings');
                  setOpen(false);
                }}
                className="flex items-center gap-3 w-full p-3 hover:bg-muted rounded-lg text-left"
              >
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </button>
              <button
                onClick={() => {
                  navigate('/help');
                  setOpen(false);
                }}
                className="flex items-center gap-3 w-full p-3 hover:bg-muted rounded-lg text-left"
              >
                <HelpCircle className="w-5 h-5" />
                <span>Help</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full p-3 hover:bg-destructive/10 text-destructive rounded-lg text-left"
              >
                <LogOut className="w-5 h-5" />
                <span>Log out</span>
              </button>
            </div>
          ) : (
            <Button onClick={() => { navigate('/auth'); setOpen(false); }} className="w-full">
              Sign in
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
