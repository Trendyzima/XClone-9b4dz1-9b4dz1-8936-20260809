/**
 * useNotificationSound — Web Audio API synthetic chime generator
 * No audio files required. Plays a two-tone chime on new messages.
 * Toggle persisted in localStorage as 'notification_sounds'.
 */

const STORAGE_KEY = 'notification_sounds';

export function useNotificationSound() {
  const isEnabled = (): boolean =>
    localStorage.getItem(STORAGE_KEY) !== 'false';

  const setEnabled = (val: boolean): void => {
    localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false');
  };

  const play = (type: 'dm' | 'group' = 'dm'): void => {
    if (!isEnabled()) return;
    if (typeof window === 'undefined') return;
    try {
      const ctx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();

      // Two-tone ascending chime
      const freqs =
        type === 'dm'
          ? [880, 1100]   // A5 → C#6 — friendly DM ping
          : [1046, 1318]; // C6 → E6  — slightly richer for groups

      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const startAt = ctx.currentTime + i * 0.12;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startAt);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.85, startAt + 0.2);

        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(0.18, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.45);

        osc.start(startAt);
        osc.stop(startAt + 0.5);
      });
    } catch {
      // AudioContext blocked (no user gesture) or not supported — silent fail
    }
  };

  return { play, isEnabled, setEnabled };
}
