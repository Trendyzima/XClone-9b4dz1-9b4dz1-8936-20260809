import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Volume2, VolumeX } from 'lucide-react';
import { showInterstitial, showRewarded, ADMOB_CONFIG } from '@/lib/admob';

interface VideoAdPlayerProps {
  videoUrl: string;
  onAdComplete: () => void;
  onSkip?: () => void;
  allowSkip?: boolean;
  skipAfter?: number; // seconds
}

/**
 * YouTube-style Video Ad Player with real AdMob integration
 */
export function VideoAdPlayer({
  videoUrl,
  onAdComplete,
  onSkip,
  allowSkip = true,
  skipAfter = 5
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
    showAdMobInterstitial(); // Show interstitial at start
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
      // Get active video ad placement
      const { data: placement } = await supabase
        .from('ad_placements')
        .select('*')
        .eq('network', 'admob')
        .eq('placement_type', 'rewarded')
        .eq('is_active', true)
        .single();

      if (!placement) {
        // No ad available, skip
        onAdComplete();
        return;
      }

      // Fetch sponsored video content or use generic ad
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
        showAdMobRewarded(); // Show rewarded ad for this placement
      } else {
        // Use generic platform ad
        setAdData({
          id: 'platform_ad',
          video_url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          title: 'T Social - Where Your Voice Matters',
          target_url: '/premium'
        });
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching video ad:', error);
      onAdComplete(); // Skip ad on error
    }
  };

  const trackImpression = async (adId: string) => {
    if (tracked) return;
    
    try {
      await supabase.rpc('track_sponsored_impression', {
        content_id_param: adId,
        user_id_param: null,
        clicked_param: false
      });
      setTracked(true);
    } catch (error) {
      console.error('Error tracking impression:', error);
    }
  };

  const handleAdClick = async () => {
    if (!adData) return;

    try {
      // Track click
      await supabase.rpc('track_sponsored_impression', {
        content_id_param: adData.id,
        user_id_param: null,
        clicked_param: true
      });

      // Open target URL in new tab
      if (adData.target_url) {
        window.open(adData.target_url, '_blank');
      }
    } catch (error) {
      console.error('Error tracking click:', error);
    }
  };

  const handleSkip = () => {
    if (canSkip && onSkip) onSkip();
    onAdComplete();
  };

  const handleVideoEnd = () => {
    onAdComplete();
  };

  const showAdMobInterstitial = () => showInterstitial(ADMOB_CONFIG.INTERSTITIAL);
  const showAdMobRewarded    = () => showRewarded(ADMOB_CONFIG.REWARDED);

  if (loading || !adData) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          src={adData.video_url}
          autoPlay
          muted={muted}
          onEnded={handleVideoEnd}
          onClick={handleAdClick}
          className="w-full h-full object-contain cursor-pointer"
        />

        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between">
            <div className="bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded">AD</div>
            {canSkip && allowSkip ? (
              <button
                onClick={handleSkip}
                className="bg-white/90 hover:bg-white text-black font-bold px-4 py-2 rounded flex items-center gap-2 transition-all"
              >
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
              <p className="text-white/80 text-sm">{adData.advertiser_name || 'T Social'}</p>
            </div>
            <button
              onClick={() => setMuted(!muted)}
              className="bg-white/20 hover:bg-white/30 p-3 rounded-full transition-colors"
            >
              {muted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
