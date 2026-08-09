import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Bell, Mail, User, Globe } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useRef, useState } from 'react';

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

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
    { icon: Home, label: 'Home', path: '/' },
    { icon: Search, label: 'Explore', path: '/explore' },
    { icon: Globe, label: 'Fediverse', path: '/fediverse' },
    { icon: Bell, label: 'Alerts', path: '/notifications', requireAuth: true },
    { icon: User, label: 'Profile', path: user ? `/profile/${user.username}` : '/auth', requireAuth: true },
  ];

  const handleNavClick = (path: string, requireAuth?: boolean) => {
    if (requireAuth && !user) {
      navigate('/auth');
    } else {
      navigate(path);
    }
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
              <div className={`p-1.5 rounded-full transition-colors ${isActive ? 'bg-primary/10' : ''}`}>
                <Icon className="w-5 h-5" fill={isActive ? 'currentColor' : 'none'} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-primary' : ''}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
