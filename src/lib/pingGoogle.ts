const SITEMAP_URL = 'https://testagram.site/sitemap.xml';
const PING_COOLDOWN_MS = 60_000;

// Closure-scoped mutable state — NOT module-level to avoid esbuild non-determinism
const _ping = { lastAt: 0 };

export async function pingGoogleSitemap(): Promise<void> {
  const now = Date.now();
  if (now - _ping.lastAt < PING_COOLDOWN_MS) return;
  _ping.lastAt = now;
  try {
    await fetch(
      `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`,
      { method: 'GET', mode: 'no-cors', cache: 'no-store' }
    );
    console.log('[SEO] Pinged Google sitemap');
  } catch {
    // ignore
  }
  try {
    const backendBase = import.meta.env.VITE_SUPABASE_URL?.replace('/rest/v1', '').replace('/v1', '') ?? '';
    if (backendBase) {
      fetch(`${backendBase}/functions/v1/sitemap-refresh`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      }).catch(() => {});
    }
  } catch {
    // ignore
  }
}
