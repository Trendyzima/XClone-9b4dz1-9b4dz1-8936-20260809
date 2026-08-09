import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import {
  Megaphone, Eye, MousePointer, DollarSign, Loader2, Plus,
  Pause, Play, Trash2, CheckCircle2, Clock, XCircle, AlertCircle,
  TrendingUp, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { AdMob, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import { ADMOB_CONFIG } from '@/lib/admob';

const STATUS_MAP: Record<string, { label: string; icon: any; cls: string }> = {
  active:   { label: 'Active',   icon: CheckCircle2, cls: 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  pending:  { label: 'Pending',  icon: Clock,        cls: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' },
  paused:   { label: 'Paused',   icon: Pause,        cls: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  rejected: { label: 'Rejected', icon: XCircle,      cls: 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  completed:{ label: 'Completed',icon: CheckCircle2, cls: 'text-muted-foreground bg-muted border-border' },
};

const PAYMENT_MAP: Record<string, { label: string; cls: string }> = {
  paid:    { label: 'Paid',    cls: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
  pending: { label: 'Unpaid',  cls: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20' },
  failed:  { label: 'Failed',  cls: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
};

export default function MyAdsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStats, setTotalStats] = useState({ spent: 0, impressions: 0, clicks: 0 });

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    fetchAds();

    // AdMob banner on native
    if (Capacitor.isNativePlatform()) {
      AdMob.showBanner({
        adId: ADMOB_CONFIG.BANNER_PROFILE,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 64,
        isTesting: false,
      });
    }
    return () => {
      if (Capacitor.isNativePlatform()) AdMob.hideBanner();
    };
  }, [user]);

  const fetchAds = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_ads')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) { toast.error('Failed to load ads'); return; }

    setAds(data || []);

    // Aggregate stats
    const totals = (data || []).reduce((acc, ad) => ({
      spent: acc.spent + (ad.spent || 0),
      impressions: acc.impressions + (ad.impressions || 0),
      clicks: acc.clicks + (ad.clicks || 0),
    }), { spent: 0, impressions: 0, clicks: 0 });
    setTotalStats(totals);
    setLoading(false);
  };

  const pauseAd = async (adId: string) => {
    await supabase.from('user_ads').update({ status: 'paused' }).eq('id', adId);
    toast.success('Ad paused');
    fetchAds();
  };

  const resumeAd = async (adId: string) => {
    const ad = ads.find(a => a.id === adId);
    if (ad?.payment_status !== 'paid') {
      toast.error('Complete payment before resuming your ad');
      return;
    }
    await supabase.from('user_ads').update({ status: 'active' }).eq('id', adId);
    toast.success('Ad resumed');
    fetchAds();
  };

  const deleteAd = async (adId: string) => {
    if (!confirm('Are you sure you want to delete this ad?')) return;
    await supabase.from('user_ads').delete().eq('id', adId);
    toast.success('Ad deleted');
    fetchAds();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <TopBar title="My Advertisements" showBack />

      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
        {/* Summary stats */}
        {ads.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Spent', value: `KES ${totalStats.spent.toLocaleString()}`, icon: DollarSign, color: 'text-green-500' },
              { label: 'Impressions', value: formatNumber(totalStats.impressions), icon: Eye, color: 'text-blue-500' },
              { label: 'Clicks', value: formatNumber(totalStats.clicks), icon: MousePointer, color: 'text-purple-500' },
            ].map((s, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-3 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
                <p className="font-bold text-sm">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">My Ads ({ads.length})</h1>
          <Button onClick={() => navigate('/create-ad')} className="rounded-full" size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Ad
          </Button>
        </div>

        {ads.length === 0 ? (
          <div className="text-center py-16 bg-muted/30 rounded-2xl">
            <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Megaphone className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">No ads yet</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
              Promote your content, business or service to thousands of users
            </p>
            <Button onClick={() => navigate('/create-ad')} className="rounded-full px-8">
              Create Your First Ad
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {ads.map((ad) => {
              const statusInfo = STATUS_MAP[ad.status] || STATUS_MAP['pending'];
              const payInfo = PAYMENT_MAP[ad.payment_status] || PAYMENT_MAP['pending'];
              const StatusIcon = statusInfo.icon;
              const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : '0.0';
              const budgetUsed = ad.budget > 0 ? Math.min(100, (ad.spent / ad.budget) * 100) : 0;

              return (
                <div key={ad.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  {/* Ad image */}
                  {ad.image_url && (
                    <div className="h-40 overflow-hidden">
                      <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base truncate">{ad.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Created {formatDistanceToNow(new Date(ad.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-medium ${statusInfo.cls}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusInfo.label}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${payInfo.cls}`}>
                          {payInfo.label}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground line-clamp-2">{ad.description}</p>

                    {/* Budget progress */}
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                        <span>Budget used: KES {(ad.spent || 0).toLocaleString()} / {(ad.budget || 0).toLocaleString()}</span>
                        <span>{budgetUsed.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-green-500 rounded-full transition-all"
                          style={{ width: `${budgetUsed}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: 'Impressions', value: formatNumber(ad.impressions || 0), icon: Eye },
                        { label: 'Clicks', value: formatNumber(ad.clicks || 0), icon: MousePointer },
                        { label: 'CTR', value: `${ctr}%`, icon: TrendingUp },
                      ].map((s, i) => (
                        <div key={i} className="bg-muted/50 rounded-lg p-2">
                          <s.icon className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-0.5" />
                          <p className="font-bold text-sm">{s.value}</p>
                          <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Payment pending alert */}
                    {ad.payment_status === 'pending' && (
                      <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                        <p className="text-xs text-yellow-700 dark:text-yellow-400">
                          Payment pending. Your ad will activate automatically once M-Pesa payment is confirmed.
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      {ad.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => pauseAd(ad.id)} className="flex-1 rounded-lg">
                          <Pause className="w-3.5 h-3.5 mr-1.5" /> Pause
                        </Button>
                      )}
                      {ad.status === 'paused' && (
                        <Button size="sm" onClick={() => resumeAd(ad.id)} className="flex-1 rounded-lg">
                          <Play className="w-3.5 h-3.5 mr-1.5" /> Resume
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/boost-analytics/${ad.id}`)}
                        className="rounded-lg"
                      >
                        <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Analytics
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteAd(ad.id)}
                        className="text-destructive hover:bg-destructive/10 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
