import { Analytics, StatusBar, Style, Capacitor } from '@/lib/capacitor-stub';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { Sidebar } from '@/components/layout/Sidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { FloatingActionButton } from '@/components/layout/FloatingActionButton';
import { LiveSpaceBanner } from '@/components/features/LiveSpaceBanner';
import { LiveNotificationBanner } from '@/components/features/LiveNotificationBanner';
import { useCreatorTierAlert } from '@/hooks/useCreatorTierAlert';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from 'sonner';
import { Loader2 } from 'lucide-react';
import HomePage from '@/pages/HomePage';
import AuthPage from '@/pages/AuthPage';
import VideosPage from '@/pages/VideosPage';
const ExplorePage = lazy(() => import('@/pages/ExplorePage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const MessagesPage = lazy(() => import('@/pages/MessagesPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const SpacesPage = lazy(() => import('@/pages/SpacesPage'));
const AIPage = lazy(() => import('@/pages/AIPage'));
const AnalyticsDashboard = lazy(() => import('@/pages/AnalyticsDashboard'));
const AdminPanel = lazy(() => import('@/pages/AdminPanel'));
const PostThreadPage = lazy(() => import('@/pages/PostThreadPage'));
const CommunitiesPage = lazy(() => import('@/pages/CommunitiesPage'));
const CommunityPage = lazy(() => import('@/pages/CommunityPage'));
const HashtagPage = lazy(() => import('@/pages/HashtagPage'));
const AIBotSetup = lazy(() => import('@/pages/AIBotSetup'));
const BookmarksPage = lazy(() => import('@/pages/BookmarksPage').then(m => ({ default: m.BookmarksPage })));
const ListsPage = lazy(() => import('@/pages/ListsPage').then(m => ({ default: m.ListsPage })));
const MonetizationDashboard = lazy(() => import('@/pages/MonetizationDashboard').then(m => ({ default: m.MonetizationDashboard })));
const ProductsPage = lazy(() => import('@/pages/ProductsPage').then(m => ({ default: m.ProductsPage })));
const ScheduledPostsPage = lazy(() => import('@/pages/ScheduledPostsPage').then(m => ({ default: m.ScheduledPostsPage })));
const CreatorStudio = lazy(() => import('@/pages/CreatorStudio'));
const PremiumPage = lazy(() => import('@/pages/PremiumPage'));
const LiveStreamPage = lazy(() => import('@/pages/LiveStreamPage'));
const StartStreamPage = lazy(() => import('@/pages/StartStreamPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const ThreadsPage = lazy(() => import('@/pages/ThreadsPage'));
const CreateThreadPage = lazy(() => import('@/pages/CreateThreadPage'));
const ThreadDetailPage = lazy(() => import('@/pages/ThreadDetailPage'));
const HistoryPage = lazy(() => import('@/pages/HistoryPage'));
const HelpPage = lazy(() => import('@/pages/HelpPage'));
const WalletPage = lazy(() => import('@/pages/WalletPage'));
const CreateAdPage = lazy(() => import('@/pages/CreateAdPage'));
const MyAdsPage = lazy(() => import('@/pages/MyAdsPage'));
const ListDetailPage = lazy(() => import('@/pages/ListDetailPage'));
const AdConfigPage = lazy(() => import('@/pages/AdConfigPage'));
const PayoutsPage = lazy(() => import('@/pages/PayoutsPage'));
const RevenueAnalytics = lazy(() => import('@/pages/RevenueAnalytics'));
const FraudDetection = lazy(() => import('@/pages/FraudDetection'));
const AdPerformanceComparison = lazy(() => import('@/pages/AdPerformanceComparison'));
const AdminRevenueDashboard = lazy(() => import('@/pages/AdminRevenueDashboard'));
const BoostAnalyticsPage = lazy(() => import('@/pages/BoostAnalyticsPage'));
const BoostCreatePage = lazy(() => import('@/pages/BoostCreatePage'));
const RewardedAdHistory = lazy(() => import('@/pages/RewardedAdHistory'));
const PostAnalyticsDashboard = lazy(() => import('@/pages/PostAnalyticsDashboard'));
const FediversePage = lazy(() => import('@/pages/FediversePage'));
const VerificationRequestPage = lazy(() => import('@/pages/VerificationRequestPage'));
const AdminVerificationPage = lazy(() => import('@/pages/AdminVerificationPage'));
const DailyRewardsPage = lazy(() => import('@/pages/DailyRewardsPage'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'));
const DiscoverPage = lazy(() => import('@/pages/DiscoverPage'));
const ReferralPage = lazy(() => import('@/pages/ReferralPage'));
const SpaceRecordingViewerPage = lazy(() => import('@/pages/SpaceRecordingViewerPage'));
const SpaceDetailPage = lazy(() => import('@/pages/SpaceDetailPage'));
const TrendingTopicFeedPage = lazy(() => import('@/pages/TrendingTopicFeedPage'));
const HashtagChallengePage = lazy(() => import('@/pages/HashtagChallengePage'));
const AdminAdsDashboard = lazy(() => import('@/pages/AdminAdsDashboard'));
const NotificationPreferencesPage = lazy(() => import('@/pages/NotificationPreferencesPage'));
const WishlistPage = lazy(() => import('@/pages/WishlistPage'));
const InterestOnboardingPage = lazy(() => import('@/pages/InterestOnboardingPage'));
const SeriesPage = lazy(() => import('@/pages/SeriesPage'));
const PlatformInboxPage = lazy(() => import('@/pages/PlatformInboxPage'));
const AdAnalyticsPage = lazy(() => import('@/pages/AdAnalyticsPage'));
const SEOAuditPage = lazy(() => import('@/pages/SEOAuditPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

// ─── Inner app — has access to router context ─────────────────────────────────
function AppInner() {
  const location = useLocation();
  useCreatorTierAlert();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    (async () => {
      try {
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setStyle({ style: Style.Dark });
        try {
          await StatusBar.setBackgroundColor({ color: '#00000000' });
        } catch (_) {}
      } catch {
        try { await StatusBar.hide(); } catch (_) {}
      }
    })();
  }, []);


  return (
    <AuthProvider>
      <div className="flex min-h-screen bg-background overflow-x-hidden pb-20">
        <Sidebar />

        <main className="flex-1 max-w-2xl w-full border-x border-border overflow-x-hidden">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/videos" element={<VideosPage />} />

              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/spaces" element={<SpacesPage />} />
              <Route path="/profile/:username" element={<ProfilePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/ai" element={<AIPage />} />
              <Route path="/analytics" element={<AnalyticsDashboard />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/post/:postId" element={<PostThreadPage />} />
              <Route path="/communities" element={<CommunitiesPage />} />
              <Route path="/c/:name" element={<CommunityPage />} />
              <Route path="/hashtag/:tag" element={<HashtagPage />} />
              <Route path="/ai-bot-setup" element={<AIBotSetup />} />
              <Route path="/bookmarks" element={<BookmarksPage />} />
              <Route path="/lists" element={<ListsPage />} />
              <Route path="/monetization" element={<MonetizationDashboard />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/scheduled" element={<ScheduledPostsPage />} />
              <Route path="/creator-studio" element={<CreatorStudio />} />
              <Route path="/premium" element={<PremiumPage />} />
              <Route path="/stream/:streamId" element={<LiveStreamPage />} />
              <Route path="/start-stream" element={<StartStreamPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/threads" element={<ThreadsPage />} />
              <Route path="/threads/create" element={<CreateThreadPage />} />
              <Route path="/thread/:id" element={<ThreadDetailPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/wallet" element={<WalletPage />} />
              <Route path="/create-ad" element={<CreateAdPage />} />
              <Route path="/my-ads" element={<MyAdsPage />} />
              <Route path="/lists/:id" element={<ListDetailPage />} />
              <Route path="/admin/ads" element={<AdConfigPage />} />
              <Route path="/payouts" element={<PayoutsPage />} />
              <Route path="/revenue-analytics" element={<RevenueAnalytics />} />
              <Route path="/fraud-detection" element={<FraudDetection />} />
              <Route path="/ad-performance" element={<AdPerformanceComparison />} />
              <Route path="/admin/revenue" element={<AdminRevenueDashboard />} />
              <Route path="/boost-analytics/:postId" element={<BoostAnalyticsPage />} />
              <Route path="/boost-create" element={<BoostCreatePage />} />
              <Route path="/rewards" element={<RewardedAdHistory />} />
              <Route path="/post-analytics" element={<PostAnalyticsDashboard />} />
              <Route path="/post-analytics/:postId" element={<PostAnalyticsDashboard />} />
              <Route path="/verify" element={<VerificationRequestPage />} />
              <Route path="/admin/verifications" element={<AdminVerificationPage />} />
              <Route path="/fediverse" element={<FediversePage />} />
              <Route path="/daily-rewards" element={<DailyRewardsPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/referral" element={<ReferralPage />} />
              <Route path="/space-recording/:id" element={<SpaceRecordingViewerPage />} />
              <Route path="/spaces/:id" element={<SpaceDetailPage />} />
              <Route path="/trending/:topic" element={<TrendingTopicFeedPage />} />
              <Route path="/challenge/:id" element={<HashtagChallengePage />} />
              <Route path="/admin/ads-review" element={<AdminAdsDashboard />} />
              <Route path="/notification-preferences" element={<NotificationPreferencesPage />} />
              <Route path="/wishlist" element={<WishlistPage />} />
              <Route path="/interests" element={<InterestOnboardingPage />} />
              <Route path="/ad-analytics" element={<AdAnalyticsPage />} />
              <Route path="/series" element={<SeriesPage />} />
              <Route path="/platform-inbox" element={<PlatformInboxPage />} />
              <Route path="/admin/seo" element={<SEOAuditPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>

        <RightSidebar />
        <LiveSpaceBanner />
        <LiveNotificationBanner />
        <BottomNav />
        <FloatingActionButton />
      </div>

      <Toaster />
      <Sonner position="top-center" richColors />

      {/* ✅ Vercel Analytics (GLOBAL TRACKING) */}
      <Analytics />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
