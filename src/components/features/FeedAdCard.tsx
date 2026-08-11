import { useEffect, useRef } from 'react';

/**
 * FeedAdCard — AdSense native inline card injected every 5th post.
 * Each instance pushes to adsbygoogle once on mount.
 * Matches feed card visual style (border-b, padding).
 */
export function FeedAdCard() {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (_) {}
  }, []);

  return (
    <div className="border-b border-border px-4 py-3 bg-muted/10">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
        Sponsored
      </p>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: 90 }}
        data-ad-client="ca-pub-2458567543017441"
        data-ad-slot="2031881558"
        data-ad-format="fluid"
        data-ad-layout="in-article"
        data-full-width-responsive="true"
      />
    </div>
  );
}
