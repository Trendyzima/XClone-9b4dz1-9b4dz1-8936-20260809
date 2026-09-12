import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Loader2, ExternalLink } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import * as federation from '@/api/federation';
import { FederatedPostCard } from '@/components/features/FederatedPostCard';
import { useSEO } from '@/hooks/useSEO';

const strings = (...values: unknown[]) => [...new Set(values.flatMap(v => typeof v === 'string' && v.trim() ? [v.trim()] : []))];
const unwrap = (v: any): any[] => {
  if (Array.isArray(v)) return v;
  return [v?.items, v?.posts, v?.statuses, v?.data?.items, v?.data?.posts, v?.data?.statuses, v?.data].find(Array.isArray) ?? [];
};
const isHttp = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v.trim());

function normalizePost(value: any) {
  if (!value) return null;
  const raw = value.raw_object ?? value.object ?? value.activity ?? {};
  const account = value.actor ?? value.account ?? value.author ?? value.remote_accounts ?? raw.attributedTo ?? {};
  const objectUrl = strings(value.object_url, value.canonical_url, value.uri, value.url, raw.id, raw.url).find(isHttp) ?? '';
  const actorUrl = strings(account.url, account.id, value.actor_url, value.actor_uri, raw.attributedTo?.url, raw.attributedTo?.id).find(isHttp) ?? '';
  return {
    ...raw, ...value,
    actor: { ...account, url: actorUrl || account.url, id: actorUrl || account.id, preferredUsername: account.preferredUsername ?? account.username ?? value.actor_username, name: account.name ?? account.display_name ?? value.actor_name, icon: account.icon ?? (account.avatar_url ? { url: account.avatar_url } : undefined) },
    id: objectUrl || value.id,
    object_url: objectUrl || value.object_url || value.uri || value.url,
    url: objectUrl || value.url,
    uri: objectUrl || value.uri,
    content: value.content ?? raw.content ?? value.text ?? raw.text ?? '',
    created_at: value.created_at ?? value.published_at ?? raw.published ?? raw.created_at ?? '',
    media_attachments: value.media_attachments ?? raw.media_attachments ?? value.attachments ?? [],
  };
}

async function findByCandidate(candidate: string): Promise<any | null> {
  const tables = [
    { table: 'remote_posts', select: '*, remote_accounts(*)', fields: ['object_url', 'url', 'uri', 'id'] },
    { table: 'federation_objects', select: '*', fields: ['object_url', 'url', 'uri', 'id'] },
    { table: 'federated_objects', select: '*', fields: ['object_url', 'url', 'uri', 'id'] },
  ];
  for (const source of tables) {
    for (const field of source.fields) {
      const query = supabase.from(source.table).select(source.select).eq(field, candidate).limit(1);
      const { data, error } = await query;
      if (!error && data?.[0]) return data[0];
    }
  }
  return null;
}

export default function FediversePostPage() {
  const location = useLocation(); const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [post, setPost] = useState<any>(() => normalizePost(location.state?.post));
  const [loading, setLoading] = useState(!post); const [error, setError] = useState('');
  const objectUrl = useMemo(() => searchParams.get('url') || post?.object_url || post?.url || post?.uri || '', [searchParams, post]);
  useSEO({ title: post ? `${post.actor?.name ?? post.actor?.preferredUsername ?? 'Fediverse post'} on Testagram` : 'Fediverse post — Testagram', description: 'View a Fediverse post inside Testagram.', url: `/fediverse/post?url=${encodeURIComponent(objectUrl)}`, type: 'article' });

  useEffect(() => {
    if (!objectUrl || post) { if (post) setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const candidates = strings(objectUrl, decodeURIComponent(objectUrl));
        let cached: any = null;
        for (const candidate of candidates) { cached = await findByCandidate(candidate); if (cached) break; }
        if (!cached) {
          const timeline: any = await federation.getFederatedTimeline({ limit: 200 });
          const items = unwrap(timeline);
          cached = items.find(item => {
            const raw = item.raw_object ?? item.object ?? item.activity ?? {};
            const ids = strings(item.object_url, item.canonical_url, item.uri, item.url, item.id, raw.id, raw.url);
            return candidates.some(c => ids.includes(c));
          });
        }
        if (!cached) throw new Error('This Fediverse post could not be resolved from the canonical remote object.');
        if (!cancelled) setPost(normalizePost(cached));
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load this Fediverse post.'); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load(); return () => { cancelled = true; };
  }, [objectUrl, post]);

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!post) return <div className="min-h-screen bg-background p-8 text-center"><Globe className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-semibold">Unable to open this post in Testagram</p><p className="text-sm mt-1">{error || 'The remote post could not be resolved.'}</p><button onClick={() => navigate('/fediverse')} className="mt-5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold">Back to Fediverse</button></div>;
  const original = post.object_url || post.url || post.uri;
  return <div className="min-h-screen bg-background pb-20 md:pb-0"><div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border p-3 flex items-center gap-3"><button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-muted" aria-label="Go back"><ArrowLeft className="w-5 h-5" /></button><div><h1 className="font-bold">Post</h1><p className="text-[11px] text-muted-foreground flex items-center gap-1"><Globe className="w-3 h-3" />Fediverse · viewed in Testagram</p></div></div><FederatedPostCard post={post} disableNavigation />{original && <div className="px-4 py-3 text-center"><a href={original} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">Open original Fediverse object <ExternalLink className="w-3 h-3" /></a></div>}</div>;
}
