import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DollarSign, Settings, Plus, Trash2, Power, Loader2 } from 'lucide-react';

interface AdPlacement {
  id: string;
  network: string;
  placement_type: string;
  code: string;
  location: string;
  is_active: boolean;
  impressions: number;
  revenue: number;
}

export default function AdConfigPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [placements, setPlacements] = useState<AdPlacement[]>([]);
  const [adSenseClientId, setAdSenseClientId] = useState('');
  const [platformPayPal, setPlatformPayPal] = useState('');
  const [revenueShare, setRevenueShare] = useState(70);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlacement, setNewPlacement] = useState({
    network: 'adsense',
    placement_type: 'banner',
    code: '',
    location: 'feed_top'
  });

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    checkAdminAccess();
    fetchConfig();
  }, [user]);

  const checkAdminAccess = async () => {
    const { data } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user!.id)
      .single();

    if (!data) {
      toast.error('Access denied: Admin only');
      navigate('/');
    }
  };

  const fetchConfig = async () => {
    try {
      // Fetch ad placements
      const { data: placementsData } = await supabase
        .from('ad_placements')
        .select('*')
        .order('created_at', { ascending: false });

      setPlacements(placementsData || []);

      // Fetch platform settings
      const { data: settingsData } = await supabase
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'paypal_config')
        .single();

      if (settingsData) {
        setPlatformPayPal(settingsData.setting_value.platform_email || '');
        setRevenueShare(settingsData.setting_value.revenue_share_percentage || 70);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePlatformSettings = async () => {
    try {
      const { error } = await supabase
        .from('platform_settings')
        .upsert({
          setting_key: 'paypal_config',
          setting_value: {
            platform_email: platformPayPal,
            revenue_share_percentage: revenueShare,
            auto_payout_enabled: true,
            payout_threshold: 100
          }
        });

      if (error) throw error;
      toast.success('Platform settings updated');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const addPlacement = async () => {
    if (!newPlacement.code.trim()) {
      toast.error('Please enter ad code/ID');
      return;
    }

    try {
      const { error } = await supabase
        .from('ad_placements')
        .insert(newPlacement);

      if (error) throw error;

      toast.success('Ad placement added');
      setShowAddForm(false);
      setNewPlacement({
        network: 'adsense',
        placement_type: 'banner',
        code: '',
        location: 'feed_top'
      });
      fetchConfig();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const togglePlacement = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('ad_placements')
        .update({ is_active: !isActive })
        .eq('id', id);

      if (error) throw error;
      fetchConfig();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const deletePlacement = async (id: string) => {
    if (!confirm('Delete this ad placement?')) return;

    try {
      const { error } = await supabase
        .from('ad_placements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Ad placement deleted');
      fetchConfig();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Ad Configuration" showBack />

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Platform Settings */}
        <div className="border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Platform Settings</h2>
              <p className="text-sm text-muted-foreground">Configure revenue sharing and PayPal</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Platform PayPal Email</label>
              <Input
                value={platformPayPal}
                onChange={(e) => setPlatformPayPal(e.target.value)}
                placeholder="nahashonnyaga794@gmail.com"
                type="email"
              />
              <p className="text-xs text-muted-foreground mt-1">
                All platform revenue (70% share) will be sent to this PayPal account
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Platform Revenue Share (%)
              </label>
              <Input
                value={revenueShare}
                onChange={(e) => setRevenueShare(Number(e.target.value))}
                type="number"
                min="0"
                max="100"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Users keep {100 - revenueShare}% of their ad revenue
              </p>
            </div>

            <Button onClick={updatePlatformSettings} className="w-full">
              <DollarSign className="w-4 h-4 mr-2" />
              Save Platform Settings
            </Button>
          </div>
        </div>

        {/* AdSense Configuration */}
        <div className="border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold">Ad Placements</h2>
              <p className="text-sm text-muted-foreground">Manage AdSense/AdMob ads</p>
            </div>
            <Button onClick={() => setShowAddForm(!showAddForm)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Placement
            </Button>
          </div>

          {showAddForm && (
            <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30">
              <h3 className="font-semibold mb-4">New Ad Placement</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Network</label>
                  <select
                    value={newPlacement.network}
                    onChange={(e) => setNewPlacement({ ...newPlacement, network: e.target.value })}
                    className="w-full p-2 border border-border rounded-lg bg-background"
                  >
                    <option value="adsense">Google AdSense (Web)</option>
                    <option value="admob">Google AdMob (Mobile)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Placement Type</label>
                  <select
                    value={newPlacement.placement_type}
                    onChange={(e) => setNewPlacement({ ...newPlacement, placement_type: e.target.value })}
                    className="w-full p-2 border border-border rounded-lg bg-background"
                  >
                    <option value="banner">Banner</option>
                    <option value="native">Native</option>
                    <option value="interstitial">Interstitial</option>
                    <option value="rewarded">Rewarded</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {newPlacement.network === 'adsense' ? 'Ad Slot ID' : 'Ad Unit ID'}
                  </label>
                  <Input
                    value={newPlacement.code}
                    onChange={(e) => setNewPlacement({ ...newPlacement, code: e.target.value })}
                    placeholder={newPlacement.network === 'adsense' ? '1234567890' : 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Location</label>
                  <select
                    value={newPlacement.location}
                    onChange={(e) => setNewPlacement({ ...newPlacement, location: e.target.value })}
                    className="w-full p-2 border border-border rounded-lg bg-background"
                  >
                    <option value="feed_top">Feed Top</option>
                    <option value="feed_inline">Feed Inline (Every 5 posts)</option>
                    <option value="sidebar">Sidebar</option>
                    <option value="profile">Profile Page</option>
                    <option value="explore">Explore Page</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <Button onClick={addPlacement} className="flex-1">
                    Add Placement
                  </Button>
                  <Button onClick={() => setShowAddForm(false)} variant="outline" className="flex-1">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Ad Placements List */}
          <div className="space-y-3">
            {placements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No ad placements configured</p>
                <p className="text-sm mt-2">Add your first ad placement to start earning</p>
              </div>
            ) : (
              placements.map((placement) => (
                <div key={placement.id} className="p-4 border border-border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold capitalize">{placement.placement_type}</span>
                        <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                          {placement.network.toUpperCase()}
                        </span>
                        {placement.is_active && (
                          <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-600">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Location: <span className="font-medium">{placement.location}</span>
                      </p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {placement.code}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{placement.impressions.toLocaleString()} impressions</span>
                        <span>${placement.revenue.toFixed(2)} revenue</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => togglePlacement(placement.id, placement.is_active)}
                        size="sm"
                        variant="outline"
                        title={placement.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => deletePlacement(placement.id)}
                        size="sm"
                        variant="destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="border border-primary/20 bg-primary/5 rounded-xl p-6">
          <h3 className="font-bold text-lg mb-3">Setup Instructions</h3>
          <ol className="space-y-2 text-sm">
            <li className="flex gap-2">
              <span className="font-bold">1.</span>
              <span>Create a <a href="https://www.google.com/adsense" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google AdSense</a> account (for web) or <a href="https://admob.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">AdMob</a> (for mobile app)</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold">2.</span>
              <span>Get your Publisher ID (ca-pub-XXXXXXXXXXXXXXXX) and Ad Unit IDs</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold">3.</span>
              <span>Add the AdSense script to your website's HTML head section</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold">4.</span>
              <span>Create ad placements above and paste your ad unit IDs</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold">5.</span>
              <span>Configure your PayPal Business account to receive automatic payouts</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold">6.</span>
              <span>Revenue will be split automatically: {revenueShare}% to platform, {100 - revenueShare}% to content creators</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
