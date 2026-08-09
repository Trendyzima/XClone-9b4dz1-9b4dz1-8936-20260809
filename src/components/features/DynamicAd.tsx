
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Capacitor } from '@capacitor/core';

interface DynamicAdProps {
  location: 'feed_top' | 'feed_inline' | 'sidebar' | 'profile' | 'explore';
  className?: string;
}

interface AdPlacement {
  id: string;
  network: string;
  placement_type: string;
  code: string;
  location: string;
}

// Track slots already pushed to avoid double-push
const pushedSlots = new Set<string>();

export function DynamicAd({ location, className = '' }: DynamicAdProps) {
  const [adPlacements, setAdPlacements] = useState<AdPlacement[]>([]);
  const [loading, setLoading] = useState(true);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    fetchAds();
  }, [location]);

  const fetchAds = async () => {
    try {
      const { data } = await supabase.rpc('get_active_ads', { location_filter: location });
      const filtered = isNative
        ? (data || []).filter((a: AdPlacement) => a.network !== 'adsense')
        : (data || []);
      setAdPlacements(filtered);
    } catch {
      // silent — ads are non-critical
    } finally {
      setLoading(false);
    }
  };

  const trackImpression = async (adId: string) => {
    supabase.rpc('track_ad_view', { ad_id_param: adId, user_id_param: null }).catch(() => {});
  };

  if (loading || adPlacements.length === 0) return null;
  if (isNative) return null;

  const ad = adPlacements[0];
  if (!ad.code) return null;

  if (ad.network === 'adsense') {
    return (
      <div className={className}>
        <WebAdSense adSlot={ad.code} adId={ad.id} onLoad={() => trackImpression(ad.id)} />
      </div>
    );
  }

  return null;
}

function WebAdSense({ adSlot, adId, onLoad }: { adSlot: string; adId: string; onLoad: () => void }) {
  const insRef = useRef<HTMLModElement>(null);
  const key = `${adId}-${adSlot}`;

  useEffect(() => {
    if (pushedSlots.has(key)) return;
    const timer = setTimeout(() => {
      try {
        if (typeof window !== 'undefined') {
          window.adsbygoogle = window.adsbygoogle || [];
          window.adsbygoogle.push({});
          pushedSlots.add(key);
          onLoad();
        }
      } catch (_) {}
    }, 300);
    return () => clearTimeout(timer);
  }, [key, onLoad]); // Removed the eslint-disable-next-line comment

  return (
    <div>
      <p className="text-[10px] text-center text-muted-foreground/50 mb-0.5 uppercase tracking-wider">Sponsored</p>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block', minHeight: 60 }}
        data-ad-client="ca-app-pub-7234579833875016"
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

declare global {
  interface Window { adsbygoogle: any[]; }
}
