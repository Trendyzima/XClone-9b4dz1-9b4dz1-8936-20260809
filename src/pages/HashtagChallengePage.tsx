import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { PostCard } from '@/components/features/PostCard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  Trophy, Hash, Flame, Loader2, Clock, Users, Plus,
  CalendarDays, Gift, CheckCircle, AlertCircle
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { formatDistanceToNow, isPast, format } from 'date-fns';
import { toast } from 'sonner';
import { useSEO, buildOgImageUrl } from '@/hooks/useSEO';

import { PageAdBanner } from '@/components/features/AdSenseAd';
function HashtagChallengeAdBanner() { return <PageAdBanner />; }

export default function HashtagChallengePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [challenge, setChallenge] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [entering, setEntering] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  // ── SEO — dynamic challenge hash as OG image + Event JSON-LD ──────────────────────
  const challengeHashtag = challenge?.hashtags?.tag ?? '';
  useSEO({
    title: challenge ? `#${challengeHashtag} Challenge — ${challenge.title}` : 'Hashtag Challenge',
    description: challenge
      ? `${challenge.description || challenge.title} — ${challenge.entry_count ?? 0} entries. ${challenge.prize ? `Prize: ${challenge.prize}.` : ''} Ends ${format(new Date(challenge.end_date ?? Date.now()), 'MMM d, yyyy')}.`
      : 'Join a trending hashtag challenge on Testagram.',
    image: challengeHashtag ? buildOgImageUrl({ tag: challengeHashtag }) : undefined,
    url: id ? `/challenge/${id}` : '/explore',
    type: 'website',
    keywords: challenge ? `#${challengeHashtag}, challenge, contest, testagram, ${challenge.title}` : 'hashtag challenge, testagram',
    structuredData: challenge ? {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: challenge.title,
      description: challenge.description || challenge.title,
      url: `https://testagram.site/challenge/${id}`,
      startDate: challenge.created_at,
      endDate: challenge.end_date,
      eventStatus: isPast(new Date(challenge.end_date ?? Date.now()))
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      location: {
        '@type': 'VirtualLocation',
        url: `https://testagram.site/hashtag/${challengeHashtag}`,
      },
      organizer: challenge.user_profiles ? {
        '@type': 'Person',
        name: challenge.user_profiles.username,
        url: `https://testagram.site/profile/${challenge.user_profiles.username}`,
      } : { '@type': 'Organization', name: 'Testagram' },
      offers: challenge.prize ? {
        '@type': 'Offer',
        name: 'Challenge Prize',
        description: challenge.prize,
        price: '0',
        priceCurrency: 'USD',
        url: `https://testagram.site/challenge/${id}`,
      } : undefined,
    } : undefined,
  });

  const fetchChallenge = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('hashtag_challenges')
      .select('*, hashtags(id, tag, usage_count), user_profiles!created_by(username, avatar_url, verified)')
      .eq('id', id)
      .single();
    if (error) { toast.error('Challenge not found'); navigate('/explore'); return; }
    setChallenge(data);
    setLoading(false);
    fetchChallengePosts(data.hashtags?.tag);
  }, [id]);

  const fetchChallengePosts = async (tag: string) => {
    if (!tag) return;
    setLoadingPosts(true);
    const { data } = await supabase
      .from('posts')
      .select('*, user_profiles(*)')
      .ilike('content', `%#${tag}%`)
      .order('likes_count', { ascending: false })
      .limit(50);
    if (data) {
      setPosts(data);
      // Build mini leaderboard from top 3
      setLeaderboard(data.slice(0, 3));
      // Check if current user has entered
      if (user) {
        const entered = data.some((p: any) => p.user_id === user.id);
        setHasEntered(entered);
      }
    }
    setLoadingPosts(false);
  };

  useEffect(() => { fetchChallenge(); }, [fetchChallenge]);

  const handleEnter = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!challenge?.hashtags?.tag) return;
    setEntering(true);
    try {
      // Increment entry count
      await supabase
        .from('hashtag_challenges')
        .update({ entry_count: (challenge.entry_count ?? 0) + 1 })
        .eq('id', challenge.id);
      setChallenge((prev: any) => ({ ...prev, entry_count: (prev.entry_count ?? 0) + 1 }));
      setHasEntered(true);
      toast.success(`Entered! Post with #${challenge.hashtags.tag} to participate`);
      navigate(`/?compose=true&hashtag=${challenge.hashtags.tag}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEntering(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!challenge) return null;

  const isExpired = isPast(new Date(challenge.end_date));
  const hashtag = challenge.hashtags?.tag ?? '';

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Challenge" showBack />
      <HashtagChallengeAdBanner />

      {/* Hero */}
      <div className="px-4 pt-4 pb-5 border-b border-border bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center shrink-0">
            <Trophy className="w-7 h-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight">{challenge.title}</h1>
            {hashtag && (
              <button
                onClick={() => navigate(`/hashtag/${hashtag}`)}
                className="text-primary text-sm font-semibold hover:underline mt-0.5 inline-flex items-center gap-1"
              >
                <Hash className="w-3.5 h-3.5" />#{hashtag}
              </button>
            )}
          </div>
          {/* Status badge */}
          <div className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
            isExpired
              ? 'bg-muted text-muted-foreground'
              : 'bg-green-500/10 text-green-600 border border-green-500/20'
          }`}>
            {isExpired
              ? <><AlertCircle className="w-3 h-3" />Ended</>
              : <><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Active</>}
          </div>
        </div>

        {challenge.description && (
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{challenge.description}</p>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-muted/40 rounded-xl p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Users className="w-3.5 h-3.5 text-primary" />
            </div>
            <p className="text-lg font-black">{formatNumber(challenge.entry_count ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">Entries</p>
          </div>
          <div className="bg-muted/40 rounded-xl p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Flame className="w-3.5 h-3.5 text-orange-500" />
            </div>
            <p className="text-lg font-black">{formatNumber(posts.length)}</p>
            <p className="text-[10px] text-muted-foreground">Posts</p>
          </div>
          <div className="bg-muted/40 rounded-xl p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <p className="text-[11px] font-black leading-tight">
              {isExpired ? 'Ended' : formatDistanceToNow(new Date(challenge.end_date), { addSuffix: false })}
            </p>
            <p className="text-[10px] text-muted-foreground">{isExpired ? '' : 'left'}</p>
          </div>
        </div>

        {/* Prize */}
        {challenge.prize && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-3">
            <Gift className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Prize</p>
              <p className="text-sm text-amber-800 dark:text-amber-300">{challenge.prize}</p>
            </div>
          </div>
        )}

        {/* End date */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <CalendarDays className="w-3.5 h-3.5" />
          <span>
            {isExpired ? 'Ended' : 'Ends'} {format(new Date(challenge.end_date), 'MMM d, yyyy')}
          </span>
        </div>

        {/* Enter button */}
        {!isExpired && (
          <button
            onClick={handleEnter}
            disabled={entering || hasEntered}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              hasEntered
                ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                : 'bg-primary text-primary-foreground hover:opacity-90'
            }`}
          >
            {entering
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : hasEntered
                ? <><CheckCircle className="w-4 h-4" />You're In!</>
                : <><Plus className="w-4 h-4" />Join Challenge</>}
          </button>
        )}
      </div>

      {/* Top 3 leaderboard */}
      {leaderboard.length > 0 && (
        <div className="px-4 py-4 border-b border-border">
          <h2 className="font-bold text-base mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" /> Top Posts
          </h2>
          <div className="space-y-2">
            {leaderboard.map((post, i) => (
              <div
                key={post.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`/post/${post.id}`)}
              >
                <span className="text-2xl leading-none">{['🥇', '🥈', '🥉'][i]}</span>
                <div className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0">
                  {post.user_profiles?.avatar_url
                    ? <img src={post.user_profiles.avatar_url} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full flex items-center justify-center text-xs font-bold">{post.user_profiles?.username?.[0]?.toUpperCase()}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">@{post.user_profiles?.username}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{post.content}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-pink-600">❤️ {formatNumber(post.likes_count)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All posts */}
      <div className="border-t border-border">
        <div className="px-4 py-3 bg-muted/20">
          <p className="text-sm font-semibold text-muted-foreground">
            All {posts.length} entries — sorted by likes
          </p>
        </div>
        {loadingPosts ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground text-center px-6">
            <Hash className="w-14 h-14 opacity-20 mb-3" />
            <p className="font-semibold">No entries yet</p>
            <p className="text-sm mt-1">Be the first to post with #{hashtag}!</p>
          </div>
        ) : (
          posts.map(post => <PostCard key={post.id} post={post} onUpdate={() => fetchChallengePosts(hashtag)} />)
        )}
      </div>
    </div>
  );
}
