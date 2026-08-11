import { useState, useEffect, useRef } from 'react';
import { Sparkles, ExternalLink, X } from 'lucide-react';
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
  const [adData] = useState(SAMPLE_ADS[Math.floor(Math.random() * SAMPLE_ADS.length)]);
  const [visible, setVisible] = useState(true);
  const [impressionTracked, setImpressionTracked] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

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

  const handleAdClick = () => {
    if (adData.url && adData.url !== '#') {
      window.open(adData.url, '_blank');
    }
  };

  const handleClose = () => {
    setVisible(false);
    onClose?.();
  };

  // Always render AdSense on web
  return (
    <div className={`${className} px-2 py-2`}>
      <AdSenseAd adSlot="3193754134" adFormat="auto" fullWidthResponsive />
    </div>
  );

  if (!visible) return null;

  return (
    <div
      ref={cardRef}
      className={`relative border border-border bg-card rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 ${className}`}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
            Sponsored
          </span>
        </div>
        <button onClick={handleClose} className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground" title="Close ad">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <button onClick={handleAdClick} className="w-full text-left px-4 pb-4">
        <div className="rounded-xl overflow-hidden mb-3 aspect-video bg-muted">
          <img src={adData.image} alt={adData.headline} className="w-full h-full object-cover" loading="lazy" />
        </div>
        <p className="text-xs text-muted-foreground mb-1">{adData.advertiser}</p>
        <h3 className="font-bold text-foreground text-base leading-tight mb-1">{adData.headline}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{adData.body}</p>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-full">
            {adData.cta}
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
          <span className="text-xs text-muted-foreground">Ad</span>
        </div>
      </button>
    </div>
  );
}

export function injectNativeAds<T>(
  items: T[],
  renderItem: (item: T, index: number) => React.ReactNode,
  interval = 6
): React.ReactNode[] {
  const result: React.ReactNode[] = [];
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
