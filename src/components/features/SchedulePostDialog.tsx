import { useState } from 'react';
import { X, Calendar, Clock, Zap, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface SchedulePostDialogProps {
  onClose: () => void;
  onSchedule: (date: Date) => void;
}

// esbuild guard: module-level time suggestions — no inline objects in render
const TIME_SUGGESTIONS = [
  { label: 'Morning',    time: '07:00', reach: '~80%', peak: true,  emoji: '🌅', desc: 'High reach' },
  { label: 'Lunch',      time: '12:30', reach: '~85%', peak: true,  emoji: '☀️',  desc: 'Peak hour' },
  { label: 'Evening',    time: '19:00', reach: '~90%', peak: true,  emoji: '🌆', desc: 'Top reach'  },
];

export function SchedulePostDialog({ onClose, onSchedule }: SchedulePostDialogProps) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const handleSchedule = () => {
    if (!date || !time) {
      toast.error('Please select both date and time');
      return;
    }

    const scheduledDateTime = new Date(`${date}T${time}`);
    const now = new Date();

    if (scheduledDateTime <= now) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    onSchedule(scheduledDateTime);
  };

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  const applyTimeSuggestion = (suggestedTime: string) => {
    setTime(suggestedTime);
    if (!date) setDate(today);
    toast.success(`Time set to ${suggestedTime}`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-2xl max-w-md w-full shadow-2xl">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Schedule Post</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* ── Optimal Time Suggestions ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Optimal posting times</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TIME_SUGGESTIONS.map(s => (
                <button
                  key={s.time}
                  onClick={() => applyTimeSuggestion(s.time)}
                  className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 transition-all hover:scale-[1.03] active:scale-[0.97] ${
                    time === s.time
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  <span className="text-base leading-none">{s.emoji}</span>
                  <span className="text-xs font-bold">{s.time}</span>
                  <span className="text-[10px] text-muted-foreground">{s.label}</span>
                  <span className={`flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    time === s.time
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-green-500/10 text-green-600'
                  }`}>
                    <Zap className="w-2 h-2" />{s.reach}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              Based on peak engagement hours · Tap to apply
            </p>
          </div>

          {/* ── Date picker ── */}
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={today}
              className="w-full px-3 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-background text-sm"
            />
          </div>

          {/* ── Time picker ── */}
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Time
              {time && (
                <span className="ml-auto text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                  {time === '07:00' ? '🌅 Morning peak'
                    : time === '12:30' ? '☀️ Lunch peak'
                    : time === '19:00' ? '🌆 Evening peak'
                    : '⏰ Custom'}
                </span>
              )}
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-background text-sm"
            />
          </div>

          <div className="bg-muted/40 border border-border rounded-xl p-3 text-xs text-muted-foreground">
            Your post will be published at the scheduled time. Manage all scheduled posts in your profile.
          </div>

          <button
            onClick={handleSchedule}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Schedule Post
          </button>
        </div>
      </div>
    </div>
  );
}
