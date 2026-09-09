import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Bookmark, Heart, Loader2, MessageCircle, Pause, Play, Search, Share2, Volume2, VolumeX, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatNumber } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useSEO } from '@/hooks/useSEO';

interface Reel {
  id: string;
  content: string | null;
  video_url: string | null;
  image_url: string | null;
  likes_count: number;
  replies_count: number;
  reposts_count: number;
  views_count: number;
  created_at: string;
  user_id: string;
  user_profiles?: { id: string; username: string; avatar_url: string | null; verified: boolean };
}

const PAGE_SIZE = 12;

function ReelCard({ reel, active, muted, onMute, onLike, liked, onComment, onShare, onSave, saved }: {
  reel: Reel; active: boolean; muted: boolean; onMute: () => void; onLike: () => void; liked: boolean;
  onComment: () => void; onShare: () => void; onSave: () => void; saved: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(active);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.currentTime = 0;
      video.muted = muted;
      video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      video.pause();
      video.currentTime = 0;
      setPlaying(false);
      setProgress(0);
    }
  }, [active]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().then(() => setPlaying(true)).catch(() => {});
    else { video.pause(); setPlaying(false); }
  };

  return (
    <section className="relative h-[100svh] w-full snap-start snap-always bg-black overflow-hidden">
      <video
        ref={videoRef}
        src={reel.video_url ?? undefined}
        poster={reel.image_url ?? undefined}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        loop
        muted={muted}
        preload={active ? 'auto' : 'metadata'}
        onTimeUpdate={e => {
          const v = e.currentTarget;
          setProgress(v.duration ? (v.currentTime / v.duration) * 100 : 0);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => toast.error('This reel could not be played')}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25 pointer-events-none" />

      <button onClick={togglePlay} aria-label={playing ? 'Pause reel' : 'Play reel'} className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center text-white transition-opacity">
        {playing ? <Pause className="w-7 h-7 opacity-0 hover:opacity-100" fill="white" /> : <Play className="w-7 h-7 ml-1" fill="white" />}
      </button>

      <div className="absolute bottom-0 left-0 right-0 p-4 pb-7 text-white pr-20">
        <button onClick={() => window.location.href = `/profile/${reel.user_profiles?.username ?? ''}`} className="flex items-center gap-2 mb-3 text-left">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-white/15 border border-white/30">
            {reel.user_profiles?.avatar_url ? <img src={reel.user_profiles.avatar_url} alt="" className="w-full h-full object-cover" /> : <div className="h-full flex items-center justify-center font-bold">{reel.user_profiles?.username?.[0]?.toUpperCase() ?? '?'}</div>}
          </div>
          <span className="font-bold text-sm">@{reel.user_profiles?.username ?? 'creator'}</span>
          {reel.user_profiles?.verified && <BadgeCheck className="w-4 h-4" fill="currentColor" />}
        </button>
        {reel.content && <p className="text-sm leading-relaxed line-clamp-3 max-w-[min(600px,82vw)] mb-2">{reel.content}</p>}
        <p className="text-[11px] text-white/60">{formatDistanceToNow(new Date(reel.created_at), { addSuffix: true })}</p>
      </div>

      <div className="absolute right-3 bottom-7 flex flex-col items-center gap-4 text-white">
        <button onClick={onLike} className="flex flex-col items-center gap-1" aria-label="Like reel">
          <Heart className={`w-7 h-7 drop-shadow ${liked ? 'fill-red-500 text-red-500' : ''}`} />
          <span className="text-[11px] font-bold">{formatNumber(reel.likes_count)}</span>
        </button>
        <button onClick={onComment} className="flex flex-col items-center gap-1" aria-label="Comment on reel"><MessageCircle className="w-7 h-7" /><span className="text-[11px] font-bold">{formatNumber(reel.replies_count)}</span></button>
        <button onClick={onShare} aria-label="Share reel"><Share2 className="w-7 h-7" /></button>
        <button onClick={onSave} aria-label="Save reel"><Bookmark className={`w-7 h-7 ${saved ? 'fill-white' : ''}`} /></button>
        <button onClick={onMute} aria-label={muted ? 'Unmute' : 'Mute'} className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center">{muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}</button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/15"><div className="h-full bg-white transition-[width]" style={{ width: `${progress}%` }} /></div>
    </section>
  );
}

export default function ReelsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);

  useSEO({ title: 'Reels — Short Videos', description: 'Discover immersive short videos and reels from Testagram creators.', url: '/reels', type: 'website', keywords: 'reels, short videos, vertical video, creators, Testagram' });

  const load = useCallback(async (pageNum: number) => {
    setLoading(true);
    let q = supabase.from('posts').select('id,content,video_url,image_url,likes_count,replies_count,reposts_count,views_count,created_at,user_id,user_profiles(id,username,avatar_url,verified)').eq('is_video', true).order('created_at', { ascending: false }).range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);
    if (query.trim()) q = q.ilike('content', `%${query.trim()}%`);
    const { data, error } = await q;
    if (error) toast.error('Could not load reels');
    const rows = (data ?? []) as unknown as Reel[];
    setHasMore(rows.length === PAGE_SIZE);
    setReels(prev => pageNum === 0 ? rows : [...prev, ...rows]);
    setPage(pageNum);
    setLoading(false);
  }, [query]);

  useEffect(() => { load(0); }, [load]);

  useEffect(() => {
    if (!user) { setLiked([]); setSaved([]); return; }
    Promise.all([
      supabase.from('post_likes').select('post_id').eq('user_id', user.id).limit(500),
      supabase.from('bookmarks').select('post_id').eq('user_id', user.id).limit(500),
    ]).then(([a, b]) => {
      setLiked((a.data ?? []).map((x: any) => x.post_id));
      setSaved((b.data ?? []).map((x: any) => x.post_id));
    });
  }, [user?.id]);

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reel-index]'));
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          const idx = Number((entry.target as HTMLElement).dataset.reelIndex);
          setActiveIndex(idx);
          if (idx >= reels.length - 3 && hasMore) load(page + 1);
        }
      });
    }, { root, threshold: [0.65, 0.9] });
    items.forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [reels.length, hasMore, page, load]);

  const visible = useMemo(() => reels.filter(r => !!r.video_url), [reels]);

  const like = async (reel: Reel) => {
    if (!user) { navigate('/auth'); return; }
    const isLiked = liked.includes(reel.id);
    setLiked(prev => isLiked ? prev.filter(id => id !== reel.id) : [...prev, reel.id]);
    setReels(prev => prev.map(r => r.id === reel.id ? { ...r, likes_count: Math.max(0, r.likes_count + (isLiked ? -1 : 1)) } : r));
    if (isLiked) await supabase.from('post_likes').delete().eq('post_id', reel.id).eq('user_id', user.id);
    else await supabase.from('post_likes').insert({ post_id: reel.id, user_id: user.id });
  };

  const save = async (reel: Reel) => {
    if (!user) { navigate('/auth'); return; }
    const isSaved = saved.includes(reel.id);
    setSaved(prev => isSaved ? prev.filter(id => id !== reel.id) : [...prev, reel.id]);
    if (isSaved) { await supabase.from('bookmarks').delete().eq('post_id', reel.id).eq('user_id', user.id); toast.success('Removed from saved'); }
    else { await supabase.from('bookmarks').insert({ post_id: reel.id, user_id: user.id }); toast.success('Saved'); }
  };

  const share = async (reel: Reel) => {
    const url = `${window.location.origin}/videos?id=${reel.id}`;
    try { await navigator.share({ title: 'Testagram Reel', text: reel.content?.slice(0, 80) ?? 'Watch this reel', url }); }
    catch { await navigator.clipboard.writeText(url); toast.success('Reel link copied'); }
  };

  if (loading && reels.length === 0) return <div className="h-[100svh] bg-black flex items-center justify-center"><Loader2 className="w-8 h-8 text-white animate-spin" /></div>;
  if (visible.length === 0) return <div className="h-[100svh] bg-black text-white flex flex-col items-center justify-center gap-3"><Play className="w-14 h-14 opacity-50" /><h1 className="text-xl font-bold">No reels yet</h1><button onClick={() => navigate('/')} className="px-5 py-2.5 rounded-full bg-white text-black font-bold text-sm">Back to feed</button></div>;

  return (
    <div className="fixed inset-0 z-[90] bg-black text-white">
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-4 pointer-events-none">
        <button onClick={() => navigate(-1)} className="pointer-events-auto w-10 h-10 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center"><X className="w-5 h-5" /></button>
        <div className="pointer-events-auto flex items-center gap-2">
          <button onClick={() => setSearchOpen(true)} className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center"><Search className="w-5 h-5" /></button>
          <button onClick={() => setMuted(v => !v)} className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center">{muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}</button>
        </div>
      </div>
      {searchOpen && <div className="absolute inset-0 z-50 bg-black/95 p-4 pt-16"><div className="flex gap-2"><input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setSearchOpen(false); } }} placeholder="Search reels…" className="flex-1 bg-white/10 rounded-xl px-4 py-3 outline-none" /><button onClick={() => { setSearchOpen(false); setQuery(''); }} className="px-4 rounded-xl bg-white/10">Cancel</button></div></div>}
      <div ref={feedRef} className="h-full overflow-y-auto snap-y snap-mandatory overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {visible.map((reel, index) => <div key={reel.id} data-reel-index={index}><ReelCard reel={reel} active={activeIndex === index} muted={muted} onMute={() => setMuted(v => !v)} onLike={() => like(reel)} liked={liked.includes(reel.id)} onComment={() => navigate(`/post/${reel.id}`)} onShare={() => share(reel)} onSave={() => save(reel)} saved={saved.includes(reel.id)} /></div>)}
        {hasMore && <div className="h-16 bg-black flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-white/50" /></div>}
      </div>
    </div>
  );
}
