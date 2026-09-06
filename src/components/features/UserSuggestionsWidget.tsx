import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { BadgeCheck, Loader2, UserPlus, Check } from 'lucide-react';
import { toast } from 'sonner';

export function UserSuggestionsWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set<string>());
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (user) fetchSuggestions(); }, [user]);
  const fetchSuggestions = async () => {
    if (!user) return;
    try {
      const { data: followingData } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
      const followingIds = new Set<string>((followingData ?? []).map((f: { following_id: string }) => f.following_id));
      setFollowing(followingIds);
      const suggestedUsers = await supabase.from('user_profiles').select('*').neq('id', user.id).order('followers_count', { ascending: false }).limit(5).then(r => r.data ?? []);
      setSuggestions(suggestedUsers);
    } catch (error) { console.error('Error fetching suggestions:', error); }
    finally { setLoading(false); }
  };
  const handleFollow = async (userId: string) => {
    if (!user) { navigate('/auth'); return; }
    try {
      const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: userId });
      if (error) throw error;
      setFollowing(prev => new Set<string>([...prev, userId])); toast.success('Following!');
      await supabase.from('notifications').insert({ user_id: userId, type: 'follow', from_user_id: user.id });
    } catch (error: any) { console.error('Follow error:', error); toast.error(error.message); }
  };