import WalletPage from './WalletPage';
import WalletPayPalPanel from '@/components/features/WalletPayPalPanel';

export default function WalletWithPayPalPage(){
  return <>
    <WalletPage />
    <div className="max-w-2xl mx-auto px-4 pb-10">
      <WalletPayPalPanel />
    </div>
  </>;
}
