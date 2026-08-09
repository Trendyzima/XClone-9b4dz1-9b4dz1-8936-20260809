import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Play, Pause, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LiveAudioPlayerProps {
  spaceId: string;
  isLive?: boolean;
}

export function LiveAudioPlayer({ spaceId, isLive = false }: LiveAudioPlayerProps) {
  const { toast } = useToast();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [loading, setLoading] = useState(false);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [currentRecording, setCurrentRecording] = useState<any>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchRecordings();
    
    // Poll for new recordings every 10 seconds if live
    if (isLive) {
      const interval = setInterval(fetchRecordings, 10000);
      return () => clearInterval(interval);
    }
  }, [spaceId, isLive]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  const fetchRecordings = async () => {
    try {
      const { data, error } = await supabase
        .from('space_recordings')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      
      if (data && data.length > 0) {
        setRecordings(data);
        if (!currentRecording) {
          setCurrentRecording(data[0]);
        }
      }
    } catch (error: any) {
      console.error('Error fetching recordings:', error);
    }
  };

  const togglePlayback = async () => {
    if (!audioRef.current || !currentRecording) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Error playing audio:', error);
        toast({
          title: 'Playback error',
          description: 'Failed to play audio',
          variant: 'destructive',
        });
      }
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  if (!currentRecording && !isLive) {
    return (
      <div className="border border-border rounded-lg p-4 bg-muted/30 text-center">
        <p className="text-sm text-muted-foreground">No recordings available yet</p>
      </div>
    );
  }

  if (isLive && !currentRecording) {
    return (
      <div className="border border-border rounded-lg p-4 bg-muted/30 text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <p className="text-sm font-semibold">Waiting for broadcast to start...</p>
        </div>
        <p className="text-xs text-muted-foreground">The host will start broadcasting soon</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4 bg-background space-y-3">
      <audio
        ref={audioRef}
        src={currentRecording?.audio_url}
        onEnded={() => setIsPlaying(false)}
        onError={(e) => {
          console.error('Audio error:', e);
          toast({
            title: 'Audio error',
            description: 'Failed to load audio stream',
            variant: 'destructive',
          });
        }}
        className="hidden"
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Button
            onClick={togglePlayback}
            size="icon"
            variant="outline"
            className="rounded-full h-10 w-10"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </Button>
          
          {isLive && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-semibold">LIVE</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <Button
            onClick={toggleMute}
            size="icon"
            variant="ghost"
            className="h-8 w-8"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </Button>
          <input
            type="range"
            value={volume}
            onChange={(e) => setVolume(parseInt(e.target.value))}
            min="0"
            max="100"
            step="1"
            className="w-20 h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {isLive 
          ? 'Listening to live broadcast' 
          : 'Playing recorded audio'}
      </p>
    </div>
  );
}
