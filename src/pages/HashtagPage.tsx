import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { PostCard } from '@/components/features/PostCard';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { Post } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, TrendingUp, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatNumber } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { AdMob, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';

export default function HashtagPage() {
  const { tag } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [hashtag, setHashtag] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (tag) {
      fetchHashtagAndPosts();
      if (user) {
        checkFollowStatus();
      }
    }

    // Show AdMob banner below TopBar
    AdMob.showBanner({
      adId: "ca-app-pub-7234579833875016/8657343194", // Real Feed Top Banner ID
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.TOP_CENTER
    });

    // Hide banner on leaving the page
    return () => {
      AdMob.hideBanner();
    };
  }, [tag, user]);

  const fetchHashtagAndPosts = async () => {
    try {
      const { data: hashtagData, error: hashtagError } = await supabase
        .from('hashtags')
        .select('*')
        .eq('tag', tag?.toLowerCase())
        .single();

      if (hashtagError) throw hashtagError;
      setHashtag(hashtagData);

      const { data: postsData, error: postsError } = await supabase
        .from('post_hashtags')
        .select(`
          post_id,
          posts (
            *,
            user_profiles (*)
          )
        `)
        .eq('hashtag_id', hashtagData.id)
        .order('created_at', { ascending: false });

      if (postsError) throw postsError;
      
      const formattedPosts = (postsData || [])
        .map((item: any) => item.posts)
        .filter(Boolean);
      
      setPosts(formattedPosts);
    } catch (error) {
      console.error('Error fetching hashtag data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load hashtag',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const checkFollowStatus = async () => {
    if (!user || !hashtag) return;

    try {
      const { data } = await supabase
        .from('hashtag_follows')
        .select('id')
        .eq('user_id', user.id)
        .eq('hashtag_id', hashtag.id)
        .maybeSingle();

      setIsFollowing(!!data);
    } catch (error) {
      console.error('Error checking follow status:', error);
    }
  };

  const handleFollow = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    if (!hashtag) return;

    setFollowLoading(true);

    try {
      if (isFollowing) {
        await supabase
          .from('hashtag_follows')
          .delete()
          .eq('user_id', user.id)
          .eq('hashtag_id', hashtag.id);

        setIsFollowing(false);
        toast({
          title: 'Unfollowed',
          description: `You unfollowed #${tag}`,
        });
      } else {
        await supabase
          .from('hashtag_follows')
          .insert({
            user_id: user.id,
            hashtag_id: hashtag.id,
          });

        setIsFollowing(true);
        toast({
          title: 'Following',
          description: `You'll see posts with #${tag} in your feed`,
        });
      }
    } catch (error: any) {
      console.error('Error toggling hashtag follow:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update follow status',
        variant: 'destructive',
      });
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hashtag) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar title={`#${tag}`} showBack />
        <div className="text-center py-12 text-muted-foreground">
          <p>Hashtag not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title={`#${tag}`} showBack />

      {/* Hashtag Header */}
      <div className="border-b border-border p-6 bg-gradient-to-br from-primary/10 to-primary/5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="w-6 h-6 text-primary" />
              <h1 className="text-3xl font-bold">#{tag}</h1>
            </div>
            <p className="text-muted-foreground mb-4">
              {formatNumber(hashtag.usage_count)} posts
            </p>
          </div>
          {user && (
            <Button
              onClick={handleFollow}
              variant={isFollowing ? 'outline' : 'default'}
              className="rounded-full px-6"
              disabled={followLoading}
            >
              {followLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isFollowing ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Following
                </>
              ) : (
                'Follow'
              )}
            </Button>
          )}
        </div>

        {isFollowing && (
          <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-sm text-foreground">
              ✓ You're following this hashtag. Posts with #{tag} will appear in your feed.
            </p>
          </div>
        )}
      </div>

      {/* Posts */}
      <div>
        {posts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No posts found with this hashtag</p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} onUpdate={fetchHashtagAndPosts} />
          ))
        )}
      </div>
    </div>
  );
}
