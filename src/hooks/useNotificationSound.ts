/**
 * useNotificationSound — Web Audio API synthetic sound generator
 * No audio files required. Distinct sounds per event type:
 *   - 'like'     → soft two-tone chime (C5 → E5)
 *   - 'follow'   → rising three-note fanfare (E5 → G5 → B5)
 *   - 'tip'      → warm coin-drop jingle (G5 → E5, resonant)
 *   - 'dm'       → friendly DM ping (A5 → C#6)
 *   - 'group'    → richer group chime (C6 → E6)
 *   - 'comment'  → subtle pop (F5 → A5)
 *   - 'repost'   → double-tap click (A4 × 2)
 * Toggle persisted in localStorage as 'notification_sounds'.
 */

const STORAGE_KEY = 'notification_sounds';

type SoundType = 'dm' | 'group' | 'like' | 'follow' | 'tip' | 'comment' | 'repost';

interface ToneConfig {
  freqs: number[];
  gap: number;       // ms between tones
  duration: number;  // seconds per tone
  volume: number;    // 0–1 peak gain
  type: OscillatorType;
  decay: number;     // exponential decay factor
}

const SOUND_CONFIGS: Record<SoundType, ToneConfig> = {
  // DM — ascending friendly ping (A5 → C#6)
  dm: { freqs: [880, 1109], gap: 120, duration: 0.45, volume: 0.18, type: 'sine', decay: 0.001 },

  // Group — richer pair (C6 → E6)
  group: { freqs: [1046, 1318], gap: 120, duration: 0.45, volume: 0.18, type: 'sine', decay: 0.001 },

  // Like — soft two-note chime (C5 → E5) — very gentle
  like: { freqs: [523, 659], gap: 100, duration: 0.35, volume: 0.12, type: 'sine', decay: 0.001 },

  // Follow — three-note ascending fanfare (E5 → G5 → B5)
  follow: { freqs: [659, 784, 988], gap: 110, duration: 0.4, volume: 0.16, type: 'sine', decay: 0.001 },

  // Tip — warm coin-drop: G5 sharp drop then resonance (G5 → D5)
  tip: { freqs: [784, 587], gap: 80, duration: 0.55, volume: 0.22, type: 'triangle', decay: 0.001 },

  // Comment — pop (F5 → A5)
  comment: { freqs: [698, 880], gap: 90, duration: 0.3, volume: 0.13, type: 'sine', decay: 0.001 },

  // Repost — double click (A4 → A4)
  repost: { freqs: [440, 440], gap: 100, duration: 0.15, volume: 0.10, type: 'square', decay: 0.001 },
};

export function useNotificationSound() {
  const isEnabled = (): boolean =>
    localStorage.getItem(STORAGE_KEY) !== 'false';

  const setEnabled = (val: boolean): void => {
    localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false');
  };

  const play = (type: SoundType = 'dm'): void => {
    if (!isEnabled()) return;
    if (typeof window === 'undefined') return;
    try {
      const ctx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();

      const cfg = SOUND_CONFIGS[type];

      cfg.freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Optional: add subtle reverb via a small convolver for tip/follow
        if (type === 'tip' || type === 'follow') {
          try {
            const reverb = ctx.createDelay(0.05);
            reverb.delayTime.value = 0.04;
            osc.connect(reverb);
            reverb.connect(gain);
          } catch {
            osc.connect(gain);
          }
        } else {
          osc.connect(gain);
        }

        gain.connect(ctx.destination);

        const startAt = ctx.currentTime + (i * cfg.gap) / 1000;
        osc.type = cfg.type;
        osc.frequency.setValueAtTime(freq, startAt);

        // Slight pitch bend for organic feel
        if (type !== 'repost') {
          osc.frequency.exponentialRampToValueAtTime(freq * 0.88, startAt + cfg.duration);
        }

        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(cfg.volume, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(cfg.decay, startAt + cfg.duration);

        osc.start(startAt);
        osc.stop(startAt + cfg.duration + 0.05);
      });
    } catch {
      // AudioContext blocked (no user gesture) or not supported — silent fail
    }
  };

  return { play, isEnabled, setEnabled };
}
