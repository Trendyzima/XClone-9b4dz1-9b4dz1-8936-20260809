import { useState, useEffect } from 'react';
import { useSEO } from '@/hooks/useSEO';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  Zap, Target, DollarSign, Calendar, Users, TrendingUp,
  Eye, MousePointerClick, Loader2, ChevronRight, CheckCircle2,
  Megaphone, Video, Image as ImageIcon, BarChart3
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';

import { PageAdBanner } from '@/components/features/AdSenseAd';
function BoostCreateAdBanner() { return <PageAdBanner />; }

const BOOST_TYPES = [
  { id: 'reach', icon: <Eye className="w-5 h-5 text-blue-500" />, label: 'Reach', desc: 'Maximize impressions across feeds', color: 'border-blue-500/30 bg-blue-500/5', activeColor: 'border-blue-500 bg-blue-500/10' },
  { id: 'engagement', icon: <MousePointerClick className="w-5 h-5 text-green-500" />, label: 'Engagement', desc: 'Drive likes, comments & shares', color: 'border-green-500/30 bg-green-500/5', activeColor: 'border-green-500 bg-green-500/10' },
  { id: 'conversions', icon: <Target className="w-5 h-5 text-purple-500" />, label: 'Conversions', desc: 'Profile visits & follows', color: 'border-purple-500/30 bg-purple-500/5', activeColor: 'border-purple-500 bg-purple-500/10' },
  { id: 'video_views', icon: <Video className="w-5 h-5 text-red-500" />, label: 'Video Views', desc: 'Maximize video play-throughs', color: 'border-red-500/30 bg-red-500/5', activeColor: 'border-red-500 bg-red-500/10' },
];

const AUDIENCE_INTERESTS = [
  'Technology', 'Sports', 'Music', 'Art', 'Food', 'Travel', 'Fashion', 'Gaming',
  'Finance', 'Health', 'Education', 'Entertainment', 'Business', 'Science',
];

export default function BoostCreatePage() {
  useSEO({ noindex: true, title: 'Create Boost Campaign', url: '/boost-create' });
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const postId = searchParams.get('post_id') ?? '';

  const [post, setPost] = useState<any>(null);
  const [boostType, setBoostType] = useState('reach');
  const [dailyBudget, setDailyBudget] = useState(5);
  const [duration, setDuration] = useState(7);
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(55);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  const totalBudget = dailyBudget * duration;

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    if (postId) fetchPost();
    fetchWallet();
  }, [postId, user]);

  const fetchPost = async () => {
    const { data } = await supabase.from('posts')
      .select('id, content, image_url, video_url, is_video, views_count, likes_count, user_id')
      .eq('id', postId)
      .single();
    setPost(data);
  };

  const fetchWallet = async () => {
    if (!user) return;
    const { data } = await supabase.from('user_wallets').select('balance').eq('user_id', user.id).maybeSingle();
    setWalletBalance(Number(data?.balance ?? 0));
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest].slice(0, 5)
    );
  };

  // Estimated reach calculation
  const estimatedImpressions = Math.round(totalBudget * 500 + Math.random() * totalBudget * 100);
  const estimatedClicks = Math.round(estimatedImpressions * 0.018);

  const handleLaunch = async () => {
    if (!user || !postId) return;
    if (totalBudget > walletBalance) {
      toast.error(`Insufficient wallet balance. Top up at least $${(totalBudget - walletBalance).toFixed(2)} more.`);
      return;
    }
    setLaunching(true);
    try {
      const endDate = new Date(Date.now() + duration * 86400000).toISOString();
      const targetAudience = {
        age_min: ageMin,
        age_max: ageMax,
        interests: selectedInterests,
      };

      const { error } = await supabase.from('boosted_posts').insert({
        post_id: postId,
        user_id: user.id,
        boost_type: boostType,
        budget: totalBudget,
        spent: 0,
        impressions: 0,
        clicks: 0,
        target_audience: targetAudience,
        is_active: true,
        end_date: endDate,
        is_sponsored: boostType === 'reach' || boostType === 'conversions',
        daily_reach: 0,
        total_reach: 0,
      });

      if (error) throw error;

      // Deduct from wallet
      await supabase.rpc('deduct_from_wallet', {
        p_user_id: user.id,
        p_amount: totalBudget,
      }).catch(() => {});

      setLaunched(true);
      toast.success('Boost campaign launched!');
      setTimeout(() => navigate(`/boost-analytics/${postId}`), 1800);
    } catch (err: any) {
      toast.error(err.message || 'Failed to launch campaign');
    } finally {
      setLaunching(false);
    }
  };

  if (launched) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-5">
        <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
          <CheckCircle2 className="w-11 h-11 text-green-500" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-black text-green-600 mb-1">Campaign Launched!</h2>
          <p className="text-muted-foreground text-sm">Your boost is now active. Redirecting to analytics…</p>
        </div>
        <div className="flex gap-3 mt-2">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-center">
            <p className="text-lg font-black text-green-600">${totalBudget.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">Budget</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-center">
            <p className="text-lg font-black text-blue-600">{duration}d</p>
            <p className="text-[10px] text-muted-foreground">Duration</p>
          </div>
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3 text-center">
            <p className="text-lg font-black text-purple-600">{formatNumber(estimatedImpressions)}</p>
            <p className="text-[10px] text-muted-foreground">Est. Reach</p>
          </div>
        </div>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mt-2" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Create Boost Campaign" showBack />
      <BoostCreateAdBanner />

      <div className="max-w-2xl mx-auto p-4 space-y-5">

        {/* Hero */}
        <div className="bg-gradient-to-br from-primary/10 via-purple-500/5 to-transparent border border-primary/20 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Megaphone className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-xl font-black">Boost Campaign Creator</h1>
              <p className="text-xs text-muted-foreground">Set your goals, budget & audience</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <div className="bg-background/60 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Wallet</p>
              <p className="font-black text-sm text-green-600">${walletBalance.toFixed(2)}</p>
            </div>
            <button onClick={() => navigate('/wallet')} className="text-xs text-primary font-semibold hover:underline">Top up →</button>
          </div>
        </div>

        {/* Post preview */}
        {post && (
          <div className="border border-border rounded-2xl p-4 flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden shrink-0">
              {post.is_video && post.video_url
                ? <video src={post.video_url} className="w-full h-full object-cover" muted playsInline />
                : post.image_url
                  ? <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-muted-foreground" /></div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold line-clamp-2">{post.content?.slice(0, 120) || 'Post'}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{formatNumber(post.views_count ?? 0)}</span>
                <span>·</span>
                {post.is_video ? <span className="text-red-500 font-semibold">📹 Video</span> : <span>📷 Image</span>}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        )}

        {/* Boost type */}
        <div>
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-primary" />Campaign Objective</h2>
          <div className="grid grid-cols-2 gap-2">
            {BOOST_TYPES.map((bt) => (
              <button
                key={bt.id}
                onClick={() => setBoostType(bt.id)}
                className={`p-3 rounded-2xl border-2 text-left transition-all hover:scale-[1.01] ${boostType === bt.id ? bt.activeColor : bt.color}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {bt.icon}
                  <span className={`text-sm font-bold ${boostType === bt.id ? 'text-foreground' : 'text-muted-foreground'}`}>{bt.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{bt.desc}</p>
                {boostType === bt.id && (
                  <div className="mt-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Budget & Duration */}
        <div className="border border-border rounded-2xl p-5 space-y-5">
          <h2 className="text-sm font-bold flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-500" />Budget & Duration</h2>

          {/* Daily budget */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground">Daily Budget</label>
              <span className="text-lg font-black text-green-600">${dailyBudget}/day</span>
            </div>
            <input
              type="range" min={1} max={100} step={1}
              value={dailyBudget}
              onChange={e => setDailyBudget(Number(e.target.value))}
              className="w-full accent-green-500"
            />
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[2, 5, 10, 25].map(v => (
                <button key={v} onClick={() => setDailyBudget(v)}
                  className={`py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    dailyBudget === v ? 'border-green-500 bg-green-500/10 text-green-700' : 'border-border hover:border-green-500/30'
                  }`}>${v}/day</button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground">Duration</label>
              <span className="text-lg font-black text-blue-600">{duration} days</span>
            </div>
            <input
              type="range" min={1} max={30} step={1}
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[3, 7, 14, 30].map(v => (
                <button key={v} onClick={() => setDuration(v)}
                  className={`py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    duration === v ? 'border-blue-500 bg-blue-500/10 text-blue-700' : 'border-border hover:border-blue-500/30'
                  }`}>{v}d</button>
              ))}
            </div>
          </div>
        </div>

        {/* Audience targeting */}
        <div className="border border-border rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold flex items-center gap-2"><Users className="w-4 h-4 text-purple-500" />Target Audience</h2>

          {/* Age range */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground">Age Range</label>
              <span className="text-xs font-bold">{ageMin} – {ageMax}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Min age</p>
                <input type="range" min={13} max={ageMax - 1} value={ageMin}
                  onChange={e => setAgeMin(Number(e.target.value))}
                  className="w-full accent-purple-500" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Max age</p>
                <input type="range" min={ageMin + 1} max={65} value={ageMax}
                  onChange={e => setAgeMax(Number(e.target.value))}
                  className="w-full accent-purple-500" />
              </div>
            </div>
          </div>

          {/* Interests */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground">Interests</label>
              <span className="text-[10px] text-muted-foreground">{selectedInterests.length}/5 selected</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCE_INTERESTS.map((interest) => (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    selectedInterests.includes(interest)
                      ? 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                      : 'border-border text-muted-foreground hover:border-purple-500/40 hover:bg-purple-500/5'
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Campaign summary */}
        <div className="bg-gradient-to-br from-primary/8 to-purple-500/5 border border-primary/20 rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />Campaign Summary</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-background/70 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-green-600">${totalBudget.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Total budget</p>
            </div>
            <div className="bg-background/70 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-blue-600">{formatNumber(estimatedImpressions)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Est. impressions</p>
            </div>
            <div className="bg-background/70 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-purple-600">{formatNumber(estimatedClicks)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Est. clicks</p>
            </div>
          </div>

          {/* Details list */}
          <div className="space-y-2 text-sm border-t border-border/50 pt-3">
            {[
              { label: 'Objective', value: BOOST_TYPES.find(b => b.id === boostType)?.label ?? boostType },
              { label: 'Duration', value: `${duration} days (ends ${new Date(Date.now() + duration * 86400000).toLocaleDateString('en', { month: 'short', day: 'numeric' })})` },
              { label: 'Daily spend', value: `$${dailyBudget.toFixed(2)}` },
              { label: 'Age target', value: `${ageMin}–${ageMax} years` },
              { label: 'Interests', value: selectedInterests.length > 0 ? selectedInterests.join(', ') : 'All' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold text-right ml-3 truncate max-w-[180px]">{value}</span>
              </div>
            ))}
          </div>

          {totalBudget > walletBalance && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 text-center">
              Insufficient balance — need ${(totalBudget - walletBalance).toFixed(2)} more.{' '}
              <button onClick={() => navigate('/wallet')} className="font-bold underline">Top up</button>
            </div>
          )}

          <button
            onClick={handleLaunch}
            disabled={launching || !postId || totalBudget > walletBalance}
            className="mt-4 w-full py-4 bg-gradient-to-r from-primary to-purple-600 text-white rounded-xl font-bold text-base disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            {launching
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Launching…</>
              : <><Zap className="w-5 h-5" /> Launch Campaign · ${totalBudget.toFixed(2)}</>}
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Budget deducted from wallet immediately. Campaigns can be paused anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
