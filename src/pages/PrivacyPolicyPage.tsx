import { useSEO } from '@/hooks/useSEO';
import { TopBar } from '@/components/layout/TopBar';
import { Shield, Eye, Lock, Database, Globe, Mail, Trash2, RefreshCw, UserCheck } from 'lucide-react';

// Module-level data (esbuild guard: no inline arrays in render)
interface PolicySection {
  iconColor: string;
  iconBg: string;
  title: string;
  points: string[];
}

// esbuild guard: module-level helper — no `const Icon = section.icon` inside .map()
function getPolicyIconNode(title: string, colorClass: string) {
  if (title === 'Information We Collect')  return <Database className={`w-5 h-5 ${colorClass}`} />;
  if (title === 'How We Use Your Information') return <Eye className={`w-5 h-5 ${colorClass}`} />;
  if (title === 'Information Sharing')     return <Globe className={`w-5 h-5 ${colorClass}`} />;
  if (title === 'Data Security')           return <Lock className={`w-5 h-5 ${colorClass}`} />;
  if (title === 'Your Rights & Choices')   return <UserCheck className={`w-5 h-5 ${colorClass}`} />;
  if (title === 'Cookies & Tracking')      return <RefreshCw className={`w-5 h-5 ${colorClass}`} />;
  if (title === 'Data Retention')          return <Trash2 className={`w-5 h-5 ${colorClass}`} />;
  return <Mail className={`w-5 h-5 ${colorClass}`} />;
}

const POLICY_SECTIONS: PolicySection[] = [
  {
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-500/10',
    title: 'Information We Collect',
    points: [
      'Account information: username, email address, profile photo, bio, and optional details like website and location.',
      'Content you create: posts, replies, threads, videos, polls, and any media you upload.',
      'Usage data: pages visited, features used, time spent, interactions with posts and other users.',
      'Device & technical data: IP address, browser type, operating system, and device identifiers.',
      'Payment information: for M-Pesa transactions we collect your phone number; for PayPal we collect your email. We do not store full card numbers.',
      'Communications: messages you send to our support team and any feedback you provide.',
    ],
  },
  {
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-500/10',
    title: 'How We Use Your Information',
    points: [
      'To provide, maintain, and improve the Testagram platform and its features.',
      'To personalise your feed and content recommendations based on your interests and activity.',
      'To process payments, handle creator earnings distributions, and prevent fraud.',
      'To send you notifications about activity on your account (likes, replies, new followers, etc.).',
      'To enforce our Community Guidelines and Content Policy — including automated moderation.',
      'To respond to your support requests and communicate important platform updates.',
      'To generate anonymised, aggregated analytics that help us improve the platform.',
    ],
  },
  {
    iconColor: 'text-green-600',
    iconBg: 'bg-green-500/10',
    title: 'Information Sharing',
    points: [
      'We do NOT sell your personal data to third parties — ever.',
      'Public profile information (username, bio, posts) is visible to all users and search engines unless your account is set to private.',
      'We share data with trusted service providers (cloud infrastructure, payment processors) only as needed to operate the platform.',
      'We may disclose information to comply with legal obligations, court orders, or to protect the safety of our users.',
      'In the event of a business transfer, user data may be transferred as part of that transaction with advance notice to users.',
      'Aggregated, anonymised data may be shared for research or business intelligence purposes.',
    ],
  },
  {
    iconColor: 'text-red-600',
    iconBg: 'bg-red-500/10',
    title: 'Data Security',
    points: [
      'All data is encrypted in transit using TLS 1.3 and encrypted at rest using AES-256.',
      'Access to production databases is restricted to authorised personnel only via multi-factor authentication.',
      'We use Row-Level Security (RLS) policies in our database so users can only access their own private data.',
      'Payment credentials are handled by PCI-compliant processors — we never store raw card data.',
      'Security incidents are investigated immediately; affected users are notified within 72 hours if required by law.',
      'We perform regular security audits and penetration testing on our infrastructure.',
    ],
  },
  {
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-500/10',
    title: 'Your Rights & Choices',
    points: [
      'Access: you can view all data associated with your account at any time from your profile settings.',
      'Correction: update your profile information, email address, and preferences from Settings.',
      'Deletion: you may delete your account from Settings → Account. All personal data is removed within 30 days.',
      'Data portability: request a copy of your data by contacting support@tsocial.com.',
      'Opt-out of personalisation: disable "Personalised Feed" in Settings → Feed & Personalisation.',
      'Marketing communications: unsubscribe from any marketing email using the link in the footer.',
    ],
  },
  {
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-500/10',
    title: 'Cookies & Tracking',
    points: [
      'We use essential cookies to keep you logged in and remember your preferences.',
      'Analytics cookies (anonymised) help us understand how people use the platform.',
      'We do not use third-party advertising cookies or cross-site tracking pixels.',
      'You can clear cookies at any time via your browser settings; this will log you out.',
      'Our mobile apps use equivalent on-device storage (AsyncStorage) with the same principles.',
    ],
  },
  {
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-500/10',
    title: 'Data Retention',
    points: [
      'Active account data is retained as long as your account exists.',
      'After account deletion, personal data is purged within 30 days from live systems.',
      'Some data may be retained in encrypted backups for up to 90 days for legal compliance.',
      'Transaction records are retained for 7 years as required by financial regulations in Kenya.',
      'Content reported for safety violations may be retained longer for legal proceedings.',
    ],
  },
  {
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-500/10',
    title: 'Contact Us',
    points: [
      'Privacy enquiries: privacy@tsocial.com',
      'Data deletion requests: support@tsocial.com with subject "DATA DELETION REQUEST"',
      'General support: support@tsocial.com',
      'We aim to respond to all privacy-related requests within 30 days.',
      'Testagram is operated by T Social Ltd. Our registered address is available upon request.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  useSEO({
    title: 'Privacy Policy | Testagram',
    description: 'Learn how Testagram collects, uses, and protects your personal data. Read our full privacy policy.',
    url: '/privacy',
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Privacy Policy" showBack />

      <div className="max-w-2xl mx-auto p-4 space-y-6">

        {/* Hero */}
        <div className="bg-gradient-to-br from-blue-500/10 via-background to-purple-500/5 border border-blue-500/20 rounded-2xl p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-9 h-9 text-blue-600" />
          </div>
          <h1 className="text-2xl font-black mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            We believe privacy is a right, not a feature. Here's exactly what data we collect, why we collect it, and how we protect it.
          </p>
          <p className="text-[11px] text-muted-foreground mt-3 opacity-70">Last updated: August 2026 · Effective immediately</p>
        </div>

        {/* TL;DR */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-black text-base mb-3 flex items-center gap-2">
            <span className="text-lg">📋</span> TL;DR — The Short Version
          </h2>
          <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
            <p>✅ We only collect what we need to run the platform.</p>
            <p>✅ We never sell your data to advertisers or third parties.</p>
            <p>✅ You can delete your account and all your data at any time.</p>
            <p>✅ Your messages are private — we can't read them.</p>
            <p>✅ Payment data is handled by PCI-compliant processors.</p>
          </div>
        </div>

        {/* Policy sections */}
        {POLICY_SECTIONS.map((section) => (
            <div key={section.title} className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/20">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${section.iconBg}`}>
                  {getPolicyIconNode(section.title, section.iconColor)}
                </div>
                <h2 className="font-black text-sm">{section.title}</h2>
              </div>
              <ul className="px-5 py-4 space-y-2.5">
                {section.points.map((point, pi) => (
                  <li key={pi} className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
        ))}

        {/* Footer note */}
        <div className="text-center pb-4">
          <p className="text-xs text-muted-foreground">
            This policy may be updated periodically. We will notify you of significant changes via the platform inbox.
          </p>
          <p className="text-[10px] text-muted-foreground mt-2 opacity-60">© 2026 T Social Ltd. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
