import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Loader2, Image as ImageIcon, Video as VideoIcon, X, Wand2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';

export default function CreateThreadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverVideo, setCoverVideo] = useState<File | null>(null);
  const [coverVideoPreview, setCoverVideoPreview] = useState<string | null>(null);
  const [extraImages, setExtraImages] = useState<File[]>([]);
  const [extraPreviews, setExtraPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // AI video caption
  const [aiVideoCaptionLoading, setAiVideoCaptionLoading] = useState(false);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { sonnerToast.error('Video must be < 50MB'); return; }
    if (coverVideoPreview) URL.revokeObjectURL(coverVideoPreview);
    setCoverVideo(file);
    setCoverVideoPreview(URL.createObjectURL(file));
    setCoverImage(null);
    setCoverPreview(null);
    e.target.value = '';
  };

  const handleExtraImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const valid = files.filter(f => f.type.startsWith('image/') && f.size <= 20 * 1024 * 1024);
    const newPreviews = valid.map(f => URL.createObjectURL(f));
    setExtraImages(prev => [...prev, ...valid].slice(0, 6));
    setExtraPreviews(prev => [...prev, ...newPreviews].slice(0, 6));
    e.target.value = '';
  };

  const removeExtraImage = (idx: number) => {
    URL.revokeObjectURL(extraPreviews[idx]);
    setExtraImages(prev => prev.filter((_, i) => i !== idx));
    setExtraPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const generateVideoCaption = async () => {
    if (!coverVideo && !title.trim()) return;
    setAiVideoCaptionLoading(true);
    const ctx = title.trim() || coverVideo?.name.replace(/\.[^.]+$/, '') || 'a video thread';
    const { data } = await supabase.functions.invoke('ai-chat', {
      body: {
        messages: [{ role: 'user', content: `Generate a compelling short description (1-2 sentences, under 150 chars) for a video thread titled: "${ctx}". Return ONLY the description text.` }],
        model: 'google/gemini-3-flash-preview',
      },
    });
    const raw = data?.choices?.[0]?.message?.content ?? data?.content ?? data?.text ?? '';
    if (raw.trim()) setContent(prev => prev ? prev + '\n\n' + raw.trim() : raw.trim());
    setAiVideoCaptionLoading(false);
  };

  // ── Video Chapters ──────────────────────────────────────────────────────
  const [chapters, setChapters] = useState<{ time: string; title: string }[]>([]);
  const [showChapterEditor, setShowChapterEditor] = useState(false);

  const addChapter = () => setChapters(prev => [...prev, { time: '0:00', title: '' }]);
  const removeChapter = (i: number) => setChapters(prev => prev.filter((_, j) => j !== i));
  const updateChapter = (i: number, field: 'time' | 'title', val: string) =>
    setChapters(prev => prev.map((ch, j) => j === i ? { ...ch, [field]: val } : ch));

  const parseChaptersForDB = () => chapters
    .filter(ch => ch.title.trim())
    .map(ch => {
      const parts = ch.time.split(':').map(Number);
      const secs = parts.length === 2 ? parts[0] * 60 + (parts[1] || 0) : parts[0] || 0;
      return { time: secs, title: ch.title.trim() };
    });

  // ── AI Writer ────────────────────────────────────────────────────────────
  const [showAiWriter, setShowAiWriter] = useState(false);
  const [aiTarget, setAiTarget] = useState<'title' | 'content'>('content');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDrafts, setAiDrafts] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  if (!user) {
    navigate('/auth');
    return null;
  }

  const handleAiWrite = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiDrafts([]);
    const { data } = await supabase.functions.invoke('ai-chat', {
      body: {
        messages: [{
          role: 'user',
          content: aiTarget === 'title'
            ? `Generate exactly 3 compelling, unique thread titles about: "${aiPrompt.trim()}". Return ONLY the 3 titles separated by "|||" — no numbering, no labels.`
            : `Write exactly 3 different long-form thread content drafts (200-400 words each) about: "${aiPrompt.trim()}". Each should take a different angle or style. Return ONLY the 3 drafts separated by "|||" — no labels, no numbering.`,
        }],
        model: 'gemini-2.0-flash',
      },
    });
    const raw = data?.choices?.[0]?.message?.content ?? data?.content ?? data?.text ?? data?.response ?? '';
    const drafts = raw.split('|||').map((d: string) => d.trim()).filter(Boolean).slice(0, 3);
    setAiDrafts(drafts.length ? drafts : ['Could not generate drafts. Please try again.']);
    setAiLoading(false);
  };

  const applyDraft = (draft: string) => {
    if (aiTarget === 'title') setTitle(draft.slice(0, 200));
    else setContent(draft.slice(0, 10000));
    setAiDrafts([]);
    setAiPrompt('');
    setShowAiWriter(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      
      if (file.size > 10 * 1024 * 1024) {
        sonnerToast.error('Image must be less than 10MB');
        return;
      }

      setCoverImage(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: 'Error',
        description: 'Title and content are required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      let coverImageUrl = null;
      let videoUrl = null;
      const uploadedMediaUrls: string[] = [];

      if (coverImage) {
        const fileExt = coverImage.name.split('.').pop();
        const fileName = `threads/${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('posts').upload(fileName, coverImage);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
        coverImageUrl = publicUrl;
      }

      if (coverVideo) {
        sonnerToast.loading('Uploading video…');
        const fileExt = coverVideo.name.split('.').pop();
        const fileName = `threads/${user.id}/video_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('posts').upload(fileName, coverVideo);
        sonnerToast.dismiss();
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
        videoUrl = publicUrl;
      }

      // Upload extra inline images
      for (let i = 0; i < extraImages.length; i++) {
        const img = extraImages[i];
        const fileExt = img.name.split('.').pop();
        const fileName = `threads/${user.id}/img_${Date.now()}_${i}.${fileExt}`;
        const { error: upErr } = await supabase.storage.from('posts').upload(fileName, img);
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
          uploadedMediaUrls.push(publicUrl);
        }
      }

      const parsedChapters = parseChaptersForDB();
      const { error } = await supabase.from('threads').insert({
        user_id: user.id,
        title: title.trim(),
        content: content.trim(),
        cover_image: coverImageUrl ?? (uploadedMediaUrls[0] ?? null),
        media_url: videoUrl,
        media_type: videoUrl ? 'video' : 'image',
        media_urls: uploadedMediaUrls.length > 0 ? uploadedMediaUrls : [],
        chapters: parsedChapters.length > 0 ? parsedChapters : null,
        is_published: true,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Thread published successfully',
      });

      navigate('/threads');
    } catch (error: any) {
      console.error('Error creating thread:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create thread',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Create Thread" showBack />

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <div>
          <label className="block text-sm font-semibold mb-2">Cover Media (Optional)</label>

          {/* Cover image preview */}
          {coverPreview && (
            <div className="relative rounded-xl overflow-hidden mb-2">
              <img src={coverPreview} alt="Cover" className="w-full max-h-96 object-cover" />
              <button onClick={() => { setCoverImage(null); setCoverPreview(null); }}
                className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Cover video preview */}
          {coverVideoPreview && (
            <div className="relative rounded-xl overflow-hidden mb-2">
              <video src={coverVideoPreview} controls className="w-full max-h-72 rounded-xl" />
              <button onClick={() => { setCoverVideo(null); if (coverVideoPreview) URL.revokeObjectURL(coverVideoPreview); setCoverVideoPreview(null); }}
                className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
              {/* Chapter editor — shown when video is uploaded */}
              {coverVideoPreview && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🎬 Video Chapters</label>
                    <button onClick={() => setShowChapterEditor(v => !v)} className="text-xs text-primary font-semibold hover:underline">
                      {showChapterEditor ? 'Hide' : 'Add Chapters'}
                    </button>
                  </div>
                  {showChapterEditor && (
                    <div className="space-y-2">
                      {chapters.map((ch, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="text" value={ch.time} onChange={e => updateChapter(i, 'time', e.target.value)}
                            placeholder="0:00" className="w-16 text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                          <input type="text" value={ch.title} onChange={e => updateChapter(i, 'title', e.target.value)}
                            placeholder="Chapter title…" maxLength={40}
                            className="flex-1 text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                          <button onClick={() => removeChapter(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button onClick={addChapter} className="w-full py-2 border-2 border-dashed border-border rounded-xl text-xs font-semibold text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors">
                        + Add Chapter
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* AI Caption button */}
              <button onClick={generateVideoCaption} disabled={aiVideoCaptionLoading}
                className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/90 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50">
                {aiVideoCaptionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                AI Caption
              </button>
            </div>
          )}

          {!coverPreview && !coverVideoPreview && (
            <div className="grid grid-cols-2 gap-2">
              <label className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                <ImageIcon className="w-8 h-8 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Cover Image</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
              <label className="border-2 border-dashed border-blue-500/30 bg-blue-500/5 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-500/10 transition-colors">
                <VideoIcon className="w-8 h-8 text-blue-500 mb-1" />
                <span className="text-xs text-blue-600 font-semibold">Cover Video</span>
                <input type="file" accept="video/*" className="hidden" onChange={handleVideoChange} />
              </label>
            </div>
          )}

          {/* Inline images gallery */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Inline Images (up to 6)</label>
              <label className="flex items-center gap-1 text-xs text-primary font-semibold cursor-pointer hover:underline">
                <ImageIcon className="w-3.5 h-3.5" /> Add Images
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleExtraImages} />
              </label>
            </div>
            {extraPreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5">
                {extraPreviews.map((url, i) => (
                  <div key={i} className="relative rounded-xl overflow-hidden aspect-square">
                    <img src={url} alt={`img-${i}`} className="w-full h-full object-cover" />
                    <button onClick={() => removeExtraImage(i)}
                      className="absolute top-1 right-1 bg-black/80 text-white rounded-full w-5 h-5 flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold">Title</label>
            <button
              onClick={() => { setAiTarget('title'); setShowAiWriter(v => !v && aiTarget === 'title' ? false : true); setAiDrafts([]); }}
              className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                showAiWriter && aiTarget === 'title' ? 'text-purple-600' : 'text-muted-foreground hover:text-purple-500'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              AI Write
            </button>
          </div>
          <Input
            placeholder="Give your thread a compelling title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="text-lg"
          />
          <div className="text-right text-sm text-muted-foreground mt-1">
            {title.length}/200
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold">Content</label>
            <button
              onClick={() => { setAiTarget('content'); setShowAiWriter(v => !v && aiTarget === 'content' ? false : true); setAiDrafts([]); }}
              className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                showAiWriter && aiTarget === 'content' ? 'text-purple-600' : 'text-muted-foreground hover:text-purple-500'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              AI Write
            </button>
          </div>
          <Textarea
            placeholder="Share your story, thoughts, or insights... You can use hashtags to connect with related posts!"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[400px] text-base leading-relaxed"
            maxLength={10000}
          />
          <div className="text-right text-sm text-muted-foreground mt-1">
            {content.length}/10,000 characters
          </div>
        </div>

        {/* AI Writer Panel */}
        {showAiWriter && (
          <div className="border border-purple-500/20 rounded-xl bg-purple-500/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                  AI {aiTarget === 'title' ? 'Title' : 'Content'} Writer
                </span>
              </div>
              <button onClick={() => { setShowAiWriter(false); setAiDrafts([]); setAiPrompt(''); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAiWrite()}
                placeholder={aiTarget === 'title' ? 'What is your thread about?' : 'Describe the topic in detail...'}
                className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                disabled={aiLoading}
              />
              <button
                onClick={handleAiWrite}
                disabled={aiLoading || !aiPrompt.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex-shrink-0"
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {aiLoading ? 'Writing…' : 'Generate'}
              </button>
            </div>
            {aiDrafts.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Click to use a draft:</p>
                {aiDrafts.map((draft, i) => (
                  <button
                    key={i}
                    onClick={() => applyDraft(draft)}
                    className="w-full text-left text-sm p-3 border border-border rounded-xl hover:border-purple-500 hover:bg-purple-500/5 transition-colors leading-relaxed max-h-48 overflow-y-auto"
                  >
                    {draft}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={() => navigate('/threads')}
            variant="outline"
            className="flex-1"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePublish}
            className="flex-1"
            disabled={loading || !title.trim() || !content.trim()}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Publish Thread
          </Button>
        </div>
      </div>
    </div>
  );
}
