import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { PostCard } from '@/components/features/PostCard';
import { Bookmark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function BookmarksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    fetchBookmarks();
  }, [user]);

  const fetchBookmarks = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .select(`
          *,
          post:posts(
            *,
            user:user_profiles(*),
            poll:polls(
              *,
              options:poll_options(*)
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const bookmarkedPosts = data?.map(b => b.post).filter(Boolean) || [];
      setPosts(bookmarkedPosts);
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading bookmarks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Bookmark className="w-6 h-6" />
          <div>
            <h1 className="text-xl font-bold">Bookmarks</h1>
            <p className="text-sm text-muted-foreground">
              {posts.length} saved post{posts.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      <div>
        {posts.length === 0 ? (
          <div className="text-center py-12">
            <Bookmark className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h2 className="text-xl font-semibold mb-2">No bookmarks yet</h2>
            <p className="text-muted-foreground">
              Save posts to easily find them later
            </p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))
        )}
      </div>
    </div>
  );
}
