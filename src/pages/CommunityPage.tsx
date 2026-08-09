import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { PostCard } from '@/components/features/PostCard';
import { ComposePost } from '@/components/features/ComposePost';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Loader2, Users, TrendingUp, Lock, Globe, Shield,
  Crown, Settings, UserPlus, MessageSquare, Image
} from 'lucide-react';
import { Post } from '@/types';
import { formatNumber } from '@/lib/utils';
import { AdMob, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

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

  useEffect(() => {
    if (name) fetchCommunity();
  }, [name, user]);

  useEffect(() => {
    if (community && isMember) fetchPosts();
    else if (community && !community.is_private) fetchPosts(); // public: show posts to everyone
  }, [community, isMember]);

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
    try {
      const { data } = await supabase
        .from('posts')
        .select('*, user_profiles(*)')
        .eq('community_id', community.id)
        .order('created_at', { ascending: false });
      if (data) setPosts(data);
    } catch (err) {
      console.error('fetchPosts error:', err);
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
              <ComposePost onSuccess={fetchPosts} communityId={community.id} />
            )}
            {posts.length === 0 ? (
              <div className="flex flex-col items-center text-center py-12 text-muted-foreground">
                <Image className="w-12 h-12 mb-3 opacity-40" />
                <p className="font-semibold">No posts yet</p>
                {isMember && <p className="text-sm mt-1">Be the first to post in this community!</p>}
              </div>
            ) : (
              posts.map(post => (
                <PostCard key={post.id} post={post} onUpdate={fetchPosts} />
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
              className="flex items-center justify-between p-3 bg-card rounded-xl border border-border hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => navigate(`/profile/${member.user_profiles?.username}`)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted overflow-hidden">
                  {member.user_profiles?.avatar_url ? (
                    <img src={member.user_profiles.avatar_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold">
                      {member.user_profiles?.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-sm">{member.user_profiles?.username}</p>
                  <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                </div>
              </div>
              {member.role === 'owner' && (
                <Crown className="w-4 h-4 text-yellow-500" />
              )}
              {member.role === 'moderator' && (
                <Shield className="w-4 h-4 text-blue-500" />
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
