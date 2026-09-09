import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Bell, BellOff, ChevronRight, Loader2, Mic2, Plus, Radio, Users, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface CommunityEvent {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  location: string | null;
}

interface LiveSpace {
  id: string;
  title: string;
  listener_count: number;
  host_id: string;
}

export function CommunitySpacesUpgrades() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isCommunities = location.pathname === '/communities';
  const isSpaces = location.pathname === '/spaces';
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [liveSpace, setLiveSpace] = useState<LiveSpace | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventCommunityId, setEventCommunityId] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventStartsAt, setEventStartsAt] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [reminded, setReminded] = useState(false);
  const [requested, setRequested] = useState(false);

  const loadCommunityEvents = useCallback(async () => {
    if (!user) return;
    const { data: memberships } = await supabase
      .from('community_members')
      .select('community_id')
      .eq('user_id', user.id)
      .eq('status', 'active');
    const ids = memberships?.map(m => m.community_id) ?? [];
    if (!ids.length) { setEvents([]); return; }
    const { data } = await supabase
      .from('community_events')
      .select('id,community_id,title,description,starts_at,location')
      .in('community_id', ids)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(4);
    setEvents((data ?? []) as CommunityEvent[]);
    if (!eventCommunityId) setEventCommunityId(ids[0]);
  }, [user, eventCommunityId]);

  const loadLiveSpace = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('spaces')
      .select('id,title,listener_count,host_id')
      .eq('is_live', true)
      .eq('is_archived', false)
      .order('listener_count', { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = (data ?? null) as LiveSpace | null;
    setLiveSpace(next);
    if (!next) return;
    const { data: reminder } = await supabase.from('space_reminders').select('id').eq('space_id', next.id).eq('user_id', user.id).maybeSingle();
    setReminded(Boolean(reminder));
    const { data: request } = await supabase.from('space_speaker_requests').select('id,status').eq('space_id', next.id).eq('user_id', user.id).maybeSingle();
    setRequested(Boolean(request && request.status !== 'cancelled'));
  }, [user]);

  useEffect(() => {
    if (!user || (!isCommunities && !isSpaces)) return;
    if (isCommunities) loadCommunityEvents();
    if (isSpaces) loadLiveSpace();
  }, [user, isCommunities, isSpaces, loadCommunityEvents, loadLiveSpace]);

  const nextEventLabel = useMemo(() => {
    if (!events[0]) return null;
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(events[0].starts_at));
  }, [events]);

  const createEvent = async () => {
    if (!user || !eventCommunityId || !eventTitle.trim() || !eventStartsAt) return;
    setSaving(true);
    const { error } = await supabase.from('community_events').insert({
      community_id: eventCommunityId,
      created_by: user.id,
      title: eventTitle.trim(),
      description: eventDescription.trim() || null,
      starts_at: new Date(eventStartsAt).toISOString(),
      location: eventLocation.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Community event scheduled');
    setEventOpen(false);
    setEventTitle(''); setEventDescription(''); setEventStartsAt(''); setEventLocation('');
    loadCommunityEvents();
  };

  const toggleReminder = async () => {
    if (!user || !liveSpace) return;
    if (reminded) {
      const { error } = await supabase.from('space_reminders').delete().eq('space_id', liveSpace.id).eq('user_id', user.id);
      if (!error) { setReminded(false); toast.success('Reminder removed'); }
      return;
    }
    const { error } = await supabase.from('space_reminders').insert({ space_id: liveSpace.id, user_id: user.id });
    if (error && error.code !== '23505') { toast.error(error.message); return; }
    setReminded(true); toast.success('Space reminder saved');
  };

  const requestSpeaker = async () => {
    if (!user || !liveSpace || requesting) return;
    if (requested) { toast.message('Your speaker request is already in the queue'); return; }
    setRequesting(true);
    const { error } = await supabase.from('space_speaker_requests').insert({ space_id: liveSpace.id, user_id: user.id });
    setRequesting(false);
    if (error && error.code !== '23505') { toast.error(error.message); return; }
    setRequested(true); toast.success('Hand raised — the host can now review your request');
  };

  if (!isCommunities && !isSpaces) return null;
  if (!user) return null;

  return (
    <div className="mx-4 my-3 rounded-2xl border border-border bg-card/80 shadow-sm overflow-hidden">
      {isCommunities ? (
        <>
          <div className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><CalendarDays className="h-5 w-5" /></div>
              <div className="min-w-0"><p className="font-bold">Community events</p><p className="text-xs text-muted-foreground truncate">Turn communities into places people return to.</p></div>
            </div>
            <Button size="sm" className="rounded-full shrink-0" onClick={() => setEventOpen(true)}><Plus className="h-4 w-4 mr-1" />Event</Button>
          </div>
          {events.length > 0 ? <div className="border-t border-border divide-y divide-border">{events.map((event, index) => <button key={event.id} onClick={() => navigate(`/c/${event.community_id}`)} className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/40 transition-colors"><div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-sm font-bold">{new Date(event.starts_at).getDate()}</div><div className="min-w-0 flex-1"><p className="font-semibold text-sm truncate">{event.title}</p><p className="text-xs text-muted-foreground truncate">{index === 0 ? nextEventLabel : new Date(event.starts_at).toLocaleString()} {event.location ? `• ${event.location}` : ''}</p></div><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>)}</div> : <div className="px-4 pb-4 text-xs text-muted-foreground">No upcoming events in your communities yet. Create the first one.</div>}
          <Dialog open={eventOpen} onOpenChange={setEventOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Schedule a community event</DialogTitle></DialogHeader><div className="space-y-3"><Input value={eventTitle} onChange={e => setEventTitle(e.target.value)} placeholder="Event title" /><Textarea value={eventDescription} onChange={e => setEventDescription(e.target.value)} placeholder="What will happen?" /><Input type="datetime-local" value={eventStartsAt} onChange={e => setEventStartsAt(e.target.value)} /><Input value={eventLocation} onChange={e => setEventLocation(e.target.value)} placeholder="Location or link (optional)" /><Button onClick={createEvent} disabled={saving || !eventTitle.trim() || !eventStartsAt} className="w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Schedule event'}</Button></div></DialogContent></Dialog>
        </>
      ) : (
        <>
          <div className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center"><Radio className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-bold">Live Space upgrades</p><p className="text-xs text-muted-foreground">Raise your hand, save the room, and never miss the conversation.</p></div></div>
          {liveSpace ? <div className="border-t border-border p-3"><button onClick={() => navigate(`/spaces?space=${liveSpace.id}`)} className="w-full text-left flex items-center gap-3 mb-3"><div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Mic2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-semibold truncate">{liveSpace.title}</p><p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />{liveSpace.listener_count} listening now</p></div></button><div className="grid grid-cols-2 gap-2"><Button variant={reminded ? 'secondary' : 'outline'} size="sm" onClick={toggleReminder}>{reminded ? <BellOff className="h-4 w-4 mr-1" /> : <Bell className="h-4 w-4 mr-1" />}{reminded ? 'Reminder on' : 'Remind me'}</Button><Button size="sm" onClick={requestSpeaker} disabled={requesting}>{requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4 mr-1" />}{requested ? 'Hand raised' : 'Raise hand'}</Button></div></div> : <div className="px-4 pb-4 text-xs text-muted-foreground flex items-center gap-2"><Radio className="h-4 w-4" />No live spaces right now. Check back soon.</div>}
        </>
      )}
    </div>
  );
}
