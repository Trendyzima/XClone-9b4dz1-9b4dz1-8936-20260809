import { useState, useEffect, useRef } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Send, Search, BadgeCheck, Loader2, ArrowLeft, MessageSquare, X, Image as ImageIcon } from 'lucide-react';
import { GifPicker } from '@/components/features/GifPicker';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function MessagesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  // Conversation list filter
  const [convFilter, setConvFilter] = useState('');
  // GIF picker
  const [showGifPicker, setShowGifPicker] = useState(false);
  // In-thread message search
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [msgSearchQuery, setMsgSearchQuery] = useState('');
  const [msgSearchResults, setMsgSearchResults] = useState<any[]>([]);
  const [searchingMsgs, setSearchingMsgs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    fetchConversations();
    const recipientUsername = searchParams.get('to');
    if (recipientUsername) startConversationWithUser(recipientUsername);
  }, [user, searchParams]);

  useEffect(() => {
    if (!selectedConversation) return;
    fetchMessages(selectedConversation.id);

    const subscription = supabase
      .channel(`conversation:${selectedConversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${selectedConversation.id}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => { subscription.unsubscribe(); };
  }, [selectedConversation]);

  const startConversationWithUser = async (username: string) => {
    try {
      const { data: recipientProfile } = await supabase
        .from('user_profiles').select('*').eq('username', username).single();
      if (!recipientProfile) { toast.error('User not found'); return; }

      const { data: existing } = await supabase
        .from('conversations').select('*')
        .or(`and(participant_1.eq.${user!.id},participant_2.eq.${recipientProfile.id}),and(participant_1.eq.${recipientProfile.id},participant_2.eq.${user!.id})`)
        .single();

      if (existing) {
        setSelectedConversation({ ...existing, otherUser: recipientProfile });
      } else {
        const { data: newConv, error } = await supabase
          .from('conversations')
          .insert({ participant_1: user!.id, participant_2: recipientProfile.id })
          .select().single();
        if (error) throw error;
        setSelectedConversation({ ...newConv, otherUser: recipientProfile });
      }
    } catch (error) {
      console.error('Error starting conversation:', error);
      toast.error('Failed to start conversation');
    }
  };

  const fetchConversations = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('conversations').select('*')
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .order('last_message_at', { ascending: false });
      if (error) throw error;

      const conversationsWithUsers = await Promise.all(
        (data || []).map(async (conv) => {
          const otherUserId = conv.participant_1 === user.id ? conv.participant_2 : conv.participant_1;
          const { data: otherUser } = await supabase.from('user_profiles').select('*').eq('id', otherUserId).single();
          const { data: lastMessage } = await supabase.from('direct_messages').select('*')
            .eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(1).single();
          const { count: unreadCount } = await supabase
            .from('direct_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('read', false)
            .neq('sender_id', user.id);
          return { ...conv, otherUser, lastMessage, unreadCount: unreadCount ?? 0 };
        })
      );
      setConversations(conversationsWithUsers);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('direct_messages')
        .select(`*, sender:user_profiles!direct_messages_sender_id_fkey(*)`)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
      // Mark unread messages from the other person as read
      await supabase.from('direct_messages').update({ read: true })
        .eq('conversation_id', conversationId)
        .eq('read', false)
        .neq('sender_id', user!.id);
      // Update local state immediately so read receipts show
      setMessages(prev => prev.map(m => m.sender_id !== user!.id ? { ...m, read: true } : m));
      // Refresh conversation list to clear unread badge
      fetchConversations();
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedConversation) return;
    setSending(true);
    const text = messageText.trim();
    setMessageText('');
    try {
      const { error } = await supabase.from('direct_messages').insert({
        conversation_id: selectedConversation.id,
        sender_id: user!.id,
        content: text,
      });
      if (error) throw error;
      // Fire-and-forget push notification to recipient
      (async () => {
        try {
          const recipientId = selectedConversation.participant_1 === user!.id
            ? selectedConversation.participant_2
            : selectedConversation.participant_1;
          const { data: tokenData } = await supabase
            .from('fcm_tokens').select('token').eq('user_id', recipientId).maybeSingle();
          if (tokenData?.token) {
            await supabase.functions.invoke('send-push-notification', {
              body: {
                token: tokenData.token,
                title: user!.username,
                body: text.length > 100 ? text.slice(0, 97) + '\u2026' : text,
                data: { type: 'dm', conversation_id: selectedConversation.id },
              },
            });
          }
        } catch { /* non-fatal */ }
      })();
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', selectedConversation.id);
      fetchConversations();
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error(error.message || 'Failed to send message');
      setMessageText(text);
    } finally {
      setSending(false);
    }
  };

  // Filter conversations by username client-side (fast, no extra query)
  const filteredConversations = convFilter.trim()
    ? conversations.filter(c =>
        c.otherUser?.username?.toLowerCase().includes(convFilter.toLowerCase())
      )
    : conversations;

  // Search messages in the current thread
  const searchMessages = async (query: string) => {
    if (!query.trim() || !selectedConversation) { setMsgSearchResults([]); return; }
    setSearchingMsgs(true);
    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .eq('conversation_id', selectedConversation.id)
      .ilike('content', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(50);
    setMsgSearchResults(data ?? []);
    setSearchingMsgs(false);
  };

  const searchUsers = async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return; }
    try {
      const { data, error } = await supabase.from('user_profiles').select('*')
        .or(`username.ilike.%${query}%,email.ilike.%${query}%`)
        .neq('id', user!.id).limit(10);
      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  const handleGifSelect = async (gifUrl: string) => {
    setShowGifPicker(false);
    if (!selectedConversation) return;
    setSending(true);
    try {
      await supabase.from('direct_messages').insert({
        conversation_id: selectedConversation.id,
        sender_id: user!.id,
        content: gifUrl,
      });
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', selectedConversation.id);
      fetchConversations();
    } catch (error: any) {
      toast.error(error.message || 'Failed to send GIF');
    } finally { setSending(false); }
  };

  if (!user) return null;
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-background" style={{ height: '100dvh' }}>
      {showGifPicker && (
        <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
      )}
      {/* Only show TopBar in conversation list view on mobile */}
      {!selectedConversation && <TopBar title="Messages" />}

      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Conversations List ── */}
        <div className={`
          ${selectedConversation ? 'hidden md:flex' : 'flex'} 
          flex-col w-full md:w-80 border-r border-border
        `}>
          <div className="p-3 border-b border-border shrink-0 space-y-2">
            <Button onClick={() => setShowUserSearch(!showUserSearch)} className="w-full rounded-full">
              New Message
            </Button>
            {/* Conversation filter input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Filter conversations…"
                value={convFilter}
                onChange={e => setConvFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-muted rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
              />
              {convFilter && (
                <button
                  onClick={() => setConvFilter('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {showUserSearch && (
            <div className="p-3 border-b border-border shrink-0">
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); searchUsers(e.target.value); }}
                className="rounded-full"
                autoFocus
              />
              {searchResults.length > 0 && (
                <div className="mt-2 bg-background border border-border rounded-lg max-h-60 overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => {
                        startConversationWithUser(result.username);
                        setShowUserSearch(false);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="w-full p-3 hover:bg-muted flex items-center gap-3 text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
                        {result.avatar_url
                          ? <img src={result.avatar_url} alt={result.username} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center font-bold">{result.username[0].toUpperCase()}</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold truncate">{result.username}</span>
                          {result.verified && <BadgeCheck className="w-4 h-4 text-primary shrink-0" />}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">@{result.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 && conversations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="font-semibold mb-1">No messages yet</p>
                <p className="text-sm">Start a conversation to connect with others</p>
              </div>
            ) : (
              filteredConversations.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  No conversations matching &ldquo;{convFilter}&rdquo;
                </div>
              ) : filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={`w-full p-4 border-b border-border hover:bg-muted/50 flex items-start gap-3 text-left transition-colors ${selectedConversation?.id === conv.id ? 'bg-muted' : ''}`}
                >
                  <div className="w-12 h-12 rounded-full bg-muted overflow-hidden shrink-0">
                    {conv.otherUser?.avatar_url
                      ? <img src={conv.otherUser.avatar_url} alt={conv.otherUser.username} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center font-bold">{conv.otherUser?.username?.[0]?.toUpperCase()}</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-1">
                      <span className={`truncate ${conv.unreadCount > 0 ? 'font-bold text-foreground' : 'font-semibold'}`}>{conv.otherUser?.username}</span>
                      {conv.otherUser?.verified && <BadgeCheck className="w-4 h-4 text-primary shrink-0" />}
                      {conv.unreadCount > 0 && (
                        <span className="ml-auto shrink-0 min-w-[18px] h-[18px] bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                          {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                        </span>
                      )}
                    </div>
                    {conv.lastMessage && (
                      <>
                        <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                          {conv.lastMessage.sender_id === user.id && 'You: '}{conv.lastMessage.content}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(conv.lastMessage.created_at), { addSuffix: true })}
                        </p>
                      </>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Chat Area ── */}
        <div className={`${selectedConversation ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0 min-h-0`}>
          {selectedConversation ? (
            <>
              {/* Chat header */}
              <div className="p-3 border-b border-border flex items-center gap-3 shrink-0 bg-background">
                <button
                  onClick={() => { setSelectedConversation(null); setShowMsgSearch(false); setMsgSearchQuery(''); setMsgSearchResults([]); }}
                  className="md:hidden p-2 hover:bg-muted rounded-full transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
                  {selectedConversation.otherUser?.avatar_url
                    ? <img src={selectedConversation.otherUser.avatar_url} alt={selectedConversation.otherUser.username} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center font-bold">{selectedConversation.otherUser?.username?.[0]?.toUpperCase()}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-bold truncate">{selectedConversation.otherUser?.username}</span>
                    {selectedConversation.otherUser?.verified && <BadgeCheck className="w-4 h-4 text-primary shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground">@{selectedConversation.otherUser?.username}</p>
                </div>
                {/* In-thread search toggle */}
                <button
                  onClick={() => {
                    setShowMsgSearch(s => !s);
                    setMsgSearchQuery('');
                    setMsgSearchResults([]);
                  }}
                  className={`p-2 rounded-full transition-colors ${showMsgSearch ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                  title="Search messages"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
              {/* In-thread search bar */}
              {showMsgSearch && (
                <div className="px-3 py-2 border-b border-border bg-background shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search in this conversation…"
                      value={msgSearchQuery}
                      onChange={e => { setMsgSearchQuery(e.target.value); searchMessages(e.target.value); }}
                      className="w-full pl-9 pr-9 py-2 bg-muted rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {msgSearchQuery && (
                      <button
                        onClick={() => { setMsgSearchQuery(''); setMsgSearchResults([]); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {/* Search results list */}
                  {msgSearchQuery.trim() && (
                    <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                      {searchingMsgs ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        </div>
                      ) : msgSearchResults.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">No messages found</p>
                      ) : (
                        msgSearchResults.map(m => (
                          <div
                            key={m.id}
                            className={`px-3 py-2 rounded-xl text-xs leading-relaxed border ${
                              m.sender_id === user.id
                                ? 'bg-primary/8 border-primary/15 text-foreground ml-6'
                                : 'bg-muted border-border mr-6'
                            }`}
                          >
                            <span className="font-semibold text-[10px] text-muted-foreground block mb-0.5">
                              {m.sender_id === user.id ? 'You' : selectedConversation.otherUser?.username} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                            </span>
                            {m.content}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Messages — scrollable area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {messages.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-sm">Start a conversation with {selectedConversation.otherUser?.username}</p>
                  </div>
                )}
                {messages.map((message) => {
                  const isGif = message.content?.startsWith('https://media.tenor.com') || message.content?.endsWith('.gif');
                  return (
                  <div
                    key={message.id}
                    className={`flex ${message.sender_id === user.id ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[75%] rounded-2xl overflow-hidden ${
                      isGif ? 'bg-transparent' :
                      message.sender_id === user.id
                        ? 'px-4 py-2.5 bg-primary text-primary-foreground rounded-br-sm'
                        : 'px-4 py-2.5 bg-muted rounded-bl-sm'
                    }`}>
                      {isGif ? (
                        <img src={message.content} alt="GIF" className="rounded-2xl max-w-full max-h-56 object-contain" loading="lazy" />
                      ) : (
                      <p className="break-words text-sm leading-relaxed">{message.content}</p>
                      )}
                      <div className={`flex items-center justify-end gap-1 mt-1 ${message.sender_id === user.id ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        <span className="text-xs">
                          {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                        </span>
                        {message.sender_id === user.id && (
                          <span className="text-[11px] font-medium">{message.read ? '✓✓' : '✓'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input — pinned at the bottom, ABOVE the bottom nav */}
              <div className="shrink-0 border-t border-border bg-background px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
                <div className="flex items-center gap-2 bg-muted rounded-full px-4 py-1">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    className="flex-1 bg-transparent outline-none text-sm py-2 min-w-0"
                  />
                  <button
                    onClick={() => setShowGifPicker(true)}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
                    title="Send GIF"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={!messageText.trim() || sending}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 transition-opacity hover:opacity-90"
                  >
                    {sending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />
                    }
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Send className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="font-semibold text-lg mb-2">Select a conversation</p>
                <p className="text-sm">Choose from your existing messages or start a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
