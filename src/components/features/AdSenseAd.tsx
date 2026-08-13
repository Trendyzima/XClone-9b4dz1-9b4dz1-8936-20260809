import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@/lib/capacitor-stub';

interface AdSenseAdProps {
  adSlot: string;
  adFormat?: 'auto' | 'fluid' | 'rectangle' | 'vertical' | 'horizontal';
  fullWidthResponsive?: boolean;
  className?: string;
  onAdLoad?: () => void;
  style?: React.CSSProperties;
}

/**
 * Google AdSense Ad Component — collapses when unfilled (no reserved space).
 * Client: ca-pub-2458567543017441
 * Only renders on web (not native app).
 */
export function AdSenseAd({
  adSlot,
  adFormat = 'fluid',
  fullWidthResponsive = true,
  className = '',
  onAdLoad,
  style,
}: AdSenseAdProps) {
  // esbuild guard: no explicit generic annotations on useRef/useState
  const adRef   = useRef(null);
  const pushed  = useRef(false);
  const [filled, setFilled] = useState(null); // null = pending

  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNative) return;
    if (pushed.current) return;
    const timer = setTimeout(() => {
      try {
        if (typeof window !== 'undefined') {
          ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
          pushed.current = true;
          onAdLoad?.();
        }
      } catch (_) {}
    }, 200);

    const checkFill = () => {
      const el = adRef.current;
      if (!el) { setFilled(false); return; }
      const status = el.getAttribute('data-ad-status');
      if (status === 'unfilled') { setFilled(false); return; }
      setFilled(el.children.length > 0 || (el as any).offsetHeight > 4);
    };
    const t1 = setTimeout(checkFill, 1800);
    const t2 = setTimeout(checkFill, 3500);

    return () => { clearTimeout(timer); clearTimeout(t1); clearTimeout(t2); };
  }, [adSlot, isNative, onAdLoad]);

  if (isNative) return null;
  if (filled === false) return null; // Collapse — no dead space

  return (
    <div className={`adsense-wrapper ${className}`}>
      {/* Native-style label */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Sponsored</span>
        <span className="text-[9px] font-bold uppercase tracking-widest px-1 py-0.5 rounded-sm bg-amber-500/10 text-amber-500 border border-amber-500/15">Ad</span>
      </div>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block', ...style }}
        data-ad-client="ca-pub-2458567543017441"
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-ad-layout={adFormat === 'fluid' ? 'in-article' : undefined}
        data-full-width-responsive={fullWidthResponsive.toString()}
      />
    </div>
  );
}

// ─── Page Banner — renders inline, collapses when unfilled ───────────────────
/**
 * PageAdBanner — drop-in replacement for all the per-page AdSense banners.
 * Styled as a subtle native card. No minHeight — zero dead space if unfilled.
 */
export function PageAdBanner() {
  // esbuild guard: no explicit generic annotations on useRef/useState
  const pushed  = useRef(false);
  const insRef  = useRef(null);
  const [filled, setFilled] = useState(null);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch (_) {}

    const checkFill = () => {
      const el = insRef.current;
      if (!el) { setFilled(false); return; }
      const status = el.getAttribute('data-ad-status');
      if (status === 'unfilled') { setFilled(false); return; }
      setFilled(el.children.length > 0 || (el as any).offsetHeight > 4);
    };
    const t1 = setTimeout(checkFill, 1800);
    const t2 = setTimeout(checkFill, 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Never show blank placeholder — only render once filled is confirmed true
  if (filled !== true) return null;

  return (
    <div className="mx-4 mt-2 mb-1 rounded-xl overflow-hidden border border-border/60 bg-muted/5">
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50">Sponsored</span>
        <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded-sm bg-amber-500/10 text-amber-500 border border-amber-500/15">Ad</span>
      </div>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-2458567543017441"
        data-ad-slot="2031881558"
        data-ad-format="fluid"
        data-ad-layout="in-article"
        data-full-width-responsive="true"
      />
    </div>
  );
}

// ─── Feed Banner Ad ───────────────────────────────────────────────────────────
export function FeedBannerAd({ className }: { className?: string }) {
  return (
    <AdSenseAd
      adSlot="4099641690"
      adFormat="fluid"
      fullWidthResponsive
      className={className}
    />
  );
}

// ─── In-Article Ad ────────────────────────────────────────────────────────────
export function InArticleAd({ className }: { className?: string }) {
  return (
    <AdSenseAd
      adSlot="4099641690"
      adFormat="fluid"
      fullWidthResponsive
      className={className}
    />
  );
}

declare global {
  interface Window { adsbygoogle: any[]; }
}
