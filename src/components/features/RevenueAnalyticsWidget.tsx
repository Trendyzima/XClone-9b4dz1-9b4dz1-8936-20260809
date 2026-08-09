import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { TrendingUp, DollarSign, Eye, MousePointerClick, Calendar, Loader2 } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface RevenueStats {
  todayEarnings: number;
  weekEarnings: number;
  monthEarnings: number;
  totalImpressions: number;
  totalClicks: number;
  ctr: number;
  nextPayoutDate: string;
  nextPayoutAmount: number;
}

export function RevenueAnalyticsWidget() {
  const { user } = useAuth();
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    if (!user) return;

    try {
      // Check if user is monetized
      const { data: monetization } = await supabase
        .from('user_monetization')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!monetization?.is_monetized) {
        setLoading(false);
        return;
      }

      // Get today's earnings
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayData } = await supabase
        .from('wallet_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'earnings')
        .gte('created_at', todayStart.toISOString());

      const todayEarnings = todayData?.reduce((sum, tx) => sum + parseFloat(tx.amount), 0) || 0;

      // Get week earnings
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      const { data: weekData } = await supabase
        .from('wallet_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'earnings')
        .gte('created_at', weekStart.toISOString());

      const weekEarnings = weekData?.reduce((sum, tx) => sum + parseFloat(tx.amount), 0) || 0;

      // Get month earnings
      const monthStart = new Date();
      monthStart.setDate(1);

      const { data: monthData } = await supabase
        .from('wallet_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'earnings')
        .gte('created_at', monthStart.toISOString());

      const monthEarnings = monthData?.reduce((sum, tx) => sum + parseFloat(tx.amount), 0) || 0;

      // Get impression/click stats
      const { data: impressionData } = await supabase
        .from('ad_impressions')
        .select('clicked')
        .eq('user_id', user.id);

      const totalImpressions = impressionData?.length || 0;
      const totalClicks = impressionData?.filter(i => i.clicked).length || 0;
      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

      // Calculate next payout (assuming monthly on 1st)
      const nextPayout = new Date();
      nextPayout.setMonth(nextPayout.getMonth() + 1);
      nextPayout.setDate(1);

      setStats({
        todayEarnings,
        weekEarnings,
        monthEarnings,
        totalImpressions,
        totalClicks,
        ctr,
        nextPayoutDate: nextPayout.toISOString(),
        nextPayoutAmount: monetization.pending_user_payout || 0
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching revenue stats:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-border rounded-xl p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="border border-border rounded-xl p-6">
        <div className="text-center py-8 text-muted-foreground">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-semibold mb-1">Not Monetized Yet</p>
          <p className="text-sm">Enable monetization to start earning</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          <h3 className="font-bold text-lg">Revenue Analytics</h3>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-4 space-y-4">
        {/* Earnings */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Today</p>
            <p className="text-lg font-bold text-green-600">
              ${formatNumber(stats.todayEarnings)}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">This Week</p>
            <p className="text-lg font-bold text-blue-600">
              ${formatNumber(stats.weekEarnings)}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">This Month</p>
            <p className="text-lg font-bold text-purple-600">
              ${formatNumber(stats.monthEarnings)}
            </p>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Impressions</span>
            </div>
            <span className="font-semibold">{formatNumber(stats.totalImpressions)}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MousePointerClick className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Clicks</span>
            </div>
            <span className="font-semibold">{formatNumber(stats.totalClicks)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">CTR</span>
            <span className="font-semibold text-primary">{stats.ctr.toFixed(2)}%</span>
          </div>
        </div>

        {/* Next Payout */}
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-2 border-green-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-green-600" />
            <p className="text-sm font-semibold text-green-600">Next Payout</p>
          </div>
          <p className="text-2xl font-bold mb-1">
            ${formatNumber(stats.nextPayoutAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            Scheduled for {new Date(stats.nextPayoutDate).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
