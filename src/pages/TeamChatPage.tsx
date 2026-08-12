import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useIsRegulator } from '@/hooks/useFeatureUnlock';
import {
  Send, Loader2, Lock, MessageSquare, Users,
  Crown, Briefcase, Hash, Reply, X, MoreVertical, Trash2,
  Shield,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';

// Module-level constants — esbuild-safe
const TEAM_CHAT_EMOJIS = ['👍', '❤️', '🔥', '🎉', '💯', '👏'] as const;
// Pure helper — replaces Object.entries in render scope (esbuild guard)
function getReactionEntries(reacts: any): { emoji: string; count: number }[] {
  const result: { emoji: string; count: number }[] = [];
  const keys = Object.keys(reacts ?? {});
  for (let i = 0; i < keys.length; i++) {
    result.push({ emoji: keys[i], count: Number(reacts[keys[i]] ?? 0) });
  }
  return result;
}

// Pure function replaces index-signature object (esbuild guard)
function getDeptColor(dept: string): string {
  if (dept === 'Engineering')  return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
  if (dept === 'Content')      return 'bg-green-500/10 text-green-600 border-green-500/20';
  if (dept === 'Marketing')    return 'bg-pink-500/10 text-pink-600 border-pink-500/20';
  if (dept === 'Moderation')   return 'bg-red-500/10 text-red-600 border-red-500/20';
  if (dept === 'Finance')      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
  if (dept === 'Design')       return 'bg-violet-500/10 text-violet-600 border-violet-500/20';
  if (dept === 'Operations')   return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
  return 'bg-muted text-muted-foreground border-border';
}

export default function TeamChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isReg = useIsRegulator();

  const [loading, setLoading] = useState(true);
  const [isEmployee, setIsEmployee] = useState(false);
  const [myJobInfo, setMyJobInfo] = useState<any | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; text: string; username: string } | null>(null);
  const [reactions, setReactions] = useState<{ [msgId: string]: { [emoji: string]: number } }>(() => ({}));
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null);
  const [showMsgMenu, setShowMsgMenu] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) return;
    checkAccess();
  }, [user]);

  const checkAccess = useCallback(async () => {
    if (!user) return;
    // Regulators always have access
    if (isReg) { setIsEmployee(true); setLoading(false); fetchAll(); return; }
    const { data } = await supabase.from('employee_assignments')
      .select('id, job_title, department, permissions')
      .eq('user_id', user.id).eq('is_active', true).maybeSingle();
    if (data) {
      setIsEmployee(true);
      setMyJobInfo(data);
      fetchAll();
    } else {
      setIsEmployee(false);
    }
    setLoading(false);
  }, [user, isReg]);

  const fetchAll = useCallback(async () => {
    const [msgsRes, empsRes] = await Promise.all([
      supabase.from('team_chat_messages')
        .select('*, user_profiles:user_id(id, username, avatar_url, verified), reply_post:reply_to_id(id, message, user_profiles:user_id(username))')
        .order('created_at', { ascending: true })
        .limit(100),
      supabase.from('employee_assignments')
        .select('user_id, job_title, department, user_profiles:user_id(id, username, avatar_url, verified)')
        .eq('is_active', true)
        .limit(50),
    ]);
    if (msgsRes.data) setMessages(msgsRes.data);
    if (empsRes.data) setEmployees(empsRes.data);
    // Load stored reactions
    try {
      const raw = localStorage.getItem('team_chat_reactions');
      if (raw) setReactions(JSON.parse(raw));
    } catch { /* ignore */ }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  useEffect(() => {
    if (!isEmployee) return;
    pollingRef.current = setInterval(fetchAll, 3000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [isEmployee, fetchAll]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!user || !input.trim() || sending) return;
    const text = input.trim();
    const replyInfo = replyingTo;
    setInput('');
    setReplyingTo(null);
    setSending(true);
    const { error } = await supabase.from('team_chat_messages').insert({
      user_id: user.id,
      message: replyInfo ? `[↩ @${replyInfo.username}: "${replyInfo.text.slice(0, 40)}…"] ${text}` : text,
      department: myJobInfo?.department ?? (isReg ? 'Regulator' : null),
      reply_to_id: replyInfo?.id ?? null,
    });
    if (error) toast.error(error.message);
    else await fetchAll();
    setSending(false);
  };

  const handleReaction = useCallback((msgId: string, emoji: string) => {
    setReactions(prev => {
      const updated = { ...prev };
      if (!updated[msgId]) updated[msgId] = {};
      updated[msgId][emoji] = (updated[msgId][emoji] ?? 0) + 1;
      localStorage.setItem('team_chat_reactions', JSON.stringify(updated));
      return updated;
    });
    setShowEmojiFor(null);
  }, []);

  const handleDelete = useCallback(async (msgId: string) => {
    if (!isReg) return;
    await supabase.from('team_chat_messages').delete().eq('id', msgId);
    setMessages(prev => prev.filter(m => m.id !== msgId));
    setShowMsgMenu(null);
    toast.success('Message deleted');
  }, [isReg]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <div className="min-h-screen bg-background"><TopBar title="Team Chat" showBack /><div className="text-center py-20 text-muted-foreground"><p>Please sign in</p></div></div>;
  }

  if (!isEmployee) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar title="Team Chat" showBack />
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-5">
            <Lock className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-black mb-2">Employees Only</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Team Chat is restricted to Testagram employees. Contact the platform regulator (@Shee) to be hired as an employee.
          </p>
          <button onClick={() => navigate('/profile/Shee')}
            className="mt-5 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-bold hover:opacity-90">
            Contact @Shee
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-0">
      <TopBar title="Team Chat" showBack />

      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-violet-600/8 to-primary/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/10 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="font-black text-sm">Internal Team Channel</h2>
            <p className="text-[10px] text-muted-foreground">{employees.length} employees · Confidential</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-bold text-green-600">Live</span>
          </div>
        </div>
        {/* My badge */}
        {myJobInfo && (
          <div className="mt-2 flex items-center gap-2">
            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${getDeptColor(myJobInfo.department ?? '')}`}>
              <Hash className="w-2.5 h-2.5" />{myJobInfo.department}
            </span>
            <span className="text-[10px] text-muted-foreground">{myJobInfo.job_title}</span>
          </div>
        )}
        {isReg && (
          <div className="mt-2">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-violet-600/15 to-primary/10 border border-violet-500/30 text-[10px] font-black text-violet-600 w-fit">
              <Crown className="w-2.5 h-2.5" />Platform Regulator
            </span>
          </div>
        )}
      </div>

      {/* Online employees strip */}
      {employees.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/20 overflow-x-auto scrollbar-hide">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide shrink-0">Team</span>
          {employees.slice(0, 12).map((emp: any) => (
            <button key={emp.user_id} onClick={() => navigate(`/profile/${emp.user_profiles?.username}`)}
              className="flex items-center gap-1.5 shrink-0">
              <div className="relative w-7 h-7">
                <div className="w-full h-full rounded-full bg-muted overflow-hidden">
                  {emp.user_profiles?.avatar_url
                    ? <img src={emp.user_profiles.avatar_url} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full flex items-center justify-center text-[9px] font-bold">{emp.user_profiles?.username?.[0]?.toUpperCase()}</div>}
                </div>
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-500 border border-background" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ minHeight: 0, maxHeight: 'calc(100vh - 320px)' }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <MessageSquare className="w-14 h-14 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">Team chat is quiet</p>
            <p className="text-sm mt-1">Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg: any, i: number) => {
            const isOwn = msg.user_id === user?.id;
            const prev = messages[i - 1];
            const showHeader = !prev || prev.user_id !== msg.user_id;
            const msgReactions = reactions[msg.id] ?? {};

            return (
              <div key={msg.id} className={`group flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0 ${showHeader ? '' : 'invisible'}`}>
                  {msg.user_profiles?.avatar_url
                    ? <img src={msg.user_profiles.avatar_url} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold">{msg.user_profiles?.username?.[0]?.toUpperCase()}</div>}
                </div>
                <div className={`flex flex-col gap-0.5 max-w-[80%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {showHeader && !isOwn && (
                    <div className="flex items-center gap-1.5 px-1">
                      <span className="text-[11px] font-black">{msg.user_profiles?.username}</span>
                      {msg.user_profiles?.verified && <span className="text-[9px] text-primary font-bold">✓</span>}
                      {msg.department && (
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${getDeptColor(msg.department)}`}>
                          {msg.department}
                        </span>
                      )}
                    </div>
                  )}
                  <div className={`relative rounded-2xl px-3 py-2 text-sm leading-relaxed break-words ${
                    isOwn
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  }`}>
                    {msg.message}
                  </div>
                  {/* Reactions */}
                  {Object.keys(msgReactions).length > 0 && (
                    <div className="flex gap-1 flex-wrap px-1">
                      {getReactionEntries(msgReactions).map(re => (
                        <button key={re.emoji} onClick={() => handleReaction(msg.id, re.emoji)}
                          className="flex items-center gap-0.5 text-[11px] bg-muted/80 hover:bg-muted border border-border rounded-full px-1.5 py-0.5">
                          {re.emoji}<span className="text-[10px] font-bold text-muted-foreground">{re.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Hover actions */}
                  <div className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                    <button onClick={() => setShowEmojiFor(p => p === msg.id ? null : msg.id)} className="text-base hover:scale-110 transition-transform">😊</button>
                    <button onClick={() => setReplyingTo({ id: msg.id, text: msg.message, username: msg.user_profiles?.username ?? 'user' })}
                      className="text-[10px] text-muted-foreground hover:text-primary font-semibold px-1">
                      <Reply className="w-3 h-3" />
                    </button>
                    {(isReg || isOwn) && (
                      <div className="relative">
                        <button onClick={() => setShowMsgMenu(p => p === msg.id ? null : msg.id)}
                          className="text-muted-foreground hover:text-foreground"><MoreVertical className="w-3 h-3" /></button>
                        {showMsgMenu === msg.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowMsgMenu(null)} />
                            <div className={`absolute ${isOwn ? 'right-0' : 'left-0'} bottom-full mb-1 w-36 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden`}>
                              <button onClick={() => handleDelete(msg.id)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-destructive/10 text-destructive">
                                <Trash2 className="w-3.5 h-3.5" />Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Emoji picker */}
                  {showEmojiFor === msg.id && (
                    <div className="flex gap-1 bg-background border border-border rounded-2xl px-2 py-1.5 shadow-lg z-30">
                      {TEAM_CHAT_EMOJIS.map(e => (
                        <button key={e} onClick={() => handleReaction(msg.id, e)} className="text-xl hover:scale-125 transition-transform">{e}</button>
                      ))}
                    </div>
                  )}
                  {showHeader && <span className="text-[9px] text-muted-foreground px-1">{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</span>}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply indicator */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-t border-primary/15">
          <Reply className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[11px] text-primary font-semibold flex-1 truncate">
            @{replyingTo.username}: "{replyingTo.text.slice(0, 50)}…"
          </span>
          <button onClick={() => setReplyingTo(null)} className="text-muted-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border bg-background p-3 pb-safe flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 bg-muted/60 border border-border rounded-2xl px-3 py-2.5">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Message the team…"
            maxLength={500}
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/60"
          />
          <span className="text-[10px] text-muted-foreground/50 shrink-0">{input.length}/500</span>
        </div>
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0 shadow-md shadow-primary/20"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
