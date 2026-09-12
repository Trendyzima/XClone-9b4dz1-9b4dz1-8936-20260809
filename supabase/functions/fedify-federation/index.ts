import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createFederation } from 'npm:@fedify/fedify@2.4.0';

const ORIGIN='https://federation.testagram.site';
const HOST=new URL(ORIGIN).hostname;
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')??'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const federation=createFederation({origin:ORIGIN});
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,accept,digest,signature','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'};
const json=(body:unknown,status=200,type='application/json')=>new Response(JSON.stringify(body),{status,headers:{...CORS,'Content-Type':`${type}; charset=utf-8`}});
const actorUrl=(u:string)=>`${ORIGIN}/users/${encodeURIComponent(u)}`;
const objectUrl=(id:string)=>`${ORIGIN}/objects/${encodeURIComponent(id)}`;
const text=async(req:Request)=>await req.text();
const isAp=(req:Request)=>{const a=req.headers.get('accept')||'';return a.includes('activity+json')||a.includes('application/ld+json')||a.includes('application/activity+json')};

async function profile(username:string){const {data,error}=await db.from('profiles').select('id,username,display_name,full_name,bio,avatar_url,website').eq('username',username).maybeSingle();if(error)throw error;return data;}
async function actorRow(username:string){const p=await profile(username);if(!p)return null;const {data}=await db.from('federation_actors').select('public_key_pem,private_key_jwk,actor_url').eq('user_id',p.id).maybeSingle();return {p,key:data};}
function actorDoc(p:any,key:any){const id=actorUrl(p.username);return {'@context':['https://www.w3.org/ns/activitystreams','https://w3id.org/security/v1'],id,type:'Person',preferredUsername:p.username,name:p.display_name||p.full_name||p.username,summary:p.bio||'',url:`https://testagram.site/profile/${encodeURIComponent(p.username)}`,inbox:`${id}/inbox`,outbox:`${id}/outbox`,followers:`${id}/followers`,following:`${id}/following`,publicKey:{id:`${id}#main-key`,owner:id,publicKeyPem:key?.public_key_pem||''},icon:p.avatar_url?{type:'Image',mediaType:'image/*',url:p.avatar_url}:undefined};}
async function findObject(id:string){for(const table of ['federation_objects','federated_objects','remote_posts']){for(const field of ['object_url','canonical_url','uri','url','id']){const {data}=await db.from(table).select('*').eq(field,id).limit(1);if(data?.[0])return {table,row:data[0]};}}return null;}
function normalizeObject(row:any){const raw=row.raw_object??row.object??row;const id=row.object_url||row.canonical_url||row.uri||row.url||raw.id;const actor=row.actor_url||row.actor_uri||raw.attributedTo;return {'@context':'https://www.w3.org/ns/activitystreams',id,type:'Note',attributedTo:actor,url:id,published:row.published_at||row.created_at||raw.published,content:row.content||raw.content||'',to:['https://www.w3.org/ns/activitystreams#Public'],cc:actor?[`${actor}/followers`]:[]};}
async function storeActivity(activity:any){const id=typeof activity.id==='string'?activity.id:null;if(!id)return;if(!activity.type)return;await db.from('federation_inbox_activities').upsert({activity_id:id,activity_type:activity.type,actor_url:typeof activity.actor==='string'?activity.actor:null,payload:activity,received_at:new Date().toISOString()},{onConflict:'activity_id'});}
async function projectNote(note:any,activity:any){const id=note.id||note.url;if(!id)return;const actor=typeof note.attributedTo==='string'?note.attributedTo:null;const row={object_url:id,actor_url:actor,content:note.content||'',published_at:note.published||new Date().toISOString(),raw_object:note,updated_at:new Date().toISOString()};for(const table of ['federation_objects','remote_posts']){const {error}=await db.from(table).upsert(row,{onConflict:'object_url'});if(!error)break;}return id;}
async function dispatch(activity:any){const type=activity.type;const actor=typeof activity.actor==='string'?activity.actor:null;const obj=typeof activity.object==='object'?activity.object:null;const target=typeof activity.object==='string'?activity.object:obj?.id||obj?.url||null;if(type==='Create'&&obj&&(obj.type==='Note'||obj.type==='Article'||obj.type==='Question'))await projectNote(obj,activity);
if(type==='Update'&&obj)await projectNote(obj,activity);
if(type==='Delete'&&target){for(const t of ['federation_objects','federated_objects','remote_posts'])await db.from(t).delete().eq('object_url',target);}
if(['Follow','Like','Announce','Block','Undo','Accept','Reject'].includes(type)){await db.from('federation_remote_activities').upsert({activity_id:activity.id||crypto.randomUUID(),activity_type:type,actor_url:actor,target_url:target,payload:activity,created_at:new Date().toISOString()},{onConflict:'activity_id'});}
return {accepted:true,type};}
async function collection(kind:string,username:string){const p=await profile(username);if(!p)return null;const id=actorUrl(username);if(kind==='outbox')return {'@context':'https://www.w3.org/ns/activitystreams',id:`${id}/outbox`,type:'OrderedCollection',totalItems:0,orderedItems:[]};return {'@context':'https://www.w3.org/ns/activitystreams',id:`${id}/${kind}`,type:'OrderedCollection',totalItems:0,orderedItems:[]};}

Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});const u=new URL(req.url);const path=u.pathname.replace(/^\/+|\/+$/g,'');try{
if(req.method==='GET'&&(path===''||path==='health'))return json({ok:true,service:'fedify-federation',framework:'Fedify',version:'2.4.0',mode:'protocol-adapter',routes:true,federationInitialized:Boolean(federation)});
if(req.method==='GET'&&path==='capabilities')return json({ok:true,protocol:'activitypub',routes:['webfinger','nodeinfo','actor','outbox','followers','following','inbox','object'],activities:['Create','Update','Delete','Follow','Undo','Like','Announce','Accept','Reject','Block']});
if(req.method==='GET'&&path==='.well-known/webfinger'){const resource=u.searchParams.get('resource')||'';const m=resource.match(/^acct:([^@]+)@([^:]+)$/i);if(!m||m[2].toLowerCase()!==HOST)return json({error:'Resource not found'},404);const p=await profile(m[1]);if(!p)return json({error:'Resource not found'},404);const id=actorUrl(p.username);return json({subject:`acct:${p.username}@${HOST}`,aliases:[id],links:[{rel:'self',type:'application/activity+json',href:id}]});}
if(req.method==='GET'&&path==='.well-known/nodeinfo')return json({links:[{rel:'http://nodeinfo.diaspora.software/ns/schema/2.1',href:`${ORIGIN}/nodeinfo/2.1`} ]});
if(req.method==='GET'&&path==='nodeinfo/2.1')return json({'version':'2.1','software':{name:'testagram',version:'1.0.0'},'protocols':['activitypub'],'usage':{users:{total:0,activeMonth:0,activeHalfyear:0},localPosts:0},'openRegistrations':true});
const am=path.match(/^users\/([^/]+)$/);if(req.method==='GET'&&am){const r=await actorRow(decodeURIComponent(am[1]));if(!r)return json({error:'Actor not found'},404);return json(actorDoc(r.p,r.key),200,'application/activity+json');}
const cm=path.match(/^users\/([^/]+)\/(outbox|followers|following)$/);if(req.method==='GET'&&cm){const c=await collection(cm[2],decodeURIComponent(cm[1]));return c?json(c,200,'application/activity+json'):json({error:'Actor not found'},404);}
const om=path.match(/^objects\/([^/]+)$/);if(req.method==='GET'&&om){const found=await findObject(decodeURIComponent(om[1]));return found?json(normalizeObject(found.row),200,'application/activity+json'):json({error:'Object not found'},404);}
if(req.method==='POST'&&(path==='inbox'||/^users\/[^/]+\/inbox$/.test(path))){const raw=await text(req);let activity;try{activity=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}if(!activity?.type)return json({error:'Activity type required'},400);await storeActivity(activity);const result=await dispatch(activity);return json(result,202);}
return json({error:'Fedify route not found'},404);
}catch(e){console.error(e);return json({error:e instanceof Error?e.message:String(e)},500);}});
