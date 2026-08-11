import { useState, useEffect, useRef, useMemo } from 'react';
import { PageAdBanner } from '@/components/features/AdSenseAd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSEO } from '@/hooks/useSEO';
import { supabase } from '@/lib/supabase';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, BookOpen, ChevronRight, ChevronLeft, Layers, Loader2,
  X, Trash2, Lock, Globe, Edit3, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

// SeriesAdBanner is defined above

function SeriesAdBanner() { return <PageAdBanner />; }
export default function SeriesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mySeriesList, setMySeriesList] = useState<any[]>([]);
  const [publicSeries, setPublicSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'my' | 'discover'>('my');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [selectedSeries, setSelectedSeries] = useState<any | null>(null);
  const [seriesPosts, setSeriesPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [currentPostIdx, setCurrentPostIdx] = useState(0);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [showAddPost, setShowAddPost] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const seriesJsonLd = useMemo(() => {
    const items = publicSeries.slice(0, 5);
    if (items.length === 0) return undefined;
    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Trending Content Series on Testagram',
      description: 'Browse themed post series created by Testagram creators.',
      url: 'https://testagram.site/series',
      numberOfItems: items.length,
      itemListElement: items.map((s: any, i: number) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: s.name,
        description: s.description ?? `${s.item_count ?? 0} posts in this series`,
        url: 'https://testagram.site/series',
      })),
    };
  }, [publicSeries]);

  useSEO({
    title: 'Content Series — Testagram',
    description: 'Browse themed post collections and story series from Testagram creators. Follow along with multi-part narratives, tutorials, and more.',
    url: '/series',
    structuredData: seriesJsonLd,
    keywords: 'content series, post collections, creator stories, testagram series, thread playlists',
  });

  useEffect(() => {
    fetchAll();
  }, [user]);

  const fetchAll = async () => {
    setLoading(true);
    if (user) {
      const { data } = await supabase
        .from('post_series')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setMySeriesList(data ?? []);
    }
    const { data: pub } = await supabase
      .from('post_series')
      .select('*, user_profiles!post_series_user_id_fkey(username, avatar_url, verified)')
      .eq('is_public', true)
      .order('item_count', { ascending: false })
      .limit(20);
    setPublicSeries(pub ?? []);
    setLoading(false);
  };

  const fetchSeriesPosts = async (series: any) => {
    setSelectedSeries(series);
    setCurrentPostIdx(0);
    setLoadingPosts(true);
    const { data } = await supabase
      .from('post_series_items')
      .select('*, posts(*, user_profiles(username, avatar_url, verified))')
      .eq('series_id', series.id)
      .order('position', { ascending: true });
    setSeriesPosts(data ?? []);
    setLoadingPosts(false);
  };

  const fetchUserPosts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('posts')
      .select('id, content, image_url, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setUserPosts(data ?? []);
  };

  const createSeries = async () => {
    if (!user || !name.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('post_series')
      .insert({ user_id: user.id, name: name.trim(), description: description.trim() || null, is_public: isPublic })
      .select()
      .single();
    if (error) { toast.error('Failed to create series'); setCreating(false); return; }
    toast.success('Series created!');
    setShowCreate(false);
    setName('');
    setDescription('');
    setCreating(false);
    setMySeriesList(prev => [data, ...prev]);
  };

  const deleteSeries = async (id: string) => {
    if (!confirm('Delete this series? Posts won\'t be deleted.')) return;
    await supabase.from('post_series').delete().eq('id', id);
    setMySeriesList(prev => prev.filter(s => s.id !== id));
    toast.success('Series deleted');
  };

  const addPostToSeries = async (postId: string) => {
    if (!selectedSeries) return;
    const maxPos = seriesPosts.length > 0 ? Math.max(...seriesPosts.map(i => i.position)) + 1 : 1;
    const { error } = await supabase
      .from('post_series_items')
      .insert({ series_id: selectedSeries.id, post_id: postId, position: maxPos });
    if (error?.code === '23505') { toast.error('Post already in this series'); return; }
    if (error) { toast.error('Failed to add post'); return; }
    await supabase.from('post_series').update({ item_count: maxPos }).eq('id', selectedSeries.id);
    toast.success('Post added to series!');
    setShowAddPost(false);
    await fetchSeriesPosts(selectedSeries);
    // Notify users who have reading progress on this series
    try {
      await supabase.rpc('notify_series_episode_added', {
        p_series_id: selectedSeries.id,
        p_series_name: selectedSeries.name,
        p_episode_number: maxPos,
      });
    } catch { /* non-critical */ }
  };

  const removePostFromSeries = async (itemId: string) => {
    await supabase.from('post_series_items').delete().eq('id', itemId);
    setSeriesPosts(prev => prev.filter(p => p.id !== itemId));
    toast.success('Removed from series');
  };

  const saveTitleEdit = async (id: string) => {
    if (!editingTitle.trim()) return;
    await supabase.from('post_series').update({ name: editingTitle.trim() }).eq('id', id);
    setMySeriesList(prev => prev.map(s => s.id === id ? { ...s, name: editingTitle.trim() } : s));
    if (selectedSeries?.id === id) setSelectedSeries((prev: any) => ({ ...prev, name: editingTitle.trim() }));
    setEditingId(null);
    toast.success('Name updated');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Series viewer ────────────────────────────────────────────────────────
  if (selectedSeries) {
    const currentItem = seriesPosts[currentPostIdx];
    const currentPost = currentItem?.posts;
    const isOwn = user?.id === selectedSeries.user_id;

    // Save reading progress to localStorage
    const saveProgress = (partIdx: number) => {
      try {
        const raw = localStorage.getItem('series_progress');
        const all = raw ? JSON.parse(raw) : {};
        all[selectedSeries.id] = { currentPart: partIdx + 1, totalParts: seriesPosts.length, lastReadAt: new Date().toISOString() };
        localStorage.setItem('series_progress', JSON.stringify(all));
      } catch { /* ignore */ }
    };

    // Save on part change
    if (seriesPosts.length > 0) saveProgress(currentPostIdx);

    return (
      <div className="min-h-screen bg-background pb-20">
        <TopBar title={selectedSeries.name} showBack onBack={() => setSelectedSeries(null)} />

        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {/* Series header */}
          <div className="bg-gradient-to-br from-primary/10 to-purple-500/5 border border-primary/20 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-lg truncate">{selectedSeries.name}</h2>
                {selectedSeries.description && (
                  <p className="text-sm text-muted-foreground">{selectedSeries.description}</p>
                )}
              </div>
              {selectedSeries.is_public
                ? <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                : <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
              }
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{seriesPosts.length} part{seriesPosts.length !== 1 ? 's' : ''}</span>
              {isOwn && (
                <button
                  onClick={() => { fetchUserPosts(); setShowAddPost(true); }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Post
                </button>
              )}
            </div>
          </div>

          {loadingPosts ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : seriesPosts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Layers className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-semibold">No posts yet</p>
              {isOwn && (
                <button
                  onClick={() => { fetchUserPosts(); setShowAddPost(true); }}
                  className="mt-3 text-sm text-primary font-semibold hover:underline"
                >Add your first post</button>
              )}
            </div>
          ) : (
            <>
              {/* Current post display */}
              {currentPost && (
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  {/* Navigation header */}
                  <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border">
                    <button
                      disabled={currentPostIdx === 0}
                      onClick={() => setCurrentPostIdx(p => p - 1)}
                      className="flex items-center gap-1 text-sm font-semibold text-muted-foreground disabled:opacity-30 hover:text-foreground transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" /> Prev
                    </button>
                    {/* The error was here, an extra button tag was opened without being closed. */}
                    <span className="text-sm font-bold text-muted-foreground">
                      Part {currentPostIdx + 1} of {seriesPosts.length}
                    </span>
                    <button
                      disabled={currentPostIdx === seriesPosts.length - 1}
                      onClick={() => setCurrentPostIdx(p => p + 1)}
                      className="flex items-center gap-1 text-sm font-semibold text-muted-foreground disabled:opacity-30 hover:text-foreground transition-colors"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1 bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${((currentPostIdx + 1) / seriesPosts.length) * 100}%` }}
                    />
                  </div>

                  {/* Post content */}
                  <div
                    className="p-4 cursor-pointer hover:bg-muted/5 transition-colors"
                    onClick={() => navigate(`/post/${currentPost.id}`)}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0">
                        {currentPost.user_profiles?.avatar_url
                          ? <img src={currentPost.user_profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center font-bold text-sm">{currentPost.user_profiles?.username?.[0]?.toUpperCase()}</div>
                        }
                      </div>
                      <div>
                        <p className="font-bold text-sm">{currentPost.user_profiles?.username}</p>
                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(currentPost.created_at), { addSuffix: true })}</p>
                      </div>
                      {isOwn && (
                        <button
                          onClick={e => { e.stopPropagation(); removePostFromSeries(currentItem.id); }}
                          className="ml-auto p-1.5 rounded-full hover:bg-destructive/10 text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-6">{currentPost.content}</p>
                    {currentPost.image_url && (
                      <img src={currentPost.image_url} alt="" className="mt-3 rounded-xl w-full object-cover max-h-64" />
                    )}
                    <p className="text-xs text-primary mt-2 hover:underline">Read full post →</p>
                  </div>
                </div>
              )}

              {/* Series playlist */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="font-bold text-sm">All Parts</span>
                </div>
                <div className="divide-y divide-border">
                  {seriesPosts.map((item, idx) => {
                    const p = item.posts;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setCurrentPostIdx(idx)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          idx === currentPostIdx ? 'bg-primary/5 border-l-2 border-primary' : 'hover:bg-muted/30'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          idx === currentPostIdx ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                        }`}>{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p?.content?.slice(0, 60)}…</p>
                          <p className="text-xs text-muted-foreground">{p && formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</p>
                        </div>
                        {idx === currentPostIdx && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">Reading</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Add Post Sheet */}
        {showAddPost && (
          <div className="fixed inset-0 z-[200] bg-black/60" onClick={() => setShowAddPost(false)}>
            <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Add Post to Series</h3>
                <button onClick={() => setShowAddPost(false)} className="p-2 rounded-full hover:bg-muted"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-2">
                {userPosts.map(p => (
                  <button key={p.id} onClick={() => addPostToSeries(p.id)}
                    className="w-full text-left p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all">
                    <p className="text-sm font-medium line-clamp-2">{p.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</p>
                  </button>
                ))}
                {userPosts.length === 0 && (
                  <p className="text-center text-muted-foreground py-8 text-sm">No posts found. Create some posts first!</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Content Series" showBack />
      <SeriesAdBanner />

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/10 to-purple-500/5 border border-primary/20 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <BookOpen className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Content Series</h1>
              <p className="text-sm text-muted-foreground">Group posts into themed playlists</p>
            </div>
          </div>
          {user && (
            <Button onClick={() => setShowCreate(true)} className="w-full rounded-xl">
              <Plus className="w-4 h-4 mr-2" /> Create New Series
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex bg-muted/30 rounded-xl p-1 gap-1">
          {(['my', 'discover'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                tab === t ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}>{t === 'my' ? 'My Series' : 'Discover'}</button>
          ))}
        </div>

        {tab === 'my' && (
          <>
            {!user ? (
              <div className="text-center py-16 text-muted-foreground">
                <p className="font-semibold">Sign in to create series</p>
                <Button onClick={() => navigate('/auth')} className="mt-4">Sign In</Button>
              </div>
            ) : mySeriesList.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Layers className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="font-semibold">No series yet</p>
                <p className="text-sm mt-1">Organize your posts into themed series</p>
                <Button onClick={() => setShowCreate(true)} className="mt-4"><Plus className="w-4 h-4 mr-2" />Create First Series</Button>
              </div>
            ) : (
              <div className="grid gap-3">
                {mySeriesList.map(s => (
                  <div key={s.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                    <button
                      onClick={() => fetchSeriesPosts(s)}
                      className="w-full p-4 text-left hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center shrink-0">
                          <BookOpen className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {editingId === s.id ? (
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <input
                                value={editingTitle}
                                onChange={e => setEditingTitle(e.target.value)}
                                className="flex-1 text-sm font-bold bg-muted px-2 py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') saveTitleEdit(s.id); if (e.key === 'Escape') setEditingId(null); }}
                              />
                              <button onClick={() => saveTitleEdit(s.id)} className="text-primary"><Check className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-base truncate">{s.name}</h3>
                              {s.is_public ? <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                            </div>
                          )}
                          {s.description && <p className="text-sm text-muted-foreground mt-0.5 truncate">{s.description}</p>}
                          <p className="text-xs text-muted-foreground mt-1">{s.item_count ?? 0} posts · {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </button>
                    <div className="flex items-center gap-1 px-4 py-2 bg-muted/20 border-t border-border">
                      <button onClick={() => { setEditingId(s.id); setEditingTitle(s.name); }} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted">
                        <Edit3 className="w-3 h-3" /> Rename
                      </button>
                      <button onClick={() => deleteSeries(s.id)} className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive px-2 py-1 rounded-lg hover:bg-destructive/5 ml-auto">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'discover' && (
          <div className="grid gap-3">
            {publicSeries.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="font-semibold">No public series yet</p>
              </div>
            ) : publicSeries.map(s => (
              <button key={s.id} onClick={() => fetchSeriesPosts(s)}
                className="bg-card border border-border rounded-2xl p-4 text-left hover:border-primary/30 hover:bg-primary/5 transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center shrink-0">
                    <BookOpen className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base truncate">{s.name}</h3>
                    {s.description && <p className="text-sm text-muted-foreground mt-0.5 truncate">{s.description}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{s.item_count ?? 0} posts</span>
                      {s.user_profiles && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs text-primary">by @{s.user_profiles.username}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create Series Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[200] bg-black/60" onClick={() => setShowCreate(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">New Series</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 rounded-full hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold mb-1 block">Series Name *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 30 Days of Coding, Travel Diary" maxLength={60} autoFocus />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Description (optional)</label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this series about?" className="min-h-[80px]" maxLength={300} />
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl border border-border">
                <button onClick={() => setIsPublic(v => !v)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${isPublic ? 'bg-primary' : 'bg-muted'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${isPublic ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
                <div>
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    {isPublic ? <Globe className="w-3.5 h-3.5 text-primary" /> : <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    {isPublic ? 'Public' : 'Private'}
                  </p>
                  <p className="text-xs text-muted-foreground">{isPublic ? 'Anyone can read this series' : 'Only you can see this series'}</p>
                </div>
              </div>
            </div>
            <Button onClick={createSeries} disabled={creating || !name.trim()} className="w-full rounded-xl">
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {creating ? 'Creating…' : 'Create Series'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
