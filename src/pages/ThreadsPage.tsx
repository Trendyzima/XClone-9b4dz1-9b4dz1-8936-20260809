import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, BadgeCheck, Heart, MessageCircle, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { parseContent, formatNumber } from '@/lib/utils';

interface Thread {
  id: string;
  user_id: string;
  title: string;
  content: string;
  cover_image: string | null;
  views_count: number;
  likes_count: number;
  created_at: string;
  user_profiles: {
    id: string;
    username: string;
    avatar_url: string | null;
    verified: boolean;
  };
}

export default function ThreadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('For You');

  const tabs = ['For You', 'Following', 'Trending'];

  useEffect(() => {
    fetchThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('threads')
        .select(`
          *,
          user_profiles (
            id,
            username,
            avatar_url,
            verified
          )
        `)
        .eq('is_published', true);

      if (activeTab === 'Following' && user) {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        const followingIds = follows?.map(f => f.following_id) || [];
        if (followingIds.length > 0) {
          query = query.in('user_id', followingIds);
        } else {
          setThreads([]);
          setLoading(false);
          return;
        }
      }

      query = query.order(activeTab === 'Trending' ? 'views_count' : 'created_at', { ascending: false });

      const { data, error } = await query.limit(50);
      if (error) throw error;

      setThreads(data || []);
    } catch (error) {
      console.error('Error fetching threads:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Threads" />

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 px-6 py-4 font-semibold transition-colors border-b-2 ${
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

      {/* Create Thread */}
      {user && (
        <div className="p-4 border-b border-border">
          <Button
            onClick={() => navigate('/threads/create')}
            className="w-full rounded-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Thread
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center py-12 px-4">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">
            {activeTab === 'Following' 
              ? 'No threads from people you follow' 
              : 'No threads yet'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {threads.map((thread) => (
            <article
              key={thread.id}
              className="p-4 hover:bg-muted/5 transition-colors cursor-pointer"
              onClick={() => navigate(`/thread/${thread.id}`)}
            >
              <div className="flex items-start space-x-3">
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/profile/${thread.user_profiles.username}`);
                  }}
                >
                  {thread.user_profiles.avatar_url ? (
                    <img
                      src={thread.user_profiles.avatar_url}
                      alt={thread.user_profiles.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold">
                      {thread.user_profiles.username[0].toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Thread Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold truncate">{thread.user_profiles.username}</span>
                    {thread.user_profiles.verified && (
                      <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" fill="currentColor" />
                    )}
                    <span className="text-muted-foreground text-sm flex-shrink-0">
                      {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold mt-2 mb-2">{thread.title}</h2>

                  <div
                    className="text-muted-foreground line-clamp-3 mb-3"
                    dangerouslySetInnerHTML={{ __html: parseContent(thread.content.substring(0, 280)) }}
                  />

                  {thread.cover_image && (
                    <img
                      src={thread.cover_image}
                      alt={thread.title}
                      className="rounded-xl w-full max-h-96 object-cover mb-3"
                    />
                  )}

                  {/* Stats */}
                  <div className="flex items-center space-x-6 text-muted-foreground">
                    <div className="flex items-center space-x-2">
                      <Heart className="w-4 h-4" />
                      <span className="text-sm">{formatNumber(thread.likes_count)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MessageCircle className="w-4 h-4" />
                      <span className="text-sm">Read more</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-sm">{formatNumber(thread.views_count)} views</span>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
