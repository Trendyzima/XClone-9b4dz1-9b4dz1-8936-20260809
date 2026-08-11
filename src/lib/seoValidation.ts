/**
 * SEO Validation Utility
 * Provides runtime checks for SEO coverage across key routes.
 *
 * Usage in SEOAuditPage:
 *   import { SEO_COVERAGE, validateSEOCoverage } from '@/lib/seoValidation';
 */

export interface SEORoute {
  path: string;
  label: string;
  group: 'Core' | 'Hashtags' | 'Trending' | 'Communities' | 'Dynamic' | 'Private' | 'Admin';
  hasUseSEO: boolean;
  hasStructuredData: boolean;
  noindex: boolean;
}

/**
 * Single source-of-truth manifest. Keep in sync with actual page implementations.
 * Update hasUseSEO/hasStructuredData when adding useSEO() to new pages.
 */
export const SEO_COVERAGE: SEORoute[] = [
  // ── Core public pages ──────────────────────────────────────────────────────
  { path: '/',            label: 'Home Feed',     group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/explore',     label: 'Explore',       group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/videos',      label: 'Videos',        group: 'Core',       hasUseSEO: true,  hasStructuredData: false, noindex: false },
  { path: '/threads',     label: 'Threads',       group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/search',      label: 'Search',        group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/communities', label: 'Communities',   group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/leaderboard', label: 'Leaderboard',   group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/spaces',      label: 'Spaces',        group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/products',    label: 'Products',      group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/discover',    label: 'Discover',      group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/fediverse',   label: 'Fediverse',     group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/premium',     label: 'Premium',       group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/ai',          label: 'AI',            group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/help',        label: 'Help',          group: 'Core',       hasUseSEO: true,  hasStructuredData: true,  noindex: false },

  // ── SEO-enhanced pages ─────────────────────────────────────────────────────
  { path: '/hashtag/technology', label: '#technology',          group: 'Hashtags',    hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/hashtag/news',       label: '#news',                group: 'Hashtags',    hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/hashtag/ai',         label: '#ai',                  group: 'Hashtags',    hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/trending/technology',label: 'Trending: technology', group: 'Trending',    hasUseSEO: true,  hasStructuredData: false, noindex: false },
  { path: '/trending/sports',    label: 'Trending: sports',     group: 'Trending',    hasUseSEO: true,  hasStructuredData: false, noindex: false },
  { path: '/c/technology',       label: 'c/technology',         group: 'Communities', hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/c/sports',           label: 'c/sports',             group: 'Communities', hasUseSEO: true,  hasStructuredData: true,  noindex: false },

  // ── Dynamic pages ──────────────────────────────────────────────────────────
  { path: '/profile/{username}', label: 'Profile pages',        group: 'Dynamic',     hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/thread/{id}',        label: 'Thread detail',        group: 'Dynamic',     hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/post/{id}',          label: 'Post detail',          group: 'Dynamic',     hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/live/{id}',          label: 'Live Stream',          group: 'Dynamic',     hasUseSEO: true,  hasStructuredData: true,  noindex: false },
  { path: '/spaces/recording/{id}', label: 'Space Recording',   group: 'Dynamic',     hasUseSEO: true,  hasStructuredData: true,  noindex: false },

  // ── Private / auth pages (should be noindex) ───────────────────────────────
  { path: '/auth',               label: 'Auth',                 group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/settings',           label: 'Settings',             group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/wallet',             label: 'Wallet',               group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/messages',           label: 'Messages',             group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/notifications',      label: 'Notifications',        group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/bookmarks',          label: 'Bookmarks',            group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/scheduled',          label: 'Scheduled Posts',      group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/payouts',            label: 'Payouts',              group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/history',            label: 'Browsing History',     group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/platform-inbox',     label: 'Platform Inbox',       group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/creator-studio',     label: 'Creator Studio',       group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/wishlist',           label: 'Wishlist',             group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/monetization',       label: 'Monetization',         group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/analytics',          label: 'Analytics',            group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/verify',             label: 'Verification Request', group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/rewards',            label: 'Daily Rewards',        group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/referrals',          label: 'Referrals',            group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/interests',          label: 'Interest Onboarding',  group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/notification-preferences', label: 'Notif. Prefs', group: 'Private',     hasUseSEO: true,  hasStructuredData: false, noindex: true  },

  // ── Admin pages (all noindex) ──────────────────────────────────────────────
  { path: '/admin',              label: 'Admin Panel',          group: 'Admin',       hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/admin/ads',          label: 'Admin — Ads',          group: 'Admin',       hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/admin/revenue',      label: 'Admin — Revenue',      group: 'Admin',       hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/admin/verify',       label: 'Admin — Verifications',group: 'Admin',       hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/admin/fraud',        label: 'Admin — Fraud',        group: 'Admin',       hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/admin/ai-bot',       label: 'Admin — AI Bot',       group: 'Admin',       hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/admin/ad-config',    label: 'Admin — Ad Config',    group: 'Admin',       hasUseSEO: true,  hasStructuredData: false, noindex: true  },
  { path: '/admin/seo',          label: 'SEO Audit',            group: 'Admin',       hasUseSEO: false, hasStructuredData: false, noindex: true  },
];

export type SEOStatus = 'good' | 'warn' | 'missing' | 'noindex';

export function scoreSEORoute(route: SEORoute): SEOStatus {
  if (route.noindex) return 'noindex';
  if (!route.hasUseSEO) {
    return route.group === 'Dynamic' ? 'missing' : 'warn';
  }
  if (route.hasUseSEO && route.hasStructuredData) return 'good';
  return 'warn';
}

export interface SEOValidationSummary {
  total: number;
  good: number;
  warn: number;
  missing: number;
  noindex: number;
  /** Score out of 100 (excludes noindex pages) */
  score: number;
  /** Routes that are indexable but have no useSEO at all */
  missingRoutes: SEORoute[];
  /** Routes that have useSEO but no structured data and are public */
  warnRoutes: SEORoute[];
}

/** Run validation and return a structured summary */
export function validateSEOCoverage(): SEOValidationSummary {
  const scored = SEO_COVERAGE.map(r => ({ ...r, _status: scoreSEORoute(r) }));

  const good    = scored.filter(r => r._status === 'good').length;
  const warn    = scored.filter(r => r._status === 'warn').length;
  const missing = scored.filter(r => r._status === 'missing').length;
  const noindex = scored.filter(r => r._status === 'noindex').length;
  const indexable = SEO_COVERAGE.length - noindex;
  const score = indexable > 0 ? Math.round((good / indexable) * 100) : 0;

  return {
    total: SEO_COVERAGE.length,
    good,
    warn,
    missing,
    noindex,
    score,
    missingRoutes: scored.filter(r => r._status === 'missing'),
    warnRoutes: scored.filter(r => r._status === 'warn' && !r.noindex && !r.hasStructuredData),
  };
}
