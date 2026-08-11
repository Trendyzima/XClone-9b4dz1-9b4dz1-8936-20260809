import { useState, useEffect, useRef, ReactNode } from 'react';
import { AdSenseAd } from '@/components/features/AdSenseAd';

interface NativeAdCardProps {
  onClose?: () => void;
  className?: string;
}

// Simulated native-style ad data for web fallback
const SAMPLE_ADS = [
  {
    headline: 'Grow Your Business Online',
    body: 'Reach millions of customers with targeted advertising. Start your campaign today.',
    cta: 'Get Started',
    advertiser: 'Google Ads',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&q=80',
    url: 'https://ads.google.com',
  },
  {
    headline: 'Premium Cloud Hosting',
    body: 'Ultra-fast SSD hosting with 99.9% uptime. Free SSL, CDN and daily backups included.',
    cta: 'Try Free',
    advertiser: 'CloudHost Pro',
    image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&q=80',
    url: '#',
  },
  {
    headline: 'Learn to Code in 30 Days',
    body: 'Join 2M+ developers. Interactive courses, real projects, lifetime access.',
    cta: 'Start Learning',
    advertiser: 'CodeAcademy',
    image: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=400&q=80',
    url: '#',
  },
];

export function NativeAdCard({ onClose, className = '' }: NativeAdCardProps) {
  const [visible, setVisible] = useState(true);
  // Only show when ad slot has content — check via window.adsbygoogle length
  const [hasAd, setHasAd] = useState(false);
  const [impressionTracked, setImpressionTracked] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Detect if AdSense has loaded any ads into the slot
  useEffect(() => {
    const timer = setTimeout(() => {
      const slots = (window as any).adsbygoogle;
      setHasAd(Array.isArray(slots) && slots.length > 0);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Track impression via IntersectionObserver
  useEffect(() => {
    if (impressionTracked) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !impressionTracked) {
          setImpressionTracked(true);
        }
      },
      { threshold: 0.5 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [impressionTracked]);

  const handleClose = () => {
    setVisible(false);
    onClose?.();
  };

  if (!visible || !hasAd) return null;

  return (
    <div className={`${className} px-2 py-2`}>
      <AdSenseAd adSlot="3193754134" adFormat="auto" fullWidthResponsive />
    </div>
  );
}

export function injectNativeAds<T>(
  items: T[],
  renderItem: (item: T, index: number) => ReactNode,
  interval = 12 // increased from 6 to avoid triggering AdSense invalid traffic detection
): ReactNode[] {
  const result: ReactNode[] = [];
  items.forEach((item, i) => {
    result.push(renderItem(item, i));
    if ((i + 1) % interval === 0 && i < items.length - 1) {
      result.push(
        <NativeAdCard key={`native-ad-${i}`} className="mx-0 my-0" />
      );
    }
  });
  return result;
}
