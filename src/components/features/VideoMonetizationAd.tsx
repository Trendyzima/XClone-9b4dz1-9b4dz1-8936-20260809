/**
 * VideoMonetizationAd
 * Shows a pre-roll / mid-roll overlay ad over a video.
 * - Web: AdSense banner overlay + countdown skip
 * - Native (Capacitor): AdMob interstitial (once per session per video)
 */
import { useState, useEffect, useRef } from 'react';
import { X, Volume2, VolumeX } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

interface VideoMonetizationAdProps {
  postId: string;
  creatorUserId: string;
  onAdComplete: () => void; // called when ad finishes or is skipped
  skipAfterSeconds?: number;
}

const AD_REVENUE_PER_VIEW = 0.0003; // $0.0003 per ad view
const CREATOR_SHARE = 0.30;         // 30% to creator
const PLATFORM_SHARE = 0.70;        // 70% to platform

let nativeAdShownThisSession = new Set<string>();

export function VideoMonetizationAd({
  postId,
  creatorUserId,
  onAdComplete,
  skipAfterSeconds = 5,
}: VideoMonetizationAdProps) {
  const [countdown, setCountdown]   = useState(skipAfterSeconds);
  const [canSkip, setCanSkip]       = useState(false);
  const [adDismissed, setAdDismissed] = useState(false);
  const [muted, setMuted]           = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // On native platform — use AdMob interstitial (once per postId per session)
    if (Capacitor.isNativePlatform()) {
      if (!nativeAdShownThisSession.has(postId)) {
        nativeAdShownThisSession.add(postId);
        // Fire-and-forget — the admob lib handles the UI
        import('@/lib/admob').then(({ showInterstitial }) => {
          showInterstitial().catch(() => {});
        });
      }
      // Track revenue and immediately call completion (native ad handles its own UI)
      trackAdRevenue();
      onAdComplete();
      return;
    }

    // Web: show countdown overlay
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const trackAdRevenue = async () => {
    try {
      const creatorAmount = AD_REVENUE_PER_VIEW * CREATOR_SHARE;
      await supabase.from('creator_earnings').insert({
        user_id: creatorUserId,
        source: 'video_ads',
        amount: creatorAmount,
        post_id: postId,
        status: 'pending',
      });
      await supabase.from('post_analytics')
        .upsert({ post_id: postId }, { onConflict: 'post_id' });
    } catch (err) {
      console.warn('[VideoAd] revenue tracking error:', err);
    }
  };

  const handleSkip = () => {
    trackAdRevenue();
    setAdDismissed(true);
    onAdComplete();
  };

  if (adDismissed || Capacitor.isNativePlatform()) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col pointer-events-auto">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Ad content area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4">
        {/* AdSense unit */}
        <div className="w-full max-w-sm bg-black/40 rounded-xl overflow-hidden border border-white/10">
          <div className="px-3 py-1.5 bg-black/60 flex items-center justify-between">
            <span className="text-xs text-white/60 font-semibold uppercase tracking-wider">Ad</span>
            <button
              onClick={() => setMuted(m => !m)}
              className="text-white/60 hover:text-white transition-colors"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Responsive AdSense */}
          <div className="w-full min-h-[120px] bg-black/20 flex items-center justify-center">
            <ins
              className="adsbygoogle"
              style={{ display: 'block', width: '100%', minHeight: '100px' }}
              data-ad-client="ca-pub-7234579833875016"
              data-ad-slot="5642388963"
              data-ad-format="fluid"
              data-full-width-responsive="true"
            />
          </div>
        </div>

        <p className="text-white/50 text-xs mt-2 text-center">
          Supporting creators with ad revenue (30% goes to them)
        </p>
      </div>

      {/* Skip button */}
      <div className="relative z-10 flex justify-end items-center p-4 pb-8">
        {canSkip ? (
          <button
            onClick={handleSkip}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black font-bold text-sm rounded-full hover:bg-white/90 transition-all shadow-lg"
          >
            <X className="w-4 h-4" />
            Skip Ad
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-black/60 border border-white/30 text-white text-sm rounded-full">
            <span>Skip in {countdown}s</span>
          </div>
        )}
      </div>
    </div>
  );
}
