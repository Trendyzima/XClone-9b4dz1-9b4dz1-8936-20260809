import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  Play, Pause, Volume2, VolumeX, Download, Share2,
  Loader2, Users, Clock, ChevronRight, Radio, Bookmark,
  BookmarkCheck
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';

interface Chapter {
  time: number;   // seconds
  label: string;
}

export default function SpaceRecordingViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [recording, setRecording] = useState<any>(null);
  const [space, setSpace] = useState<any>(null);
  const [host, setHost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [otherRecordings, setOtherRecordings] = useState<any[]>([]);

  // Audio player state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [buffered, setBuffered] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [activeChapter, setActiveChapter] = useState<number>(-1);

  // Parse transcript for chapters (lines starting with [00:00])
  const chapters: Chapter[] = [];
  if (recording?.transcript) {
    const lines = recording.transcript.split('\n');
    for (const line of lines) {
      const m = line.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.+)/);
      if (m) {
        const mins = parseInt(m[1]);
        const secs = parseInt(m[2]);
        const extraSecs = m[3] ? parseInt(m[3]) : 0;
        const totalSecs = m[3] ? (mins * 3600 + secs * 60 + extraSecs) : (mins * 60 + secs);
        chapters.push({ time: totalSecs, label: m[4].trim() });
      }
    }
  }

  useEffect(() => {
    if (id) fetchRecording();
  }, [id]);

  const fetchRecording = async () => {
    setLoading(true);
    const { data: rec, error } = await supabase
      .from('space_recordings')
      .select('*, user_profiles:user_id(username, avatar_url, verified), spaces:space_id(title, description, listener_count, is_archived)')
      .eq('id', id!)
      .single();

    if (error || !rec) {
      toast.error('Recording not found');
      navigate('/spaces');
      return;
    }

    setRecording(rec);
    setSpace(rec.spaces);
    setHost(rec.user_profiles);

    // Fetch other recordings from same space
    const { data: others } = await supabase
      .from('space_recordings')
      .select('id, title, duration, listener_count, created_at')
      .eq('space_id', rec.space_id)
      .neq('id', id!)
      .limit(5);
    setOtherRecordings(others ?? []);

    setLoading(false);
  };

  // Audio event wiring
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Update buffered progress
      if (audio.buffered.length > 0) {
        setBuffered((audio.buffered.end(audio.buffered.length - 1) / audio.duration) * 100);
      }
      // Update active chapter
      if (chapters.length > 0) {
        let ci = -1;
        for (let i = 0; i < chapters.length; i++) {
          if (audio.currentTime >= chapters[i].time) ci = i;
          else break;
        }
        setActiveChapter(ci);
      }
    };
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [recording, chapters.length]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play().catch(() => toast.error('Cannot play audio'));
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || !audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * duration;
  };

  const seekToChapter = (time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    audioRef.current.play().catch(() => {});
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !muted;
    setMuted(m => !m);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.volume = v;
    setVolume(v);
    if (v === 0) setMuted(true);
    else setMuted(false);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: recording?.title, url });
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied!');
    }
  };

  const fmtTime = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // Generate waveform bars (deterministic from id seed)
  const waveformBars = Array.from({ length: 60 }, (_, i) => {
    const seed = (id?.charCodeAt(i % id.length) ?? 50) + i * 13;
    return 20 + (seed % 70); // height between 20-90%
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <TopBar title="Space Recording" showBack />

      {/* Hidden audio element */}
      {recording?.audio_url && (
        <audio ref={audioRef} src={recording.audio_url} preload="metadata" />
      )}

      {/* Hero section */}
      <div className="relative bg-gradient-to-br from-purple-600/15 via-violet-600/10 to-cyan-600/10 border-b border-border px-5 pt-6 pb-8">
        {/* Radio icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-violet-600 flex items-center justify-center mb-4 shadow-lg shadow-purple-500/25">
          <Radio className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-2xl font-black leading-snug mb-2">{recording?.title}</h1>

        {/* Space info */}
        {space?.title && (
          <p className="text-sm text-muted-foreground mb-3">
            From space: <span className="font-semibold text-foreground">{space.title}</span>
          </p>
        )}

        {/* Host row */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-full bg-muted overflow-hidden shrink-0">
            {host?.avatar_url
              ? <img src={host.avatar_url} alt={host?.username} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center font-bold text-xs">{host?.username?.[0]?.toUpperCase()}</div>
            }
          </div>
          <button
            onClick={() => navigate(`/profile/${host?.username}`)}
            className="text-sm font-semibold hover:text-primary transition-colors"
          >
            @{host?.username}
          </button>
          <span className="text-muted-foreground text-xs">· Host</span>
        </div>

        {/* Meta badges */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {fmtTime(recording?.duration ?? 0)}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {formatNumber(recording?.listener_count ?? 0)} listeners
          </span>
          {recording?.created_at && (
            <span>{format(new Date(recording.created_at), 'MMM d, yyyy')}</span>
          )}
          {recording?.has_video && (
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">Has Video</span>
          )}
        </div>
      </div>

      {/* ── Player card ── */}
      <div className="mx-4 mt-4 bg-card border border-border rounded-3xl p-5 shadow-sm">

        {/* Waveform visualizer */}
        <div
          className="relative h-16 mb-4 cursor-pointer rounded-xl overflow-hidden bg-muted/30"
          onClick={seekTo}
        >
          {/* Buffered bar */}
          <div
            className="absolute inset-y-0 left-0 bg-muted/50 transition-all duration-300"
            style={{ width: `${buffered}%` }}
          />
          {/* Progress overlay */}
          <div
            className="absolute inset-y-0 left-0 bg-primary/15 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
          {/* Waveform bars */}
          <div className="absolute inset-0 flex items-center justify-between px-1 gap-[1px]">
            {waveformBars.map((h, i) => {
              const barPct = ((i + 0.5) / waveformBars.length) * 100;
              const played = barPct <= progress;
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-full transition-colors duration-75 ${
                    played ? 'bg-primary' : 'bg-muted-foreground/25'
                  }`}
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
          {/* Playhead scrubber */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary rounded-full shadow pointer-events-none"
            style={{ left: `${progress}%` }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary shadow-md" />
          </div>
        </div>

        {/* Time row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground font-mono mb-4">
          <span>{fmtTime(currentTime)}</span>
          <span>{fmtTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-3">
          {/* Rewind 15s */}
          <button
            onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, currentTime - 15); }}
            className="flex flex-col items-center gap-0.5 p-2 rounded-xl hover:bg-muted transition-colors"
            title="Rewind 15s"
          >
            <span className="text-lg">⏮</span>
            <span className="text-[9px] text-muted-foreground">15s</span>
          </button>

          {/* Play/Pause main button */}
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 hover:opacity-90 transition-opacity active:scale-95"
          >
            {playing
              ? <Pause className="w-7 h-7 fill-current" />
              : <Play className="w-7 h-7 fill-current ml-0.5" />
            }
          </button>

          {/* Forward 30s */}
          <button
            onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration, currentTime + 30); }}
            className="flex flex-col items-center gap-0.5 p-2 rounded-xl hover:bg-muted transition-colors"
            title="Forward 30s"
          >
            <span className="text-lg">⏭</span>
            <span className="text-[9px] text-muted-foreground">30s</span>
          </button>

          {/* Volume */}
          <div className="flex items-center gap-1.5 flex-1 max-w-[100px]">
            <button onClick={toggleMute} className="shrink-0 text-muted-foreground hover:text-foreground">
              {muted || volume === 0
                ? <VolumeX className="w-4 h-4" />
                : <Volume2 className="w-4 h-4" />
              }
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="flex-1 h-1 accent-primary cursor-pointer"
            />
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-border">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border hover:bg-muted text-sm font-medium transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
          {recording?.audio_url && (
            <a
              href={recording.audio_url}
              download
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border hover:bg-muted text-sm font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          )}
          <button
            onClick={() => { setBookmarked(b => !b); toast.success(bookmarked ? 'Removed from bookmarks' : 'Bookmarked!'); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
              bookmarked ? 'border-primary/30 bg-primary/8 text-primary' : 'border-border hover:bg-muted'
            }`}
          >
            {bookmarked ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
            {bookmarked ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Chapter markers ── */}
      {chapters.length > 0 && (
        <div className="mx-4 mt-4 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <h2 className="font-bold text-sm">Chapters</h2>
            <span className="text-xs text-muted-foreground">{chapters.length} sections</span>
          </div>
          <div className="divide-y divide-border">
            {chapters.map((ch, i) => {
              const isActive = activeChapter === i;
              return (
                <button
                  key={i}
                  onClick={() => seekToChapter(ch.time)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors ${
                    isActive ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {isActive ? <Play className="w-3.5 h-3.5 fill-current" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-primary' : ''}`}>{ch.label}</p>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono shrink-0">{fmtTime(ch.time)}</span>
                  <ChevronRight className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Transcript (if no chapters) ── */}
      {recording?.transcript && chapters.length === 0 && (
        <div className="mx-4 mt-4 bg-card border border-border rounded-2xl p-4">
          <h2 className="font-bold text-sm mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500" />
            Transcript
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{recording.transcript}</p>
        </div>
      )}

      {/* ── Other recordings from this space ── */}
      {otherRecordings.length > 0 && (
        <div className="mx-4 mt-4 mb-4 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <h2 className="font-bold text-sm">More from this Space</h2>
          </div>
          <div className="divide-y divide-border">
            {otherRecordings.map(r => (
              <button
                key={r.id}
                onClick={() => navigate(`/space-recording/${r.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                  <Radio className="w-5 h-5 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{r.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{fmtTime(r.duration ?? 0)}</span>
                    <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{formatNumber(r.listener_count ?? 0)}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
