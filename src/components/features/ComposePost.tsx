import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { pingGoogleSitemap } from '@/lib/pingGoogle';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Image, Video, Loader2, X, BarChart3, Smile, Calendar, ShoppingBag, Globe, Wand2, AtSign, Sparkles, Layers } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CreatePollDialog } from './CreatePollDialog';
import { SchedulePostDialog } from './SchedulePostDialog';
import { ProductTagDialog } from './ProductTagDialog';
import { GifPicker } from './GifPicker';
import { toast as sonnerToast } from 'sonner';
import * as federation from '@/api/federation';

interface ComposePostProps {
  onSuccess?: () => void;
  communityId?: string;
}

export function ComposePost({ onSuccess, communityId }: ComposePostProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Duet/quote params — set by VideoPlayer when user taps Duet or Quote
  const duetUrl   = searchParams.get('duet_url')  ? decodeURIComponent(searchParams.get('duet_url')!)  : null;
  const duetMeta  = searchParams.get('duet_meta') ? decodeURIComponent(searchParams.get('duet_meta')!) : null;
  const quoteText = searchParams.get('quote')     ? decodeURIComponent(searchParams.get('quote')!)     : null;

  // Content creation is free for ALL users — no follower gate.
  // Monetization is separately gated in MonetizationDashboard (500 followers + 3000 posts + 100 videos).
  const [content, setContent] = useState(quoteText ? `${quoteText}\n` : duetMeta ? `${duetMeta}\n` : '');
  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [pollData, setPollData] = useState<any>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [showGifDialog, setShowGifDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [taggedProducts, setTaggedProducts] = useState<any[]>([]);
  const [postToFediverse, setPostToFediverse] = useState(false);
  const { toast } = useToast();

  // ── @Mentions Autocomplete ─────────────────────────────────────────────────
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [mentionIdx, setMentionIdx] = useState(0);
  const mentionSearchRef = useRef<string | null>(null);

  const handleContentChange = useCallback(async (val: string) => {
    setContent(val);
    const ta = textareaRef.current;
    const pos = ta?.selectionStart ?? val.length;
    const before = val.slice(0, pos);
    const atMatch = before.match(/@(\w*)$/);
    if (!atMatch) { setMentionQuery(null); setMentionResults([]); return; }
    const q = atMatch[1];
    setMentionQuery(q);
    setMentionIdx(0);
    mentionSearchRef.current = q;
    if (q.length === 0) { setMentionResults([]); return; }
    const { data } = await supabase.from('user_profiles').select('id, username, avatar_url').ilike('username', `${q}%`).limit(5);
    if (mentionSearchRef.current === q) setMentionResults(data ?? []);
  }, []);

  const insertMention = useCallback((username: string) => {
    const ta = textareaRef.current;
    const pos = ta?.selectionStart ?? content.length;
    const before = content.slice(0, pos);
    const after = content.slice(pos);
    const replaced = before.replace(/@(\w*)$/, `@${username} `);
    setContent(replaced + after);
    setMentionQuery(null);
    setMentionResults([]);
    setTimeout(() => { if (ta) { ta.focus(); ta.setSelectionRange(replaced.length, replaced.length); } }, 0);
  }, [content]);

  const handleMentionKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionResults.length === 0 || mentionQuery === null) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, mentionResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && mentionResults[mentionIdx]) { e.preventDefault(); insertMention(mentionResults[mentionIdx].username); }
    else if (e.key === 'Escape') { setMentionQuery(null); setMentionResults([]); }
  }, [mentionResults, mentionQuery, mentionIdx, insertMention]);

  // ── AI Caption Generator ─────────────────────────────────────────────────
  const [showCaptionGen, setShowCaptionGen] = useState(false);
  const [captionContext, setCaptionContext] = useState('');
  const [captionSuggestions, setCaptionSuggestions] = useState<string[]>([]);
  const [captionLoading, setCaptionLoading] = useState(false);

  const handleGenerateCaptions = async () => {
    setCaptionLoading(true);
    setCaptionSuggestions([]);
    try {
      const context = captionContext.trim() || content.trim() || 'a social media post';
      const imageHint = images.length > 0 ? ' for a photo' : video ? ' for a video' : '';
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { messages: [{ role: 'user', content: `Generate exactly 3 catchy social media captions${imageHint} about: "${context}". Make them distinct: one witty/funny, one inspirational, one question-based/engaging. Under 200 characters each. Return ONLY the 3 captions separated by "|||" with no numbering or labels.` }], model: 'google/gemini-3-flash-preview' },
      });
      if (error) throw error;
      const raw = data?.choices?.[0]?.message?.content ?? data?.content ?? data?.text ?? '';
      const suggestions = raw.split('|||').map((s: string) => s.trim()).filter(Boolean).slice(0, 3);
      setCaptionSuggestions(suggestions.length > 0 ? suggestions : ['Could not generate captions. Try again.']);
    } catch (err) {
      setCaptionSuggestions(['Failed to generate. Please try again.']);
    } finally {
      setCaptionLoading(false);
    }
  };

  const applyCaptionSuggestion = (caption: string) => {
    setContent(prev => prev ? prev + '\n\n' + caption : caption);
    setShowCaptionGen(false);
    setCaptionSuggestions([]);
    setCaptionContext('');
  };

  // ── AI Post Writer ────────────────────────────────────────────────────────
  const [showAiWriter, setShowAiWriter] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDrafts, setAiDrafts] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const handleAiWrite = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiDrafts([]);
    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { messages: [{ role: 'user', content: `Generate exactly 3 different engaging social media post drafts about: "${aiPrompt.trim()}". Each draft should be unique in style (one casual, one informative, one engaging/question-based). Keep each under 280 characters. Return ONLY the 3 drafts separated by the delimiter "|||" with no numbering, labels, or extra text.` }], model: 'gemini-2.0-flash' },
      });
      if (error) throw error;
      const raw = data?.choices?.[0]?.message?.content ?? data?.content ?? data?.text ?? data?.response ?? '';
      const drafts = raw.split('|||').map((d: string) => d.trim()).filter(Boolean).slice(0, 3);
      setAiDrafts(drafts.length > 0 ? drafts : ['Could not generate drafts. Please try again.']);
    } catch (err) {
      setAiDrafts(['Failed to generate drafts. Please try again.']);
    } finally {
      setAiLoading(false);
    }
  };

  const applyDraft = (draft: string) => { setContent(draft); setAiDrafts([]); setAiPrompt(''); setShowAiWriter(false); };

  // ── File handlers ─────────────────────────────────────────────────────────
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (images.length + files.length > 4) { sonnerToast.error('Maximum 4 images per post'); return; }
    const validFiles = files.filter(f => {
      if (f.size > 20 * 1024 * 1024) { sonnerToast.error(`${f.name} exceeds 20MB limit`); return false; }
      if (!f.type.startsWith('image/')) { sonnerToast.error(`${f.name} is not a valid image`); return false; }
      return true;
    });
    if (validFiles.length > 0) { setImages([...images, ...validFiles].slice(0, 4)); setVideo(null); setGifUrl(null); sonnerToast.success(`${validFiles.length} image(s) added`); }
  };

  const removeImage = (index: number) => setImages(images.filter((_, i) => i !== index));

  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { sonnerToast.error('Please select a valid video file'); return; }
    if (file.size > 20 * 1024 * 1024) { sonnerToast.error('Video must be less than 20MB'); return; }
    const videoUrl = URL.createObjectURL(file);
    const videoElement = document.createElement('video');
    videoElement.src = videoUrl;
    videoElement.onloadedmetadata = () => {
      const maxDuration = user?.creator_tier !== 'free' ? 3600 : 600;
      if (videoElement.duration > maxDuration) {
        sonnerToast.error(`Video duration cannot exceed ${Math.floor(maxDuration / 60)} minutes`);
        URL.revokeObjectURL(videoUrl); return;
      }
      setVideo(file); setImages([]); setGifUrl(null);
      sonnerToast.success('Video ready to upload!');
    };
    videoElement.onerror = () => { sonnerToast.error('Failed to load video. Please try a different file.'); URL.revokeObjectURL(videoUrl); };
  };

  const handlePollCreated = (data: { question: string; options: string[]; duration: number }) => { setPollData(data); setShowPollDialog(false); sonnerToast.success('Poll attached'); };
  const handleSchedule = (date: Date) => { setScheduledDate(date); setShowScheduleDialog(false); sonnerToast.success('Post scheduled'); };
  const handleProductsSelected = (products: any[]) => { setTaggedProducts(products); sonnerToast.success(`${products.length} product(s) tagged`); };

  // ── Post handler ──────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!content.trim() && images.length === 0 && !video && !gifUrl && !pollData) return;
    setLoading(true);
    try {
      let imageUrls: string[] = [];
      let videoUrl = null;

      if (images.length > 0) {
        sonnerToast.loading(`Uploading ${images.length} image(s)...`);
        for (let i = 0; i < images.length; i++) {
          const image = images[i];
          const fileExt = image.name.split('.').pop();
          const fileName = `${user!.id}/${Date.now()}_${i}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('posts').upload(fileName, image, { cacheControl: '3600', upsert: false });
          if (uploadError) { sonnerToast.error(`Failed to upload image ${i + 1}`); continue; }
          const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
          imageUrls.push(publicUrl);
        }
        sonnerToast.dismiss();
        if (imageUrls.length > 0) sonnerToast.success(`${imageUrls.length} image(s) uploaded!`);
      }

      if (video) {
        sonnerToast.loading('Uploading video...');
        const fileExt = video.name.split('.').pop();
        const fileName = `videos/${user!.id}/${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('posts').upload(fileName, video, { cacheControl: '3600', upsert: false });
        if (uploadError) { sonnerToast.dismiss(); sonnerToast.error(`Upload failed: ${uploadError.message}`); setLoading(false); return; }
        const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
        videoUrl = publicUrl;
        sonnerToast.dismiss();
        sonnerToast.success('Video uploaded!');
      }

      if (scheduledDate) {
        const { error: scheduleError } = await supabase.from('scheduled_posts').insert({ user_id: user!.id, content: content.trim(), image_url: imageUrls[0] ?? gifUrl ?? null, video_url: videoUrl, scheduled_for: scheduledDate.toISOString(), status: 'pending' });
        if (scheduleError) throw scheduleError;
        setContent(''); setImages([]); setVideo(null); setPollData(null); setGifUrl(null); setScheduledDate(null); setTaggedProducts([]);
        toast({ title: 'Success', description: 'Post scheduled successfully' });
        onSuccess?.();
        setLoading(false);
        return;
      }

      const postPayload: any = { user_id: user!.id, content: content.trim() || '', community_id: communityId || null, media_urls: [], media_count: 0, is_video: false };

      if (videoUrl && video) {
        postPayload.video_url = videoUrl; postPayload.is_video = true; postPayload.image_url = null;
      } else if (imageUrls.length > 0) {
        postPayload.image_url = imageUrls[0]; postPayload.media_urls = imageUrls; postPayload.media_count = imageUrls.length;
      } else if (gifUrl) {
        postPayload.image_url = gifUrl; postPayload.media_urls = [gifUrl]; postPayload.media_count = 1;
      }

      const { data: postData, error: postError } = await supabase.from('posts').insert(postPayload).select().single();
      if (postError) throw postError;

      if (pollData && postData) {
        const expiresAt = new Date(Date.now() + pollData.duration * 60 * 1000);
        const { data: poll, error: pollError } = await supabase.from('polls').insert({ post_id: postData.id, question: pollData.question, expires_at: expiresAt.toISOString() }).select().single();
        if (pollError) throw pollError;
        await supabase.from('poll_options').insert(pollData.options.map((opt: string) => ({ poll_id: poll.id, option_text: opt })));
      }

      if (taggedProducts.length > 0 && postData) {
        await supabase.from('product_tags').insert(taggedProducts.map(p => ({ post_id: postData.id, product_id: p.id }))).select().then(() => {});
      }

      const mentionMatches = content.match(/@(\w+)/g);
      if (mentionMatches && postData) {
        const uniqueUsernames = [...new Set(mentionMatches.map(m => m.slice(1).toLowerCase()))];
        const { data: mentionedUsers } = await supabase.from('user_profiles').select('id, username').in('username', uniqueUsernames).neq('id', user!.id);
        if (mentionedUsers && mentionedUsers.length > 0) {
          await supabase.from('notifications').insert(mentionedUsers.map(mu => ({ user_id: mu.id, type: 'mention', from_user_id: user!.id, post_id: postData.id })));
          await supabase.from('mentions').insert(mentionedUsers.map(mu => ({ post_id: postData.id, mentioned_user_id: mu.id }))).select().then(() => {});
        }
      }

      if (postToFediverse) {
        try { await federation.postStatus({ content: content.trim(), visibility: 'public' }); sonnerToast.success('Also posted to Fediverse!'); }
        catch (fedErr: any) { sonnerToast.info('Posted locally. Fediverse delivery pending.'); }
      }

      setContent(''); setImages([]); setVideo(null); setPollData(null); setGifUrl(null); setScheduledDate(null); setTaggedProducts([]); setPostToFediverse(false);
      sonnerToast.success('Post created successfully!');
      toast({ title: 'Success', description: 'Post created successfully' });
      pingGoogleSitemap();
      onSuccess?.();
    } catch (error: any) {
      console.error('Post error:', error);
      sonnerToast.error(error.message || 'Failed to create post');
      toast({ title: 'Error', description: error.message || 'Failed to create post', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="border-b border-border p-8 text-center">
        <p className="text-muted-foreground mb-4">Sign in to post</p>
        <Button onClick={() => navigate('/auth')} className="rounded-full px-6">Sign in</Button>
      </div>
    );
  }

  return (
    <div className="border-b border-border p-4">
      {/* Duet banner — shown when arriving from VideoPlayer Duet/Stitch button */}
      {duetUrl && (
        <div className="mb-3 rounded-xl overflow-hidden border border-sky-500/30 bg-sky-500/5">
          <div className="flex items-center gap-2 px-3 py-2 bg-sky-500/10 border-b border-sky-500/20">
            <Layers className="w-4 h-4 text-sky-500" />
            <span className="text-xs font-bold text-sky-600 dark:text-sky-400">{duetMeta ?? 'Duet / Stitch'}</span>
          </div>
          <div className="flex gap-2 p-2">
            {/* Left: original video preview */}
            <div className="w-1/2 rounded-lg overflow-hidden bg-black aspect-video relative">
              <video src={duetUrl} muted autoPlay loop playsInline className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/40 px-2 py-0.5 rounded-full text-[10px] text-white font-bold">Original</div>
              </div>
            </div>
            {/* Right: user's reaction upload slot */}
            <label className="w-1/2 rounded-lg border-2 border-dashed border-sky-400/40 bg-muted/30 aspect-video flex flex-col items-center justify-center gap-1 text-sky-500/60 cursor-pointer hover:bg-sky-500/5 transition-colors">
              <Video className="w-6 h-6" />
              <span className="text-[10px] font-semibold text-center leading-tight px-1">Upload your reaction</span>
              <input type="file" accept="video/*" className="hidden" onChange={handleVideoChange} disabled={loading} />
            </label>
          </div>
        </div>
      )}

      <div className="flex space-x-3">
        <div
          className="w-10 h-10 rounded-full bg-muted flex-shrink-0 overflow-hidden cursor-pointer"
          onClick={() => navigate(`/profile/${user.username}`)}
        >
          {user.avatar
            ? <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-sm font-bold">{user.username[0].toUpperCase()}</div>}
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder="What's happening?"
              value={content}
              onChange={e => handleContentChange(e.target.value)}
              onKeyDown={handleMentionKeyDown}
              className="min-h-[80px] border-0 resize-none focus-visible:ring-0 p-0 text-lg bg-transparent w-full"
              maxLength={700}
            />
            {/* @Mentions dropdown */}
            {mentionQuery !== null && mentionResults.length > 0 && (
              <div className="absolute z-50 left-0 mt-1 w-64 bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
                {mentionResults.map((u, i) => (
                  <button key={u.id} onMouseDown={e => { e.preventDefault(); insertMention(u.username); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${i === mentionIdx ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                    <div className="w-7 h-7 rounded-full bg-muted overflow-hidden flex-shrink-0">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt={u.username} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-xs font-bold">{u.username[0]?.toUpperCase()}</div>}
                    </div>
                    <p className="font-semibold text-sm truncate">@{u.username}</p>
                    <AtSign className="w-3 h-3 text-primary ml-auto flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Image grid */}
          {images.length > 0 && (
            <div className={`mt-2 gap-2 grid ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {images.map((image, index) => (
                <div key={index} className={`relative rounded-2xl overflow-hidden ${images.length === 3 && index === 0 ? 'col-span-2' : ''}`}>
                  <img src={URL.createObjectURL(image)} alt={`Upload ${index + 1}`} className="w-full h-full object-cover max-h-96" />
                  <button onClick={() => removeImage(index)} className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Video preview */}
          {video && (
            <div className="mt-2 relative rounded-2xl overflow-hidden max-w-full">
              <video src={URL.createObjectURL(video)} controls className="max-h-96 w-full" />
              <button onClick={() => setVideo(null)} className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Poll, schedule, products, GIF chips */}
          {pollData && (
            <div className="mt-2 p-3 border border-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium"><BarChart3 className="w-4 h-4" />Poll attached</div>
                <button onClick={() => setPollData(null)} className="text-sm text-muted-foreground hover:text-foreground">Remove</button>
              </div>
              <p className="text-sm text-muted-foreground break-words">{pollData.question}</p>
            </div>
          )}
          {scheduledDate && (
            <div className="mt-2 p-3 border border-border rounded-lg bg-primary/5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-sm font-medium"><Calendar className="w-4 h-4" />Scheduled</div>
                <button onClick={() => setScheduledDate(null)} className="text-sm text-muted-foreground hover:text-foreground">Remove</button>
              </div>
              <p className="text-sm text-muted-foreground">{scheduledDate.toLocaleString()}</p>
            </div>
          )}
          {taggedProducts.length > 0 && (
            <div className="mt-2 p-3 border border-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium"><ShoppingBag className="w-4 h-4" />{taggedProducts.length} product{taggedProducts.length !== 1 ? 's' : ''} tagged</div>
                <button onClick={() => setTaggedProducts([])} className="text-sm text-muted-foreground hover:text-foreground">Remove</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {taggedProducts.map(p => <div key={p.id} className="px-2 py-1 bg-muted rounded text-xs truncate">{p.name} - ${p.price}</div>)}
              </div>
            </div>
          )}
          {gifUrl && (
            <div className="mt-2 relative rounded-2xl overflow-hidden max-w-full">
              <img src={gifUrl} alt="GIF" className="max-h-96 w-full object-cover" />
              <button onClick={() => setGifUrl(null)} className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border overflow-x-auto">
            <div className="flex space-x-2">
              <label className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors flex-shrink-0">
                <Image className="w-5 h-5" />
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} disabled={loading || !!video || !!gifUrl || images.length >= 4} />
              </label>
              <label className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors flex-shrink-0">
                <Video className="w-5 h-5" />
                <input type="file" accept="video/*" className="hidden" onChange={handleVideoChange} disabled={loading || images.length > 0 || !!gifUrl} />
              </label>
              <button onClick={() => setShowGifDialog(true)} disabled={loading || images.length > 0 || !!video} className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors disabled:opacity-50 flex-shrink-0" title="Add GIF">
                <Smile className="w-5 h-5" />
              </button>
              <button onClick={() => setShowPollDialog(true)} disabled={loading || !!pollData} className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors disabled:opacity-50 flex-shrink-0" title="Add poll">
                <BarChart3 className="w-5 h-5" />
              </button>
              <button onClick={() => setShowScheduleDialog(true)} disabled={loading || !!scheduledDate} className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors disabled:opacity-50 flex-shrink-0" title="Schedule post">
                <Calendar className="w-5 h-5" />
              </button>
              <button onClick={() => setShowProductDialog(true)} disabled={loading} className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors disabled:opacity-50 flex-shrink-0" title="Tag products">
                <ShoppingBag className="w-5 h-5" />
              </button>
              <button onClick={() => setShowCaptionGen(v => !v)} disabled={loading}
                className={`cursor-pointer p-2 rounded-full transition-colors disabled:opacity-50 flex-shrink-0 ${showCaptionGen ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'hover:bg-primary/10 text-muted-foreground'}`}
                title="AI Caption Generator">
                <Sparkles className="w-5 h-5" />
              </button>
              <button onClick={() => setShowAiWriter(v => !v)} disabled={loading}
                className={`cursor-pointer p-2 rounded-full transition-colors disabled:opacity-50 flex-shrink-0 ${showAiWriter ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400' : 'hover:bg-primary/10 text-muted-foreground'}`}
                title="AI Post Writer">
                <Wand2 className="w-5 h-5" />
              </button>
              <button onClick={() => setPostToFediverse(v => !v)} disabled={loading}
                className={`cursor-pointer p-2 rounded-full transition-colors disabled:opacity-50 flex-shrink-0 ${postToFediverse ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400' : 'hover:bg-primary/10 text-muted-foreground'}`}
                title={postToFediverse ? 'Will post to Fediverse' : 'Also post to Fediverse'}>
                <Globe className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center space-x-3 flex-shrink-0">
              {images.length > 0 && <span className="text-sm text-muted-foreground">{images.length}/4 images</span>}
              {content.length > 0 && <span className={`text-sm ${content.length > 680 ? 'text-destructive' : 'text-muted-foreground'}`}>{content.length}/700</span>}
              {postToFediverse && <span className="flex items-center gap-1 text-xs text-purple-500 font-medium"><Globe className="w-3 h-3" />+Fediverse</span>}
              <Button onClick={handlePost} disabled={loading || (!content.trim() && images.length === 0 && !video && !gifUrl && !pollData) || content.length > 700} className="rounded-full px-6 font-semibold">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
              </Button>
            </div>
          </div>

          {/* AI Caption Panel */}
          {showCaptionGen && (
            <div className="mt-3 p-3 border border-amber-500/20 rounded-xl bg-amber-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">AI Caption Generator</span>
                <button onClick={() => { setShowCaptionGen(false); setCaptionSuggestions([]); setCaptionContext(''); }} className="ml-auto text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2">
                <input type="text" value={captionContext} onChange={e => setCaptionContext(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleGenerateCaptions()}
                  placeholder={images.length > 0 || video ? 'Describe your photo/video (optional)…' : 'Describe your post topic…'}
                  className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500" disabled={captionLoading} />
                <button onClick={handleGenerateCaptions} disabled={captionLoading}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex-shrink-0">
                  {captionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {captionLoading ? 'Generating…' : 'Generate'}
                </button>
              </div>
              {captionSuggestions.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Pick a caption to add:</p>
                  {captionSuggestions.map((cap, i) => (
                    <button key={i} onClick={() => applyCaptionSuggestion(cap)} className="w-full text-left text-sm p-2.5 border border-border rounded-lg hover:border-amber-500 hover:bg-amber-500/5 transition-colors leading-relaxed">{cap}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Writer Panel */}
          {showAiWriter && (
            <div className="mt-3 p-3 border border-purple-500/20 rounded-xl bg-purple-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Wand2 className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">AI Post Writer</span>
                <button onClick={() => { setShowAiWriter(false); setAiDrafts([]); setAiPrompt(''); }} className="ml-auto text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2">
                <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAiWrite()}
                  placeholder="What do you want to write about?"
                  className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500" disabled={aiLoading} />
                <button onClick={handleAiWrite} disabled={aiLoading || !aiPrompt.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex-shrink-0">
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {aiLoading ? 'Writing…' : 'Write'}
                </button>
              </div>
              {aiDrafts.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Choose a draft:</p>
                  {aiDrafts.map((draft, i) => (
                    <button key={i} onClick={() => applyDraft(draft)} className="w-full text-left text-sm p-2.5 border border-border rounded-lg hover:border-purple-500 hover:bg-purple-500/5 transition-colors leading-relaxed">{draft}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {showGifDialog && (
            <GifPicker
              onSelect={url => { setGifUrl(url); setImages([]); setVideo(null); setShowGifDialog(false); }}
              onClose={() => setShowGifDialog(false)}
            />
          )}
        </div>
      </div>

      {showPollDialog && <CreatePollDialog onClose={() => setShowPollDialog(false)} onPollCreated={handlePollCreated} />}
      {showScheduleDialog && <SchedulePostDialog onClose={() => setShowScheduleDialog(false)} onSchedule={handleSchedule} />}
      {showProductDialog && <ProductTagDialog onClose={() => setShowProductDialog(false)} onProductSelected={handleProductsSelected} />}
    </div>
  );
}
