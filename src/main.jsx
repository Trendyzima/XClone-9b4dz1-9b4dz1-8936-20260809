import { createRoot } from 'react-dom/client';
import './index.css';
import { AppBootBoundary } from './components/layout/AppBootBoundary';
import './lib/platformReels';

const container = document.getElementById('root');
if (!container) throw new Error('Testagram root element is missing');
const root = createRoot(container);

// Federated object URLs are data identities, not navigation destinations.
// Some legacy/remote-fed cards still render an "Open on origin" anchor. Keep
// those clicks inside Testagram so the canonical Fediverse detail page can
// render the post and expose the existing ActivityPub interaction controls.
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!target) return;
  const href = target.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
  let url;
  try { url = new URL(href, window.location.href); } catch { return; }
  if (url.origin === window.location.origin) return;

  const label = (target.textContent || target.getAttribute('aria-label') || '').trim().toLowerCase();
  const inFediverseArea = window.location.pathname.startsWith('/fediverse');
  const looksLikeOriginAction = label.includes('open on origin') || label.includes('view on origin');
  if (!inFediverseArea && !looksLikeOriginAction) return;

  event.preventDefault();
  event.stopPropagation();
  const internal = `/fediverse/post?url=${encodeURIComponent(url.toString())}`;
  window.location.assign(internal);
}, true);

function renderBootError(error) {
  console.error('[Testagram boot] Module load failure', error);
  const message = error instanceof Error ? error.message : String(error);
  const safe = message.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  container.innerHTML = `<main class="min-h-screen bg-background text-foreground flex items-center justify-center p-6"><section class="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-xl"><div class="text-3xl mb-3">⚠️</div><h1 class="text-xl font-black">Testagram could not load</h1><p class="mt-2 text-sm text-muted-foreground">A production JavaScript module failed before React could start.</p><pre class="mt-4 max-h-40 overflow-auto rounded-xl bg-muted p-3 text-xs whitespace-pre-wrap break-words">${safe}</pre><button onclick="location.reload()" class="mt-5 w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground">Reload Testagram</button></section></main>`;
}

// The social app is the critical path. Optional wallet UI is loaded only after
// React is alive, so a wallet integration/config error can never produce a blank app.
import('./App')
  .then(({ default: App }) => {
    root.render(<AppBootBoundary><App /></AppBootBoundary>);
    import('./components/features/WalletPayPalOverlay')
      .then(({ default: WalletPayPalOverlay }) => {
        const host = document.createElement('div');
        host.id = 'testagram-wallet-overlay';
        document.body.appendChild(host);
        createRoot(host).render(<WalletPayPalOverlay />);
      })
      .catch(error => console.warn('[Testagram wallet] Optional wallet UI disabled:', error));
  })
  .catch(renderBootError);
