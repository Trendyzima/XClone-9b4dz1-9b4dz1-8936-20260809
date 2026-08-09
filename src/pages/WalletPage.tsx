import { useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { WalletDashboard } from '@/components/features/WalletDashboard';
import { showBanner, hideBanner, ADMOB_CONFIG } from '@/lib/admob';
import { BannerAdPosition } from '@capacitor-community/admob';

export default function WalletPage() {

  useEffect(() => {
    showBanner(ADMOB_CONFIG.BANNER_FEED, BannerAdPosition.TOP_CENTER);
    return () => { hideBanner(); };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="My Wallet" showBack />

      <div className="max-w-2xl mx-auto p-6">
        <WalletDashboard />
      </div>
    </div>
  );
}
