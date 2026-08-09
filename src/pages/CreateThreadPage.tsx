import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Loader2, Image as ImageIcon, X, Wand2 } from 'lucide-react';
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
  const [loading, setLoading] = useState(false);

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

      if (coverImage) {
        const fileExt = coverImage.name.split('.').pop();
        const fileName = `threads/${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(fileName, coverImage);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('posts')
          .getPublicUrl(fileName);

        coverImageUrl = publicUrl;
      }

      const { error } = await supabase.from('threads').insert({
        user_id: user.id,
        title: title.trim(),
        content: content.trim(),
        cover_image: coverImageUrl,
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
          <label className="block text-sm font-semibold mb-2">Cover Image (Optional)</label>
          {coverPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              <img src={coverPreview} alt="Cover" className="w-full max-h-96 object-cover" />
              <button
                onClick={() => {
                  setCoverImage(null);
                  setCoverPreview(null);
                }}
                className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
              <ImageIcon className="w-12 h-12 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Click to upload cover image</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
            </label>
          )}
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
