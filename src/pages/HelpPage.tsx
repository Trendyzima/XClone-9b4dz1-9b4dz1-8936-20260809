import { useState } from 'react';
import { useSEO } from '@/hooks/useSEO';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Input } from '@/components/ui/input';
import {
  Search, HelpCircle, MessageCircle, Shield, CreditCard, User,
  ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import { PageAdBanner } from '@/components/features/AdSenseAd';
function HelpAdBanner() { return <PageAdBanner />; }

// ── Module-level help content (esbuild guard: no inline object arrays in render)
// Each entry: { q: string; a: string | string[] }
// string[] = bullet list; string = paragraph

const ACCOUNT_TOPICS = [
  {
    q: 'How to change username',
    a: [
      'Go to your Profile by tapping your avatar in the bottom nav.',
      'Tap the Edit Profile button (pencil icon) near your profile photo.',
      'Update the Username field with your desired new handle.',
      'Tap Save — your username is changed immediately across the platform.',
      'Note: usernames must be unique. If the name is taken you\'ll see an error.',
    ],
  },
  {
    q: 'Update profile information',
    a: [
      'Open your Profile tab and tap Edit Profile.',
      'You can update: Display name, Bio (up to 160 chars), Website link, Location, and Profile photo.',
      'Tap the camera icon on your avatar to upload a new photo from your device.',
      'All changes are saved immediately when you tap Save.',
    ],
  },
  {
    q: 'Verify your account',
    a: [
      'Go to Settings → Verification Request (or tap /verification-request directly).',
      'Choose your verification tier: Basic, Creator, Business, or Celebrity.',
      'Pay the one-time verification fee via M-Pesa or wallet balance.',
      'Our admin team reviews your account within 24 hours.',
      'Once approved you\'ll get a coloured verified badge ✓ on your profile and all posts.',
    ],
  },
  {
    q: 'Delete your account',
    a: [
      'Go to Settings → Account → Delete Account.',
      'You will be asked to confirm by typing your username.',
      'All your posts, followers, and earnings data will be permanently removed within 30 days.',
      'Wallet balances should be withdrawn before deletion — they cannot be recovered after.',
      'If you change your mind, contact support@tsocial.com within 7 days of deletion.',
    ],
  },
  {
    q: 'Privacy settings',
    a: [
      'Go to Settings → Privacy to control who can see your content.',
      'You can make your account private — new followers need your approval.',
      'Control who can send you Direct Messages: Everyone, Followers only, or Nobody.',
      'Mute or Block users from their profile page or the three-dot menu on their posts.',
      'Your email and phone number are always private and never shown publicly.',
    ],
  },
];

const POSTS_TOPICS = [
  {
    q: 'How to post videos',
    a: [
      'Tap the green + FAB button on the Home screen to open the Compose sheet.',
      'Tap the video camera icon or "Attach Video" to select a video from your gallery.',
      'Videos up to 10 MB are supported. For longer videos use the upload-to-storage flow.',
      'Add a caption, hashtags (#), and mentions (@) before posting.',
      'Toggle "Monetize" on the post card to earn CPM revenue from video views.',
    ],
  },
  {
    q: 'Create polls',
    a: [
      'In the Compose sheet, tap the Poll icon (bar chart icon) in the toolbar.',
      'Enter your question and up to 4 answer options.',
      'Set the poll duration: 1 day, 3 days, or 7 days.',
      'Post normally — followers can tap an option to vote.',
      'Results are visible to everyone once you\'ve voted or after the poll expires.',
    ],
  },
  {
    q: 'Schedule posts',
    a: [
      'In the Compose sheet, tap the Clock/Calendar icon.',
      'Pick a date and time for your post to go live.',
      'Scheduled posts appear in your Scheduled Posts page (tap the calendar icon in your profile).',
      'You can edit or cancel a scheduled post before it goes live.',
      'The platform publishes it automatically at the chosen time — no action needed from you.',
    ],
  },
  {
    q: 'Use hashtags effectively',
    a: [
      'Type # followed by a keyword in your post (e.g. #Nairobi #TechKenya).',
      'Use 3–7 relevant hashtags for best reach — too many can look spammy.',
      'Follow hashtags from the Explore page to see all posts under that tag in your feed.',
      'Create hashtag challenges from the Explore → Challenges section (verified users only).',
      'Trending hashtags appear on the Explore tab — using them boosts discoverability.',
    ],
  },
  {
    q: 'Report inappropriate content',
    a: [
      'Tap the ··· three-dot menu on any post and select Report.',
      'Choose a reason: Spam, Harassment, Hate speech, Misinformation, Nudity, or Other.',
      'Add optional details and submit — our moderation team reviews within 24–48 hours.',
      'You can also report a user from their profile page via the three-dot menu.',
      'All reports are anonymous — the reported user is never told who reported them.',
    ],
  },
];

const PAYMENTS_TOPICS = [
  {
    q: 'Boost your posts',
    a: [
      'Go to any of your posts and tap Boost (rocket icon) or visit /boost-create.',
      'Set your boost budget (minimum $1), target audience, and duration.',
      'Pay from your wallet balance or top up via M-Pesa / PayPal.',
      'Boosted posts appear more prominently in feeds and Explore for the selected audience.',
      'View boost performance (impressions, clicks) in Boost Analytics from your profile.',
    ],
  },
  {
    q: 'Payment methods (PayPal, M-Pesa)',
    a: [
      'Go to Wallet → M-Pesa tab to deposit via STK push (Kenya only).',
      'Enter your Safaricom number, amount, and tap "Pay" — a PIN prompt appears on your phone.',
      'For PayPal: go to Wallet → Withdraw and enter your PayPal email for payouts.',
      'Minimum deposit via M-Pesa: KES 10. Minimum payout: $5 USD.',
      'All transactions are recorded in Wallet → History.',
    ],
  },
  {
    q: 'Creator earnings',
    a: [
      'Earnings come from: video CPM ($1.50–$3.50 per 1k views), tips (85% to you), ad revenue share, and subscriptions.',
      'Your CPM tier upgrades automatically as your video views grow.',
      'View your full earnings breakdown in Creator Studio → Earnings tab.',
      'Earnings are distributed daily by our automated system.',
      'Request a payout from Creator Studio → Earnings → Request Payout (minimum $5).',
    ],
  },
  {
    q: 'Premium subscriptions',
    a: [
      'Go to /premium to view available plans (Monthly or Annual).',
      'Premium removes all ads, gives you a Premium badge, and unlocks advanced creator tools.',
      'Pay with your wallet balance, M-Pesa, or PayPal.',
      'Your subscription auto-renews unless cancelled 24 hours before renewal.',
      'Cancel anytime from Settings → Premium → Cancel Subscription.',
    ],
  },
  {
    q: 'Refund policy',
    a: [
      'Digital purchases (boosts, premium, verification) are generally non-refundable once delivered.',
      'If a technical error prevented your boost from running, contact support within 7 days.',
      'M-Pesa deposits that fail but deduct your balance are refunded within 24 hours automatically.',
      'For all other refund requests email support@tsocial.com with your transaction reference.',
    ],
  },
];

const SAFETY_TOPICS = [
  {
    q: 'Block or mute users',
    a: [
      'To Block: visit the user\'s profile → tap ··· → Block. They can no longer see your content.',
      'To Mute: visit their profile → tap ··· → Mute. Their posts won\'t appear in your feed but they can still follow you.',
      'Manage your block/mute list in Settings → Privacy → Blocked & Muted.',
      'Blocked users cannot message you, follow you, or see your posts.',
      'Muted users don\'t know they\'re muted — the action is silent.',
    ],
  },
  {
    q: 'Report abuse',
    a: [
      'Tap the ··· menu on a post or user profile and select Report.',
      'For urgent safety concerns (threats, CSAM) use the Priority Report option.',
      'All abuse reports go to our Safety team and are reviewed within 24 hours.',
      'You can also email abuse@tsocial.com for sensitive or urgent matters.',
      'Our platform regulators can issue temporary bans, strikes, or permanent bans.',
    ],
  },
  {
    q: 'Two-factor authentication',
    a: [
      'Go to Settings → Security → Two-Factor Authentication.',
      'Currently 2FA is implemented via OTP code sent to your registered email.',
      'Every new login from an unrecognised device triggers an OTP verification step.',
      'Do not share your OTP codes with anyone — Testagram staff will never ask for them.',
      'If you lose access to your email, contact support immediately to recover your account.',
    ],
  },
  {
    q: 'Suspicious activity',
    a: [
      'If you notice logins you don\'t recognise, go to Settings → Security → Active Sessions and sign out all devices.',
      'Change your password immediately and enable 2FA.',
      'Check your Wallet → History for any unauthorised transactions.',
      'Report compromised accounts to support@tsocial.com with "ACCOUNT COMPROMISED" in the subject.',
      'We may temporarily lock your account during investigation to protect your funds.',
    ],
  },
  {
    q: 'Content guidelines',
    a: [
      'Testagram prohibits: hate speech, harassment, graphic violence, NSFW content, and spam.',
      'Posts are reviewed by our AI moderation system and human regulators.',
      'First violation: warning + content removal. Second: temporary ban. Third: permanent ban.',
      'You can appeal a ban via the Appeals page (/appeals).',
      'Read the full Content Policy at /content-policy.',
    ],
  },
];

// Flat list of all topics for search (esbuild guard: module-level, not inside component)
const ALL_TOPICS: { category: string; q: string; a: string[] }[] = [
  ...ACCOUNT_TOPICS.map(t => ({ category: 'Account & Profile', q: t.q, a: Array.isArray(t.a) ? t.a : [t.a] })),
  ...POSTS_TOPICS.map(t => ({ category: 'Posts & Engagement', q: t.q, a: Array.isArray(t.a) ? t.a : [t.a] })),
  ...PAYMENTS_TOPICS.map(t => ({ category: 'Payments & Monetization', q: t.q, a: Array.isArray(t.a) ? t.a : [t.a] })),
  ...SAFETY_TOPICS.map(t => ({ category: 'Safety & Security', q: t.q, a: Array.isArray(t.a) ? t.a : [t.a] })),
];

const CATEGORIES = [
  { icon: User,        title: 'Account & Profile',        topics: ACCOUNT_TOPICS,  color: 'text-blue-600',   bg: 'bg-blue-500/10'   },
  { icon: MessageCircle, title: 'Posts & Engagement',     topics: POSTS_TOPICS,    color: 'text-green-600',  bg: 'bg-green-500/10'  },
  { icon: CreditCard,  title: 'Payments & Monetization',  topics: PAYMENTS_TOPICS, color: 'text-purple-600', bg: 'bg-purple-500/10' },
  { icon: Shield,      title: 'Safety & Security',        topics: SAFETY_TOPICS,   color: 'text-red-600',    bg: 'bg-red-500/10'    },
];

// ── Accordion item (module-level component — esbuild guard) ──────────────────
function HelpAccordionItem({ q, a, defaultOpen }: { q: string; a: string[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-4 text-left hover:bg-muted/40 transition-colors flex items-center justify-between gap-3 group"
      >
        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{q}</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 bg-muted/20 border-t border-border/50 animate-in slide-in-from-top-1 duration-150">
          <ul className="mt-3 space-y-2">
            {a.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  useSEO({
    title: 'Help Center — Testagram Support',
    description: 'Find answers to common questions about Testagram. Learn how to post, earn money, manage your account, report issues, and get the most out of your experience.',
    url: '/help',
    type: 'website',
    keywords: 'help, support, faq, testagram help, how to, account, payments, creators',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: ALL_TOPICS.slice(0, 5).map(t => ({
        '@type': 'Question',
        name: t.q,
        acceptedAnswer: { '@type': 'Answer', text: t.a.join(' ') },
      })),
    },
  });

  // Search results — filter from all topics
  const searchLow = searchQuery.toLowerCase().trim();
  const searchResults = searchLow.length >= 2
    ? ALL_TOPICS.filter(t => t.q.toLowerCase().includes(searchLow) || t.a.some(l => l.toLowerCase().includes(searchLow)))
    : [];
  const hasSearch = searchLow.length >= 2;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <TopBar title="Help Center" showBack />
      <HelpAdBanner />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Hero */}
        <div className="text-center pt-2 pb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <HelpCircle className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-black mb-1">How can we help you?</h1>
          <p className="text-sm text-muted-foreground">Search for answers or browse categories below</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search help articles…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 h-11 rounded-xl"
          />
        </div>

        {/* Search Results */}
        {hasSearch && (
          <div className="border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-muted/30 border-b border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {searchResults.length > 0 ? `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${searchQuery}"` : `No results for "${searchQuery}"`}
              </p>
            </div>
            {searchResults.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground">
                <p className="text-sm mb-1">No articles found</p>
                <p className="text-xs">Try a different keyword or browse the categories below</p>
              </div>
            ) : (
              <div>
                {searchResults.map((item, i) => (
                  <div key={i}>
                    <div className="px-4 pt-2 pb-0">
                      <span className="text-[10px] font-bold text-primary/70 uppercase tracking-wide">{item.category}</span>
                    </div>
                    <HelpAccordionItem q={item.q} a={item.a} defaultOpen />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Category Sections */}
        {!hasSearch && CATEGORIES.map(cat => {
          const Icon = cat.icon;
          return (
            <div key={cat.title} className="border border-border rounded-2xl overflow-hidden">
              {/* Category header */}
              <div className="flex items-center gap-3 px-4 py-3.5 bg-muted/20 border-b border-border">
                <div className={`w-9 h-9 rounded-xl ${cat.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4.5 h-4.5 ${cat.color}`} size={18} />
                </div>
                <h2 className="font-black text-base">{cat.title}</h2>
              </div>
              {/* Accordion items */}
              <div>
                {cat.topics.map((topic, ti) => (
                  <HelpAccordionItem key={ti} q={topic.q} a={Array.isArray(topic.a) ? topic.a : [topic.a]} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Contact Support CTA */}
        <div className="bg-gradient-to-br from-primary/8 via-purple-500/5 to-background border border-primary/15 rounded-2xl p-7 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <MessageCircle className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-xl font-black mb-1">Still need help?</h3>
          <p className="text-sm text-muted-foreground mb-5">Our support team is here to help you</p>
          <a
            href="mailto:support@tsocial.com"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
          >
            <MessageCircle className="w-4 h-4" />
            Contact Support
          </a>
        </div>

        {/* Quick Links */}
        <div className="space-y-3">
          <button
            onClick={() => navigate('/content-policy')}
            className="w-full flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted/40 transition-colors text-left"
          >
            <div>
              <p className="font-bold text-sm">Community Guidelines</p>
              <p className="text-xs text-muted-foreground">Learn about our rules</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
          <button
            onClick={() => navigate('/help#privacy')}
            className="w-full flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted/40 transition-colors text-left"
          >
            <div>
              <p className="font-bold text-sm">Privacy Policy</p>
              <p className="text-xs text-muted-foreground">How we protect your data</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
          <button
            onClick={() => navigate('/help#tos')}
            className="w-full flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted/40 transition-colors text-left"
          >
            <div>
              <p className="font-bold text-sm">Terms of Service</p>
              <p className="text-xs text-muted-foreground">Terms and conditions</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </div>

      </div>
    </div>
  );
}
