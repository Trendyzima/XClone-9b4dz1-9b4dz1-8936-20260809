/**
 * usePageBanner — manages a page-level AdMob banner.
 *
 * Placement strategy:
 * - Position: BOTTOM_CENTER with 64px margin (clears the bottom nav, which is ~56px)
 * - Show after a short delay so the user sees content first (non-intrusive)
 * - Auto-hide on unmount
 */
import { useEffect } from 'react';
import { BannerAdPosition } from '@capacitor-community/admob';
import { showBanner, hideBanner, ADMOB_CONFIG } from '@/lib/admob';

interface PageBannerOptions {
  /** Ad unit ID override — defaults to BANNER_FEED */
  adId?: string;
  /** Margin above bottom in px — defaults to 64 (above bottom nav) */
  margin?: number;
  /** Delay in ms before showing (non-intrusive) — defaults to 2000 */
  delay?: number;
  /** Position override */
  position?: BannerAdPosition;
  /** Set false to disable on this page */
  enabled?: boolean;
}

export function usePageBanner({
  adId = ADMOB_CONFIG.BANNER_FEED,
  margin = 64,
  delay = 2000,
  position = BannerAdPosition.BOTTOM_CENTER,
  enabled = true,
}: PageBannerOptions = {}) {
  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout>;
    let active = true;

    timer = setTimeout(async () => {
      if (!active) return;
      await showBanner(adId, position, margin);
    }, delay);

    return () => {
      active = false;
      clearTimeout(timer);
      hideBanner();
    };
  }, [adId, margin, delay, position, enabled]);
}
