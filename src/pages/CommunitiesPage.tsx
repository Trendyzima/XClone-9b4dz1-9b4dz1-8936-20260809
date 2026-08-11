import { useState, useEffect, useRef, useMemo } from 'react';
import { PageAdBanner } from '@/components/features/AdSenseAd';
function CommunitiesAdBanner() { return <PageAdBanner />; }
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Users, Plus, TrendingUp, Loader2, Search, Lock, Globe, Shield,
  Image as ImageIcon, X, Camera, Sparkles
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { useSEO } from '@/hooks/useSEO';
import { toast as sonnerToast } from 'sonner';

interface Community {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  icon_url?: string;
  banner_url?: string;
  member_count: number;
  post_count: number;
  created_by: string;
  is_private: boolean;
  is_member?: boolean;
}

export default function CommunitiesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [suggestedCommunities, setSuggestedCommunities] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'joined' | 'discover'>('all');
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    description: '',
    is_private: false,
  });
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  // ItemList JSON-LD — built once communities load, stable reference via useMemo
  const communitiesJsonLd = useMemo(() => {
    const top = communities.slice(0, 10);
    if (top.length === 0) return undefined;
    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Top Communities on Testagram',
      description: 'Browse the most popular communities on Testagram',
      url: 'https://testagram.site/communities',
      numberOfItems: top.length,
      itemListElement: top.map((c: any, i: number) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.display_name,
        url: `https://testagram.site/c/${c.name}`,
        description: c.description || `${c.display_name} community on Testagram — ${c.member_count?.toLocaleString() ?? 0} members`,
      })),
    };
  }, [communities]);

  useSEO({
    title: 'Discover Communities',
    description: 'Join communities on Testagram — connect with people who share your passions. Browse public communities on technology, sports, entertainment, lifestyle and more.',
    url: '/communities',
    type: 'website',
    keywords: 'communities, groups, testagram, join, forums, social groups, technology, sports, entertainment',
    structuredData: communitiesJsonLd,
  });

  useEffect(() => {
    fetchCommunities();
    if (user) fetchSuggestions();
  }, [user, activeTab]);

  const fetchSuggestions = async () => {
    if (!user) return;
    await supabase.rpc('generate_community_suggestions', { p_user_id: user.id }).catch(() => {});
    const { data } = await supabase
      .from('community_suggestions')
      .select('community_id, reason, communities(*)')
      .eq('user_id', user.id)
      .order('score', { ascending: false })
      .limit(5);
    if (data) {
      setSuggestedCommunities(data.map((d: any) => ({ ...d.communities, _reason: d.reason })).filter(Boolean));
    }
  };

  const fetchCommunities = async () => {
    try {
      const { data } = await supabase
        .from('communities')
        .select('*')
        .order('member_count', { ascending: false });

      if (!data) return;

      if (user) {
        const { data: memberships } = await supabase
          .from('community_members')
          .select('community_id')
          .eq('user_id', user.id);

        const memberIds = new Set(memberships?.map((m) => m.community_id));
        let enriched = data.map((c) => ({ ...c, is_member: memberIds.has(c.id) }));

        if (activeTab === 'joined') enriched = enriched.filter(c => c.is_member);
        else if (activeTab === 'discover') enriched = enriched.filter(c => !c.is_member);

        setCommunities(enriched);
      } else {
        setCommunities(data.map(c => ({ ...c, is_member: false })));
      }
    } catch (error) {
      console.error('fetchCommunities error:', error);
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (file: File, path: string): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const fileName = `${path}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('posts').upload(fileName, file, { upsert: true });
    if (error) { console.error('Upload error:', error); return null; }
    const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
    return publicUrl;
  };

  const handleCreateCommunity = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!formData.name.trim() || !formData.display_name.trim()) {
      toast({ title: 'Error', description: 'Name and display name are required', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const communityName = formData.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!communityName) {
        toast({ title: 'Error', description: 'Community name must contain letters or numbers', variant: 'destructive' });
        return;
      }

      sonnerToast.loading('Creating community...');

      let iconUrl: string | null = null;
      let bannerUrl: string | null = null;

      if (iconFile) {
        iconUrl = await uploadImage(iconFile, `communities/icons/${user.id}`);
      }
      if (bannerFile) {
        bannerUrl = await uploadImage(bannerFile, `communities/banners/${user.id}`);
      }

      const { data, error } = await supabase
        .from('communities')
        .insert({
          name: communityName,
          display_name: formData.display_name,
          description: formData.description,
          is_private: formData.is_private,
          created_by: user.id,
          icon_url: iconUrl,
          banner_url: bannerUrl,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('community_members').insert({
        community_id: data.id,
        user_id: user.id,
        role: 'owner',
      });

      sonnerToast.dismiss();
      toast({ title: '🎉 Community created!' });
      setCreateOpen(false);
      setFormData({ name: '', display_name: '', description: '', is_private: false });
      setIconFile(null); setIconPreview(null);
      setBannerFile(null); setBannerPreview(null);
      fetchCommunities();
      navigate(`/c/${communityName}`);
    } catch (error: any) {
      sonnerToast.dismiss();
      toast({ title: 'Error', description: error.message || 'Failed to create community', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (communityId: string) => {
    if (!user) { navigate('/auth'); return; }
    try {
      await supabase.from('community_members').insert({ community_id: communityId, user_id: user.id });
      toast({ title: '✅ Joined community!' });
      fetchCommunities();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleLeave = async (communityId: string) => {
    if (!user) return;
    try {
      await supabase.from('community_members')
        .delete()
        .match({ community_id: communityId, user_id: user.id });
      toast({ title: 'Left community' });
      fetchCommunities();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const filtered = communities.filter(c =>
    c.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Communities" />

      {/* Hero */}
      <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 p-6 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-2xl font-bold">Communities</h2>
            <p className="text-muted-foreground text-sm">Join conversations that matter to you</p>
          </div>
          {user && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Create
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create a Community</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  {/* Banner image upload */}
                  <div>
                    <label className="text-sm font-medium block mb-1">Banner Image (optional)</label>
                    <div className="relative h-28 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-xl overflow-hidden border-2 border-dashed border-border cursor-pointer hover:border-primary/50 transition-colors">
                      {bannerPreview && (
                        <img src={bannerPreview} className="w-full h-full object-cover" alt="Banner preview" />
                      )}
                      <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                        <Camera className="w-6 h-6 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">Click to upload banner</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) { setBannerFile(f); setBannerPreview(URL.createObjectURL(f)); }
                          }}
                        />
                      </label>
                      {bannerPreview && (
                        <button
                          onClick={e => { e.preventDefault(); setBannerFile(null); setBannerPreview(null); }}
                          className="absolute top-2 right-2 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Icon upload */}
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 border-2 border-dashed border-border overflow-hidden flex items-center justify-center">
                        {iconPreview ? (
                          <img src={iconPreview} className="w-full h-full object-cover" alt="Icon" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <label className="absolute inset-0 cursor-pointer rounded-2xl">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) { setIconFile(f); setIconPreview(URL.createObjectURL(f)); }
                          }}
                        />
                      </label>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Community Icon</p>
                      <p className="text-xs text-muted-foreground">Square image recommended</p>
                      {iconPreview && (
                        <button
                          onClick={() => { setIconFile(null); setIconPreview(null); }}
                          className="text-xs text-destructive mt-1"
                        >
                          Remove icon
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Community Name (URL) *</label>
                    <Input
                      placeholder="technology"
                      value={formData.name}
                      onChange={e => setFormData(p => ({ ...p, name: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') }))}
                    />
                    {formData.name && (
                      <p className="text-xs text-muted-foreground mt-1">URL: /c/{formData.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Display Name *</label>
                    <Input
                      placeholder="Technology Enthusiasts"
                      value={formData.display_name}
                      onChange={e => setFormData(p => ({ ...p, display_name: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Description</label>
                    <Textarea
                      placeholder="What is this community about?"
                      value={formData.description}
                      onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  <div
                    className="flex items-center gap-3 p-3 border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setFormData(p => ({ ...p, is_private: !p.is_private }))}
                  >
                    {formData.is_private ? (
                      <Lock className="w-5 h-5 text-orange-500" />
                    ) : (
                      <Globe className="w-5 h-5 text-primary" />
                    )}
                    <div>
                      <p className="font-medium text-sm">{formData.is_private ? 'Private Community' : 'Public Community'}</p>
                      <p className="text-xs text-muted-foreground">
                        {formData.is_private
                          ? 'Only members can see content and posts'
                          : 'Anyone can join and see posts'}
                      </p>
                    </div>
                    <div className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      formData.is_private ? 'border-orange-500 bg-orange-500' : 'border-border'
                    }`}>
                      {formData.is_private && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>

                  <Button
                    onClick={handleCreateCommunity}
                    disabled={creating || !formData.name || !formData.display_name}
                    className="w-full rounded-full"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    Create Community
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 bg-background"
            placeholder="Search communities..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      {user && (
        <div className="sticky top-14 z-20 bg-background border-b border-border">
          <div className="flex">
            {(['all', 'joined', 'discover'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 capitalize ${
                  activeTab === tab
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AdSense banner — communities page */}
      <CommunitiesAdBanner />

      {/* Communities List */}
      <div className="p-4 space-y-3">
        {/* ── Community Suggestions Strip ── */}
        {user && suggestedCommunities.length > 0 && activeTab !== 'joined' && !searchQuery && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm">Suggested for You</h3>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
              {suggestedCommunities.map((sc: any) => (
                <div key={sc.id} className="flex-shrink-0 w-44 border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/c/${sc.name}`)}
                >
                  <div className="h-14 bg-gradient-to-br from-primary/20 to-purple-500/20 overflow-hidden">
                    {sc.banner_url ? <img src={sc.banner_url} className="w-full h-full object-cover" alt="" /> : null}
                  </div>
                  <div className="p-2.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="w-7 h-7 rounded-lg bg-muted overflow-hidden shrink-0">
                        {sc.icon_url ? <img src={sc.icon_url} className="w-full h-full object-cover" alt="" /> : <span className="w-full h-full flex items-center justify-center font-bold text-xs text-primary">{sc.display_name[0]}</span>}
                      </div>
                      <p className="font-bold text-xs truncate">{sc.display_name}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{formatNumber(sc.member_count)} members</p>
                    {sc._reason && <p className="text-[10px] text-primary mt-0.5">{sc._reason}</p>}
                    <button onClick={e => { e.stopPropagation(); handleJoin(sc.id); }}
                      className="mt-2 w-full py-1 text-[10px] font-bold bg-primary text-white rounded-lg hover:opacity-90 transition-opacity">
                      Join
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-semibold">No communities found</p>
            <p className="text-sm mt-1">
              {activeTab === 'joined' ? "You haven't joined any communities yet" : 'Try a different search'}
            </p>
          </div>
        ) : (
          filtered.map(community => (
            <div
              key={community.id}
              className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-all cursor-pointer"
              onClick={() => navigate(`/c/${community.name}`)}
            >
              {/* Banner */}
              {community.banner_url && (
                <div className="h-20 overflow-hidden">
                  <img src={community.banner_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${
                      community.banner_url ? '-mt-8 ring-2 ring-background' : 'bg-primary/10'
                    }`}>
                      {community.icon_url ? (
                        <img src={community.icon_url} alt={community.display_name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl font-bold text-primary">{community.display_name[0]}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-foreground truncate">{community.display_name}</h3>
                        {community.is_private ? (
                          <span className="flex items-center gap-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">
                            <Lock className="w-3 h-3" /> Private
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            <Globe className="w-3 h-3" /> Public
                          </span>
                        )}
                        {community.is_member && (
                          <span className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                            <Shield className="w-3 h-3" /> Member
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">c/{community.name}</p>
                      {community.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{community.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {formatNumber(community.member_count)} members
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          {formatNumber(community.post_count)} posts
                        </span>
                      </div>
                    </div>
                  </div>

                  {user && (
                    <Button
                      size="sm"
                      variant={community.is_member ? 'outline' : 'default'}
                      className="rounded-full flex-shrink-0"
                      onClick={e => {
                        e.stopPropagation();
                        community.is_member
                          ? handleLeave(community.id)
                          : handleJoin(community.id);
                      }}
                    >
                      {community.is_member ? 'Joined' : 'Join'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── AdSense banner — mounted once, push-guarded ───────────────────────────────────────────────────
