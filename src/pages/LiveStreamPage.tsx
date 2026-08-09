import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Eye, Heart, MessageCircle, Share2, Loader2, Send,
  Users, BadgeCheck, Radio, ThumbsUp, Maximize2, Volume2, VolumeX
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { AdMob, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import { ADMOB_CONFIG } from '@/lib/admob';

interface StreamMessage {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  user_profiles?: { username: string; avatar_url?: string; verified?: boolean };
}

export default function LiveStreamPage() {
  const { streamId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stream, setStream] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [heartCount, setHeartCount] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const chatRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // AdMob banner on native
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    AdMob.showBanner({
      adId: ADMOB_CONFIG.BANNER_FEED,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.TOP_CENTER,
      margin: 0,
      isTesting: false,
    });
    return () => { AdMob.hideBanner(); };
  }, []);

  useEffect(() => {
    if (!streamId) return;
    fetchStream();
    joinStream();
    fetchMessages();

    pollRef.current = setInterval(() => {
      fetchMessages();
      fetchViewerCount();
    }, 3000);

    return () => {
      leaveStream();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [streamId]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchStream = async () => {
    try {
      const { data, error } = await supabase
        .from('live_streams')
        .select('*, user:user_profiles(*)')
        .eq('id', streamId)
        .single();
      if (error) throw error;
      setStream(data);
      setViewerCount(data.viewer_count || 0);
    } catch {
      toast.error('Stream not found');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchViewerCount = async () => {
    const { count } = await supabase
      .from('stream_viewers')
      .select('*', { count: 'exact', head: true })
      .eq('stream_id', streamId);
    if (count !== null) setViewerCount(count);
  };

  const joinStream = async () => {
    try {
      await supabase.from('stream_viewers').upsert({
        stream_id: streamId,
        user_id: user?.id || null,
        joined_at: new Date().toISOString(),
      }, { onConflict: 'stream_id,user_id' });
    } catch {}
  };

  const leaveStream = async () => {
    if (!user) return;
    try {
      await supabase.from('stream_viewers')
        .delete()
        .match({ stream_id: streamId, user_id: user.id });
    } catch {}
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('stream_chat')
      .select('*, user_profiles(username, avatar_url, verified)')
      .eq('stream_id', streamId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (data) setMessages(data);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { navigate('/auth'); return; }
    if (!newMessage.trim()) return;

    try {
      await supabase.from('stream_chat').insert({
        stream_id: streamId,
        user_id: user.id,
        message: newMessage.trim(),
      });
      setNewMessage('');
      fetchMessages();
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handleHeart = () => {
    setHeartCount(c => c + 1);
    // Floating heart animation
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-4">
        <Radio className="w-16 h-16 opacity-40" />
        <p className="text-xl font-semibold">Stream not found</p>
        <Button variant="outline" onClick={() => navigate('/')}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Stream area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden h-screen">
        {/* Video Player */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[40vh] md:min-h-0">
          {stream.stream_url ? (
            <video
              ref={videoRef}
              src={stream.stream_url}
              controls
              autoPlay
              muted={muted}
              playsInline
              className="w-full h-full object-contain max-h-screen"
            />
          ) : (
            /* Placeholder when no stream URL yet */
            <div className="text-center p-8">
              <div className={`w-28 h-28 mx-auto rounded-full flex items-center justify-center mb-4 ${
                stream.is_live ? 'bg-red-600 animate-pulse' : 'bg-muted/30'
              }`}>
                <Eye className="w-14 h-14" />
              </div>
              <h3 className="text-2xl font-bold mb-2">{stream.title}</h3>
              <p className="text-gray-400 text-sm">
                {stream.is_live ? 'Stream is live — video feed starting...' : 'Stream has ended'}
              </p>
            </div>
          )}

          {/* Top overlay — stream info */}
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                >
                  ←
                </button>
                {/* Streamer info */}
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => navigate(`/profile/${stream.user?.username}`)}
                >
                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden ring-2 ring-red-500">
                    {stream.user?.avatar_url ? (
                      <img src={stream.user.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold">
                        {stream.user?.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <p className="font-bold text-sm">{stream.user?.username}</p>
                      {stream.user?.verified && <BadgeCheck className="w-4 h-4 text-blue-400" />}
                    </div>
                    <p className="text-xs text-gray-300 truncate max-w-[140px]">{stream.title}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {stream.is_live && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-600 rounded-full text-xs font-bold">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-live-pulse" />
                    LIVE
                  </div>
                )}
                <div className="flex items-center gap-1 px-2.5 py-1 bg-black/50 rounded-full text-xs">
                  <Users className="w-3.5 h-3.5" />
                  {formatNumber(viewerCount)}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom overlay — actions */}
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
            {/* Stream description */}
            {stream.description && (
              <div className="flex-1 mr-4 max-w-xs">
                <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-2">
                  <p className="text-xs text-gray-200 line-clamp-2">{stream.description}</p>
                  {stream.category && (
                    <span className="text-xs text-primary mt-0.5 inline-block">#{stream.category}</span>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={handleHeart}
                className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-red-500/30 transition-colors active:scale-90"
              >
                <Heart className="w-6 h-6 text-red-400" />
              </button>
              {heartCount > 0 && (
                <span className="text-xs text-red-400 font-bold">{formatNumber(heartCount)}</span>
              )}
              <button
                onClick={() => setMuted(m => !m)}
                className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                {muted ? <VolumeX className="w-6 h-6 text-gray-300" /> : <Volume2 className="w-6 h-6 text-gray-300" />}
              </button>
              <button
                onClick={() => setShowChat(c => !c)}
                className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <MessageCircle className={`w-6 h-6 ${showChat ? 'text-primary' : 'text-gray-300'}`} />
              </button>
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: stream.title, url: window.location.href });
                  } else {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success('Link copied!');
                  }
                }}
                className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <Share2 className="w-6 h-6 text-gray-300" />
              </button>
            </div>
          </div>
        </div>

        {/* Live Chat Panel */}
        {showChat && (
          <div className="w-full md:w-96 bg-background text-foreground flex flex-col border-l border-border"
            style={{ height: 'min(400px, 45vh)', maxHeight: '100vh' }}
          >
            {/* Chat header */}
            <div className="p-3 border-b border-border flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-sm">Live Chat</h3>
                <span className="text-xs text-muted-foreground">({messages.length})</span>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="text-muted-foreground hover:text-foreground text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Messages */}
            <div ref={chatRef} className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <p className="text-sm font-medium">No messages yet</p>
                  <p className="text-xs mt-1">Be the first to say hi! 👋</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-2 animate-slide-in">
                    <div className="w-7 h-7 rounded-full bg-muted overflow-hidden flex-shrink-0">
                      {msg.user_profiles?.avatar_url ? (
                        <img src={msg.user_profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold">
                          {msg.user_profiles?.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-primary">
                        {msg.user_profiles?.username}
                        {msg.user_profiles?.verified && ' ✓'}
                      </span>
                      {' '}
                      <span className="text-xs text-foreground break-words">{msg.message}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Message input */}
            <form onSubmit={sendMessage} className="p-3 border-t border-border flex-shrink-0">
              {user ? (
                <div className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Say something..."
                    maxLength={200}
                    className="flex-1 h-9 text-sm"
                  />
                  <Button type="submit" size="sm" disabled={!newMessage.trim()} className="px-3">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => navigate('/auth')}
                  className="w-full py-2 text-sm text-center text-primary font-medium border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
                >
                  Sign in to chat
                </button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
