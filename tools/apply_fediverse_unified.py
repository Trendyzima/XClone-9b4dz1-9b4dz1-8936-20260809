from pathlib import Path

HOME = Path('src/pages/HomePage.tsx')
CARD = Path('src/components/features/FederatedPostCard.tsx')

IMPORT = "import { FederatedPostCard } from '@/components/features/FederatedPostCard';\n"
ANCHOR = "import * as federation from '@/api/federation';\n"
HELPER = '''\n  // ── Unified For You feed: local XClone + Fediverse, ranked together ─────────\n  const fetchUnifiedForYouFeed = async (): Promise<FeedItem[]> => {\n    const [localResult, fedResult] = await Promise.allSettled([\n      fetchFeed(0),\n      fetchFederatedPosts(),\n    ]);\n\n    const localItems: FeedItem[] = localResult.status === 'fulfilled' ? localResult.value : [];\n    const fedPosts = fedResult.status === 'fulfilled' ? fedResult.value : [];\n    const fedItems: FeedItem[] = fedPosts.map((post: any) => ({\n      type: 'fedpost' as const,\n      data: { ...post, _unified_origin: 'fediverse' },\n    }));\n\n    const all = [...localItems, ...fedItems];\n    const score = (item: FeedItem): number => {\n      const p: any = item.data ?? {};\n      const created = new Date(p.created_at ?? p.published ?? p.published_at ?? 0).getTime();\n      const ageHours = Math.max(0, (Date.now() - created) / 3_600_000);\n      const freshness = Math.exp(-ageHours / 18) * 40;\n\n      if (item.type === 'fedpost') {\n        const remoteRank = Number(p.platform_rank_score ?? 0);\n        const likes = Number(p.favourites_count ?? p.likes_count ?? 0);\n        const boosts = Number(p.reblogs_count ?? p.boosts_count ?? 0);\n        const replies = Number(p.replies_count ?? 0);\n        const interaction = Math.log1p(likes) * 4 + Math.log1p(boosts) * 5 + Math.log1p(replies) * 3;\n        return freshness + interaction + remoteRank * 1.35 + 2;\n      }\n\n      const engagement =\n        Math.log1p(Number(p.likes_count ?? 0)) * 5 +\n        Math.log1p(Number(p.reposts_count ?? 0)) * 7 +\n        Math.log1p(Number(p.replies_count ?? 0)) * 4 +\n        Math.log1p(Number(p.views_count ?? 0)) * 1.5;\n      const mediaBonus = p.is_video ? 6 : (p.image_url || p.media_urls?.length) ? 3 : 0;\n      const verifiedBonus = p.user_profiles?.verified ? 3 : 0;\n      return freshness + engagement + mediaBonus + verifiedBonus;\n    };\n\n    return all\n      .filter((item) => item.type === 'post' || item.type === 'fedpost')\n      .sort((a, b) => score(b) - score(a))\n      .slice(0, PAGE_SIZE);\n  };\n'''

CARD_SOURCE = '''import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Globe, Heart, Languages, Loader2, MessageCircle, Repeat2, Send, Share2, Quote } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import * as federation from '@/api/federation';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/utils';

type Props = { post: any };

function stripHtml(value: string): string {
  if (!value) return '';
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return doc.body.textContent ?? '';
}

function actorHandle(actor: any, domain: string): string {
  const acct = actor?.acct ?? actor?.preferredUsername ?? actor?.username ?? 'unknown';
  return acct.includes('@') || !domain ? acct : `${acct}@${domain}`;
}

export function FederatedPostCard({ post }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const actor = post.actor ?? post.account ?? {};
  const username = actor.preferredUsername ?? actor.username ?? actor.acct ?? 'unknown';
  const domain = actor.url ? (() => { try { return new URL(actor.url).hostname; } catch { return actor.domain ?? ''; } })() : (actor.domain ?? post.fediverse_domain ?? '');
  const handle = actorHandle(actor, domain);
  const avatarUrl = actor.icon?.url ?? actor.avatar ?? actor.avatar_url;
  const displayName = actor.name ?? actor.display_name ?? username;
  const actorTarget = actor.url ?? actor.id ?? handle;
  const postUrl = post.url ?? post.uri ?? '';
  const createdAt = post.created_at ?? post.published ?? post.published_at ?? '';
  const rawText = stripHtml(post.content ?? post.text ?? '');

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

  useEffect(() => {
    setLiked(Boolean(post.favourited ?? post.liked));
    setReposted(Boolean(post.reblogged ?? post.boosted));
    setFollowing(Boolean(actor.following ?? post.following));
  }, [post.id, post.favourited, post.reblogged, actor.following, post.following]);

  const media = useMemo(() => Array.isArray(post.media_attachments) ? post.media_attachments : [], [post.media_attachments]);
  const rank = Number(post.platform_rank_score ?? 0);

  const run = async (key: string, fn: () => Promise<any>) => {
    if (!user) { navigate('/auth'); return; }
    setBusy(key);
    try { await fn(); } catch (error: any) { console.error(`[fediverse:${key}]`, error); }
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
    if (navigator.share) { try { await navigator.share({ title: displayName, text: rawText.slice(0, 180), url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); } catch {}
  };

  const quote = () => run('quote', async () => {
    const text = window.prompt('Add a comment to your quote (optional):', '');
    if (text === null) return;
    await federation.postStatus({ content: `${text.trim()}${text.trim() ? '\n\n' : ''}${postUrl || 'Fediverse post'}` });
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
    } catch { setTranslation('Translation failed.'); }
    finally { setTranslating(false); }
  };

  return (
    <article className="border-b border-border p-4 hover:bg-muted/5 transition-colors">
      <div className="flex gap-3">
        <button onClick={() => navigate(`/fediverse?acct=${encodeURIComponent(handle)}`)} className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
          {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold">{username[0]?.toUpperCase()}</span>}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{displayName}</span>
            <span className="text-xs text-purple-500 flex items-center gap-1"><Globe className="w-3 h-3" />{domain}</span>
            {createdAt && <span className="text-xs text-muted-foreground">· {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground truncate">@{handle}</span>
            {rank > 0 && <span className="text-[9px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">Rank {rank.toFixed(1)}</span>}
            {user && <button onClick={toggleFollow} disabled={busy === 'follow'} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${following ? 'border-border text-muted-foreground' : 'border-primary text-primary'}`}>{busy === 'follow' ? '…' : following ? 'Following' : 'Follow'}</button>}
          </div>

          <div className={`text-sm leading-relaxed mt-2 whitespace-pre-wrap break-words ${showMore ? '' : 'line-clamp-12'}`}>{rawText}</div>
          {rawText.length > 800 && <button onClick={() => setShowMore(v => !v)} className="text-xs text-primary mt-1 flex items-center gap-1">{showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{showMore ? 'Show less' : 'Show more'}</button>}

          {media.length > 0 && (
            <div className={`mt-3 grid gap-1 rounded-xl overflow-hidden ${media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {media.slice(0, 4).map((m: any, i: number) => m.type === 'image' ? <img key={i} src={m.url ?? m.preview_url} alt={m.description ?? ''} className="w-full max-h-80 object-cover" loading="lazy" /> : m.url ? <video key={i} src={m.url} controls className="w-full max-h-80 bg-black" /> : null)}
            </div>
          )}

          {translation && <div className="mt-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-sm">{translation}</div>}

          <div className="flex items-center justify-between mt-3 max-w-xl text-muted-foreground">
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
  );
}
'''

def apply():
    home = HOME.read_text()
    changed = False
    if IMPORT not in home:
        if ANCHOR not in home:
            raise RuntimeError('HomePage federation import anchor not found')
        home = home.replace(ANCHOR, ANCHOR + IMPORT, 1)
        changed = True

    if 'const fetchUnifiedForYouFeed = async' not in home:
        marker = '\n  const fetchInitialFeed = async (skipCache = false) => {'
        if marker not in home:
            raise RuntimeError('HomePage fetchInitialFeed marker not found')
        home = home.replace(marker, HELPER + marker, 1)
        changed = True

    old = '''      const items = await fetchFeed(0);\n      setFeedItems(items);'''
    new = '''      const items = activeTab === 'foryou'\n        ? await fetchUnifiedForYouFeed()\n        : await fetchFeed(0);\n      setFeedItems(items);'''
    if old in home:
        home = home.replace(old, new, 1)
        changed = True

    start = home.find('function FederatedPostCard({ post }: { post: any }) {')
    end_marker = '\n// ── Inline Suggestions ────────────────────────────────────────────────────────'
    if start >= 0:
        end = home.find(end_marker, start)
        if end < 0:
            raise RuntimeError('FediversePostCard end marker not found')
        home = home[:start] + home[end + 1:]
        changed = True

    HOME.write_text(home)
    CARD.parent.mkdir(parents=True, exist_ok=True)
    if not CARD.exists() or CARD.read_text() != CARD_SOURCE:
        CARD.write_text(CARD_SOURCE)
        changed = True
    return changed

if __name__ == '__main__':
    print('fediverse-unified:', 'changed' if apply() else 'already applied')
