import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Bell, User, Flame, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  // Unread counts
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [streakDay, setStreakDay] = useState(0);
  const prevNotifs = useRef(-1);
  const prevMessages = useRef(-1);
  const audioCtxRef = useRef<any>(null);

  const playBeep = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 520;
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch { /* browser may block audio without prior user gesture */ }
  };

  // Poll local unread notification count every 60s
  useEffect(() => {
    if (!user) { setUnreadNotifs(0); setUnreadMessages(0); return; }
    let mounted = true;
    const fetchCounts = async () => {
      const { count: notifCount } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (mounted) {
        const nc = notifCount ?? 0;
        if (prevNotifs.current >= 0 && nc > prevNotifs.current) playBeep();
        prevNotifs.current = nc;
        setUnreadNotifs(nc);
      }

      const { data: convData } = await supabase
        .from('conversations')
        .select('id')
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`);
      const convIds = convData?.map((c: any) => c.id) ?? [];
      if (convIds.length > 0) {
        const { count: dmCount } = await supabase
          .from('direct_messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .eq('read', false)
          .neq('sender_id', user.id);
        if (mounted) {
          const dc = dmCount ?? 0;
          if (prevMessages.current >= 0 && dc > prevMessages.current) playBeep();
          prevMessages.current = dc;
          setUnreadMessages(dc);
        }
      } else {
        if (mounted) {
          prevMessages.current = 0;
          setUnreadMessages(0);
        }
      }
    };
    fetchCounts();
    const iv = setInterval(fetchCounts, 15_000);

    // Real-time subscription for instant badge updates
    const sub = supabase
      .channel(`bottomnav-notifs-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => { if (mounted) fetchCounts(); })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
      }, () => { if (mounted) fetchCounts(); })
      .subscribe();

    return () => { mounted = false; clearInterval(iv); supabase.removeChannel(sub); };
  }, [user?.id]);

  // Clear notification badge when visiting relevant pages
  useEffect(() => {
    if (location.pathname === '/notifications') setUnreadNotifs(0);
    if (location.pathname === '/messages') setUnreadMessages(0);
  }, [location.pathname]);

  // Fetch current streak on mount and after auth changes
  useEffect(() => {
    if (!user) { setStreakDay(0); return; }
    supabase
      .from('daily_rewards')
      .select('streak_day')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setStreakDay(data?.streak_day ?? 0));
  }, [user?.id]);

  useEffect(() => {
    const handleScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const currentY = window.scrollY;
          const delta = currentY - lastScrollY.current;

          // Hide on scroll down (>10px), show on scroll up
          if (delta > 10 && currentY > 60) {
            setVisible(false);
          } else if (delta < -5) {
            setVisible(true);
          }
          lastScrollY.current = currentY;
          ticking.current = false;
        });
        ticking.current = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Always show on route change
  useEffect(() => {
    setVisible(true);
    lastScrollY.current = 0;
  }, [location.pathname]);

  const navItems = [
    { icon: Home,   label: 'Home',      path: '/',                                              badge: 0 },
    { icon: Search, label: 'Explore',   path: '/explore',                                       badge: 0 },
    { icon: Flame,  label: 'Streak',    path: '/daily-rewards',                                badge: streakDay, badgeStyle: 'bg-orange-500', requireAuth: true },
    { icon: Mail,   label: 'Messages',  path: '/messages',   requireAuth: true,                  badge: unreadMessages },
    { icon: Bell,   label: 'Alerts',    path: '/notifications',  requireAuth: true,              badge: unreadNotifs },
    { icon: User,   label: 'Profile',   path: user ? `/profile/${user.username}` : '/auth',     badge: 0, requireAuth: true },
  ];

  const handleNavClick = (path: string, requireAuth?: boolean) => {
    // Initialize AudioContext on user gesture so beep works later
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { /* ignore */ }
    }
    if (requireAuth && !user) navigate('/auth');
    else navigate(path);
  };

  return (
    <nav
      className={`lg:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border z-50 transition-transform duration-300 ease-in-out ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="flex justify-around items-center h-16 safe-area-bottom">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <button
              key={item.path}
              onClick={() => handleNavClick(item.path, item.requireAuth)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 active:scale-90 ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className={`relative p-1.5 rounded-full transition-colors ${isActive ? 'bg-primary/10' : ''}`}>
                <Icon className="w-5 h-5" fill={isActive ? 'currentColor' : 'none'} strokeWidth={isActive ? 2.5 : 2} />
                {item.badge > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none ${(item as any).badgeStyle ?? 'bg-red-500'}`}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-primary' : ''}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
