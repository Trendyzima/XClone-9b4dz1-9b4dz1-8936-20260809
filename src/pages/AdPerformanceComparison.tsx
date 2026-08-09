import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Loader2, TrendingUp, Eye, MousePointerClick, DollarSign, BarChart3 } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface PlacementPerformance {
  placement_id: string;
  location: string;
  placement_type: string;
  impressions: number;
  clicks: number;
  revenue: number;
  ctr: number;
  rpm: number;
}

export default function AdPerformanceComparison() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [performances, setPerformances] = useState<PlacementPerformance[]>([]);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    checkAdmin();
  }, [user, timeRange]);

  const checkAdmin = async () => {
    const { data } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user!.id)
      .single();

    if (!data) {
      navigate('/');
      return;
    }
    fetchPerformance();
  };

  const fetchPerformance = async () => {
    setLoading(true);
    try {
      const daysAgo = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      // Fetch all ad placements
      const { data: placements } = await supabase
        .from('ad_placements')
        .select('*')
        .eq('is_active', true);

      if (!placements) {
        setLoading(false);
        return;
      }

      // Calculate performance for each placement
      const performanceData: PlacementPerformance[] = [];

      for (const placement of placements) {
        // Get impressions/clicks for this placement
        const { data: impressions } = await supabase
          .from('ad_impressions')
          .select('*')
          .eq('ad_id', placement.id)
          .gte('created_at', startDate.toISOString());

        const totalImpressions = impressions?.length || 0;
        const totalClicks = impressions?.filter(i => i.clicked).length || 0;
        const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        
        // Calculate revenue (example: $0.50 per click, $0.01 per 1000 impressions)
        const clickRevenue = totalClicks * 0.50;
        const impressionRevenue = (totalImpressions / 1000) * 0.01;
        const totalRevenue = clickRevenue + impressionRevenue;
        
        const rpm = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;

        performanceData.push({
          placement_id: placement.id,
          location: placement.location,
          placement_type: placement.placement_type,
          impressions: totalImpressions,
          clicks: totalClicks,
          revenue: totalRevenue,
          ctr: parseFloat(ctr.toFixed(2)),
          rpm: parseFloat(rpm.toFixed(2))
        });
      }

      // Sort by revenue descending
      performanceData.sort((a, b) => b.revenue - a.revenue);
      setPerformances(performanceData);
    } catch (error) {
      console.error('Performance fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getBestMetric = (metric: keyof PlacementPerformance) => {
    if (performances.length === 0) return null;
    return performances.reduce((best, curr) => 
      (curr[metric] as number) > (best[metric] as number) ? curr : best
    );
  };

  const bestRevenue = getBestMetric('revenue');
  const bestCTR = getBestMetric('ctr');
  const bestRPM = getBestMetric('rpm');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Ad Performance Comparison" showBack />

      <div className="max-w-6xl mx-auto p-6">
        {/* Time Range Selector */}
        <div className="flex gap-2 mb-6">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                timeRange === range
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>

        {/* Best Performers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="border-2 border-green-500/20 bg-green-500/5 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              <span className="text-sm text-muted-foreground">Highest Revenue</span>
            </div>
            <p className="text-2xl font-bold text-green-600 mb-1">
              ${formatNumber(bestRevenue?.revenue || 0)}
            </p>
            <p className="text-sm capitalize">{bestRevenue?.location.replace('_', ' ')}</p>
          </div>

          <div className="border-2 border-blue-500/20 bg-blue-500/5 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <MousePointerClick className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-muted-foreground">Best CTR</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 mb-1">
              {bestCTR?.ctr || 0}%
            </p>
            <p className="text-sm capitalize">{bestCTR?.location.replace('_', ' ')}</p>
          </div>

          <div className="border-2 border-purple-500/20 bg-purple-500/5 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              <span className="text-sm text-muted-foreground">Best RPM</span>
            </div>
            <p className="text-2xl font-bold text-purple-600 mb-1">
              ${formatNumber(bestRPM?.rpm || 0)}
            </p>
            <p className="text-sm capitalize">{bestRPM?.location.replace('_', ' ')}</p>
          </div>
        </div>

        {/* Performance Table */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/50">
            <h2 className="text-xl font-bold">All Placements Performance</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Location</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Type</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold">Impressions</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold">Clicks</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold">CTR</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold">Revenue</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold">RPM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {performances.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      No performance data available for selected time range
                    </td>
                  </tr>
                ) : (
                  performances.map((perf) => (
                    <tr key={perf.placement_id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 capitalize font-medium">
                        {perf.location.replace('_', ' ')}
                      </td>
                      <td className="px-6 py-4 capitalize text-sm text-muted-foreground">
                        {perf.placement_type}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Eye className="w-4 h-4 text-muted-foreground" />
                          {formatNumber(perf.impressions)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <MousePointerClick className="w-4 h-4 text-muted-foreground" />
                          {formatNumber(perf.clicks)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-semibold ${
                          perf.ctr === bestCTR?.ctr ? 'text-blue-600' : ''
                        }`}>
                          {perf.ctr}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-bold ${
                          perf.revenue === bestRevenue?.revenue ? 'text-green-600' : ''
                        }`}>
                          ${formatNumber(perf.revenue)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-semibold ${
                          perf.rpm === bestRPM?.rpm ? 'text-purple-600' : ''
                        }`}>
                          ${formatNumber(perf.rpm)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recommendations */}
        <div className="mt-8 border-2 border-primary/20 rounded-xl p-6 bg-primary/5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-lg">Optimization Recommendations</h3>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>
                <strong>{bestRevenue?.location.replace('_', ' ')}</strong> generates the most revenue - 
                consider adding more ads in this location
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>
                <strong>{bestCTR?.location.replace('_', ' ')}</strong> has the highest CTR ({bestCTR?.ctr}%) - 
                users engage most with ads here
              </span>
            </li>
            {performances.filter(p => p.ctr < 0.5).length > 0 && (
              <li className="flex items-start gap-2">
                <span className="text-orange-600">⚠</span>
                <span className="text-orange-600">
                  {performances.filter(p => p.ctr < 0.5).length} placement(s) have CTR below 0.5% - 
                  consider A/B testing different ad formats
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
