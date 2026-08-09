import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Home, Search, Bell, Mail, User, Hash, Radio, LogOut, Plus, Users, TrendingUp, Sparkles, Bookmark, List, DollarSign, BarChart3, ShoppingBag, Calendar, Crown, Briefcase, Settings, HelpCircle, History, ChevronDown, ChevronUp, FileText, Wallet, Megaphone, Shield, LineChart, Globe } from 'lucide-react';
import { authService } from '@/lib/auth';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/utils';

interface Community {
  id: string;
  name: string;
  display_name: string;
  icon_url?: string;
  member_count: number;
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [trendingCommunities, setTrendingCommunities] = useState<Community[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCommunities, setShowCommunities] = useState(true);
  const [showTrending, setShowTrending] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUserCommunities();
    }
    fetchTrendingCommunities();
  }, [user]);

  const fetchUserCommunities = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('community_members')
      .select(`
        communities (*)
      `)
      .eq('user_id', user.id)
      .limit(5);

    if (data) {
      setCommunities(data.map((d: any) => d.communities));
    }
  };

  const fetchTrendingCommunities = async () => {
    const { data } = await supabase
      .from('communities')
      .select('*')
      .order('member_count', { ascending: false })
      .limit(5);

    if (data) {
      setTrendingCommunities(data);
    }
  };

  const navItems = [
    { icon: Home, label: 'Home', path: '/', requireAuth: false },
    { icon: Hash, label: 'Explore', path: '/explore', requireAuth: false },
    { icon: FileText, label: 'Threads', path: '/threads', requireAuth: false },
    { icon: Bell, label: 'Notifications', path: '/notifications', requireAuth: true },
    { icon: Mail, label: 'Messages', path: '/messages', requireAuth: true },
    { icon: Radio, label: 'Spaces', path: '/spaces', requireAuth: false },
    { icon: Sparkles, label: 'AI', path: '/ai', requireAuth: false },
    { icon: Globe, label: 'Fediverse', path: '/fediverse', requireAuth: false },
  ];

  const creatorTools = [
    { icon: Briefcase, label: 'Creator Studio', path: '/creator-studio', requireAuth: true },
    { icon: BarChart3, label: 'Analytics', path: '/analytics', requireAuth: true },
    { icon: DollarSign, label: 'Monetization', path: '/monetization', requireAuth: true },
    { icon: ShoppingBag, label: 'Products', path: '/products', requireAuth: true },
    { icon: Calendar, label: 'Scheduled', path: '/scheduled', requireAuth: true },
  ];

  const adminTools = [
    { icon: LineChart, label: 'Revenue Analytics', path: '/revenue-analytics', requireAuth: true },
    { icon: TrendingUp, label: 'Admin Revenue', path: '/admin/revenue', requireAuth: true },
    { icon: Shield, label: 'Fraud Detection', path: '/fraud-detection', requireAuth: true },
  ];

  const userTools = [
    { icon: Bookmark, label: 'Bookmarks', path: '/bookmarks', requireAuth: true },
    { icon: List, label: 'Lists', path: '/lists', requireAuth: true },
    { icon: History, label: 'History', path: '/history', requireAuth: true },
    { icon: Wallet, label: 'Wallet', path: '/wallet', requireAuth: true },
    { icon: DollarSign, label: 'Payouts', path: '/payouts', requireAuth: true },
    { icon: Megaphone, label: 'My Ads', path: '/my-ads', requireAuth: true },
  ];

  const handleNavClick = (path: string, requireAuth?: boolean) => {
    if (requireAuth && !user) {
      navigate('/auth');
    } else {
      navigate(path);
    }
  };

  const handleLogout = async () => {
    await authService.signOut();
    logout();
    navigate('/');
  };

  return (
    <aside className="hidden lg:flex lg:flex-col w-72 h-screen sticky top-0 border-r border-border overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center space-x-2 p-4 border-b border-border">
        <img src="/tsocial-logo.png" alt="Tsocial" className="w-10 h-10 rounded-xl object-cover" />
        <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Tsocial</span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-2">
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path, item.requireAuth)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors w-full text-left ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* User Tools */}
        {user && (
          <>
            <div className="mt-6 mb-2">
              <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Library
              </h3>
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
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Creator Tools */}
            <div className="mt-6 mb-2">
              <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Creator Tools
              </h3>
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
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Admin Tools */}
            <div className="mt-6 mb-2">
              <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Admin Tools
              </h3>
            </div>
            <div className="space-y-1">
              {adminTools.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavClick(item.path, item.requireAuth)}
                    className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors w-full text-left text-sm ${
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Communities */}
        <div className="mt-6">
          <button
            onClick={() => setShowCommunities(!showCommunities)}
            className="flex items-center justify-between w-full px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground"
          >
            <span>Communities</span>
            {showCommunities ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {showCommunities && (
            <div className="mt-2 space-y-1">
              <button
                onClick={() => navigate('/communities')}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg hover:bg-muted w-full text-left text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Discover Communities</span>
              </button>
              
              {user && communities.length > 0 && (
                <>
                  <div className="px-4 py-1 text-xs text-muted-foreground">Your Communities</div>
                  {communities.map((community) => (
                    <button
                      key={community.id}
                      onClick={() => navigate(`/c/${community.name}`)}
                      className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-muted w-full text-left"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {community.icon_url ? (
                          <img src={community.icon_url} alt={community.display_name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold">{community.display_name[0]}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{community.display_name}</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(community.member_count)}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Trending Communities */}
        {trendingCommunities.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowTrending(!showTrending)}
              className="flex items-center justify-between w-full px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                <span>Trending</span>
              </div>
              {showTrending ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showTrending && (
              <div className="mt-2 space-y-1">
                {trendingCommunities.map((community) => (
                  <button
                    key={community.id}
                    onClick={() => navigate(`/c/${community.name}`)}
                    className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-muted w-full text-left"
                  >
                    <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {community.icon_url ? (
                        <img src={community.icon_url} alt={community.display_name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold">{community.display_name[0]}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{community.display_name}</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(community.member_count)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Premium Banner */}
        <div className="mt-6 mx-2">
          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl p-4 border border-purple-500/20">
            <Crown className="w-8 h-8 text-purple-500 mb-2" />
            <h3 className="font-bold text-sm mb-1">Upgrade to Premium</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Get verified, unlock exclusive features, and monetize your content
            </p>
            <Button
              onClick={() => navigate('/premium')}
              size="sm"
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Crown className="w-4 h-4 mr-2" />
              Get Premium
            </Button>
          </div>
        </div>
      </nav>

      {/* User Profile / Sign In */}
      <div className="p-2 border-t border-border">
        {user ? (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center justify-between p-3 hover:bg-muted rounded-lg w-full transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold">
                      {user.username[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-semibold truncate">{user.username}</p>
                  <p className="text-sm text-muted-foreground truncate">@{user.username}</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>

            {showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
                <button
                  onClick={() => {
                    navigate(`/profile/${user.username}`);
                    setShowUserMenu(false);
                  }}
                  className="flex items-center gap-3 w-full p-3 hover:bg-muted text-left"
                >
                  <User className="w-5 h-5" />
                  <span>Profile</span>
                </button>
                <button
                  onClick={() => {
                    navigate('/settings');
                    setShowUserMenu(false);
                  }}
                  className="flex items-center gap-3 w-full p-3 hover:bg-muted text-left"
                >
                  <Settings className="w-5 h-5" />
                  <span>Settings</span>
                </button>
                <button
                  onClick={() => {
                    navigate('/help');
                    setShowUserMenu(false);
                  }}
                  className="flex items-center gap-3 w-full p-3 hover:bg-muted text-left"
                >
                  <HelpCircle className="w-5 h-5" />
                  <span>Help</span>
                </button>
                <div className="border-t border-border" />
                <button
                  onClick={() => {
                    handleLogout();
                    setShowUserMenu(false);
                  }}
                  className="flex items-center gap-3 w-full p-3 hover:bg-destructive/10 text-destructive text-left"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <Button
            onClick={() => navigate('/auth')}
            className="w-full rounded-lg font-semibold"
          >
            Sign in
          </Button>
        )}
      </div>
    </aside>
  );
}
