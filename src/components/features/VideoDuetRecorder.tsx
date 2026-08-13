import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Video, Loader2, Check, AlertCircle, Layers, Mic, MicOff, Play, Square } from 'lucide-react';
import { toast } from 'sonner';

interface VideoDuetRecorderProps {
  originalVideoUrl: string;
  duetMeta?: string;
  onDuetReady: (file: File, mergedPreviewUrl: string) => void;
  onClose: () => void;
}

type RecordState = 'idle' | 'countdown' | 'recording' | 'preview' | 'done';

const COUNTDOWN_SECS = 3;

export function VideoDuetRecorder({ originalVideoUrl, duetMeta, onDuetReady, onClose }: VideoDuetRecorderProps) {
  const [state, setState] = useState<RecordState>('idle');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);
  const [elapsed, setElapsed] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reactUrl, setReactUrl] = useState<string | null>(null); // recorded reaction blob URL
  const [reactFile, setReactFile] = useState<File | null>(null);

  const origVideoRef = useRef<HTMLVideoElement>(null);
  const reactVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Max recording duration: 60s
  const MAX_DURATION = 60;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  const startCountdown = useCallback(async () => {
    setErrorMsg(null);
    // Request camera + mic
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: micEnabled,
      });
      streamRef.current = stream;
      if (reactVideoRef.current) {
        reactVideoRef.current.srcObject = stream;
        reactVideoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      setErrorMsg('Camera/mic access denied. Please allow camera access to record a duet.');
      return;
    }

    setState('countdown');
    setCountdown(COUNTDOWN_SECS);

    // Play original video from start
    if (origVideoRef.current) {
      origVideoRef.current.currentTime = 0;
      origVideoRef.current.muted = true;
    }

    let c = COUNTDOWN_SECS;
    countdownTimerRef.current = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c <= 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        startRecording();
      }
    }, 1000);
  }, [micEnabled]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4';

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const file = new File([blob], `duet-${Date.now()}.webm`, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setReactUrl(url);
      setReactFile(file);
      setState('preview');

      // Stop camera stream
      stream.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };

    recorder.start(100);
    setState('recording');
    setElapsed(0);

    // Play original video at the same time
    if (origVideoRef.current) {
      origVideoRef.current.currentTime = 0;
      origVideoRef.current.muted = true;
      origVideoRef.current.play().catch(() => {});
    }

    // Track elapsed time and enforce max duration
    let e = 0;
    elapsedTimerRef.current = setInterval(() => {
      e += 1;
      setElapsed(e);
      if (e >= MAX_DURATION) stopRecording();
    }, 1000);
  }, []);

  const stopRecording = useCallback(() => {
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    if (origVideoRef.current) origVideoRef.current.pause();
    recorderRef.current?.stop();
  }, []);

  const handleAccept = () => {
    if (!reactFile || !reactUrl) return;
    onDuetReady(reactFile, reactUrl);
    onClose();
    toast.success('Duet recorded! Add your caption and post.');
  };

  const handleRetake = () => {
    if (reactUrl) URL.revokeObjectURL(reactUrl);
    setReactUrl(null);
    setReactFile(null);
    setElapsed(0);
    setState('idle');
  };

  const toggleMic = () => {
    setMicEnabled(v => {
      const next = !v;
      streamRef.current?.getAudioTracks().forEach(t => { t.enabled = next; });
      return next;
    });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-[350] bg-black/95 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-20">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5 border border-white/20">
          <Layers className="w-4 h-4 text-sky-400" />
          <span className="text-white text-sm font-bold">Duet / Stitch</span>
        </div>
        <button onClick={toggleMic} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${micEnabled ? 'bg-white/10 text-white' : 'bg-red-500/30 text-red-400'}`}>
          {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>
      </div>

      {/* Duet meta label */}
      {duetMeta && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-sky-500/20 border border-sky-400/30 rounded-full px-3 py-1">
          <p className="text-sky-300 text-xs font-semibold">{duetMeta}</p>
        </div>
      )}

      {/* Error state */}
      {errorMsg && (
        <div className="w-full max-w-sm bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-white font-bold mb-1">Camera Access Required</p>
          <p className="text-white/60 text-sm mb-4">{errorMsg}</p>
          <button onClick={onClose} className="px-6 py-2.5 bg-white/10 text-white rounded-full text-sm font-semibold hover:bg-white/20">Close</button>
        </div>
      )}

      {/* Main duet layout: side-by-side */}
      {!errorMsg && (
        <div className="w-full max-w-sm relative">
          {/* Side-by-side video panels */}
          <div className="flex gap-1 rounded-2xl overflow-hidden" style={{ aspectRatio: '9/8' }}>
            {/* Left: original video */}
            <div className="relative flex-1 bg-zinc-900 flex items-center justify-center overflow-hidden">
              <video
                ref={origVideoRef}
                src={originalVideoUrl}
                muted
                loop
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 bg-black/60 rounded-full px-2 py-0.5">
                <span className="text-white text-[10px] font-bold">Original</span>
              </div>
            </div>

            {/* Right: reaction camera / recorded preview */}
            <div className="relative flex-1 bg-zinc-800 flex items-center justify-center overflow-hidden">
              {state === 'preview' && reactUrl ? (
                <video
                  ref={previewVideoRef}
                  src={reactUrl}
                  autoPlay
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  ref={reactVideoRef}
                  muted
                  playsInline
                  autoPlay
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }} // mirror for selfie
                />
              )}
              <div className="absolute top-2 left-2 bg-black/60 rounded-full px-2 py-0.5">
                <span className="text-white text-[10px] font-bold">{state === 'preview' ? 'Your Duet' : 'You'}</span>
              </div>
              {state === 'idle' && !reactUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                  <Video className="w-8 h-8 text-white/40 mb-1" />
                  <span className="text-white/50 text-xs">Camera preview</span>
                </div>
              )}
            </div>
          </div>

          {/* Countdown overlay */}
          {state === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="w-24 h-24 rounded-full bg-black/70 border-4 border-white/40 flex items-center justify-center">
                <span className="text-white text-5xl font-black">{countdown}</span>
              </div>
            </div>
          )}

          {/* Recording indicator */}
          {state === 'recording' && (
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-red-600 rounded-full px-3 py-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              <span className="text-white text-xs font-black">{formatTime(elapsed)}</span>
              <span className="text-white/60 text-[10px]">/ {formatTime(MAX_DURATION)}</span>
            </div>
          )}

          {/* Progress bar (recording) */}
          {state === 'recording' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${(elapsed / MAX_DURATION) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      {!errorMsg && (
        <div className="mt-6 flex items-center justify-center gap-5">
          {state === 'idle' && (
            <button
              onClick={startCountdown}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-red-500/30">
                <Play className="w-7 h-7 text-white fill-white ml-1" />
              </div>
              <span className="text-white/60 text-xs font-semibold">Start Duet</span>
            </button>
          )}

          {state === 'countdown' && (
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-16 h-16 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
              <span className="text-white/60 text-xs font-semibold">Get ready…</span>
            </div>
          )}

          {state === 'recording' && (
            <button
              onClick={stopRecording}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="w-16 h-16 rounded-full bg-white/10 border-4 border-white hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center">
                <Square className="w-7 h-7 text-white fill-white" />
              </div>
              <span className="text-white/60 text-xs font-semibold">Stop</span>
            </button>
          )}

          {state === 'preview' && (
            <>
              <button
                onClick={handleRetake}
                className="flex flex-col items-center gap-1.5"
              >
                <div className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center border border-white/20">
                  <Video className="w-5 h-5 text-white" />
                </div>
                <span className="text-white/50 text-xs font-semibold">Retake</span>
              </button>
              <button
                onClick={handleAccept}
                className="flex flex-col items-center gap-1.5"
              >
                <div className="w-16 h-16 rounded-full bg-sky-500 hover:bg-sky-400 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-sky-500/30">
                  <Check className="w-7 h-7 text-white" />
                </div>
                <span className="text-sky-300 text-xs font-bold">Use Duet</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Tips */}
      {state === 'idle' && !errorMsg && (
        <div className="mt-4 text-center space-y-1">
          <p className="text-white/40 text-xs">Both videos appear side-by-side</p>
          <p className="text-white/30 text-[11px]">Max {MAX_DURATION}s · Mic {micEnabled ? 'on' : 'off'}</p>
        </div>
      )}
    </div>
  );
}
