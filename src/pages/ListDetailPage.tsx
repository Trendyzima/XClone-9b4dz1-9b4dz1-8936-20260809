import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PostCard } from '@/components/features/PostCard';
import { Users, Plus, Settings, Trash2, Lock, Globe, Search, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';

export default function ListDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Posts');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    if (id) {
      fetchList();
      fetchMembers();
      fetchPosts();
    }
  }, [id]);

  const fetchList = async () => {
    try {
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      // Check access
      if (data.is_private && data.user_id !== user?.id) {
        toast.error('This list is private');
        navigate('/lists');
        return;
      }

      setList(data);
    } catch (error) {
      console.error('Error fetching list:', error);
      navigate('/lists');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    const { data } = await supabase
      .from('list_members')
      .select(`
        *,
        user_profiles (*)
      `)
      .eq('list_id', id)
      .order('added_at', { ascending: false });

    setMembers((data || []).map((m: any) => m.user_profiles).filter(Boolean));
  };

  const fetchPosts = async () => {
    const { data: memberData } = await supabase
      .from('list_members')
      .select('user_id')
      .eq('list_id', id);

    if (!memberData || memberData.length === 0) {
      setPosts([]);
      return;
    }

    const userIds = memberData.map((m: any) => m.user_id);

    const { data: postsData } = await supabase
      .from('posts')
      .select(`
        *,
        user_profiles (*)
      `)
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
      .limit(50);

    setPosts(postsData || []);
  };

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .ilike('username', `%${query}%`)
      .limit(20);

    // Filter out already added members
    const memberIds = members.map(m => m.id);
    setSearchResults((data || []).filter(u => !memberIds.includes(u.id)));
  };

  const addMember = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('list_members')
        .insert({
          list_id: id,
          user_id: userId
        });

      if (error) throw error;

      toast.success('User added to list');
      fetchMembers();
      fetchPosts();
      setShowAddDialog(false);
      setSearchQuery('');
      setSearchResults([]);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const removeMember = async (userId: string) => {
    if (!confirm('Remove this user from the list?')) return;

    try {
      const { error } = await supabase
        .from('list_members')
        .delete()
        .eq('list_id', id)
        .eq('user_id', userId);

      if (error) throw error;

      toast.success('User removed from list');
      fetchMembers();
      fetchPosts();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const deleteList = async () => {
    if (!confirm('Delete this list? This action cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('lists')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('List deleted');
      navigate('/lists');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!list) return null;

  const isOwner = user?.id === list.user_id;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title={list.name} showBack />

      <div className="border-b border-border p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl font-bold">{list.name}</h1>
              {list.is_private ? (
                <Lock className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Globe className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            {list.description && (
              <p className="text-muted-foreground mb-3">{list.description}</p>
            )}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{list.member_count} members</span>
              </div>
            </div>
          </div>

          {isOwner && (
            <div className="flex gap-2">
              <Button
                onClick={() => setShowAddDialog(true)}
                size="sm"
                className="rounded-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
              <Button
                onClick={deleteList}
                size="sm"
                variant="destructive"
                className="rounded-full"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="flex">
          <button
            onClick={() => setActiveTab('Posts')}
            className={`flex-1 py-4 font-semibold transition-colors border-b-2 ${
              activeTab === 'Posts'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-muted/50'
            }`}
          >
            Posts
          </button>
          <button
            onClick={() => setActiveTab('Members')}
            className={`flex-1 py-4 font-semibold transition-colors border-b-2 ${
              activeTab === 'Members'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-muted/50'
            }`}
          >
            Members ({members.length})
          </button>
        </div>
      </div>

      {activeTab === 'Posts' ? (
        posts.length > 0 ? (
          posts.map((post) => (
            <PostCard key={post.id} post={post} onUpdate={fetchPosts} />
          ))
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>No posts yet</p>
            <p className="text-sm mt-2">Add members to see their posts here</p>
          </div>
        )
      ) : (
        <div className="divide-y divide-border">
          {members.map((member) => (
            <div key={member.id} className="p-4 flex items-center justify-between">
              <div
                onClick={() => navigate(`/profile/${member.username}`)}
                className="flex items-center gap-3 flex-1 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-full bg-muted overflow-hidden">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt={member.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold">
                      {member.username[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-semibold">{member.username}</p>
                  <p className="text-sm text-muted-foreground">@{member.username}</p>
                </div>
              </div>
              {isOwner && (
                <Button
                  onClick={() => removeMember(member.id)}
                  size="sm"
                  variant="outline"
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold">Add to List</h2>
              <button onClick={() => setShowAddDialog(false)} className="p-2 hover:bg-muted rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    searchUsers(e.target.value);
                  }}
                  placeholder="Search users..."
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {searchResults.map((result) => (
                <div key={result.id} className="p-4 hover:bg-muted/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted overflow-hidden">
                      {result.avatar_url ? (
                        <img src={result.avatar_url} alt={result.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold">
                          {result.username[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold">{result.username}</p>
                      <p className="text-sm text-muted-foreground">@{result.username}</p>
                    </div>
                  </div>
                  <Button onClick={() => addMember(result.id)} size="sm">
                    Add
                  </Button>
                </div>
              ))}

              {searchQuery && searchResults.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No users found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
