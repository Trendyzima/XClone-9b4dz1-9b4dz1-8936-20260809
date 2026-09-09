import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY')!;
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const json = (v:unknown,s=200) => new Response(JSON.stringify(v), {status:s, headers:{...CORS,'Content-Type':'application/json','Cache-Control':'public, max-age=5, s-maxage=10, stale-while-revalidate=30'}});

async function input(req:Request) {
  const u = new URL(req.url);
  let body:any = {};
  if (req.method !== 'GET') { try { body = await req.json(); } catch {} }
  return {
    limit: Math.min(100, Math.max(10, Number(body.limit ?? u.searchParams.get('limit') ?? 20))),
    before: String(body.before ?? u.searchParams.get('before') ?? '').trim() || null,
  };
}

function nativeFrequency(p:any) {
  const a = Array.isArray(p.post_analytics) ? p.post_analytics[0] : p.post_analytics;
  return Number(a?.likes ?? 0) + Number(a?.replies ?? 0) + Number(a?.reposts ?? 0);
}

function compareFrequency(a:any,b:any) {
  if (b.frequency !== a.frequency) return b.frequency - a.frequency;
  const bt = Date.parse(b.created_at || b.published_at || '') || 0;
  const at = Date.parse(a.created_at || a.published_at || '') || 0;
  return bt - at;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});
  try {
    const {limit,before} = await input(req);
    const nativeQuery = admin.from('posts')
      .select('*,author:profiles!posts_author_id_fkey(*),post_analytics(likes,replies,reposts)')
      .is('deleted_at',null).eq('visibility','public')
      .order('created_at',{ascending:false}).limit(Math.min(100,limit*3));
    const fedQuery = admin.from('federated_objects')
      .select('*').order('published_at',{ascending:false}).limit(Math.min(100,limit*3));
    const activityQuery = admin.from('federated_activities')
      .select('object_uri,activity_type').in('activity_type',['Like','Announce']);
    if (before) { nativeQuery.lt('created_at',before); fedQuery.lt('published_at',before); }
    const [native,fed,activities] = await Promise.all([nativeQuery,fedQuery,activityQuery]);
    if (native.error) throw new Error(`native feed: ${native.error.message}`);
    if (fed.error) throw new Error(`fediverse feed: ${fed.error.message}`);
    if (activities.error) throw new Error(`federated activity ranking: ${activities.error.message}`);

    const fedFrequency = new Map<string,number>();
    for (const activity of activities.data || []) {
      const uri = String(activity.object_uri || '').trim();
      if (!uri) continue;
      fedFrequency.set(uri,(fedFrequency.get(uri) || 0) + 1);
    }

    const candidates = [
      ...(native.data||[]).map((p:any)=>({...p,source:'xclone',origin:'local',frequency:nativeFrequency(p)})),
      ...(fed.data||[])
        .filter((p:any)=>!p.sensitive && (p.object_type==='Note'||p.object_type==='Article'||p.object_type==='Question'||p.object_type==='Video'))
        .map((p:any)=>({...p,source:'fediverse',origin:'federated',fediv:true,frequency:fedFrequency.get(String(p.uri)) || 0}))
    ];

    const seen = new Set<string>();
    const items = candidates
      .filter(p=>{
        const id=p.source==='fediverse' ? (p.object_url||p.uri||p.id) : p.id;
        if(!id||seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort(compareFrequency)
      .slice(0,limit)
      .map(({frequency,...item})=>item);

    return json({ok:true,items,meta:{count:items.length,native:items.filter(x=>x.source==='xclone').length,fediverse:items.filter(x=>x.source==='fediverse').length,next_cursor:items.at(-1)?.created_at||items.at(-1)?.published_at||null,rankedAt:new Date().toISOString(),ranking:'frequency_first'}});
  } catch(e) { console.error(e); return json({error:e instanceof Error?e.message:'Feed failed'},500); }
});
