import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Globe, Heart, Languages, Loader2, MessageCircle, Quote, Repeat2, Send, Share2, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import * as federation from '@/api/federation';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/utils';

type Props = { post: any };

function stripHtml(value: string): string {
  if (!value) return '';
  return new DOMParser().parseFromString(value, 'text/html').body.textContent ?? '';
}

export function FederatedPostCard({ post }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const actor = post.actor ?? post.account ?? {};
  const username = actor.preferredUsername ?? actor.username ?? actor.acct ?? 'unknown';
  const domain = actor.url ? (() => { try { return new URL(actor.url).hostname; } catch { return actor.domain ?? ''; } })() : (actor.domain ?? post.fediverse_domain ?? '');
  const acct = actor.acct ?? actor.preferredUsername ?? username;
  const handle = acct.includes('@') || !domain ? acct : `${acct}@${domain}`;
  const avatarUrl = actor.icon?.url ?? actor.avatar ?? actor.avatar_url;
  const displayName = actor.name ?? actor.display_name ?? username;
  const actorTarget = actor.url ?? actor.id ?? handle;
  const postUrl = post.url ?? post.uri ?? post.object_url ?? '';
  const createdAt = post.created_at ?? post.published ?? post.published_at ?? '';
  const rawText = stripHtml(post.content ?? post.text ?? '');
  const media = useMemo(() => Array.isArray(post.media_attachments) ? post.media_attachments : [], [post.media_attachments]);

  const [liked, setLiked] = useState(Boolean(post.favourited ?? post.liked));
  const [reposted, setReposted] = useState(Boolean(post.reblogged ?? post.boosted));
  const [following, setFollowing] = useState(Boolean(actor.following ?? post.following));
  const [likes, setLikes] = useState(Number(post.favourites_count ?? post.likes_count ?? 0));
  const [reposts, setReposts] = useState(Number(post.reblogs_count ?? post.boosts_count ?? 0));
  const [replies, setReplies] = useState(Number(post.replies_count ?? 0));
  const [busy, setBusy] = useState('');
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    if (!user) { navigate('/auth'); return; }
    setBusy(key);
    try { await fn(); } catch (error) { console.error(`[fediverse:${key}]`, error); }
    finally { setBusy(''); }
  };

  const toggleLike = () => run('like', async () => {
    if (liked) { await federation.unfavorite(post.id); setLiked(false); setLikes(v => Math.max(0, v - 1)); }
    else { await federation.favorite(post.id); setLiked(true); setLikes(v => v + 1); }
  });

  const toggleRepost = () => run('repost', async () => {
    if (reposted) { await federation.unboost(post.id); setReposted(false); setReposts(v => Math.max(0, v - 1)); }
    else { await federation.boost(post.id); setReposted(true); setReposts(v => v + 1); }
  });

  const toggleFollow = () => run('follow', async () => {
    if (following) { await federation.unfollow(actorTarget); setFollowing(false); }
    else { await federation.follow(actorTarget); setFollowing(true); }
  });

  const submitReply = () => run('reply', async () => {
    const content = replyText.trim();
    if (!content) return;
    await federation.reply({ postId: post.id, content });
    setReplyText(''); setReplyOpen(false); setReplies(v => v + 1);
  });

  const share = async () => {
    const url = postUrl || actorTarget;
    if (!url) return;
    if (navigator.share) {
      try { await navigator.share({ title: displayName, text: rawText.slice(0, 180), url }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard unavailable */ }
  };

  const quote = () => run('quote', async () => {
    const text = window.prompt('Add a comment to your quote (optional):', '');
    if (text === null) return;
    const comment = text.trim();
    await federation.postStatus({ content: `${comment}${comment ? '\n\n' : ''}${postUrl || 'Fediverse post'}` });
  });

  const translate = async () => {
    if (translation) { setTranslation(null); return; }
    if (!rawText) return;
    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { messages: [{ role: 'user', content: `Translate this Fediverse post to English. Return only the translation:\n\n${rawText}` }], model: 'gemini-2.0-flash' },
      });
      if (error) throw error;
      setTranslation(String(data?.choices?.[0]?.message?.content ?? data?.content ?? data?.text ?? data?.response ?? '').trim());
    } catch {
      setTranslation('Translation failed.');
    } finally {
      setTranslating(false);
    }
  };

  const openDetail = () => {
    if (postUrl || rawText || media.length) setDetailOpen(true);
  };

  const handleDetailKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetail();
    }
  };

  return (
    <>
      <article className="border-b border-border p-4 hover:bg-muted/5 transition-colors">
        <div className="flex gap-3">
          <button onClick={() => navigate(`/fediverse?acct=${encodeURIComponent(handle)}`)} className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0" aria-label={`Open ${handle}`}>
            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold">{username[0]?.toUpperCase()}</span>}
          </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{displayName}</span>
            {domain && <span className="text-xs text-purple-500 flex items-center gap-1"><Globe className="w-3 h-3" />{domain}</span>}
            {createdAt && <span className="text-xs text-muted-foreground">· {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground truncate">@{handle}</span>
            {user && <button onClick={toggleFollow} disabled={busy === 'follow'} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${following ? 'border-border text-muted-foreground' : 'border-primary text-primary'}`}>{busy === 'follow' ? '…' : following ? 'Following' : 'Follow'}</button>}
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={openDetail}
            onKeyDown={handleDetailKeyDown}
            className="cursor-pointer rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Open Fediverse post in Testagram"
          >
            <div className={`text-sm leading-relaxed mt-2 whitespace-pre-wrap break-words ${showMore ? '' : 'line-clamp-12'}`}>{rawText}</div>
            {rawText.length > 800 && <button onClick={(e) => { e.stopPropagation(); setShowMore(v => !v); }} className="text-xs text-primary mt-1 flex items-center gap-1">{showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{showMore ? 'Show less' : 'Show more'}</button>}

            {media.length > 0 && (
              <div className={`mt-3 grid gap-1 rounded-xl overflow-hidden ${media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {media.slice(0, 4).map((m: any, i: number) => m.type === 'image' ? <img key={i} src={m.url ?? m.preview_url} alt={m.description ?? ''} className="w-full max-h-80 object-cover" loading="lazy" /> : m.url ? <video key={i} src={m.url} controls onClick={e => e.stopPropagation()} className="w-full max-h-80 bg-black" /> : null)}
              </div>
            )}
          </div>

          {translation && <div className="mt-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-sm">{translation}</div>}

          <div className="flex items-center justify-between mt-3 max-w-xl text-muted-foreground" onClick={e => e.stopPropagation()}>
            <button onClick={() => setReplyOpen(v => !v)} className="flex items-center gap-1.5 hover:text-primary"><MessageCircle className="w-4 h-4" /><span>{formatNumber(replies)}</span></button>
            <button onClick={toggleRepost} disabled={busy === 'repost'} className={`flex items-center gap-1.5 hover:text-green-500 ${reposted ? 'text-green-500' : ''}`}><Repeat2 className="w-4 h-4" /><span>{formatNumber(reposts)}</span></button>
            <button onClick={toggleLike} disabled={busy === 'like'} className={`flex items-center gap-1.5 hover:text-pink-500 ${liked ? 'text-pink-500' : ''}`}><Heart className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} /><span>{formatNumber(likes)}</span></button>
            <button onClick={quote} disabled={busy === 'quote'} title="Quote" className="hover:text-blue-500"><Quote className="w-4 h-4" /></button>
            <button onClick={share} title="Share" className="hover:text-primary"><Share2 className="w-4 h-4" /></button>
            <button onClick={translate} disabled={translating} title="Translate" className="hover:text-blue-500">{translating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}</button>
            {postUrl && <a href={postUrl} target="_blank" rel="noreferrer" title="Open original" className="hover:text-primary"><ExternalLink className="w-4 h-4" /></a>}
          </div>

          {replyOpen && (
            <div className="mt-3 flex items-center gap-2">
              <input value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitReply(); }} placeholder="Reply / comment…" className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" maxLength={1000} />
              <button onClick={submitReply} disabled={!replyText.trim() || busy === 'reply'} className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-40">{busy === 'reply' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button>
            </div>
          )}
        </div>
      </div>
    </article>

    {detailOpen && (
      <div className="fixed inset-0 z-[700] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={() => setDetailOpen(false)} role="presentation">
        <section className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-border bg-background shadow-2xl" onClick={e => e.stopPropagation()} aria-label="Fediverse post viewer">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
            <div className="min-w-0">
              <div className="font-bold truncate">{displayName}</div>
              <div className="text-xs text-muted-foreground truncate">@{handle}{domain ? ` · ${domain}` : ''}</div>
            </div>
            <button onClick={() => setDetailOpen(false)} className="p-2 rounded-full hover:bg-muted" aria-label="Close post viewer"><X className="w-5 h-5" /></button>
          </header>
          <div className="p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-muted overflow-hidden shrink-0">
                {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold">{username[0]?.toUpperCase()}</span>}
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{displayName}</div>
                <div className="text-sm text-muted-foreground">@{handle}</div>
              </div>
            </div>
            <div className="text-base leading-7 whitespace-pre-wrap break-words">{rawText}</div>
            {media.length > 0 && <div className="mt-5 grid gap-2 rounded-2xl overflow-hidden {media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}">{media.map((m: any, i: number) => m.type === 'image' ? <img key={i} src={m.url ?? m.preview_url} alt={m.description ?? ''} className="w-full max-h-[60vh] object-contain bg-muted" /> : m.url ? <video key={i} src={m.url} controls className="w-full max-h-[60vh] bg-black" /> : null)}</div>}
            {translation && <div className="mt-5 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">{translation}</div>}
            <div className="mt-6 flex items-center gap-5 border-y border-border py-4 text-sm text-muted-foreground">
              <span>{formatNumber(replies)} replies</span><span>{formatNumber(reposts)} reposts</span><span>{formatNumber(likes)} likes</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button onClick={toggleRepost} disabled={busy === 'repost'} className={`flex items-center gap-2 px-3 py-2 rounded-full border ${reposted ? 'text-green-600 border-green-500/40' : 'border-border hover:bg-muted'}`}><Repeat2 className="w-4 h-4" />{reposted ? 'Reposted' : 'Repost'}</button>
              <button onClick={toggleLike} disabled={busy === 'like'} className={`flex items-center gap-2 px-3 py-2 rounded-full border ${liked ? 'text-pink-600 border-pink-500/40' : 'border-border hover:bg-muted'}`}><Heart className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} />{liked ? 'Liked' : 'Like'}</button>
              <button onClick={share} className="flex items-center gap-2 px-3 py-2 rounded-full border border-border hover:bg-muted"><Share2 className="w-4 h-4" />Share</button>
              {postUrl && <a href={postUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-full border border-border hover:bg-muted"><ExternalLink className="w-4 h-4" />Open original</a>}
            </div>
          </div>
        </section>
      </div>
    )}
    </>
  );
}
