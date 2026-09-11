import { useEffect, useState } from 'react';
import { ArrowLeft, Quote, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import ComposePost from '@/components/features/ComposePost';
import { PostCard } from '@/components/features/PostCard';

export default function QuotePage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!postId) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles:user_id(id, username, display_name, avatar_url, verified)')
        .eq('id', postId)
        .maybeSingle();
      if (active) {
        if (error) console.error('[quote-page]', error);
        setPost(data ?? null);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [postId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!post) return <div className="p-6 text-center"><p className="text-muted-foreground">The post to quote could not be found.</p><button className="mt-4 text-primary" onClick={() => navigate(-1)}>Go back</button></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
        <button onClick={() => navigate(-1)} className="rounded-full p-2 hover:bg-muted" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
        <Quote className="w-5 h-5 text-primary" />
        <h1 className="font-bold text-lg">Quote post</h1>
      </header>
      <main className="mx-auto max-w-2xl p-4 space-y-4">
        <section className="rounded-2xl border border-border bg-card p-2">
          <PostCard post={post} />
        </section>
        {user ? (
          <ComposePost quotedPostId={post.id} quotedPostPreview={post} />
        ) : (
          <button onClick={() => navigate('/auth')} className="w-full rounded-xl bg-primary px-4 py-3 text-primary-foreground font-semibold">Sign in to quote this post</button>
        )}
      </main>
    </div>
  );
}
