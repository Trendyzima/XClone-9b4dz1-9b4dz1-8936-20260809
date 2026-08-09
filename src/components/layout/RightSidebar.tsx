import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { TrendingUp, Users, Hash, Radio, Sparkles, Plus } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { UserSuggestionsWidget } from '../features/UserSuggestionsWidget';
import { ContentSuggestionsWidget } from '../features/ContentSuggestionsWidget';

interface TrendingTopic {
  id: string;
  topic: string;
  category: string;
  posts_count: number;
}

interface Community {
  id: string;
  name: string;
  display_name: string;
  icon_url?: string;
  member_count: number;
}

interface Space {
  id: string;
  title: string;
  host_id: string;
  listener_count: number;
  is_live: boolean;
  user_profiles: {
    username: string;
    avatar_url?: string;
  };
}

export function RightSidebar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [trending, setTrending] = useState<TrendingTopic[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [liveSpaces, setLiveSpaces] = useState<Space[]>([]);

  useEffect(() => {
    fetchTrending();
    fetchCommunities();
    fetchLiveSpaces();
  }, []);

  const fetchTrending = async () => {
    // Refresh trending from real posts
    await supabase.rpc('refresh_trending_topics');
    
    const { data } = await supabase
      .from('trending_topics')
      .select('*')
      .order('posts_count', { ascending: false })
      .limit(5);

    if (data) setTrending(data);
  };

  const fetchCommunities = async () => {
    const { data } = await supabase
      .from('communities')
      .select('*')
      .order('member_count', { ascending: false })
      .limit(5);

    if (data) setCommunities(data);
  };

  const fetchLiveSpaces = async () => {
    const { data } = await supabase
      .from('spaces')
      .select(`
        *,
        user_profiles (username, avatar_url)
      `)
      .eq('is_live', true)
      .order('listener_count', { ascending: false })
      .limit(3);

    if (data) setLiveSpaces(data);
  };

  return (
    <aside className="hidden xl:block w-80 h-screen sticky top-0 p-4 space-y-4 overflow-y-auto">
      {/* Create Community */}
      <div className="bg-muted/50 rounded-xl p-4 border border-border">
        <h3 className="font-bold text-lg mb-3 flex items-center">
          <Users className="w-5 h-5 mr-2 text-primary" />
          Communities
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Create your own community to connect with like-minded people
        </p>
        <Button
          onClick={() => navigate('/communities')}
          className="w-full rounded-full"
          variant="outline"
        >
          <Plus className="w-4 h-4 mr-2" />
          Browse Communities
        </Button>
      </div>

      {/* Live Audio Spaces */}
      {liveSpaces.length > 0 && (
        <div className="bg-muted/50 rounded-xl p-4 border border-border">
          <h3 className="font-bold text-lg mb-3 flex items-center">
            <Radio className="w-5 h-5 mr-2 text-red-500 animate-pulse" />
            Live Spaces
          </h3>
          <div className="space-y-3">
            {liveSpaces.map((space) => (
              <button
                key={space.id}
                onClick={() => navigate('/spaces')}
                className="w-full text-left p-3 hover:bg-muted rounded-lg transition-colors"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <Radio className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{space.title}</p>
                    <p className="text-xs text-muted-foreground">
                      @{space.user_profiles.username}
                    </p>
                    <p className="text-xs text-red-500 font-medium mt-1">
                      🔴 {space.listener_count} listening
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <Button
            onClick={() => navigate('/spaces')}
            variant="outline"
            className="w-full mt-3 rounded-full"
          >
            View All Spaces
          </Button>
        </div>
      )}

      {/* Trending Topics */}
      <div className="bg-muted/50 rounded-xl p-4 border border-border">
        <h3 className="font-bold text-lg mb-3 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2 text-primary" />
          Trending
        </h3>
        <div className="space-y-3">
          {trending.map((topic, index) => (
            <button
              key={topic.id}
              onClick={() => {
                if (topic.topic.startsWith('#')) {
                  navigate(`/hashtag/${topic.topic.substring(1)}`);
                } else {
                  navigate(`/search?q=${encodeURIComponent(topic.topic)}`);
                }
              }}
              className="w-full text-left p-3 hover:bg-muted rounded-lg transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground mb-1">
                    <span className="font-bold">{index + 1}</span>
                    <span>·</span>
                    <span>{topic.category}</span>
                  </div>
                  <p className="font-bold text-sm">{topic.topic}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatNumber(topic.posts_count)} posts
                  </p>
                </div>
                <TrendingUp className="w-4 h-4 text-primary flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
        <Button
          onClick={() => navigate('/explore')}
          variant="ghost"
          className="w-full mt-3"
        >
          Show more
        </Button>
      </div>

      {/* Suggested Communities */}
      <div className="bg-muted/50 rounded-xl p-4 border border-border">
        <h3 className="font-bold text-lg mb-3 flex items-center">
          <Users className="w-5 h-5 mr-2 text-primary" />
          Popular Communities
        </h3>
        <div className="space-y-3">
          {communities.map((community) => (
            <button
              key={community.id}
              onClick={() => navigate(`/c/${community.name}`)}
              className="w-full text-left p-3 hover:bg-muted rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {community.icon_url ? (
                    <img
                      src={community.icon_url}
                      alt={community.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold">{community.display_name[0]}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{community.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(community.member_count)} members
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
        <Button
          onClick={() => navigate('/communities')}
          variant="ghost"
          className="w-full mt-3"
        >
          Show more
        </Button>
      </div>

      {/* User Suggestions */}
      <UserSuggestionsWidget />

      {/* Content Suggestions */}
      <ContentSuggestionsWidget />

      {/* AI Features */}
      <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl p-4 border border-purple-500/20">
        <h3 className="font-bold text-lg mb-2 flex items-center">
          <Sparkles className="w-5 h-5 mr-2 text-purple-500" />
          AI-Powered
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Discover personalized content, trending topics, and smart recommendations
        </p>
        <Button
          onClick={() => navigate('/ai')}
          className="w-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Explore AI
        </Button>
      </div>

      {/* Footer Links */}
      <div className="text-xs text-muted-foreground px-4 space-y-2 pb-4">
        <div className="flex flex-wrap gap-2">
          <a href="#" className="hover:underline">Terms</a>
          <span>·</span>
          <a href="#" className="hover:underline">Privacy</a>
          <span>·</span>
          <a href="#" className="hover:underline">Help</a>
          <span>·</span>
          <a href="#" className="hover:underline">About</a>
        </div>
        <p>© 2025 T Social</p>
      </div>
    </aside>
  );
}
