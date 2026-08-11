import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Volume2, VolumeX } from 'lucide-react';

interface VideoAdPlayerProps {
  videoUrl: string;
  onAdComplete: () => void;
  onSkip?: () => void;
  allowSkip?: boolean;
  skipAfter?: number;
}

/**
 * YouTube-style Video Ad Player (web only — AdMob removed).
 */
export function VideoAdPlayer({
  videoUrl,
  onAdComplete,
  onSkip,
  allowSkip = true,
  skipAfter = 5,
}: VideoAdPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [adData, setAdData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(skipAfter);
  const [canSkip, setCanSkip] = useState(false);
  const [muted, setMuted] = useState(true);
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    fetchVideoAd();
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (allowSkip) {
      setCanSkip(true);
    }
  }, [countdown, allowSkip]);

  const fetchVideoAd = async () => {
    try {
      const { data: sponsoredAd } = await supabase
        .from('sponsored_content')
        .select('*')
        .not('video_url', 'is', null)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (sponsoredAd) {
        setAdData(sponsoredAd);
        trackImpression(sponsoredAd.id);
      } else {
        setAdData({
          id: 'platform_ad',
          video_url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          title: 'Testagram — Where Your Voice Matters',
          target_url: '/premium',
        });
      }
      setLoading(false);
    } catch {
      onAdComplete();
    }
  };

  const trackImpression = async (adId: string) => {
    if (tracked) return;
    try {
      await supabase.rpc('track_sponsored_impression', {
        content_id_param: adId,
        user_id_param: null,
        clicked_param: false,
      });
      setTracked(true);
    } catch {}
  };

  const handleAdClick = async () => {
    if (!adData) return;
    try {
      await supabase.rpc('track_sponsored_impression', {
        content_id_param: adData.id,
        user_id_param: null,
        clicked_param: true,
      });
      if (adData.target_url) window.open(adData.target_url, '_blank');
    } catch {}
  };

  const handleSkip = () => {
    if (canSkip && onSkip) onSkip();
    onAdComplete();
  };

  if (loading || !adData) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          src={adData.video_url}
          autoPlay
          muted={muted}
          onEnded={onAdComplete}
          onClick={handleAdClick}
          className="w-full h-full object-contain cursor-pointer"
        />
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between">
            <div className="bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded">AD</div>
            {canSkip && allowSkip ? (
              <button onClick={handleSkip} className="bg-white/90 hover:bg-white text-black font-bold px-4 py-2 rounded flex items-center gap-2 transition-all">
                Skip Ad <X className="w-4 h-4" />
              </button>
            ) : (
              <div className="bg-black/70 text-white text-sm px-3 py-1 rounded">Skip in {countdown}s</div>
            )}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
          <div className="flex items-end justify-between">
            <div onClick={handleAdClick} className="cursor-pointer hover:opacity-80 transition-opacity">
              <p className="text-white font-bold text-lg mb-1">{adData.title || 'Sponsored Content'}</p>
              <p className="text-white/80 text-sm">{adData.advertiser_name || 'Testagram'}</p>
            </div>
            <button onClick={() => setMuted(!muted)} className="bg-white/20 hover:bg-white/30 p-3 rounded-full transition-colors">
              {muted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
