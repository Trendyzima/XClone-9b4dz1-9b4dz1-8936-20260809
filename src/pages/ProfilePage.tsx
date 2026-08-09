import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/layout/TopBar';
import { PostCard } from '@/components/features/PostCard';
import { EditProfileDialog } from '@/components/features/EditProfileDialog';
import { RevenueAnalyticsWidget } from '@/components/features/RevenueAnalyticsWidget';
import { Calendar, MapPin, Link as LinkIcon, Mail, BadgeCheck, Loader2, ExternalLink, Twitter, Instagram, Linkedin, MessageCircle, Globe, ShieldCheck, X, Trophy, Flame, DollarSign, Gift, Check, Share2, Copy, Plus, Star } from 'lucide-react';
import { FediverseBadge } from '@/components/features/FediverseBadge';
import { sendActivityNotification } from '@/components/layout/AuthProvider';
import { toast } from 'sonner';
import { usePageBanner } from '@/hooks/usePageBanner';
import { ADMOB_CONFIG } from '@/lib/admob';
import { formatDistanceToNow } from 'date-fns';
import { formatNumber } from '@/lib/utils';
import { Post } from '@/types';

export default function ProfilePage() {
  const { username } = useParams();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [replies, setReplies] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [likedPosts, setLikedPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Posts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [streakDay, setStreakDay] = useState(0);
  const [followerRank, setFollowerRank] = useState<number | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const [profileShared, setProfileShared] = useState(false);
  const [fedHandleCopied, setFedHandleCopied] = useState(false);
  const [hasActorRecord, setHasActorRecord] = useState(false);
  // Tip
  const [showTipDialog, setShowTipDialog] = useState(false);
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [customTipAmount, setCustomTipAmount] = useState('');
  const [sendingTip, setSendingTip] = useState(false);
  const [tipSent, setTipSent] = useState(false);
  // Highlights
  const [highlights, setHighlights] = useState<any[]>([]);
  const [showCreateHighlight, setShowCreateHighlight] = useState(false);
  const [highlightTitle, setHighlightTitle] = useState('');
  const [highlightCoverUrl, setHighlightCoverUrl] = useState<string | null>(null);
  const [availableStories, setAvailableStories] = useState<any[]>([]);
  const [creatingHighlight, setCreatingHighlight] = useState(false);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [viewHighlightId, setViewHighlightId] = useState<string | null>(null);
  // Highlight story viewer
  const [highlightStories, setHighlightStories] = useState<any[]>([]);
  const [highlightStoryIdx, setHighlightStoryIdx] = useState(0);
  const [highlightProgress, setHighlightProgress] = useState(0);
  const [loadingHighlightStories, setLoadingHighlightStories] = useState(false);
  const [viewingHighlight, setViewingHighlight] = useState<any | null>(null);
  // Tip history
  const [tipHistory, setTipHistory] = useState<any[]>([]);
  const [loadingTips, setLoadingTips] = useState(false);
  // Tip goal
  const [tipGoal, setTipGoal] = useState<number | null>(null);
  const [currentMonthTips, setCurrentMonthTips] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const openHighlightViewer = async (h: any) => {
    if (!h.story_ids || h.story_ids.length === 0) { toast.error('No stories in this highlight'); return; }
    setLoadingHighlightStories(true);
    setViewingHighlight(h);
    const { data } = await supabase
      .from('stories')
      .select('*')
      .in('id', h.story_ids);
    setHighlightStories(data ?? []);
    setHighlightStoryIdx(0);
    setHighlightProgress(0);
    setLoadingHighlightStories(false);
  };

  const closeHighlightViewer = () => {
    setViewingHighlight(null);
    setHighlightStories([]);
    setHighlightStoryIdx(0);
    setHighlightProgress(0);
  };

  const fetchTipGoal = async (userId: string) => {
    const { data: mon } = await supabase
      .from('user_monetization')
      .select('total_earnings')
      .eq('user_id', userId)
      .maybeSingle();
    // We repurpose a platform_settings entry keyed by user_id for the monthly goal
    const { data: setting } = await supabase
      .from('platform_settings')
      .select('setting_value')
      .eq('setting_key', `tip_goal_${userId}`)
      .maybeSingle();
    setTipGoal(setting?.setting_value?.goal ?? null);
    // Sum this month's received tips
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { data: monthTips } = await supabase
      .from('tips')
      .select('amount')
      .eq('to_user_id', userId)
      .gte('created_at', startOfMonth.toISOString());
    const total = (monthTips ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
    setCurrentMonthTips(total);
  };

  const handleSaveTipGoal = async () => {
    if (!currentUser || !profile) return;
    const goal = Number(goalInput);
    if (!goal || goal <= 0) return;
    await supabase.from('platform_settings').upsert(
      { setting_key: `tip_goal_${profile.id}`, setting_value: { goal } },
      { onConflict: 'setting_key' }
    );
    setTipGoal(goal);
    setEditingGoal(false);
    toast.success('Tip goal saved!');
  };

  const fetchTipHistory = async (userId: string) => {
    setLoadingTips(true);
    const { data: tips } = await supabase
      .from('tips')
      .select('*')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!tips || tips.length === 0) { setTipHistory([]); setLoadingTips(false); return; }
    // Collect unique user IDs to resolve profiles
    const uids = [...new Set(tips.flatMap((t: any) => [t.from_user_id, t.to_user_id]))] as string[];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url')
      .in('id', uids);
    const profileMap: Record<string, any> = {};
    (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });
    setTipHistory(tips.map((t: any) => ({ ...t, sender: profileMap[t.from_user_id], recipient: profileMap[t.to_user_id] })));
    setLoadingTips(false);
  };

  const handleShareProfile = async () => {
    const url = `${window.location.origin}/profile/${profile.username}`;
    const shareText = `Check out @${profile.username} on Tsocial${profile.bio ? ': ' + profile.bio.slice(0, 80) : ''}!`;
    if (navigator.share) {
      await navigator.share({ title: `@${profile.username} on Tsocial`, text: shareText, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
    setProfileShared(true);
    setTimeout(() => setProfileShared(false), 2000);
  };

  // Profile page banner — shown at bottom, above bottom nav, after 2.5s
  usePageBanner({ adId: ADMOB_CONFIG.BANNER_PROFILE, margin: 64, delay: 2500 });

  const tabs = ['Posts', 'Threads', 'Replies', 'Media', 'Likes', 'Tips', 'Followers', 'Following'];

  useEffect(() => {
    if (username) {
      fetchProfile();
    }
  }, [username]);

  const fetchHighlights = async (userId: string) => {
    const { data } = await supabase
      .from('user_highlights')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    setHighlights(data ?? []);
  };

  const fetchAvailableStories = async (userId: string) => {
    // Fetch all stories (including expired) for selection
    const { data } = await supabase
      .from('stories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    setAvailableStories(data ?? []);
  };

  const handleCreateHighlight = async () => {
    if (!currentUser || !highlightTitle.trim()) return;
    setCreatingHighlight(true);
    // Use first selected story's media_url as cover if not manually chosen
    const autoCover = selectedStoryIds.length > 0
      ? (availableStories.find((s: any) => s.id === selectedStoryIds[0])?.media_url ?? null)
      : null;
    const { error } = await supabase.from('user_highlights').insert({
      user_id: currentUser.id,
      title: highlightTitle.trim(),
      cover_url: highlightCoverUrl ?? autoCover,
      story_ids: selectedStoryIds,
    });
    if (error) { toast.error('Failed to create highlight'); }
    else {
      toast.success('Highlight created!');
      setShowCreateHighlight(false);
      setHighlightTitle('');
      setHighlightCoverUrl(null);
      setSelectedStoryIds([]);
      fetchHighlights(currentUser.id);
    }
    setCreatingHighlight(false);
  };

  const handleDeleteHighlight = async (id: string) => {
    await supabase.from('user_highlights').delete().eq('id', id);
    setHighlights(prev => prev.filter(h => h.id !== id));
    toast.success('Highlight removed');
  };

  const handleSendTip = async () => {
    if (!currentUser || !profile) return;
    const amount = tipAmount ?? Number(customTipAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid tip amount'); return; }
    setSendingTip(true);
    // Check sender wallet
    const { data: wallet } = await supabase
      .from('user_wallets')
      .select('balance, credits')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (!wallet || Number(wallet.balance) < amount) {
      toast.error('Insufficient wallet balance');
      setSendingTip(false);
      return;
    }
    // Deduct from sender
    const { error: deductErr } = await supabase.rpc('deduct_from_wallet', {
      p_user_id: currentUser.id,
      p_amount: amount,
    });
    if (deductErr) { toast.error('Could not deduct from wallet'); setSendingTip(false); return; }
    // Credit recipient
    await supabase.rpc('add_to_wallet', { p_user_id: profile.id, p_amount: amount }).catch(() => {});
    // Record tip
    await supabase.from('tips').insert({
      from_user_id: currentUser.id,
      to_user_id: profile.id,
      amount,
      message: `Tip from @${currentUser.username}`,
    }).catch(() => {});
    // Record earnings for recipient
    await supabase.from('creator_earnings').insert({
      user_id: profile.id,
      source: 'tips',
      amount,
      status: 'paid',
    }).catch(() => {});
    // Notify recipient (in-app)
    await supabase.from('notifications').insert({
      user_id: profile.id,
      type: 'tip',
      from_user_id: currentUser.id,
    }).catch(() => {});
    // Push notification to recipient
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const backendUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetch(`${backendUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: profile.id,
          title: 'You received a tip! 💰',
          body: `@${currentUser.username} sent you a $${amount.toFixed(2)} tip`,
          data: { route: `/profile/${currentUser.username}`, type: 'tip', amount },
        }),
      });
    } catch { /* non-critical — ignore push errors */ }
    toast.success(`$${amount.toFixed(2)} tip sent to @${profile.username}!`);
    setTipSent(true);
    setShowTipDialog(false);
    setTipAmount(null);
    setCustomTipAmount('');
    setSendingTip(false);
    setTimeout(() => setTipSent(false), 3000);
  };

  // ── Highlight story viewer auto-advance ───────────────────────────────
  useEffect(() => {
    if (!viewingHighlight || highlightStories.length === 0) { setHighlightProgress(0); return; }
    const story = highlightStories[highlightStoryIdx];
    if (!story || story.media_type === 'video') { setHighlightProgress(0); return; }
    setHighlightProgress(0);
    const start = Date.now();
    const DURATION = 5000;
    const iv = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / DURATION) * 100, 100);
      setHighlightProgress(pct);
      if (pct >= 100) {
        clearInterval(iv);
        if (highlightStoryIdx < highlightStories.length - 1) {
          setHighlightStoryIdx(p => p + 1);
        } else {
          closeHighlightViewer();
        }
      }
    }, 50);
    return () => clearInterval(iv);
  }, [viewingHighlight, highlightStoryIdx, highlightStories]);

  // Check if this profile has an ActivityPub actor
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('activitypub_actors')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .then(({ count }) => setHasActorRecord((count ?? 0) > 0));
  }, [profile?.id]);

  useEffect(() => {
    if (profile && currentUser && profile.id !== currentUser.id) {
      checkFollowStatus();
    }
  }, [profile, currentUser]);

  const fetchProfile = async () => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('username', username)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      await Promise.all([
        fetchPosts(profileData.id),
        fetchThreads(profileData.id),
        fetchReplies(profileData.id),
        fetchMedia(profileData.id),
        fetchLikedPosts(profileData.id),
        fetchFollowers(profileData.id),
        fetchFollowing(profileData.id),
        fetchProfileStats(profileData.id),
        fetchHighlights(profileData.id),
        fetchTipHistory(profileData.id),
        fetchTipGoal(profileData.id),
      ]);
    } catch (error) {
      console.error('Error fetching profile:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async (userId: string) => {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        user_profiles (*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching posts:', error);
      return;
    }
    setPosts(data || []);
  };

  const fetchThreads = async (userId: string) => {
    const { data, error } = await supabase
      .from('threads')
      .select('*')
      .eq('user_id', userId)
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching threads:', error);
      return;
    }
    setThreads(data || []);
  };

  const fetchReplies = async (userId: string) => {
    const { data, error } = await supabase
      .from('replies')
      .select(`
        *,
        posts(
          *,
          user_profiles(*)
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching replies:', error);
      return;
    }
    setReplies(data || []);
  };

  const fetchMedia = async (userId: string) => {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        user_profiles (*)
      `)
      .eq('user_id', userId)
      .or('image_url.not.is.null,video_url.not.is.null,media_urls.neq.[]')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching media:', error);
      return;
    }
    setMedia(data || []);
  };

  const fetchLikedPosts = async (userId: string) => {
    const { data, error } = await supabase
      .from('likes')
      .select(`
        posts(
          *,
          user_profiles(*)
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching liked posts:', error);
      return;
    }
    const posts = (data || []).map((item: any) => item.posts).filter(Boolean);
    setLikedPosts(posts);
  };

  const fetchFollowers = async (userId: string) => {
    const { data, error } = await supabase
      .from('follows')
      .select(`
        follower:user_profiles!follows_follower_id_fkey(*)
      `)
      .eq('following_id', userId);

    if (error) {
      console.error('Error fetching followers:', error);
      return;
    }
    setFollowers((data || []).map((item: any) => item.follower).filter(Boolean));
  };

  const fetchProfileStats = async (userId: string) => {
    // Streak
    const { data: reward } = await supabase
      .from('daily_rewards')
      .select('streak_day')
      .eq('user_id', userId)
      .maybeSingle();
    setStreakDay(reward?.streak_day ?? 0);

    // Follower rank (count users with more followers + 1)
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('followers_count')
      .eq('id', userId)
      .maybeSingle();
    if (profileData) {
      const { count } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .gt('followers_count', profileData.followers_count ?? 0);
      setFollowerRank((count ?? 0) + 1);
    }
  };

  const fetchFollowing = async (userId: string) => {
    const { data, error } = await supabase
      .from('follows')
      .select(`
        following:user_profiles!follows_following_id_fkey(*)
      `)
      .eq('follower_id', userId);

    if (error) {
      console.error('Error fetching following:', error);
      return;
    }
    setFollowing((data || []).map((item: any) => item.following).filter(Boolean));
  };

  const checkFollowStatus = async () => {
    if (!currentUser || !profile) return;

    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', currentUser.id)
      .eq('following_id', profile.id)
      .single();

    setIsFollowing(!!data);
  };

  const handleFollow = async () => {
    if (!currentUser) {
      navigate('/auth');
      return;
    }

    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', profile.id);
      } else {
        await supabase.from('follows').insert({
          follower_id: currentUser.id,
          following_id: profile.id,
        });

        await supabase.from('notifications').insert({
          user_id: profile.id,
          type: 'follow',
          from_user_id: currentUser.id,
        });
        // Push notification
        await sendActivityNotification({
          recipientUserId: profile.id,
          title: 'New Follower',
          body: `${currentUser.username} started following you`,
          data: { route: `/profile/${currentUser.username}`, type: 'follow', fromUserId: currentUser.id },
        });
      }
      setIsFollowing(!isFollowing);
      fetchProfile();
    } catch (error: any) {
      console.error('Follow error:', error);
    }
  };

  const handleMessage = () => {
    if (!currentUser) {
      navigate('/auth');
      return;
    }
    navigate(`/messages?to=${profile.username}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) return null;

  const isOwnProfile = currentUser?.id === profile.id;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title={profile.username} showBack />

      {/* Profile Header */}
      <div className="border-b border-border">
        {profile.cover_image && (
          <div className="h-48 bg-muted overflow-hidden">
            <img
              src={profile.cover_image}
              alt="Cover"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="px-4 pb-4">
          <div className="flex justify-between items-start -mt-16 mb-4">
            <div className="w-32 h-32 rounded-full border-4 border-background bg-muted overflow-hidden">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-bold">
                  {profile.username[0].toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-2 flex-wrap">
              {isOwnProfile ? (
                <>
                  <button
                    onClick={() => setShowEditDialog(true)}
                    className="px-4 py-2 border border-border rounded-full font-semibold hover:bg-muted transition-colors"
                  >
                    Edit profile
                  </button>
                  <button
                    onClick={handleShareProfile}
                    className="p-2 border border-border rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Share profile"
                  >
                    {profileShared ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleMessage}
                    className="px-4 py-2 border border-border rounded-full font-semibold hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Message
                  </button>
                  <button
                    onClick={handleFollow}
                    className={`px-4 py-2 rounded-full font-semibold transition-colors ${
                      isFollowing
                        ? 'border border-border hover:bg-muted'
                        : 'bg-foreground text-background hover:opacity-90'
                    }`}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  <button
                    onClick={() => setShowTipDialog(true)}
                    className={`p-2 border rounded-full transition-colors ${
                      tipSent ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500' : 'border-border hover:bg-yellow-500/10 hover:border-yellow-500/30 text-muted-foreground hover:text-yellow-600'
                    }`}
                    title="Send Tip"
                  >
                    {tipSent ? <Check className="w-4 h-4 text-yellow-500" /> : <DollarSign className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleShareProfile}
                    className="p-2 border border-border rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Share profile"
                  >
                    {profileShared ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold">{profile.username}</h2>
              {profile.verified && (
                <BadgeCheck className="w-5 h-5 text-primary" fill="currentColor" />
              )}
            </div>
            <p className="text-muted-foreground">@{profile.username}</p>
          </div>

          {profile.bio && <p className="mb-3 break-words">{profile.bio}</p>}
          {/* ── Tip Goal Badge ──────────────────────────────────────────────── */}
          {(tipGoal !== null || isOwnProfile) && (
            <div className="mb-3">
              {!editingGoal ? (
                <div className="flex items-center gap-3 p-3 rounded-2xl border border-yellow-500/20 bg-yellow-500/5">
                  <div className="relative w-12 h-12 shrink-0">
                    {/* SVG ring progress */}
                    <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                      <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
                      <circle
                        cx="22" cy="22" r="18" fill="none"
                        stroke="currentColor" strokeWidth="3"
                        className="text-yellow-500 transition-all duration-700"
                        strokeDasharray={`${2 * Math.PI * 18}`}
                        strokeDashoffset={`${2 * Math.PI * 18 * (1 - Math.min(tipGoal ? currentMonthTips / tipGoal : 0, 1))}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-yellow-600">
                      {tipGoal ? Math.round(Math.min((currentMonthTips / tipGoal) * 100, 100)) : 0}%
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-yellow-700 dark:text-yellow-400">Monthly Tip Goal</p>
                    <p className="text-sm font-bold text-foreground">
                      ${currentMonthTips.toFixed(2)}
                      {tipGoal !== null && <span className="text-muted-foreground font-normal"> / ${tipGoal.toFixed(2)}</span>}
                    </p>
                    {tipGoal && (
                      <div className="w-full bg-muted rounded-full h-1 mt-1 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full transition-all duration-700"
                          style={{ width: `${Math.min((currentMonthTips / tipGoal) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  {isOwnProfile && (
                    <button
                      onClick={() => { setGoalInput(String(tipGoal ?? '')); setEditingGoal(true); }}
                      className="text-xs text-yellow-600 hover:text-yellow-700 font-semibold px-2 py-1 rounded-lg hover:bg-yellow-500/10 transition-colors shrink-0"
                    >
                      {tipGoal ? 'Edit' : 'Set Goal'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/5">
                  <span className="text-yellow-600 font-bold text-sm">$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={goalInput}
                    onChange={e => setGoalInput(e.target.value)}
                    placeholder="Monthly goal amount"
                    autoFocus
                    className="flex-1 bg-transparent text-sm focus:outline-none text-foreground placeholder:text-muted-foreground"
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveTipGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
                  />
                  <button onClick={handleSaveTipGoal} className="text-xs bg-yellow-500 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-yellow-600 transition-colors">Save</button>
                  <button onClick={() => setEditingGoal(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5">Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* ── Story Highlights strip ─────────────────────────────────────── */}
          {(highlights.length > 0 || isOwnProfile) && (
            <div className="flex items-start gap-4 py-3 overflow-x-auto scrollbar-hide">
              {isOwnProfile && (
                <button
                  onClick={() => { fetchAvailableStories(profile.id); setShowCreateHighlight(true); }}
                  className="flex flex-col items-center gap-1.5 shrink-0 group"
                >
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-muted-foreground/30 group-hover:border-primary/50 flex items-center justify-center transition-colors bg-muted/30">
                    <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">New</span>
                </button>
              )}
              {highlights.map((h: any) => (
                <div key={h.id} className="flex flex-col items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openHighlightViewer(h)}
                    className="w-16 h-16 rounded-full ring-2 ring-offset-2 ring-offset-background ring-muted-foreground/20 hover:ring-primary/50 transition-all overflow-hidden bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center"
                  >
                    {h.cover_url
                      ? <img src={h.cover_url} alt={h.title} className="w-full h-full object-cover" />
                      : <Star className="w-6 h-6 text-primary" />}
                  </button>
                  <span className="text-[10px] font-medium max-w-[64px] truncate text-center">{h.title}</span>
                  {/* Delete option for own profile */}
                  {isOwnProfile && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteHighlight(h.id); }}
                      className="text-[10px] text-destructive hover:underline"
                    >Remove</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Fediverse Actor Badge — clickable handle */}
          {hasActorRecord && profile.username && (
            <button
              onClick={() => {
                const handle = `@${profile.username}@testagram.site`;
                navigator.clipboard.writeText(handle).then(() => {
                  setFedHandleCopied(true);
                  setTimeout(() => setFedHandleCopied(false), 2000);
                });
              }}
              className="mb-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-xs font-mono font-semibold text-purple-600 dark:text-purple-400">
                @{profile.username}@testagram.site
              </span>
              {fedHandleCopied
                ? <Check className="w-3 h-3 text-green-500" />
                : <Copy className="w-3 h-3 text-purple-400" />}
            </button>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground mb-3">
            {profile.location && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span>{profile.location}</span>
              </div>
            )}
            {profile.website && (
              <a
                href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <LinkIcon className="w-4 h-4" />
                <span>{profile.website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>Joined {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}</span>
            </div>
          </div>

          {/* Social Links */}
          {(profile.twitter_handle || profile.instagram_handle || profile.linkedin_url) && (
            <div className="flex gap-3 mb-3">
              {profile.twitter_handle && (
                <a
                  href={`https://twitter.com/${profile.twitter_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="Twitter/X"
                >
                  <Twitter className="w-5 h-5" />
                </a>
              )}
              {profile.instagram_handle && (
                <a
                  href={`https://instagram.com/${profile.instagram_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="Instagram"
                >
                  <Instagram className="w-5 h-5" />
                </a>
              )}
              {profile.linkedin_url && (
                <a
                  href={profile.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="LinkedIn"
                >
                  <Linkedin className="w-5 h-5" />
                </a>
              )}
            </div>
          )}

          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab('Following')}
              className="hover:underline"
            >
              <span className="font-bold">{formatNumber(profile.following_count)}</span>{' '}
              <span className="text-muted-foreground">Following</span>
            </button>
            <button 
              onClick={() => setActiveTab('Followers')}
              className="hover:underline"
            >
              <span className="font-bold">{formatNumber(profile.followers_count)}</span>{' '}
              <span className="text-muted-foreground">Followers</span>
            </button>
          </div>

          {/* ── Referral Copy Button (own profile) ────────────── */}
          {isOwnProfile && (
            <button
              onClick={() => {
                const link = `${window.location.origin}/auth?ref=${profile.id}`;
                navigator.clipboard.writeText(link).then(() => {
                  setReferralCopied(true);
                  setTimeout(() => setReferralCopied(false), 2000);
                });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors mt-2"
            >
              {referralCopied
                ? <Check className="w-3.5 h-3.5 text-green-500" />
                : <Gift className="w-3.5 h-3.5 text-primary" />}
              <span className="text-xs font-semibold text-primary">
                {referralCopied ? 'Link copied!' : 'Copy Invite Link'}
              </span>
            </button>
          )}

          {/* ── Profile Stats Card ─────────────────────────────── */}
          <div className="flex gap-2 mt-3 flex-wrap">
            {/* Follower rank */}
            {followerRank !== null && (
              <div
                onClick={() => navigate('/leaderboard')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
              >
                <Trophy className={`w-3.5 h-3.5 ${
                  followerRank === 1 ? 'text-yellow-500' :
                  followerRank === 2 ? 'text-slate-400' :
                  followerRank === 3 ? 'text-amber-600' :
                  'text-primary'
                }`} />
                <span className="text-xs font-semibold">
                  {followerRank <= 3
                    ? ['🥇','🥈','🥉'][followerRank - 1] + ` #${followerRank}`
                    : `#${formatNumber(followerRank)}`}
                </span>
                <span className="text-xs text-muted-foreground">followers</span>
              </div>
            )}
            {/* Streak */}
            {streakDay > 0 && (
              <div
                onClick={() => navigate('/daily-rewards')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-orange-500/30 bg-orange-500/5 cursor-pointer hover:bg-orange-500/10 transition-colors"
              >
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">Day {streakDay}</span>
                <span className="text-xs text-muted-foreground">streak</span>
              </div>
            )}
            {/* Earnings (own profile only) */}
            {isOwnProfile && Number(profile.total_earnings) > 0 && (
              <div
                onClick={() => navigate('/monetization')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-green-500/30 bg-green-500/5 cursor-pointer hover:bg-green-500/10 transition-colors"
              >
                <DollarSign className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-semibold text-green-600">${Number(profile.total_earnings).toFixed(2)}</span>
                <span className="text-xs text-muted-foreground">earned</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Verify Banner (own profile, unverified, not dismissed) ──────── */}
      {isOwnProfile && !profile.verified && !verifyBannerDismissed && (
        <div className="mx-4 mt-4 p-4 bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-transparent border border-amber-500/30 rounded-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">Get Verified</p>
                <p className="text-xs text-muted-foreground">Add a blue checkmark to stand out</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => navigate('/verify')}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-full transition-colors"
              >
                Apply
              </button>
              <button
                onClick={() => setVerifyBannerDismissed(true)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revenue Analytics Widget (for own profile only) */}
      {isOwnProfile && (
        <div className="px-4 mt-4">
          <RevenueAnalyticsWidget />
        </div>
      )}

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 px-4 py-4 font-semibold transition-colors border-b-2 ${
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

      {/* Content */}
      <div>
        {activeTab === 'Posts' && (
          posts.length > 0 ? (
            posts.map((post) => (
              <PostCard key={post.id} post={post} onUpdate={fetchProfile} />
            ))
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No posts yet</p>
            </div>
          )
        )}

        {activeTab === 'Threads' && (
          threads.length > 0 ? (
            threads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => navigate(`/thread/${thread.id}`)}
                className="border-b border-border p-4 hover:bg-muted/5 cursor-pointer"
              >
                <h3 className="font-bold text-lg mb-2">{thread.title}</h3>
                <p className="text-muted-foreground line-clamp-3 mb-2">{thread.content.substring(0, 200)}...</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{formatNumber(thread.views_count)} views</span>
                  <span>{formatNumber(thread.likes_count)} likes</span>
                  <span>{formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No threads yet</p>
            </div>
          )
        )}

        {activeTab === 'Replies' && (
          replies.length > 0 ? (
            replies.map((reply: any) => (
              <div key={reply.id} className="border-b border-border p-4 hover:bg-muted/5">
                <p className="text-sm text-muted-foreground mb-2">Replying to @{reply.posts?.user_profiles?.username}</p>
                <p className="mb-2">{reply.content}</p>
                <button 
                  onClick={() => navigate(`/post/${reply.post_id}`)}
                  className="text-sm text-primary hover:underline"
                >
                  View conversation
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No replies yet</p>
            </div>
          )
        )}

        {activeTab === 'Media' && (
          media.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-2">
              {media.map((post) => {
                const mediaUrl = post.video_url || post.image_url || post.media_urls?.[0];
                return (
                  <div
                    key={post.id}
                    onClick={() => navigate(`/post/${post.id}`)}
                    className="aspect-square bg-muted rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {post.is_video || post.video_url ? (
                      <video src={mediaUrl} className="w-full h-full object-cover" />
                    ) : (
                      <img src={mediaUrl} alt="Media" className="w-full h-full object-cover" />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No media yet</p>
            </div>
          )
        )}

        {activeTab === 'Tips' && (
          loadingTips ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : tipHistory.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-semibold">No tips yet</p>
              <p className="text-sm mt-1">Tips sent and received will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {tipHistory.map((tip: any) => {
                const isSent = tip.from_user_id === profile.id;
                const other = isSent ? tip.recipient : tip.sender;
                const uname = other?.username ?? 'user';
                return (
                  <div key={tip.id} className="p-4 hover:bg-muted/5 transition-colors flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0 cursor-pointer"
                      onClick={() => navigate(`/profile/${uname}`)}
                    >
                      {other?.avatar_url
                        ? <img src={other.avatar_url} alt={uname} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center font-bold text-sm">{uname[0]?.toUpperCase()}</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-semibold text-sm cursor-pointer hover:underline"
                          onClick={() => navigate(`/profile/${uname}`)}
                        >
                          {isSent ? `To @${uname}` : `From @${uname}`}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          isSent ? 'bg-red-500/10 text-red-600' : 'bg-green-500/10 text-green-600'
                        }`}>
                          {isSent ? '↑ Sent' : '↓ Received'}
                        </span>
                      </div>
                      {tip.message && <p className="text-xs text-muted-foreground mt-0.5 truncate">{tip.message}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(tip.created_at), { addSuffix: true })}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-bold ${
                        isSent ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {isSent ? '-' : '+'}${Number(tip.amount).toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {activeTab === 'Likes' && (
          likedPosts.length > 0 ? (
            likedPosts.map((post) => (
              <PostCard key={post.id} post={post} onUpdate={fetchProfile} />
            ))
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No liked posts yet</p>
            </div>
          )
        )}

        {activeTab === 'Followers' && (
          followers.length > 0 ? (
            <div className="divide-y divide-border">
              {followers.map((follower) => (
                <div key={follower.id} className="p-4 hover:bg-muted/5 flex items-center justify-between">
                  <div 
                    className="flex items-center space-x-3 flex-1 cursor-pointer"
                    onClick={() => navigate(`/profile/${follower.username}`)}
                  >
                    <div className="w-12 h-12 rounded-full bg-muted overflow-hidden">
                      {follower.avatar_url ? (
                        <img src={follower.avatar_url} alt={follower.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg font-bold">
                          {follower.username[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold">{follower.username}</span>
                        {follower.verified && (
                          <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{follower.bio || `@${follower.username}`}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No followers yet</p>
            </div>
          )
        )}

        {activeTab === 'Following' && (
          following.length > 0 ? (
            <div className="divide-y divide-border">
              {following.map((followedUser) => (
                <div key={followedUser.id} className="p-4 hover:bg-muted/5 flex items-center justify-between">
                  <div 
                    className="flex items-center space-x-3 flex-1 cursor-pointer"
                    onClick={() => navigate(`/profile/${followedUser.username}`)}
                  >
                    <div className="w-12 h-12 rounded-full bg-muted overflow-hidden">
                      {followedUser.avatar_url ? (
                        <img src={followedUser.avatar_url} alt={followedUser.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg font-bold">
                          {followedUser.username[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold">{followedUser.username}</span>
                        {followedUser.verified && (
                          <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{followedUser.bio || `@${followedUser.username}`}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>Not following anyone yet</p>
            </div>
          )
        )}
      </div>

      {/* ── Highlight Story Viewer Overlay ── */}
      {viewingHighlight && (
        <div className="fixed inset-0 z-[220] bg-black flex flex-col select-none">
          {loadingHighlightStories ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-white/60" />
            </div>
          ) : highlightStories.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/60">
              <Star className="w-12 h-12" />
              <p className="text-sm">No media found for this highlight</p>
              <button onClick={closeHighlightViewer} className="px-5 py-2 border border-white/30 rounded-full text-sm text-white">Close</button>
            </div>
          ) : (() => {
            const story = highlightStories[highlightStoryIdx];
            return (
              <>
                {/* Progress bars */}
                <div className="absolute top-3 left-3 right-3 flex gap-1 z-30 pointer-events-none">
                  {highlightStories.map((_, i) => (
                    <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full transition-none"
                        style={{ width: i < highlightStoryIdx ? '100%' : i === highlightStoryIdx ? `${highlightProgress}%` : '0%' }}
                      />
                    </div>
                  ))}
                </div>
                {/* Header */}
                <div className="absolute top-8 left-3 right-3 flex items-center gap-2 z-30">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-white/20 shrink-0">
                    {profile.avatar_url
                      ? <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs">{profile.username[0]?.toUpperCase()}</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{viewingHighlight.title}</p>
                    <p className="text-white/60 text-xs">@{profile.username}</p>
                  </div>
                  <button
                    onClick={closeHighlightViewer}
                    className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {/* Media */}
                <div
                  className="flex-1 flex items-center justify-center"
                  onClick={e => {
                    const x = e.clientX;
                    const w = (e.currentTarget as HTMLElement).offsetWidth;
                    if (x < w / 2) {
                      setHighlightStoryIdx(p => Math.max(0, p - 1));
                      setHighlightProgress(0);
                    } else {
                      if (highlightStoryIdx < highlightStories.length - 1) {
                        setHighlightStoryIdx(p => p + 1);
                        setHighlightProgress(0);
                      } else {
                        closeHighlightViewer();
                      }
                    }
                  }}
                >
                  {story.media_type === 'video'
                    ? <video key={story.id} src={story.media_url} autoPlay playsInline className="max-h-screen max-w-full object-contain" onEnded={() => { if (highlightStoryIdx < highlightStories.length - 1) { setHighlightStoryIdx(p => p + 1); setHighlightProgress(0); } else closeHighlightViewer(); }} />
                    : <img key={story.id} src={story.media_url} alt="" className="max-h-screen max-w-full object-contain" draggable={false} />
                  }
                </div>
                {story.caption && (
                  <div className="absolute bottom-8 left-6 right-6 z-30 pointer-events-none">
                    <p className="text-white text-sm font-medium bg-black/50 rounded-2xl px-4 py-2.5 text-center backdrop-blur-sm">{story.caption}</p>
                  </div>
                )}

              </>
            );
          })()}
        </div>
      )}

      {isOwnProfile && (
        <EditProfileDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          profile={profile}
          onSuccess={fetchProfile}
        />
      )}

      {/* ── Tip Dialog ── */}
      {showTipDialog && !isOwnProfile && (
        <div className="fixed inset-0 z-[200] bg-black/60" onClick={() => setShowTipDialog(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-5 space-y-4 max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg">Send a Tip</h2>
                <p className="text-sm text-muted-foreground">to @{profile.username}</p>
              </div>
              <button onClick={() => setShowTipDialog(false)} className="p-2 rounded-full hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Preset amounts */}
            <div className="grid grid-cols-3 gap-3">
              {[1, 5, 10].map(amt => (
                <button
                  key={amt}
                  onClick={() => { setTipAmount(amt); setCustomTipAmount(''); }}
                  className={`py-3 rounded-xl font-bold text-lg border-2 transition-all ${
                    tipAmount === amt
                      ? 'border-yellow-500 bg-yellow-500/10 text-yellow-600'
                      : 'border-border hover:border-yellow-500/40 hover:bg-yellow-500/5'
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
            {/* Custom amount */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Custom amount"
                value={customTipAmount}
                onChange={e => { setCustomTipAmount(e.target.value); setTipAmount(null); }}
                className="w-full pl-8 pr-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-yellow-500/30 text-base"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
              <DollarSign className="w-3.5 h-3.5 text-yellow-500" />
              Tips are sent from your wallet balance instantly
            </div>
            <button
              onClick={handleSendTip}
              disabled={sendingTip || (!tipAmount && !Number(customTipAmount))}
              className="w-full py-3.5 bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              {sendingTip ? <Loader2 className="w-5 h-5 animate-spin" /> : <DollarSign className="w-5 h-5" />}
              {sendingTip ? 'Sending…' : `Send $${(tipAmount ?? Number(customTipAmount)) || '—'} Tip`}
            </button>
          </div>
        </div>
      )}

      {/* ── Create Highlight Dialog ── */}
      {showCreateHighlight && isOwnProfile && (
        <div className="fixed inset-0 z-[200] bg-black/60" onClick={() => setShowCreateHighlight(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">New Highlight</h2>
              <button onClick={() => setShowCreateHighlight(false)} className="p-2 rounded-full hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Highlight name (e.g. Travel, Food…)"
              value={highlightTitle}
              onChange={e => setHighlightTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-base"
              autoFocus
              maxLength={30}
            />
            {/* Story multi-select picker */}
            {availableStories.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold">Select stories to include</p>
                  {selectedStoryIds.length > 0 && (
                    <span className="text-xs text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded-full">
                      {selectedStoryIds.length} selected
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {availableStories.map((s: any) => {
                    const isSelected = selectedStoryIds.includes(s.id);
                    const selIdx = selectedStoryIds.indexOf(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedStoryIds(prev =>
                            isSelected ? prev.filter(id => id !== s.id) : [...prev, s.id]
                          );
                          // Auto-set cover to first selected story
                          if (!isSelected && selectedStoryIds.length === 0 && !highlightCoverUrl) {
                            setHighlightCoverUrl(s.media_url);
                          }
                        }}
                        className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-transparent hover:border-muted-foreground/30'
                        }`}
                      >
                        {s.media_type === 'video'
                          ? <video src={s.media_url} className="w-full h-full object-cover" />
                          : <img src={s.media_url} alt="story" className="w-full h-full object-cover" />
                        }
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shadow">
                              {selIdx + 1}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedStoryIds.length > 0 && (
                  <button
                    onClick={() => { setSelectedStoryIds([]); setHighlightCoverUrl(null); }}
                    className="mt-2 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            )}
            {/* Manual cover override */}
            {availableStories.length > 0 && selectedStoryIds.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Override cover (optional)</p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {selectedStoryIds.map(id => {
                    const s = availableStories.find((a: any) => a.id === id);
                    if (!s) return null;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setHighlightCoverUrl(c => c === s.media_url ? null : s.media_url)}
                        className={`shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                          highlightCoverUrl === s.media_url ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                        }`}
                      >
                        {s.media_type === 'video'
                          ? <video src={s.media_url} className="w-full h-full object-cover" />
                          : <img src={s.media_url} alt="cover" className="w-full h-full object-cover" />
                        }
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {highlightCoverUrl && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Cover:</span>
                <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-primary">
                  <img src={highlightCoverUrl} alt="cover" className="w-full h-full object-cover" />
                </div>
                <button onClick={() => setHighlightCoverUrl(null)} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
              </div>
            )}
            <button
              onClick={handleCreateHighlight}
              disabled={creatingHighlight || !highlightTitle.trim()}
              className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 mt-1"
            >
              {creatingHighlight ? <Loader2 className="w-5 h-5 animate-spin" /> : <Star className="w-5 h-5" />}
              {creatingHighlight ? 'Creating…' : 'Create Highlight'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
