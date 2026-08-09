import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { Space } from '@/types';
import { Radio, Users, Mic, Loader2, Headphones, Video, Settings, BadgeCheck, Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { formatNumber } from '@/lib/utils';
import { StartSpaceDialog } from '@/components/features/StartSpaceDialog';
import { JoinSpaceDialog } from '@/components/features/JoinSpaceDialog';
import { ManageSpaceDialog } from '@/components/features/ManageSpaceDialog';
import { toast } from 'sonner';

export default function SpacesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'recordings'>('live');
  const [allRecordings, setAllRecordings] = useState<any[]>([]);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    fetchSpaces();
    fetchAllRecordings();
    if (user) fetchUserProfile();
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('verified, subscriber_count, followers_count')
      .eq('id', user.id)
      .single();
    if (data) setUserProfile(data);
  };

  const fetchSpaces = async () => {
    try {
      const { data, error } = await supabase
        .from('spaces')
        .select('*, host:user_profiles!spaces_host_id_fkey(*)')
        .eq('is_live', true)
        .order('listener_count', { ascending: false });
      if (error) throw error;
      setSpaces(data || []);
    } catch { } finally {
      setLoading(false);
    }
  };

  const fetchAllRecordings = async () => {
    const { data } = await supabase
      .from('space_recordings')
      .select('*, user_profiles(*), spaces(title, description, host:user_profiles!spaces_host_id_fkey(*))')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setAllRecordings(data);
  };

  const handleStartSpace = () => {
    if (!user) { navigate('/auth'); return; }
    // Only verified users can start spaces
    if (!userProfile?.verified) {
      toast.error('Only verified users can start Audio Spaces', {
        description: 'Get your account verified to host live spaces.',
      });
      return;
    }
    setShowStartDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Spaces" />

      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Audio Spaces</h2>
            <p className="text-sm text-muted-foreground">Live conversations & recordings</p>
          </div>
          {user && (
            <Button className="rounded-full" size="lg" onClick={handleStartSpace}>
              <Radio className="w-5 h-5 mr-2" />
              Start Space
            </Button>
          )}
        </div>

        {/* Verified badge info */}
        {user && !userProfile?.verified && (
          <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl mb-4">
            <Lock className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                Verified accounts only
              </p>
              <p className="text-xs text-orange-600 dark:text-orange-500">
                Get verified to host live audio spaces and video streams
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="sticky top-14 z-30 bg-background border-b border-border mb-4">
          <div className="flex">
            <button
              onClick={() => setActiveTab('live')}
              className={`flex-1 py-3 font-semibold text-sm border-b-2 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'live' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
              }`}
            >
              <Radio className="w-4 h-4" /> Live Now
            </button>
            <button
              onClick={() => setActiveTab('recordings')}
              className={`flex-1 py-3 font-semibold text-sm border-b-2 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'recordings' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
              }`}
            >
              <Headphones className="w-4 h-4" /> Recordings
            </button>
          </div>
        </div>

        {activeTab === 'live' && (
          spaces.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Radio className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">No live Spaces</h3>
              <p className="text-muted-foreground text-sm mb-6">Check back later for live conversations</p>
              {user && userProfile?.verified && (
                <Button className="rounded-full" onClick={handleStartSpace}>
                  <Radio className="w-4 h-4 mr-2" />
                  Be the first to start a Space
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {spaces.map(space => (
                <div key={space.id} className="border border-border rounded-2xl p-5 hover:bg-muted/5 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5 text-red-500 font-bold">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-live-pulse" />
                        LIVE
                      </span>
                      <span>·</span>
                      <Users className="w-4 h-4" />
                      <span>{formatNumber(space.listener_count)} listening</span>
                      {space.has_video && (
                        <>
                          <span>·</span>
                          <Video className="w-4 h-4 text-primary" />
                          <span className="text-primary">Video</span>
                        </>
                      )}
                    </div>
                    {user?.id === space.host_id && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedSpace(space);
                          setShowManageDialog(true);
                        }}
                        className="p-2 hover:bg-muted rounded-lg"
                      >
                        <Settings className="w-4 h-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  <h3 className="text-lg font-bold mb-2">{space.title}</h3>
                  {space.description && <p className="text-sm text-muted-foreground mb-3">{space.description}</p>}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-muted overflow-hidden">
                        {space.host?.avatar_url ? (
                          <img src={space.host.avatar_url} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                            {space.host?.username?.[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="font-semibold text-sm">{space.host?.username}</p>
                          {space.host?.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground">Host · Verified</p>
                      </div>
                    </div>
                    <Button
                      className="rounded-full"
                      onClick={() => {
                        setSelectedSpaceId(space.id);
                        setShowJoinDialog(true);
                      }}
                    >
                      <Mic className="w-4 h-4 mr-2" />
                      Join
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'recordings' && (
          allRecordings.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Headphones className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-2">No recordings yet</h3>
              <p className="text-muted-foreground text-sm">Recorded spaces will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allRecordings.map(recording => (
                <div key={recording.id} className="border border-border rounded-xl p-4 hover:bg-muted/5 transition-colors">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                      {recording.user_profiles?.avatar_url ? (
                        <img src={recording.user_profiles.avatar_url} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold">
                          {recording.user_profiles?.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm">{recording.spaces?.title}</h4>
                      <p className="text-xs text-muted-foreground">
                        by @{recording.user_profiles?.username} · {formatDistanceToNow(new Date(recording.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <audio controls src={recording.audio_url} className="w-full" controlsList="nodownload" />
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <StartSpaceDialog
        open={showStartDialog}
        onOpenChange={setShowStartDialog}
        onSuccess={fetchSpaces}
      />
      <JoinSpaceDialog
        open={showJoinDialog}
        onOpenChange={setShowJoinDialog}
        spaceId={selectedSpaceId}
      />
      {selectedSpace && (
        <ManageSpaceDialog
          open={showManageDialog}
          onOpenChange={setShowManageDialog}
          space={selectedSpace}
          onSuccess={() => { fetchSpaces(); fetchAllRecordings(); }}
        />
      )}
    </div>
  );
}
