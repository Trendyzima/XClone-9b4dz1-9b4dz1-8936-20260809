/**
 * usePageBanner — no-op hook (AdMob removed; use AdSense slots directly in page JSX).
 */
export function usePageBanner(_options?: {
  adId?: string;
  margin?: number;
  delay?: number;
  enabled?: boolean;
}) {
  // AdMob banner support removed. Embed an AdSense <ins> slot in the page instead.
}
