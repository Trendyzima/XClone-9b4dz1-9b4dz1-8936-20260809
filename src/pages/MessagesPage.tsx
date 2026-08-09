import { useState, useEffect, useRef } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Send, Search, BadgeCheck, Loader2, ArrowLeft, MessageSquare } from 'lucide-react';
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
          return { ...conv, otherUser, lastMessage };
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
      await supabase.from('direct_messages').update({ read: true })
        .eq('conversation_id', conversationId).neq('sender_id', user!.id);
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

  if (!user) return null;
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    // Use full viewport height and prevent the page from scrolling — only inner panels scroll
    <div className="flex flex-col bg-background" style={{ height: '100dvh' }}>
      {/* Only show TopBar in conversation list view on mobile */}
      {!selectedConversation && <TopBar title="Messages" />}

      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Conversations List ── */}
        <div className={`
          ${selectedConversation ? 'hidden md:flex' : 'flex'} 
          flex-col w-full md:w-80 border-r border-border
        `}>
          <div className="p-3 border-b border-border shrink-0">
            <Button onClick={() => setShowUserSearch(!showUserSearch)} className="w-full rounded-full">
              New Message
            </Button>
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
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="font-semibold mb-1">No messages yet</p>
                <p className="text-sm">Start a conversation to connect with others</p>
              </div>
            ) : (
              conversations.map((conv) => (
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
                      <span className="font-semibold truncate">{conv.otherUser?.username}</span>
                      {conv.otherUser?.verified && <BadgeCheck className="w-4 h-4 text-primary shrink-0" />}
                    </div>
                    {conv.lastMessage && (
                      <>
                        <p className="text-sm text-muted-foreground truncate">
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
                  onClick={() => setSelectedConversation(null)}
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
              </div>

              {/* Messages — scrollable area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {messages.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-sm">Start a conversation with {selectedConversation.otherUser?.username}</p>
                  </div>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender_id === user.id ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                      message.sender_id === user.id
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted rounded-bl-sm'
                    }`}>
                      <p className="break-words text-sm leading-relaxed">{message.content}</p>
                      <p className={`text-xs mt-1 ${message.sender_id === user.id ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
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
