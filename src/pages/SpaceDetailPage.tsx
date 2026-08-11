import { useState, useEffect } from 'react';
import { PageAdBanner } from '@/components/features/AdSenseAd';
function SpaceDetailAdBanner() { return <PageAdBanner />; }
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Radio, Users, Mic, Headphones, Video, BadgeCheck, Clock, Hash, Play, Loader2, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';
import { useSEO } from '@/hooks/useSEO';
import { Button } from '@/components/ui/button';
import { JoinSpaceDialog } from '@/components/features/JoinSpaceDialog';

export default function SpaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [space, setSpace] = useState<any>(null);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  // ── SEO — BroadcastEvent JSON-LD ──────────────────────────────────────────
  useSEO({
    title: space
      ? `${space.title} — Live Space on Testagram`
      : 'Live Space — Testagram',
    description: space
      ? `Join "${space.title}" hosted by @${space.host?.username ?? 'creator'} — ${space.listener_count ?? 0} listeners live now on Testagram Spaces.`
      : 'Join a live audio space on Testagram.',
    url: id ? `/spaces/${id}` : '/spaces',
    type: 'website',
    image: space?.artwork_url || 'https://testagram.site/app-icon.jpg',
    keywords: `live audio, space, ${space?.category ?? 'general'}, testagram, podcast, ${space?.host?.username ?? 'creator'}`,
    structuredData: space ? {
      '@context': 'https://schema.org',
      '@type': 'BroadcastEvent',
      name: space.title,
      description: space.description || space.title,
      url: `https://testagram.site/spaces/${id}`,
      startDate: space.started_at,
      endDate: space.ended_at ?? undefined,
      eventStatus: space.is_live
        ? 'https://schema.org/EventScheduled'
        : 'https://schema.org/EventEnded',
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      location: {
        '@type': 'VirtualLocation',
        url: `https://testagram.site/spaces/${id}`,
      },
      organizer: space.host ? {
        '@type': 'Person',
        name: space.host.username,
        url: `https://testagram.site/profile/${space.host.username}`,
      } : undefined,
      audience: {
        '@type': 'Audience',
        audienceType: 'Public',
      },
      recordedIn: recordings.length > 0 ? recordings.map(r => ({
        '@type': 'AudioObject',
        name: r.title,
        contentUrl: r.audio_url,
        url: `https://testagram.site/space-recording/${r.id}`,
        duration: r.duration ? `PT${Math.floor(r.duration / 60)}M${r.duration % 60}S` : undefined,
      })) : undefined,
    } : undefined,
  });

  useEffect(() => {
    if (!id) return;
    fetchSpace();
    fetchRecordings();
    fetchParticipants();
  }, [id]);

  const fetchSpace = async () => {
    const { data } = await supabase
      .from('spaces')
      .select('*, host:user_profiles!spaces_host_id_fkey(*)')
      .eq('id', id!)
      .single();
    setSpace(data);
    setLoading(false);
  };

  const fetchRecordings = async () => {
    const { data } = await supabase
      .from('space_recordings')
      .select('*')
      .eq('space_id', id!)
      .order('created_at', { ascending: false });
    setRecordings(data ?? []);
  };

  const fetchParticipants = async () => {
    const { data } = await supabase
      .from('space_participants')
      .select('*, user_profiles(id, username, avatar_url, verified)')
      .eq('space_id', id!)
      .limit(20);
    setParticipants(data ?? []);
  };

  const handleJoin = () => {
    if (!user) { navigate('/auth'); return; }
    setShowJoinDialog(true);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/spaces/${id}`;
    try { await navigator.share({ title: space?.title, url }); }
    catch { navigator.clipboard.writeText(url); toast.success('Link copied!'); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!space) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar title="Space" showBack />
        <div className="text-center py-24 text-muted-foreground">
          <Radio className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="font-bold text-xl mb-2">Space not found</p>
          <p className="text-sm mb-6">This space may have ended or been removed.</p>
          <Button onClick={() => navigate('/spaces')} className="rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Spaces
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Space" showBack />

      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-purple-500/10 border-b border-border p-5">
        <div className="flex items-start gap-4">
          {/* Artwork */}
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 to-purple-500/20 flex-shrink-0 shadow-lg">
            {space.artwork_url ? (
              <img src={space.artwork_url} alt={space.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl">🎙️</div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Live badge */}
            {space.is_live && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-bold text-red-500 uppercase tracking-wide">Live Now</span>
              </div>
            )}
            <h1 className="text-xl font-black leading-snug mb-1">{space.title}</h1>
            {space.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{space.description}</p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
              {space.category && (
                <span className="capitalize">{space.category}</span>
              )}
              {space.has_video && (
                <span className="flex items-center gap-0.5 text-primary">
                  <Video className="w-3 h-3" /> Video
                </span>
              )}
              {space.episode_number && (
                <span>Ep. {space.episode_number}</span>
              )}
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-5 mt-4 text-sm">
          <div className="flex flex-col items-center">
            <span className="font-black text-lg">{formatNumber(space.listener_count ?? 0)}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Listeners</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="font-black text-lg">{participants.length}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Participants</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="font-black text-lg">{recordings.length}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Recordings</span>
          </div>
        </div>

        {/* CTA */}
        {space.is_live && (
          <Button onClick={handleJoin} className="w-full mt-4 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white font-bold h-12">
            <Headphones className="w-5 h-5 mr-2" /> Join Live Space
          </Button>
        )}
      </div>

      {/* ── Host card ── */}
      {space.host && (
        <div className="px-4 py-4 border-b border-border">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Host</p>
          <button
            onClick={() => navigate(`/profile/${space.host.username}`)}
            className="flex items-center gap-3 w-full text-left hover:bg-muted/30 rounded-xl p-2 -mx-2 transition-colors"
          >
            <div className="w-12 h-12 rounded-full overflow-hidden bg-muted">
              {space.host.avatar_url
                ? <img src={space.host.avatar_url} alt={space.host.username} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center font-bold">{space.host.username?.[0]?.toUpperCase()}</div>}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold">{space.host.username}</span>
                {space.host.verified && <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(space.started_at), { addSuffix: true })}
              </p>
            </div>
          </button>
        </div>
      )}

      {/* ── Tags ── */}
      {space.tags && space.tags.length > 0 && (
        <div className="flex gap-2 px-4 py-3 border-b border-border overflow-x-auto scrollbar-hide">
          {space.tags.map((tag: string) => (
            <span key={tag} className="flex items-center gap-0.5 px-2.5 py-1 bg-muted rounded-full text-xs font-medium text-muted-foreground whitespace-nowrap">
              <Hash className="w-3 h-3" />{tag}
            </span>
          ))}
        </div>
      )}

      {/* ── AdSense banner ── */}
      <SpaceDetailAdBanner />

      {/* ── Participants ── */}
      {participants.length > 0 && (
        <div className="px-4 py-4 border-b border-border">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Participants ({participants.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {participants.map((p: any) => (
              <button
                key={p.id}
                onClick={() => navigate(`/profile/${p.user_profiles?.username}`)}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/50 rounded-xl border border-border hover:border-primary/30 transition-colors"
              >
                <div className="w-6 h-6 rounded-full overflow-hidden bg-muted">
                  {p.user_profiles?.avatar_url
                    ? <img src={p.user_profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold">{p.user_profiles?.username?.[0]?.toUpperCase()}</div>}
                </div>
                <span className="text-xs font-medium">{p.user_profiles?.username}</span>
                {p.role === 'speaker' && <Mic className="w-3 h-3 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Recordings ── */}
      {recordings.length > 0 && (
        <div className="px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Recordings ({recordings.length})
          </p>
          <div className="space-y-3">
            {recordings.map((rec: any) => (
              <div
                key={rec.id}
                className="flex items-center gap-3 p-3 border border-border rounded-xl hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/space-recording/${rec.id}`)}
              >
                <button
                  onClick={e => { e.stopPropagation(); navigate(`/space-recording/${rec.id}`); }}
                  className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 hover:bg-primary/20 transition-colors"
                >
                  <Play className="w-4 h-4 text-primary ml-0.5" fill="currentColor" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{rec.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {rec.duration > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />{Math.floor(rec.duration / 60)}m
                      </span>
                    )}
                    {rec.listener_count > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Users className="w-3 h-3" />{formatNumber(rec.listener_count)}
                      </span>
                    )}
                    <span>{formatDistanceToNow(new Date(rec.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
                {rec.has_video && <Video className="w-4 h-4 text-primary shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}

      <JoinSpaceDialog
        open={showJoinDialog}
        onOpenChange={setShowJoinDialog}
        spaceId={id ?? null}
      />
    </div>
  );
}
