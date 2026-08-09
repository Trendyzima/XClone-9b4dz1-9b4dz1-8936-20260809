import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Clock, Trash2, CheckCircle, XCircle,
  Image as ImageIcon, Video, FileText, Edit3, Loader2,
  ChevronLeft, ChevronRight, AlarmClock,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import { TopBar } from '@/components/layout/TopBar';

// ── Countdown helper ─────────────────────────────────────────────────────────
function getCountdown(scheduledFor: string): { label: string; urgent: boolean } {
  const target = new Date(scheduledFor);
  const now = new Date();
  if (target <= now) return { label: 'Due now', urgent: true };

  const mins  = differenceInMinutes(target, now);
  const hours = differenceInHours(target, now);
  const days  = differenceInDays(target, now);

  if (mins < 60)  return { label: `in ${mins}m`, urgent: mins < 15 };
  if (hours < 24) return { label: `in ${hours}h ${mins % 60}m`, urgent: hours < 1 };
  return { label: `in ${days}d ${hours % 24}h`, urgent: false };
}

// ── Live clock to keep countdowns fresh ──────────────────────────────────────
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}

export function ScheduledPostsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow(); // refreshes every 30s — triggers re-render of countdowns
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<'pending' | 'published' | 'failed'>('pending');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    fetchScheduledPosts();
  }, [user]);

  const fetchScheduledPosts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('user_id', user.id)
      .order('scheduled_for', { ascending: true });
    if (error) { toast.error(error.message); }
    else { setPosts(data || []); }
    setLoading(false);
  }, [user]);

  const deleteScheduledPost = async (postId: string) => {
    if (!confirm('Cancel this scheduled post?')) return;
    setDeletingId(postId);
    const { error } = await supabase
      .from('scheduled_posts')
      .delete()
      .eq('id', postId);
    if (error) toast.error(error.message);
    else { toast.success('Scheduled post cancelled'); setPosts(p => p.filter(x => x.id !== postId)); }
    setDeletingId(null);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'pending':   return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'published': return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
      case 'failed':    return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      default:          return 'bg-muted text-muted-foreground border-border';
    }
  };

  const tabs: { id: typeof previewTab; label: string }[] = [
    { id: 'pending',   label: 'Pending'   },
    { id: 'published', label: 'Published' },
    { id: 'failed',    label: 'Failed'    },
  ];

  const filtered = posts.filter(p => p.status === previewTab);
  const pendingCount = posts.filter(p => p.status === 'pending').length;

  // Build calendar day → posts map for mini-calendar
  const calDays = (() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const map: Record<number, number> = {};
    posts
      .filter(p => p.status === 'pending')
      .forEach(p => {
        const d = new Date(p.scheduled_for);
        if (d.getFullYear() === year && d.getMonth() === month) {
          map[d.getDate()] = (map[d.getDate()] || 0) + 1;
        }
      });
    return { year, month, firstDay, daysInMonth, map };
  })();

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <TopBar title="Scheduled Posts" showBack />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Scheduled Posts" showBack />

      {/* ── Mini Calendar Preview ── */}
      <div className="px-4 pt-4 pb-3 bg-gradient-to-br from-blue-500/8 to-indigo-500/5 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-sm">
            {calendarMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {/* Day labels */}
        <div className="grid grid-cols-7 mb-1">
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-bold text-muted-foreground py-0.5">{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {Array.from({ length: calDays.firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: calDays.daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const count = calDays.map[day] || 0;
            const isToday = new Date().getDate() === day &&
              new Date().getMonth() === calDays.month &&
              new Date().getFullYear() === calDays.year;
            return (
              <div key={day} className="flex flex-col items-center py-0.5">
                <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                  isToday ? 'bg-primary text-primary-foreground font-bold' :
                  count > 0 ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-foreground'
                }`}>{day}</span>
                {count > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {Array.from({ length: Math.min(count, 3) }).map((_, di) => (
                      <div key={di} className="w-1 h-1 rounded-full bg-blue-500" />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {pendingCount > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-semibold">
            <AlarmClock className="w-3.5 h-3.5" />
            {pendingCount} post{pendingCount !== 1 ? 's' : ''} scheduled this month
          </div>
        )}
      </div>

      {/* ── Hero header ── */}
      <div className="px-4 py-5 bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border-b border-border flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
          <Calendar className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Scheduled Posts</h1>
          <p className="text-sm text-muted-foreground">
            {pendingCount > 0
              ? `${pendingCount} post${pendingCount !== 1 ? 's' : ''} queued to publish`
              : 'No posts scheduled — compose one to get started'}
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          + New
        </button>
      </div>

      {/* ── Status tabs ── */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border flex">
        {tabs.map(t => {
          const cnt = posts.filter(p => p.status === t.id).length;
          return (
            <button
              key={t.id}
              onClick={() => setPreviewTab(t.id)}
              className={`flex-1 py-3.5 font-semibold text-sm border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                previewTab === t.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/40'
              }`}
            >
              {t.label}
              {cnt > 0 && (
                <span className={`min-w-[18px] h-[18px] text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none ${
                  t.id === 'pending' ? 'bg-blue-500 text-white' :
                  t.id === 'failed'  ? 'bg-red-500 text-white'  : 'bg-green-500 text-white'
                }`}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Post list ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Calendar className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-lg">No {previewTab} posts</p>
          {previewTab === 'pending' && (
            <p className="text-sm mt-2">Schedule a post using the ⏰ button in the compose toolbar</p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((post) => {
            const countdown = getCountdown(post.scheduled_for);
            const mediaUrl = post.video_url || post.image_url;
            const isVideo  = !!post.video_url;

            return (
              <div
                key={post.id}
                className={`p-4 hover:bg-muted/5 transition-colors ${
                  post.status === 'pending' ? 'border-l-2 border-l-blue-500/40' : ''
                }`}
              >
                {/* ── Card header row ── */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Status pill */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusStyle(post.status)}`}>
                      {post.status === 'pending'   && <Clock className="w-3 h-3" />}
                      {post.status === 'published' && <CheckCircle className="w-3 h-3" />}
                      {post.status === 'failed'    && <XCircle className="w-3 h-3" />}
                      {post.status}
                    </span>
                    {/* Countdown pill — only for pending */}
                    {post.status === 'pending' && (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                        countdown.urgent
                          ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 animate-pulse'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}>
                        ⏰ {countdown.label}
                      </span>
                    )}
                    {/* Media type badge */}
                    {mediaUrl && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                        {isVideo ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                        {isVideo ? 'Video' : 'Image'}
                      </span>
                    )}
                  </div>
                  {/* Delete / cancel button — only for pending */}
                  {post.status === 'pending' && (
                    <button
                      onClick={() => deleteScheduledPost(post.id)}
                      disabled={deletingId === post.id}
                      className="shrink-0 p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      title="Cancel scheduled post"
                    >
                      {deletingId === post.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* ── Content preview ── */}
                <div className="flex gap-3">
                  {/* Media thumbnail */}
                  {mediaUrl && (
                    <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-muted border border-border">
                      {isVideo
                        ? <video src={mediaUrl} className="w-full h-full object-cover" muted playsInline />
                        : <img src={mediaUrl} alt="media" className="w-full h-full object-cover" />
                      }
                    </div>
                  )}
                  {/* Text content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed line-clamp-3 whitespace-pre-wrap break-words">
                      {post.content || <span className="text-muted-foreground italic">No text content</span>}
                    </p>
                    {!mediaUrl && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                        <FileText className="w-3 h-3" />
                        <span>Text only</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Footer row ── */}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(post.scheduled_for).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                  </div>
                  {post.status === 'pending' && (
                    <button
                      onClick={() => toast.info('Edit scheduled post — coming soon!')}
                      className="flex items-center gap-1 text-xs text-primary hover:underline font-semibold"
                    >
                      <Edit3 className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
