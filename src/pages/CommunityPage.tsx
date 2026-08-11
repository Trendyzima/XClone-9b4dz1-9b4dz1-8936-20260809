import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { PostCard } from '@/components/features/PostCard';
import { ComposePost } from '@/components/features/ComposePost';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2, Users, TrendingUp, Lock, Globe, Shield,
  Crown, Settings, UserPlus, MessageSquare, Image,
  BookOpen, Plus, Trash2, X,
  ShieldCheck, ShieldOff, MoreVertical, Pin, PinOff,
  Camera, Check
} from 'lucide-react';
import { Post } from '@/types/app-types';
import { formatNumber } from '@/lib/utils';
import { AdMob, BannerAdSize, BannerAdPosition, Capacitor } from '@/lib/capacitor-stub';
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
}

interface CommunityMember {
  id: string;
  user_id: string;
  role: string;
  user_profiles: {
    username: string;
    avatar_url?: string;
    verified: boolean;
  };
}

export default function CommunityPage() {
  const { name } = useParams<{ name: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [community, setCommunity] = useState<Community | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [userRole, setUserRole] = useState<string>('member');
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'members'>('posts');
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [editingRules, setEditingRules] = useState(false);
  const [rules, setRules] = useState<string[]>([]);
  const [newRuleText, setNewRuleText] = useState('');
  const [savingRules, setSavingRules] = useState(false);
  // Role management
  const [promotingMemberId, setPromotingMemberId] = useState<string | null>(null);
  const [showRoleMenu, setShowRoleMenu] = useState<string | null>(null);
  // Edit community state (owner/admin)
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({ display_name: '', description: '' });
  const [editIconFile, setEditIconFile] = useState<File | null>(null);
  const [editIconPreview, setEditIconPreview] = useState<string | null>(null);
  const [editBannerFile, setEditBannerFile] = useState<File | null>(null);
  const [editBannerPreview, setEditBannerPreview] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditDialog = () => {
    if (!community) return;
    setEditForm({ display_name: community.display_name, description: community.description ?? '' });
    setEditIconPreview(community.icon_url ?? null);
    setEditBannerPreview(community.banner_url ?? null);
    setEditIconFile(null);
    setEditBannerFile(null);
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!community) return;
    setSavingEdit(true);
    try {
      let iconUrl = community.icon_url ?? null;
      let bannerUrl = community.banner_url ?? null;

      const uploadImage = async (file: File, path: string) => {
        const ext = file.name.split('.').pop();
        const fileName = `${path}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('posts').upload(fileName, file, { upsert: true });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
        return publicUrl;
      };

      if (editIconFile) iconUrl = await uploadImage(editIconFile, `communities/icons/${user!.id}`);
      if (editBannerFile) bannerUrl = await uploadImage(editBannerFile, `communities/banners/${user!.id}`);

      const { error } = await supabase
        .from('communities')
        .update({
          display_name: editForm.display_name.trim() || community.display_name,
          description: editForm.description.trim(),
          icon_url: iconUrl,
          banner_url: bannerUrl,
        })
        .eq('id', community.id);

      if (error) throw error;

      setCommunity(prev => prev ? {
        ...prev,
        display_name: editForm.display_name.trim() || prev.display_name,
        description: editForm.description.trim(),
        icon_url: iconUrl ?? prev.icon_url,
        banner_url: bannerUrl ?? prev.banner_url,
      } : null);
      setShowEditDialog(false);
      sonnerToast.success('Community updated!');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  // Pinned posts
  const [pinnedPostIds, setPinnedPostIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (name) fetchCommunity();
  }, [name, user]);

  // Load pinned posts from community settings
  useEffect(() => {
    if (!community?.id) return;
    supabase
      .from('platform_settings')
      .select('setting_value')
      .eq('setting_key', `community_pinned_${community.id}`)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.setting_value?.pinned) {
          setPinnedPostIds(new Set(data.setting_value.pinned));
        }
      });
  }, [community?.id]);

  const handlePromoteRole = async (memberId: string, userId: string, newRole: 'member' | 'moderator') => {
    if (!community || !isOwner) return;
    setPromotingMemberId(memberId);
    const { error } = await supabase
      .from('community_members')
      .update({ role: newRole })
      .eq('id', memberId)
      .eq('community_id', community.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
      toast({ title: newRole === 'moderator' ? '🛡 Promoted to Moderator' : 'Role changed to Member' });
    }
    setPromotingMemberId(null);
    setShowRoleMenu(null);
  };

  const handlePinPost = async (postId: string) => {
    if (!community || !isAdmin) return;
    const updated = new Set(pinnedPostIds);
    if (updated.has(postId)) updated.delete(postId);
    else updated.add(postId);
    setPinnedPostIds(updated);
    await supabase.from('platform_settings').upsert(
      { setting_key: `community_pinned_${community.id}`, setting_value: { pinned: [...updated] } },
      { onConflict: 'setting_key' }
    );
    toast({ title: updated.has(postId) ? 'Post pinned' : 'Post unpinned' });
  };

  const handleModDeletePost = async (postId: string) => {
    if (!isAdmin) return;
    if (!window.confirm('Delete this post as moderator?')) return;
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setPosts(prev => prev.filter(p => p.id !== postId));
    toast({ title: 'Post deleted by moderator' });
  };

  // Sync rules from community data
  useEffect(() => {
    if (community?.rules) {
      setRules(Array.isArray(community.rules) ? community.rules.map((r: any) => typeof r === 'string' ? r : r.text ?? String(r)) : []);
    }
  }, [community?.rules]);

  useEffect(() => {
    if (community && isMember) fetchPosts();
    else if (community && !community.is_private) fetchPosts(); // public: show posts to everyone
  }, [community, isMember]);

  // Real-time subscription for new community posts
  useEffect(() => {
    if (!community) return;
    const sub = supabase
      .channel(`community-posts-${community.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
        filter: `community_id=eq.${community.id}`,
      }, () => { fetchPosts(); })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [community?.id]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    AdMob.showBanner({
      adId: 'ca-app-pub-7234579833875016/8657343194',
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
    });
    return () => { AdMob.hideBanner(); };
  }, []);

  const fetchCommunity = async () => {
    if (!name) return;
    try {
      const { data, error } = await supabase
        .from('communities')
        .select('*')
        .eq('name', name)
        .single();

      if (error) throw error;
      setCommunity(data);

      if (user) {
        const { data: memberData } = await supabase
          .from('community_members')
          .select('id, role')
          .eq('community_id', data.id)
          .eq('user_id', user.id)
          .maybeSingle();

        const joined = !!memberData;
        setIsMember(joined);
        if (memberData) setUserRole(memberData.role);
      }

      // Fetch members for display
      const { data: membersData } = await supabase
        .from('community_members')
        .select('*, user_profiles(username, avatar_url, verified)')
        .eq('community_id', data.id)
        .order('role', { ascending: true })
        .limit(20);

      if (membersData) setMembers(membersData);
    } catch {
      toast({ title: 'Community not found', variant: 'destructive' });
      navigate('/communities');
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    if (!community) return;
    setLoadingPosts(true);
    try {
      const { data } = await supabase
        .from('posts')
        .select('*, user_profiles(*)')
        .eq('community_id', community.id)
        .order('created_at', { ascending: false });
      if (data) setPosts(data);
    } catch (err) {
      console.error('fetchPosts error:', err);
    } finally {
      setLoadingPosts(false);
    }
  };

  const handleJoinToggle = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!community) return;

    try {
      if (isMember) {
        if (userRole === 'owner') {
          toast({ title: 'Error', description: 'Owners cannot leave. Transfer ownership first.', variant: 'destructive' });
          return;
        }
        await supabase.from('community_members')
          .delete()
          .match({ community_id: community.id, user_id: user.id });
        setIsMember(false);
        toast({ title: 'Left community' });
      } else {
        await supabase.from('community_members')
          .insert({ community_id: community.id, user_id: user.id });
        setIsMember(true);
        toast({ title: '✅ Joined community!' });
      }
      fetchCommunity();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!community) return null;

  const isOwner = userRole === 'owner';
  const isAdmin = ['owner', 'moderator'].includes(userRole);
  const canSeeContent = !community.is_private || isMember;

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title={`c/${community.name}`} showBack />

      {/* Banner */}
      {community.banner_url && (
        <div className="h-36 bg-muted overflow-hidden">
          <img src={community.banner_url} alt={community.display_name} className="w-full h-full object-cover" />
        </div>
      )}
      {!community.banner_url && (
        <div className="h-20 bg-gradient-to-r from-primary/20 to-purple-500/20" />
      )}

      {/* Community Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border-4 border-background flex items-center justify-center -mt-8 overflow-hidden flex-shrink-0">
              {community.icon_url ? (
                <img src={community.icon_url} alt={community.display_name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-primary">{community.display_name[0]}</span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{community.display_name}</h1>
                {community.is_private ? (
                  <span className="flex items-center gap-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 px-2 py-0.5 rounded-full">
                    <Lock className="w-3 h-3" /> Private
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    <Globe className="w-3 h-3" /> Public
                  </span>
                )}
                {isMember && (
                  <span className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                    {isOwner ? <Crown className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                    {isOwner ? 'Owner' : isAdmin ? 'Mod' : 'Member'}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">c/{community.name}</p>
            </div>
          </div>

          {user && (
            <Button
              onClick={handleJoinToggle}
              variant={isMember ? 'outline' : 'default'}
              className="rounded-full flex-shrink-0"
              size="sm"
            >
              {isMember ? 'Joined' : (
                <>
                  <UserPlus className="w-4 h-4 mr-1" />
                  Join
                </>
              )}
            </Button>
          )}
        </div>

        {community.description && (
          <p className="mt-3 text-sm text-muted-foreground">{community.description}</p>
        )}

        {/* Edit Community button — owner/admin only */}
        {isAdmin && (
          <button onClick={openEditDialog}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors text-xs font-semibold text-muted-foreground hover:text-foreground">
            <Settings className="w-3.5 h-3.5" />
            Edit Community
          </button>
        )}

        {/* Rules button */}
        {rules.length > 0 && (
          <button
            onClick={() => setShowRulesModal(true)}
            className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {rules.length} Community Rule{rules.length !== 1 ? 's' : ''}
          </button>
        )}
        {isAdmin && rules.length === 0 && (
          <button
            onClick={() => { setShowRulesModal(true); setEditingRules(true); }}
            className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-full border border-dashed border-border hover:bg-muted transition-colors text-xs font-semibold text-muted-foreground"
          >
            <Plus className="w-3.5 h-3.5" /> Add Community Rules
          </button>
        )}

        {/* Stats */}
        <div className="flex items-center gap-6 mt-3 text-sm">
          <button
            onClick={() => setActiveTab('members')}
            className="flex items-center gap-1.5 hover:text-primary transition-colors"
          >
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="font-bold">{formatNumber(community.member_count)}</span>
            <span className="text-muted-foreground">members</span>
          </button>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="font-bold">{formatNumber(community.post_count)}</span>
            <span className="text-muted-foreground">posts</span>
          </div>
        </div>
      </div>

      {/* ── Edit Community Modal ── */}
      {showEditDialog && isAdmin && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-end" onClick={() => setShowEditDialog(false)}>
          <div className="w-full bg-background rounded-t-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                <h2 className="font-bold text-lg">Edit Community</h2>
              </div>
              <button onClick={() => setShowEditDialog(false)} className="p-2 rounded-full hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-5">
              {/* Banner upload */}
              <div>
                <p className="text-sm font-semibold mb-2">Banner Image</p>
                <div className="relative h-28 rounded-xl overflow-hidden border-2 border-dashed border-border cursor-pointer hover:border-primary/50 transition-colors bg-gradient-to-r from-primary/10 to-purple-500/10">
                  {editBannerPreview && <img src={editBannerPreview} className="w-full h-full object-cover" alt="" />}
                  <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer gap-1">
                    <Camera className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{editBannerPreview ? 'Change banner' : 'Upload banner'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setEditBannerFile(f); setEditBannerPreview(URL.createObjectURL(f)); } }} />
                  </label>
                  {editBannerPreview && (
                    <button onClick={e => { e.preventDefault(); setEditBannerFile(null); setEditBannerPreview(null); }}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center text-white z-10">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Icon upload */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border-2 border-dashed border-border overflow-hidden flex items-center justify-center">
                    {editIconPreview
                      ? <img src={editIconPreview} className="w-full h-full object-cover" alt="" />
                      : <span className="text-2xl font-bold text-primary">{community.display_name[0]}</span>}
                  </div>
                  <label className="absolute inset-0 cursor-pointer rounded-2xl">
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setEditIconFile(f); setEditIconPreview(URL.createObjectURL(f)); } }} />
                  </label>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow">
                    <Camera className="w-3 h-3 text-white" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold">Community Icon</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tap icon to change</p>
                  {editIconPreview && editIconPreview !== community.icon_url && (
                    <button onClick={() => { setEditIconFile(null); setEditIconPreview(community.icon_url ?? null); }} className="text-xs text-destructive mt-1">Revert</button>
                  )}
                </div>
              </div>

              {/* Display name */}
              <div>
                <label className="text-sm font-semibold block mb-1.5">Display Name</label>
                <Input value={editForm.display_name} onChange={e => setEditForm(p => ({ ...p, display_name: e.target.value }))} placeholder="Community Display Name" maxLength={60} />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-semibold block mb-1.5">Description</label>
                <Textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} placeholder="What is this community about?" rows={3} maxLength={300} />
                <p className="text-xs text-muted-foreground text-right mt-1">{editForm.description.length}/300</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowEditDialog(false)} className="flex-1 py-3 border border-border rounded-xl text-sm font-semibold hover:bg-muted transition-colors">Cancel</button>
                <button onClick={handleSaveEdit} disabled={savingEdit || !editForm.display_name.trim()}
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors hover:opacity-90">
                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Rules Modal ── */}
      {showRulesModal && (
        <div className="fixed inset-0 z-[200] bg-black/60 flex items-end" onClick={() => { setShowRulesModal(false); setEditingRules(false); setNewRuleText(''); }}>
          <div className="w-full bg-background rounded-t-3xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                <h2 className="font-bold text-lg">Community Rules</h2>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{community.display_name}</span>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button onClick={() => setEditingRules(e => !e)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${ editingRules ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70' }`}>
                    {editingRules ? 'Done' : 'Edit'}
                  </button>
                )}
                <button onClick={() => { setShowRulesModal(false); setEditingRules(false); }} className="p-2 rounded-full hover:bg-muted">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Rules list */}
            <div className="px-5 py-4 space-y-3">
              {rules.length === 0 && !editingRules && (
                <p className="text-sm text-muted-foreground text-center py-6">No rules have been set for this community.</p>
              )}
              {rules.map((rule, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">{idx + 1}</div>
                  <p className="flex-1 text-sm leading-relaxed pt-0.5">{rule}</p>
                  {editingRules && (
                    <button onClick={async () => {
                      const updated = rules.filter((_, i) => i !== idx);
                      setSavingRules(true);
                      await supabase.from('communities').update({ rules: updated }).eq('id', community.id);
                      setRules(updated);
                      setSavingRules(false);
                    }} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {/* Add new rule (edit mode, owner only) */}
              {editingRules && isAdmin && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={newRuleText}
                    onChange={e => setNewRuleText(e.target.value)}
                    placeholder="Describe the rule clearly…"
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    disabled={!newRuleText.trim() || savingRules}
                    onClick={async () => {
                      if (!newRuleText.trim()) return;
                      const updated = [...rules, newRuleText.trim()];
                      setSavingRules(true);
                      await supabase.from('communities').update({ rules: updated }).eq('id', community.id);
                      setRules(updated);
                      setNewRuleText('');
                      setSavingRules(false);
                      toast({ title: 'Rule added' });
                    }}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingRules ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add Rule
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="sticky top-14 z-20 bg-background border-b border-border">
        <div className="flex">
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'posts' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Posts
            {posts.length > 0 && (
              <span className="ml-1 text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full">{posts.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'members' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
            }`}
          >
            <Users className="w-4 h-4" /> Members
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'posts' ? (
        !canSeeContent ? (
          /* Gated content for private communities */
          <div className="flex flex-col items-center justify-center text-center py-16 px-6">
            <div className="w-20 h-20 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center mb-4">
              <Lock className="w-10 h-10 text-orange-500" />
            </div>
            <h3 className="text-xl font-bold mb-2">Private Community</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm">
              This community is private. Join to see posts and connect with members.
            </p>
            {user ? (
              <Button onClick={handleJoinToggle} className="rounded-full px-8">
                <UserPlus className="w-4 h-4 mr-2" />
                Request to Join
              </Button>
            ) : (
              <Button onClick={() => navigate('/auth')} className="rounded-full px-8">
                Sign in to Join
              </Button>
            )}

            {/* Show member avatars as social proof */}
            {members.length > 0 && (
              <div className="mt-8">
                <div className="flex -space-x-2 justify-center mb-2">
                  {members.slice(0, 5).map(m => (
                    <div
                      key={m.id}
                      className="w-8 h-8 rounded-full bg-muted border-2 border-background overflow-hidden"
                    >
                      {m.user_profiles?.avatar_url ? (
                        <img src={m.user_profiles.avatar_url} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold">
                          {m.user_profiles?.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(community.member_count)} members inside
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Members can see posts */
          <div>
            {isMember && (
              <div className="border-b border-border">
                <ComposePost onSuccess={fetchPosts} communityId={community.id} />
              </div>
            )}
            {loadingPosts ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center text-center py-12 text-muted-foreground">
                <Image className="w-12 h-12 mb-3 opacity-40" />
                <p className="font-semibold">No posts yet</p>
                {isMember && <p className="text-sm mt-1">Be the first to post in this community!</p>}
              </div>
            ) : (
              [...posts]
              .sort((a, b) => {
                const aPinned = pinnedPostIds.has(a.id) ? 1 : 0;
                const bPinned = pinnedPostIds.has(b.id) ? 1 : 0;
                return bPinned - aPinned;
              })
              .map(post => (
                <div key={post.id} className="relative">
                  {/* Pinned indicator */}
                  {pinnedPostIds.has(post.id) && (
                    <div className="flex items-center gap-1.5 px-4 pt-2 pb-0 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      <Pin className="w-3 h-3" /> Pinned
                    </div>
                  )}
                  <PostCard post={post} onUpdate={fetchPosts} />
                  {/* Mod actions overlay */}
                  {isAdmin && (
                    <div className="absolute top-2 right-12 z-10">
                      <button
                        onClick={e => { e.stopPropagation(); setShowRoleMenu(p => p === post.id ? null : post.id); }}
                        className="p-1.5 rounded-full bg-background/80 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
                        title="Moderator actions"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                      {showRoleMenu === post.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowRoleMenu(null)} />
                          <div className="absolute right-0 mt-1 w-44 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                            <button
                              onClick={e => { e.stopPropagation(); handlePinPost(post.id); setShowRoleMenu(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                            >
                              {pinnedPostIds.has(post.id)
                                ? <><PinOff className="w-4 h-4 text-amber-500" />Unpin post</>
                                : <><Pin className="w-4 h-4 text-amber-500" />Pin post</>}
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); handleModDeletePost(post.id); setShowRoleMenu(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-destructive/10 text-destructive transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />Delete (mod)
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )
      ) : (
        /* Members tab */
        <div className="p-4 space-y-3">
          <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">
            {formatNumber(community.member_count)} Members
          </h3>
          {members.map(member => (
            <div
              key={member.id}
              className="flex items-center justify-between p-3 bg-card rounded-xl border border-border hover:border-primary/30 transition-colors"
            >
              <div
                className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                onClick={() => navigate(`/profile/${member.user_profiles?.username}`)}
              >
                <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
                  {member.user_profiles?.avatar_url ? (
                    <img src={member.user_profiles.avatar_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold">
                      {member.user_profiles?.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm truncate">{member.user_profiles?.username}</p>
                    {member.role === 'owner' && <Crown className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                    {member.role === 'moderator' && <Shield className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                </div>
              </div>
              {/* Owner can promote/demote members */}
              {isOwner && member.role !== 'owner' && (
                <div className="relative ml-2 shrink-0">
                  <button
                    onClick={() => setShowRoleMenu(p => p === member.id ? null : member.id)}
                    className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Manage role"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {showRoleMenu === member.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowRoleMenu(null)} />
                      <div className="absolute right-0 mt-1 w-48 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                        {member.role === 'member' && (
                          <button
                            onClick={() => handlePromoteRole(member.id, member.user_id, 'moderator')}
                            disabled={promotingMemberId === member.id}
                            className="w-full flex items-center gap-2 px-3 py-3 text-sm hover:bg-muted transition-colors text-blue-600"
                          >
                            {promotingMemberId === member.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <ShieldCheck className="w-4 h-4" />
                            }
                            Promote to Moderator
                          </button>
                        )}
                        {member.role === 'moderator' && (
                          <button
                            onClick={() => handlePromoteRole(member.id, member.user_id, 'member')}
                            disabled={promotingMemberId === member.id}
                            className="w-full flex items-center gap-2 px-3 py-3 text-sm hover:bg-muted transition-colors text-orange-600"
                          >
                            {promotingMemberId === member.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <ShieldOff className="w-4 h-4" />
                            }
                            Remove Moderator
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Remove @${member.user_profiles?.username} from community?`)) return;
                            await supabase.from('community_members').delete().eq('id', member.id);
                            setMembers(prev => prev.filter(m => m.id !== member.id));
                            setShowRoleMenu(null);
                            toast({ title: 'Member removed' });
                          }}
                          className="w-full flex items-center gap-2 px-3 py-3 text-sm hover:bg-destructive/10 text-destructive transition-colors border-t border-border"
                        >
                          <Trash2 className="w-4 h-4" />Remove from community
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {community.member_count > 20 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              +{formatNumber(community.member_count - 20)} more members
            </p>
          )}
        </div>
      )}
    </div>
  );
}
