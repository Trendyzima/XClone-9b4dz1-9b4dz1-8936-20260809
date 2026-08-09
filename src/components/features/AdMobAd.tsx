/**
 * AdMob Component — Production Mode
 * All ads use real production IDs. No isTesting flags.
 * Uses centralized config from @/lib/admob
 */
import { useEffect } from 'react';
import {
  showBanner, hideBanner, showInterstitial, showRewarded,
  ADMOB_CONFIG
} from '@/lib/admob';
import { BannerAdPosition } from '@capacitor-community/admob';

interface AdMobAdProps {
  adId?: string;
  type: 'banner' | 'interstitial' | 'rewarded';
  position?: BannerAdPosition;
  onAdLoaded?: () => void;
  onAdFailed?: (error: any) => void;
  onRewarded?: (reward: any) => void;
}

export function AdMobAd({
  adId,
  type,
  position = BannerAdPosition.BOTTOM_CENTER,
  onAdLoaded,
  onAdFailed,
  onRewarded,
}: AdMobAdProps) {

  useEffect(() => {
    if (type !== 'banner') return;

    const id = adId || ADMOB_CONFIG.BANNER_FEED;
    showBanner(id, position).then(() => onAdLoaded?.()).catch(onAdFailed);

    return () => { hideBanner(); };
  }, [adId, type, position]);

  const triggerInterstitial = async () => {
    const ok = await showInterstitial(adId || ADMOB_CONFIG.INTERSTITIAL);
    if (ok) onAdLoaded?.(); else onAdFailed?.(new Error('Interstitial failed'));
  };

  const triggerRewarded = async () => {
    const reward = await showRewarded(adId || ADMOB_CONFIG.REWARDED);
    if (reward) { onAdLoaded?.(); onRewarded?.(reward); }
    else onAdFailed?.(new Error('Rewarded ad failed'));
  };

  if (type === 'interstitial') {
    return <button onClick={triggerInterstitial} className="hidden" aria-hidden="true" />;
  }
  if (type === 'rewarded') {
    return <button onClick={triggerRewarded} className="hidden" aria-hidden="true" />;
  }

  return null; // Banner is native — no DOM element needed
}

/** Hook for programmatic ad triggering */
export const useAdMob = () => ({
  showInterstitial: (id = ADMOB_CONFIG.INTERSTITIAL) => showInterstitial(id),
  showRewarded:     (id = ADMOB_CONFIG.REWARDED)     => showRewarded(id),
  showBanner:       (id = ADMOB_CONFIG.BANNER_FEED, pos = BannerAdPosition.TOP_CENTER) =>
                      showBanner(id, pos),
  hideBanner,
});
