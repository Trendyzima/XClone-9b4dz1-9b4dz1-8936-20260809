/**
 * AdMob Production Configuration
 * App ID: ca-app-pub-7234579833875016~4829778821
 *
 * Production mode only — no test ads, no blank popups.
 * Proper initialization ensures ads show on native platforms.
 */

import { AdMob, BannerAdSize, BannerAdPosition, AdMobRewardItem } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

export const ADMOB_CONFIG = {
  APP_ID: 'ca-app-pub-7234579833875016~4829778821',

  // ── Banners ───────────────────────────────────────────────────────
  // Primary banner — used on feed, home, explore
  BANNER_FEED:        'ca-app-pub-7234579833875016/4099641690',
  // Secondary banner — used on profile, wallet, creator studio
  BANNER_PROFILE:     'ca-app-pub-7234579833875016/4099641690',
  // Explore / search banner
  BANNER_EXPLORE:     'ca-app-pub-7234579833875016/4099641690',

  // ── Interstitial ──────────────────────────────────────────────────
  // Full-screen ad shown between page transitions
  INTERSTITIAL:       'ca-app-pub-7234579833875016/8911947261',

  // ── Rewarded ──────────────────────────────────────────────────────
  // Rewarded video ad — user watches for unlock/boost
  REWARDED:           'ca-app-pub-7234579833875016/2031881558',

  // ── Native/Content Ad ─────────────────────────────────────────────
  // Native advanced ad — rendered inside feed as a card
  NATIVE:             'ca-app-pub-7234579833875016/3193754134',
} as const;

/**
 * Revenue split per ad type (matches creator_ad_revenue table)
 * Creators get 30% of attributed impressions; platform retains 70%
 */
export const AD_REVENUE_SPLIT = {
  CREATOR_SHARE: 0.30,
  PLATFORM_SHARE: 0.70,
  // Estimated CPM (USD) per ad type — adjust as actuals come in from AdMob dashboard
  ESTIMATED_CPM: {
    banner: 0.80,
    interstitial: 4.50,
    rewarded: 8.00,
    native: 2.50,
  },
} as const;

let initialized = false;
let interstitialReady = false;
let rewardedReady = false;

/** Returns true if running on a native platform where AdMob is available */
export function isAdMobSupported(): boolean {
  return Capacitor.isNativePlatform();
}

// ─── Core Init ───────────────────────────────────────────────────────────────
/**
 * Initialize AdMob for production.
 * Must be called before showing any ads.
 * Safe to call multiple times — will skip if already initialized.
 */
export async function initAdMob() {
  if (!isAdMobSupported()) return;
  if (initialized) return;
  try {
    await AdMob.initialize({
      requestTrackingAuthorization: true,   // iOS ATT prompt
      initializeForTesting: false,           // PRODUCTION — real revenue
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    initialized = true;
    console.log('[AdMob] Initialized — production mode (App: ca-app-pub-7234579833875016~4829778821)');

    // Listen for revenue events to track creator earnings
    AdMob.addListener('onAdImpression' as any, (info: any) => {
      console.log('[AdMob] Impression:', info);
    });

    // Silently preload heavy ad types after short delay
    setTimeout(() => {
      preloadInterstitial().catch(() => {});
      preloadRewarded().catch(() => {});
    }, 3000);
  } catch (err) {
    console.warn('[AdMob] Init error:', err);
  }
}

// ─── Banner ──────────────────────────────────────────────────────────────────
/**
 * Show a native AdMob banner.
 * @param adId    Production ad unit ID
 * @param position Banner position
 * @param margin  Bottom margin in px (64 clears bottom nav)
 */
export async function showBanner(
  adId: string = ADMOB_CONFIG.BANNER_FEED,
  position: BannerAdPosition = BannerAdPosition.BOTTOM_CENTER,
  margin = 64
) {
  if (!isAdMobSupported()) return;
  if (!initialized) await initAdMob();
  try {
    await AdMob.showBanner({
      adId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position,
      margin,
      isTesting: false,
    });
    console.log('[AdMob] Banner shown:', adId.slice(-8));
  } catch (err) {
    console.warn('[AdMob] Banner error:', err);
  }
}

export async function hideBanner() {
  if (!isAdMobSupported()) return;
  try { await AdMob.hideBanner(); } catch (_) {}
}

// ─── Interstitial ────────────────────────────────────────────────────────────
async function preloadInterstitial(adId = ADMOB_CONFIG.INTERSTITIAL) {
  if (!isAdMobSupported()) return;
  try {
    await AdMob.prepareInterstitial({ adId, isTesting: false });
    interstitialReady = true;
    console.log('[AdMob] Interstitial ready');
  } catch (err) {
    interstitialReady = false;
    console.warn('[AdMob] Interstitial preload:', err);
  }
}

/** Show interstitial. Auto-reloads for next call. Returns true on success. */
export async function showInterstitial(adId = ADMOB_CONFIG.INTERSTITIAL): Promise<boolean> {
  if (!isAdMobSupported()) return false;
  if (!initialized) await initAdMob();
  try {
    if (!interstitialReady) await preloadInterstitial(adId);
    await AdMob.showInterstitial();
    interstitialReady = false;
    preloadInterstitial(adId).catch(() => {});
    return true;
  } catch (err) {
    console.warn('[AdMob] Interstitial show:', err);
    return false;
  }
}

// ─── Rewarded ────────────────────────────────────────────────────────────────
async function preloadRewarded(adId = ADMOB_CONFIG.REWARDED) {
  if (!isAdMobSupported()) return;
  try {
    await AdMob.prepareRewardVideoAd({ adId, isTesting: false });
    rewardedReady = true;
    console.log('[AdMob] Rewarded ready');
  } catch (err) {
    rewardedReady = false;
    console.warn('[AdMob] Rewarded preload:', err);
  }
}

/** Show rewarded ad. Returns reward item or null on failure/skip. */
export async function showRewarded(adId = ADMOB_CONFIG.REWARDED): Promise<AdMobRewardItem | null> {
  if (!isAdMobSupported()) return null;
  if (!initialized) await initAdMob();
  try {
    if (!rewardedReady) await preloadRewarded(adId);
    const result = await AdMob.showRewardVideoAd();
    rewardedReady = false;
    preloadRewarded(adId).catch(() => {});
    return result?.reward ?? null;
  } catch (err) {
    console.warn('[AdMob] Rewarded show:', err);
    return null;
  }
}

// ─── Creator Revenue Tracking ────────────────────────────────────────────────
/**
 * Track AdMob impression revenue for a creator.
 * Called after each banner/interstitial impression attributed to creator content.
 * Revenue split: 30% creator / 70% platform (as configured).
 */
export async function trackCreatorAdRevenue(params: {
  supabase: any;
  creatorUserId: string;
  adType: 'banner' | 'interstitial' | 'rewarded';
  grossRevenue: number; // USD
}) {
  const CREATOR_SHARE = 0.30; // 30% to creator
  const PLATFORM_SHARE = 0.70;

  const creatorAmount = params.grossRevenue * CREATOR_SHARE;
  const platformAmount = params.grossRevenue * PLATFORM_SHARE;

  try {
    // Log earning
    await params.supabase.from('creator_earnings').insert({
      user_id: params.creatorUserId,
      source: `${params.adType}_ads`,
      amount: creatorAmount,
      status: 'pending',
    });

    // Update revenue_shares
    await params.supabase.rpc('increment', {
      table_name: 'revenue_shares',
      field_name: 'user_share',
      row_id: params.creatorUserId,
      amount: creatorAmount,
    }).catch(() => {}); // RPC may not exist — silent fail

    console.log(`[AdMob Revenue] Creator ${params.creatorUserId} earned $${creatorAmount.toFixed(4)}`);
  } catch (e) {
    console.warn('[AdMob Revenue] Tracking error:', e);
  }
}
