import { useEffect, useRef, useState } from 'react';

/**
 * FeedAdCard — AdSense ad styled as a native post card.
 * Collapses to zero height if AdSense doesn't fill the slot.
 * No reserved space — only visible when an ad actually loads.
 */
export function FeedAdCard() {
  const pushed   = useRef(false);
  const insRef   = useRef<HTMLModElement>(null);
  const [filled, setFilled] = useState<boolean | null>(null); // null = pending

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;

    // Give AdSense 2s to fill the slot, then check if it placed content
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (_) {}

    const checkFilled = () => {
      const el = insRef.current;
      if (!el) { setFilled(false); return; }
      // AdSense sets data-ad-status="filled" or "unfilled"
      const status = el.getAttribute('data-ad-status');
      if (status === 'unfilled') { setFilled(false); return; }
      // Fallback: check if any child element was injected
      const hasContent = el.children.length > 0 || (el as any).offsetHeight > 4;
      setFilled(hasContent);
    };

    // Check after AdSense has had time to respond
    const t1 = setTimeout(checkFilled, 1500);
    const t2 = setTimeout(checkFilled, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // While pending (null) render hidden placeholder; if unfilled collapse completely
  if (filled === false) return null;

  return (
    <div
      className="border-b border-border"
      style={{ display: filled === null ? 'block' : 'block' }}
    >
      {/* Native post card header — looks like organic content */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-1.5">
        {/* Sponsor avatar placeholder */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 border border-border">
          <span className="text-primary text-xs font-black">Ad</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">Sponsored</span>
            {/* Subtle "Ad" pill — clearly marks it as advertising */}
            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Ad
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Promoted content</p>
        </div>
      </div>

      {/* AdSense slot — no minHeight so it doesn't reserve empty space */}
      <div className="px-4 pb-3">
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
    </div>
  );
}
