const SITEMAP_URL = 'https://testagram.site/sitemap.xml';
const PING_COOLDOWN_MS = 60_000; // max 1 ping per minute to avoid quota abuse

let lastPingAt = 0;

export async function pingGoogleSitemap(): Promise<void> {
  const now = Date.now();
  if (now - lastPingAt < PING_COOLDOWN_MS) return; // throttle
  lastPingAt = now;

  try {
    await fetch(
      `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`,
      { method: 'GET', mode: 'no-cors', cache: 'no-store' }
    );
    console.log('[SEO] Pinged Google sitemap');
  } catch {
    // Silently ignore — network errors must never surface to users
  }

  // Also trigger a background refresh of the dynamic sitemap cache
  try {
    const backendBase = import.meta.env.VITE_SUPABASE_URL?.replace('/rest/v1', '').replace('/v1', '') ?? '';
    if (backendBase) {
      fetch(`${backendBase}/functions/v1/sitemap-refresh`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      }).catch(() => {});
    }
  } catch {
    // Ignore
  }
}
