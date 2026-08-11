import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Plus, X, Loader2, Send, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption?: string | null;
  created_at: string;
  expires_at: string;
  views_count?: number;
  user_profiles: { username: string; avatar_url?: string | null } | null;
}

interface StoryGroup {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  stories: Story[];
  hasUnseen: boolean;
}

export function StoriesStrip() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Viewer
  const [viewerGroupIdx, setViewerGroupIdx] = useState<number | null>(null);
  const [activeStoryIdx, setActiveStoryIdx] = useState(0);
  const [progressPct, setProgressPct] = useState(0);

  // Caption input
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingCaption, setPendingCaption] = useState('');
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  // Swipe tracking
  const touchStartX = useRef<number | null>(null);
  const isSwiping = useRef(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [sendingReaction, setSendingReaction] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Story Views Analytics ────────────────────────────────────────────────
  // ── Story Text Overlays ──────────────────────────────────────────────────────
  const [textOverlays, setTextOverlays] = useState<{ text: string; x: number; y: number; id: string; color: string; size: string }[]>([]);
  const [showTextInput, setShowTextInput] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftTextColor, setDraftTextColor] = useState('#ffffff');
  const [draftTextSize, setDraftTextSize] = useState('text-2xl');
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const TEXT_COLORS = ['#ffffff', '#000000', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
  const TEXT_SIZES = [{ label: 'S', cls: 'text-lg' }, { label: 'M', cls: 'text-2xl' }, { label: 'L', cls: 'text-4xl' }];

  const addTextOverlay = () => {
    if (!draftText.trim()) return;
    setTextOverlays(prev => [...prev, {
      text: draftText.trim(), x: 30 + Math.random() * 40, y: 30 + Math.random() * 30,
      id: Date.now().toString(), color: draftTextColor, size: draftTextSize,
    }]);
    setDraftText('');
    setShowTextInput(false);
  };

  const moveTextOverlay = (e: React.MouseEvent | React.TouchEvent) => {
    if (!draggingTextId || !storyPreviewRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const rect = storyPreviewRef.current.getBoundingClientRect();
    const xPct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(2, Math.min(95, ((clientY - rect.top) / rect.height) * 100));
    setTextOverlays(prev => prev.map(t => t.id === draggingTextId ? { ...t, x: xPct, y: yPct } : t));
  };

  // ── Story Stickers ─────────────────────────────────────────────────────────
  const [stickers, setStickers] = useState<{ emoji: string; x: number; y: number; id: string }[]>([]);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [draggingSticker, setDraggingSticker] = useState<string | null>(null);
  const storyPreviewRef = useRef<HTMLDivElement>(null);
  const STICKER_EMOJIS = ['❤️','😂','🔥','😍','👏','🎉','💯','😎','🙏','💪','🤩','😢','😡','👀','✨','🌟','🎵','🌈','🦋','💫','🤑','😜','🙌','💥','🌸'];

  const addSticker = (emoji: string) => {
    setStickers(prev => [...prev, { emoji, x: 40 + Math.random() * 20, y: 30 + Math.random() * 30, id: Date.now().toString() }]);
    setShowStickerPicker(false);
  };

  const moveDragSticker = (e: React.MouseEvent | React.TouchEvent) => {
    if (!draggingSticker || !storyPreviewRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const rect = storyPreviewRef.current.getBoundingClientRect();
    const xPct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(2, Math.min(95, ((clientY - rect.top) / rect.height) * 100));
    setStickers(prev => prev.map(s => s.id === draggingSticker ? { ...s, x: xPct, y: yPct } : s));
  };

  const [showViewers, setShowViewers] = useState(false);
  const [storyViewers, setStoryViewers] = useState<any[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);

  const REACTIONS = ['❤️', '😂', '😮', '🔥', '👏', '😍'];

  const fetchStories = useCallback(async () => {
    setLoading(true);

    // Fetch IDs of people the current user follows (for followers-only filtering on client)
    let followedIds: string[] = [];
    if (user?.id) {
      const { data: followData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);
      followedIds = (followData ?? []).map((f: any) => f.following_id);
    }

    // Only fetch own stories + followed users' stories (RLS also enforces this)
    const allowedIds = user?.id ? [user.id, ...followedIds] : [];

    let query = supabase
      .from('stories')
      .select('*, user_profiles(username, avatar_url)')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    // Client-side filter to followed+self (belt-and-suspenders alongside RLS)
    if (allowedIds.length > 0) {
      query = query.in('user_id', allowedIds);
    } else {
      // Not logged in — show nothing
      setGroups([]);
      setLoading(false);
      return;
    }

    const { data } = await query;

    const rawStories: Story[] = (data as Story[]) ?? [];

    let viewedSet = new Set<string>();
    if (user?.id) {
      const { data: vd } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', user.id);
      viewedSet = new Set(vd?.map((v: any) => v.story_id) ?? []);
      setViewedIds(viewedSet);
    }

    const map: Record<string, StoryGroup> = {};
    for (const story of rawStories) {
      if (!map[story.user_id]) {
        map[story.user_id] = {
          userId: story.user_id,
          username: story.user_profiles?.username ?? 'user',
          avatarUrl: story.user_profiles?.avatar_url ?? null,
          stories: [],
          hasUnseen: false,
        };
      }
      map[story.user_id].stories.push(story);
      if (!viewedSet.has(story.id)) map[story.user_id].hasUnseen = true;
    }

    const all = Object.values(map);
    const myGroup = all.find(g => g.userId === user?.id);
    const others = all.filter(g => g.userId !== user?.id);
    setGroups([
      ...(myGroup ? [myGroup] : []),
      ...others.filter(g => g.hasUnseen),
      ...others.filter(g => !g.hasUnseen),
    ]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchStories(); }, [fetchStories]);

  const markViewed = useCallback(async (storyId: string) => {
    if (!user?.id) return;
    setViewedIds(prev => new Set([...prev, storyId]));
    await supabase.from('story_views').upsert(
      { story_id: storyId, viewer_id: user.id },
      { onConflict: 'story_id,viewer_id' }
    );
  }, [user?.id]);

  // Auto-advance with smooth progress bar
  useEffect(() => {
    if (viewerGroupIdx === null) { setProgressPct(0); return; }
    const g = groups[viewerGroupIdx];
    if (!g) return;
    const story = g.stories[activeStoryIdx];
    if (!story || story.media_type === 'video') { setProgressPct(0); return; }

    setProgressPct(0);
    const start = Date.now();
    const DURATION = 5000;

    const iv = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / DURATION) * 100, 100);
      setProgressPct(pct);
      if (pct >= 100) {
        clearInterval(iv);
        if (activeStoryIdx < g.stories.length - 1) {
          const ni = activeStoryIdx + 1;
          setActiveStoryIdx(ni);
          markViewed(g.stories[ni].id);
        } else {
          const ng = viewerGroupIdx + 1;
          if (ng < groups.length) {
            setViewerGroupIdx(ng);
            setActiveStoryIdx(0);
            markViewed(groups[ng].stories[0].id);
          } else {
            setViewerGroupIdx(null);
          }
        }
      }
    }, 50);

    return () => clearInterval(iv);
  }, [viewerGroupIdx, activeStoryIdx, groups, markViewed]);

  const closeViewer = () => {
    setViewerGroupIdx(null);
    setReplyText('');
    setShowViewers(false);
    setStoryViewers([]);
  };

  const openViewer = (groupIdx: number) => {
    setViewerGroupIdx(groupIdx);
    setActiveStoryIdx(0);
    setShowViewers(false);
    setStoryViewers([]);
    const story = groups[groupIdx]?.stories[0];
    if (story && !viewedIds.has(story.id)) markViewed(story.id);
  };

  const advance = () => {
    setReplyText('');
    setShowViewers(false);
    if (viewerGroupIdx === null) return;
    const g = groups[viewerGroupIdx];
    if (!g) return;
    if (activeStoryIdx < g.stories.length - 1) {
      const ni = activeStoryIdx + 1;
      setActiveStoryIdx(ni);
      markViewed(g.stories[ni].id);
    } else if (viewerGroupIdx < groups.length - 1) {
      const ng = viewerGroupIdx + 1;
      setViewerGroupIdx(ng);
      setActiveStoryIdx(0);
      markViewed(groups[ng].stories[0].id);
    } else {
      closeViewer();
    }
  };

  const retreat = () => {
    setReplyText('');
    setShowViewers(false);
    if (viewerGroupIdx === null) return;
    if (activeStoryIdx > 0) {
      setActiveStoryIdx(prev => prev - 1);
    } else if (viewerGroupIdx > 0) {
      const pg = viewerGroupIdx - 1;
      setViewerGroupIdx(pg);
      setActiveStoryIdx(groups[pg].stories.length - 1);
    }
  };

  const fetchStoryViewers = async (storyId: string) => {
    setLoadingViewers(true);
    setShowViewers(true);
    const { data } = await supabase
      .from('story_views')
      .select('viewed_at, user_profiles:viewer_id(id, username, avatar_url)')
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false });
    setStoryViewers(data ?? []);
    setLoadingViewers(false);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 20 * 1024 * 1024) { toast.error('File must be under 20MB'); return; }
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(file);
    setPendingCaption('');
    setPendingPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const cancelPending = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(null);
    setPendingCaption('');
    setPendingPreviewUrl(null);
  };

  const doUpload = async () => {
    if (!pendingFile || !user) return;
    setUploading(true);
    const ext = pendingFile.name.split('.').pop();
    const path = `stories/${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('posts').upload(path, pendingFile);
    if (upErr) { toast.error('Upload failed'); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(path);
    const stickerMeta = { ...(stickers.length > 0 ? { stickers } : {}), ...(textOverlays.length > 0 ? { textOverlays } : {}) };
    const { error: insErr } = await supabase.from('stories').insert({
      user_id: user.id,
      media_url: publicUrl,
      media_type: pendingFile.type.startsWith('video') ? 'video' : 'image',
      caption: pendingCaption.trim() || null,
      metadata: stickerMeta,
    });
    if (insErr) toast.error('Failed to post story');
    else { toast.success('Story posted!'); await fetchStories(); }
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(null);
    setPendingCaption('');
    setPendingPreviewUrl(null);
    setStickers([]);
    setTextOverlays([]);
    setShowStickerPicker(false);
    setShowTextInput(false);
    setUploading(false);
  };

  const sendReaction = async (emoji: string) => {
    if (!user || viewerGroupIdx === null) return;
    const g = groups[viewerGroupIdx];
    if (!g || g.userId === user.id) return;
    setSendingReaction(true);
    setShowReactions(false);
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${user.id},participant_2.eq.${g.userId}),and(participant_1.eq.${g.userId},participant_2.eq.${user.id})`)
        .maybeSingle();
      let convId = existing?.id;
      if (!convId) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({ participant_1: user.id, participant_2: g.userId })
          .select('id').single();
        convId = newConv?.id;
      }
      if (!convId) throw new Error('No conversation');
      await supabase.from('direct_messages').insert({
        conversation_id: convId,
        sender_id: user.id,
        content: `${emoji} Reacted to your story`,
      });
      toast.success(`${emoji} Sent!`, { duration: 1500 });
    } catch {
      toast.error('Could not send reaction');
    } finally {
      setSendingReaction(false);
    }
  };

  const sendStoryReply = async () => {
    if (!replyText.trim() || !user || viewerGroupIdx === null) return;
    const g = groups[viewerGroupIdx];
    if (!g || g.userId === user.id) return;
    setSendingReply(true);
    const text = replyText.trim();
    setReplyText('');
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${user.id},participant_2.eq.${g.userId}),and(participant_1.eq.${g.userId},participant_2.eq.${user.id})`)
        .maybeSingle();
      let convId = existing?.id;
      if (!convId) {
        const { data: newConv, error: convErr } = await supabase
          .from('conversations')
          .insert({ participant_1: user.id, participant_2: g.userId })
          .select('id').single();
        if (convErr) throw convErr;
        convId = newConv?.id;
      }
      if (!convId) throw new Error('No conversation');
      const { error: msgErr } = await supabase.from('direct_messages').insert({
        conversation_id: convId,
        sender_id: user.id,
        content: text,
      });
      if (msgErr) throw msgErr;
      toast.success('Reply sent!');
    } catch {
      toast.error('Failed to send reply');
      setReplyText(text);
    } finally {
      setSendingReply(false);
    }
  };

  // Skeleton while loading
  if (loading && groups.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border overflow-hidden h-[88px]">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="w-14 h-14 rounded-full bg-muted animate-pulse" />
            <div className="w-10 h-2 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!user && groups.length === 0) return null;

  const myGroupIdx = groups.findIndex(g => g.userId === user?.id);
  const hasMyStory = myGroupIdx !== -1;

  return (
    <>
      {/* ── Story Strip ────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-border bg-background">
        {/* Your story */}
        {user && (
          <button
            onClick={() => hasMyStory ? openViewer(myGroupIdx) : fileInputRef.current?.click()}
            disabled={uploading}
            className="flex flex-col items-center gap-1 flex-shrink-0 group"
          >
            <div className={`relative w-14 h-14 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all ${
              hasMyStory ? 'ring-primary' : 'ring-muted-foreground/30 group-hover:ring-primary/50'
            }`}>
              {user.avatar
                ? <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                : <div className="w-full h-full rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center font-bold text-primary">{user.username[0]?.toUpperCase()}</div>
              }
              {!hasMyStory && (
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center border-2 border-background">
                  {uploading
                    ? <Loader2 className="w-3 h-3 text-white animate-spin" />
                    : <Plus className="w-3 h-3 text-white" />
                  }
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground font-medium leading-none">
              {hasMyStory ? 'My Story' : 'Add Story'}
            </span>
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelected} />

        {/* Other users */}
        {groups
          .filter(g => g.userId !== user?.id)
          .map(g => {
            const realIdx = groups.indexOf(g);
            return (
              <button
                key={g.userId}
                onClick={() => openViewer(realIdx)}
                className="flex flex-col items-center gap-1 flex-shrink-0 group"
              >
                <div className={`w-14 h-14 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all ${
                  g.hasUnseen
                    ? 'ring-primary'
                    : 'ring-muted-foreground/20 group-hover:ring-muted-foreground/40'
                }`}>
                  {g.avatarUrl
                    ? <img src={g.avatarUrl} alt={g.username} className="w-full h-full rounded-full object-cover" />
                    : <div className="w-full h-full rounded-full bg-muted flex items-center justify-center font-bold text-sm">{g.username[0]?.toUpperCase()}</div>
                  }
                </div>
                <span className={`text-[10px] font-medium leading-none max-w-[56px] truncate ${g.hasUnseen ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {g.username}
                </span>
              </button>
            );
          })}
      </div>

      {/* ── Caption Input Modal ─────────────────────────── */}
      {pendingFile && pendingPreviewUrl && (
        <div className="fixed inset-0 z-[210] bg-black/85 flex flex-col items-center justify-center p-4 gap-3 overflow-y-auto">
          {/* Preview with sticker overlay */}
          <div
            ref={storyPreviewRef}
            className="relative w-full max-w-sm rounded-2xl overflow-hidden select-none flex-shrink-0"
            onMouseMove={e => { moveDragSticker(e); moveTextOverlay(e); }}
            onMouseUp={() => { setDraggingSticker(null); setDraggingTextId(null); }}
            onTouchMove={e => { moveDragSticker(e); moveTextOverlay(e); }}
            onTouchEnd={() => { setDraggingSticker(null); setDraggingTextId(null); }}
          >
            {pendingFile.type.startsWith('video') ? (
              <video src={pendingPreviewUrl} className="w-full max-h-[45vh] object-contain" muted playsInline />
            ) : (
              <img src={pendingPreviewUrl} alt="" className="w-full max-h-[45vh] object-contain rounded-2xl" />
            )}
            {/* Draggable text overlays on preview */}
            {textOverlays.map(t => (
              <div
                key={t.id}
                className={`absolute font-black cursor-grab active:cursor-grabbing select-none drop-shadow-lg ${t.size}`}
                style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%,-50%)', color: t.color, touchAction: 'none', zIndex: 21, textShadow: t.color === '#ffffff' ? '0 1px 3px rgba(0,0,0,0.8)' : '0 1px 3px rgba(255,255,255,0.5)' }}
                onMouseDown={e => { e.stopPropagation(); setDraggingTextId(t.id); }}
                onTouchStart={e => { e.stopPropagation(); setDraggingTextId(t.id); }}
                onDoubleClick={e => { e.stopPropagation(); setTextOverlays(prev => prev.filter(x => x.id !== t.id)); }}
              >
                {t.text}
              </div>
            ))}
            {/* Draggable stickers on preview */}
            {stickers.map(s => (
              <div
                key={s.id}
                className="absolute text-4xl cursor-grab active:cursor-grabbing select-none"
                style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)', touchAction: 'none', zIndex: 20 }}
                onMouseDown={e => { e.stopPropagation(); setDraggingSticker(s.id); }}
                onTouchStart={e => { e.stopPropagation(); setDraggingSticker(s.id); }}
                onDoubleClick={e => { e.stopPropagation(); setStickers(prev => prev.filter(st => st.id !== s.id)); }}
              >
                {s.emoji}
              </div>
            ))}
          </div>

          {/* Sticker picker panel */}
          {showStickerPicker && (
            <div className="w-full max-w-sm bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex-shrink-0">
              <p className="text-white/70 text-[10px] font-semibold uppercase tracking-widest mb-2 text-center">Tap to add · drag to reposition · double-tap to remove</p>
              <div className="grid grid-cols-5 gap-1.5">
                {STICKER_EMOJIS.map(emoji => (
                  <button key={emoji} onClick={() => addSticker(emoji)}
                    className="w-11 h-11 flex items-center justify-center text-2xl rounded-xl hover:bg-white/20 active:scale-110 transition-all">
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="w-full max-w-sm space-y-2 flex-shrink-0">
            {/* Text overlay input panel */}
            {showTextInput && (
              <div className="w-full max-w-sm bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20">
                <p className="text-white/70 text-[10px] font-semibold uppercase tracking-widest mb-2 text-center">Add Text · drag to reposition · double-tap to remove</p>
                <input
                  type="text"
                  value={draftText}
                  onChange={e => setDraftText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTextOverlay()}
                  placeholder="Type something…"
                  autoFocus
                  maxLength={80}
                  className="w-full bg-white/10 text-white placeholder:text-white/40 border border-white/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary mb-2"
                />
                {/* Color picker */}
                <div className="flex items-center gap-1.5 mb-2">
                  {TEXT_COLORS.map(c => (
                    <button key={c} onClick={() => setDraftTextColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition-transform active:scale-110 ${draftTextColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                {/* Size picker */}
                <div className="flex items-center gap-2 mb-2">
                  {TEXT_SIZES.map(s => (
                    <button key={s.cls} onClick={() => setDraftTextSize(s.cls)}
                      className={`px-3 py-1 rounded-lg text-white text-xs font-bold border transition-colors ${draftTextSize === s.cls ? 'bg-primary border-primary' : 'bg-white/10 border-white/20'}`}
                    >{s.label}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowTextInput(false)} className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-medium">Cancel</button>
                  <button onClick={addTextOverlay} disabled={!draftText.trim()} className="flex-1 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold disabled:opacity-50">Add Text</button>
                </div>
              </div>
            )}

            {/* Sticker toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowTextInput(v => !v); setShowStickerPicker(false); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  showTextInput ? 'bg-primary border-primary text-white' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                }`}
              >
                <span>✍️</span>
                Text {textOverlays.length > 0 ? `(${textOverlays.length})` : ''}
              </button>
              <button
                onClick={() => { setShowStickerPicker(v => !v); setShowTextInput(false); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  showStickerPicker ? 'bg-primary border-primary text-white' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                }`}
              >
                <span>🎉</span>
                Stickers {stickers.length > 0 ? `(${stickers.length})` : ''}
              </button>
              {(stickers.length > 0 || textOverlays.length > 0) && (
                <button onClick={() => { setStickers([]); setTextOverlays([]); }} className="text-white/50 text-xs hover:text-white/80 transition-colors">
                  Clear all
                </button>
              )}
            </div>
            <input
              type="text"
              value={pendingCaption}
              onChange={e => setPendingCaption(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doUpload()}
              placeholder="Add a caption… (optional)"
              maxLength={200}
              autoFocus
              className="w-full bg-white/10 text-white placeholder:text-white/40 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
            <p className="text-right text-[10px] text-white/40">{pendingCaption.length}/200</p>
            <div className="flex gap-3">
              <button onClick={cancelPending} disabled={uploading}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={doUpload} disabled={uploading}
                className="flex-1 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                {uploading ? 'Posting…' : 'Share Story'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Full-screen Story Viewer ────────────────────────── */}
      {viewerGroupIdx !== null && (() => {
        const g = groups[viewerGroupIdx];
        if (!g) return null;
        const story = g.stories[activeStoryIdx];
        if (!story) return null;
        const isOwn = user?.id === g.userId;
        return (
          <div
            className="fixed inset-0 z-[200] bg-black flex items-center justify-center select-none"
            onTouchStart={e => { touchStartX.current = e.touches[0].clientX; isSwiping.current = false; }}
            onTouchMove={e => {
              if (touchStartX.current !== null && Math.abs(e.touches[0].clientX - touchStartX.current) > 10)
                isSwiping.current = true;
            }}
            onTouchEnd={e => {
              if (touchStartX.current === null) return;
              const delta = e.changedTouches[0].clientX - touchStartX.current;
              touchStartX.current = null;
              if (Math.abs(delta) < 50) { isSwiping.current = false; return; }
              if (delta < 0) advance(); else retreat();
            }}
            onClick={e => {
              if (showViewers) return;
              if (isSwiping.current) { isSwiping.current = false; return; }
              const x = e.clientX;
              const w = (e.currentTarget as HTMLElement).clientWidth;
              if (x < w / 2) retreat(); else advance();
            }}
          >
            {/* Progress segments */}
            <div className="absolute top-3 left-3 right-3 flex gap-1 z-20 pointer-events-none">
              {g.stories.map((_, i) => (
                <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    style={{
                      width: i < activeStoryIdx
                        ? '100%'
                        : i === activeStoryIdx
                          ? story.media_type === 'video' ? '0%' : `${progressPct}%`
                          : '0%',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* User header */}
            <div className="absolute top-8 left-3 right-3 flex items-center gap-2 z-20">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-white/20 flex-shrink-0">
                {g.avatarUrl
                  ? <img src={g.avatarUrl} alt={g.username} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs">{g.username[0]?.toUpperCase()}</div>
                }
              </div>
              <span className="text-white font-semibold text-sm flex-1 truncate">{g.username}</span>

              {/* Views analytics button — own story only */}
              {isOwn && (
                <button
                  onClick={e => { e.stopPropagation(); fetchStoryViewers(story.id); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-medium border border-white/20 transition-colors shrink-0"
                >
                  <span>👁</span>
                  <span>{story.views_count ?? 0}</span>
                </button>
              )}

              <button
                onClick={e => { e.stopPropagation(); closeViewer(); }}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Media */}
            {story.media_type === 'video'
              ? (
                <video
                  key={story.id}
                  src={story.media_url}
                  autoPlay
                  playsInline
                  className="max-h-screen max-w-full object-contain"
                  onEnded={advance}
                  onClick={e => e.stopPropagation()}
                />
              )
              : (
                <img
                  key={story.id}
                  src={story.media_url}
                  alt=""
                  className="max-h-screen max-w-full object-contain"
                  draggable={false}
                />
              )
            }

            {/* ── Story Viewers Analytics Sheet (own story) ── */}
            {showViewers && isOwn && (
              <div
                className="absolute inset-0 z-50 flex flex-col"
                style={{ background: 'rgba(0,0,0,0.93)' }}
                onClick={e => e.stopPropagation()}
              >
                {/* Sheet header */}
                <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b border-white/10">
                  <div>
                    <h3 className="text-white font-bold text-base">Story Views</h3>
                    <p className="text-white/50 text-xs mt-0.5">
                      {loadingViewers ? 'Loading…' : `${storyViewers.length} viewer${storyViewers.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowViewers(false); setStoryViewers([]); }}
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
                {/* Viewer list */}
                <div className="flex-1 overflow-y-auto">
                  {loadingViewers ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-7 h-7 animate-spin text-white/50" />
                    </div>
                  ) : storyViewers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-2 text-white/40">
                      <span className="text-4xl">👁</span>
                      <p className="text-sm font-medium">No views yet</p>
                      <p className="text-xs">Share your story to get views!</p>
                    </div>
                  ) : storyViewers.map((v: any, i: number) => {
                    const profile = v.user_profiles ?? {};
                    const uname = profile.username ?? 'user';
                    const ts = v.viewed_at ? new Date(v.viewed_at) : null;
                    const timeStr = ts ? ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    const dateStr = ts ? ts.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
                    return (
                      <div key={v.story_id + String(i)} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8">
                        <div className="w-10 h-10 rounded-full bg-white/15 overflow-hidden shrink-0">
                          {profile.avatar_url
                            ? <img src={profile.avatar_url} alt={uname} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm">{uname[0]?.toUpperCase()}</div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm truncate">{uname}</p>
                          {(dateStr || timeStr) && (
                            <p className="text-white/45 text-xs">{dateStr}{dateStr && timeStr ? ' · ' : ''}{timeStr}</p>
                          )}
                        </div>
                        <span className="text-white/20 text-lg">👁</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Emoji Reactions ── */}
            {user && !isOwn && showReactions && (
              <div
                className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-3 py-2 border border-white/20"
                onClick={e => e.stopPropagation()}
              >
                {REACTIONS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    disabled={sendingReaction}
                    className="w-10 h-10 flex items-center justify-center text-2xl rounded-full hover:bg-white/20 active:scale-125 transition-all duration-150"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  onClick={() => setShowReactions(false)}
                  className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Story stickers overlay */}
            {(() => {
              const meta = (story as any).metadata;
              const stickerList: { emoji: string; x: number; y: number; id: string }[] = meta?.stickers ?? [];
              const textList: { text: string; x: number; y: number; id: string; color: string; size: string }[] = meta?.textOverlays ?? [];
              return (
                <>
                  {stickerList.map(s => (
                    <div key={s.id} className="absolute text-4xl pointer-events-none select-none"
                      style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)', zIndex: 22 }}>
                      {s.emoji}
                    </div>
                  ))}
                  {textList.map(t => (
                    <div key={t.id} className={`absolute font-black pointer-events-none select-none drop-shadow-lg ${t.size || 'text-2xl'}`}
                      style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%,-50%)', color: t.color || '#fff', zIndex: 23, textShadow: t.color === '#ffffff' ? '0 1px 3px rgba(0,0,0,0.8)' : '0 1px 3px rgba(255,255,255,0.5)' }}>
                      {t.text}
                    </div>
                  ))}
                </>
              );
            })()}

            {/* Caption */}
            {story.caption && (
              <div className="absolute bottom-16 left-6 right-6 z-20 pointer-events-none">
                <p className="text-white text-sm font-medium bg-black/50 rounded-2xl px-4 py-2.5 text-center backdrop-blur-sm">
                  {story.caption}
                </p>
              </div>
            )}

            {/* Story Reply Input + Reaction trigger — other user's story only */}
            {user && !isOwn && (
              <div
                className="absolute bottom-4 left-4 right-4 z-30 flex items-center gap-2"
                onClick={e => e.stopPropagation()}
              >
                {/* Go to DM with story preview */}
                <button
                  onClick={() => {
                    const storyUrl = encodeURIComponent(story.media_url);
                    navigate(`/messages?to=${g.username}&storyUrl=${storyUrl}`);
                  }}
                  className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center border border-white/20 shrink-0 hover:bg-white/25 transition-colors"
                  title="Reply via DM"
                >
                  <MessageCircle className="w-4 h-4 text-white" />
                </button>
                {/* Reaction emoji button */}
                <button
                  onMouseDown={() => {
                    longPressTimer.current = setTimeout(() => setShowReactions(true), 400);
                  }}
                  onMouseUp={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                  onTouchStart={() => {
                    longPressTimer.current = setTimeout(() => setShowReactions(true), 400);
                  }}
                  onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                  onClick={() => setShowReactions(v => !v)}
                  className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center border border-white/20 text-lg shrink-0 hover:bg-white/25 transition-colors"
                >
                  😊
                </button>
                <input
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') sendStoryReply(); }}
                  placeholder={`Reply to ${g.username}…`}
                  className="flex-1 bg-white/10 text-white placeholder:text-white/50 border border-white/20 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/50 backdrop-blur-sm"
                />
                <button
                  onClick={e => { e.stopPropagation(); sendStoryReply(); }}
                  disabled={sendingReply || !replyText.trim()}
                  className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0 disabled:opacity-50 transition-opacity hover:opacity-90"
                >
                  {sendingReply
                    ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                    : <Send className="w-4 h-4 text-white" />
                  }
                </button>
              </div>
            )}

            {/* Navigation hit zones (invisible) — disabled when viewers sheet is open */}
            {!showViewers && (
              <>
                <div className="absolute inset-y-0 left-0 w-1/3 z-10" onClick={e => { e.stopPropagation(); retreat(); }} />
                <div className="absolute inset-y-0 right-0 w-1/3 z-10" onClick={e => { e.stopPropagation(); advance(); }} />
              </>
            )}
          </div>
        );
      })()}
    </>
  );
}
