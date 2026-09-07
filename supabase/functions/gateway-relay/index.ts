import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const PUBLIC = "https://www.w3.org/ns/activitystreams#Public";
const CTX = ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"];
const ACCEPT = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/activity+json';
const CORS = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type, signature, date, digest", "Access-Control-Allow-Methods":"GET,POST,OPTIONS" };
const json = (v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});

async function db(path:string, init:RequestInit={}){const h=new Headers(init.headers);h.set("apikey",SERVICE_KEY);h.set("Authorization",`Bearer ${SERVICE_KEY}`);h.set("Content-Type","application/json");return fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...init,headers:h});}
async function user(req:Request){const a=req.headers.get("Authorization");if(!a)return null;const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:ANON_KEY,Authorization:a}});if(!r.ok)return null;return (await r.json()).id||null;}
function enc(s:string){return encodeURIComponent(s);}
function bytesToB64(x:ArrayBuffer|Uint8Array){return btoa(String.fromCharCode(...new Uint8Array(x)));}
function b64ToBytes(s:string){const b=atob(s);return Uint8Array.from(b,c=>c.charCodeAt(0));}

async function ensureActor(uid:string,origin:string){
  const r=await db(`federation_actors?user_id=eq.${enc(uid)}&select=*`);const old=await r.json();if(old[0])return old[0];
  const p=await db(`profiles?id=eq.${enc(uid)}&select=username,display_name,bio,avatar_url`);const pr=await p.json();
  const username=String(pr[0]?.username||`user_${uid.replaceAll("-","").slice(0,12)}`).toLowerCase().replace(/[^a-z0-9_-]/g,"_").slice(0,32);
  const actorUrl=`${origin}/users/${enc(username)}`, inboxUrl=`${actorUrl}/inbox`;
  const kp=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
  const priv=await crypto.subtle.exportKey("jwk",kp.privateKey), spki=new Uint8Array(await crypto.subtle.exportKey("spki",kp.publicKey));
  const raw=bytesToB64(spki), pem=`-----BEGIN PUBLIC KEY-----\n${raw.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
  const w=await db("federation_actors",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({user_id:uid,username,actor_url:actorUrl,inbox_url:inboxUrl,public_key_pem:pem,private_key_jwk:priv})});
  if(!w.ok)throw new Error(`actor creation failed: ${await w.text()}`);return(await w.json())[0];
}
async function remoteJson(url:string,accept=ACCEPT){const r=await fetch(url,{headers:{Accept:accept,"User-Agent":"Testagram-Federation/1.0"}});if(!r.ok)throw new Error(`remote ${r.status} ${url}`);return r.json();}
async function resolveActor(target:string){
  let id=String(target||"").replace(/^@/,"");
  if(!id.startsWith("http")){const [u,d]=id.split("@");if(!u||!d)throw new Error("Expected @user@domain or ActivityPub actor URL");const wf=await remoteJson(`https://${d}/.well-known/webfinger?resource=${enc(`acct:${u}@${d}`)}`,"application/jrd+json");const l=(wf.links||[]).find((x:any)=>x.rel==="self"&&x.href&&(String(x.type||"").includes("activity+json")||String(x.type||"").includes("activitystreams")));id=l?.href;if(!id)throw new Error("WebFinger actor not found");}
  const a=await remoteJson(id), inbox=a.endpoints?.sharedInbox||a.inbox;if(!inbox)throw new Error("Remote actor has no inbox");
  await db("federation_remote_actors",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({actor_url:a.id||id,acct:a.preferredUsername?`${a.preferredUsername}@${new URL(a.id||id).hostname}`:null,username:a.preferredUsername||null,domain:new URL(a.id||id).hostname,inbox_url:a.inbox||null,shared_inbox_url:a.endpoints?.sharedInbox||null,actor:a,fetched_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  return {actorUrl:a.id||id,actor:a,inbox};
}
async function signedPost(local:any,inbox:string,activity:any){
  const body=JSON.stringify(activity), u=new URL(inbox), date=new Date().toUTCString();
  const digest=`SHA-256=${bytesToB64(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body)))}`;
  const key=await crypto.subtle.importKey("jwk",local.private_key_jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signing=`(request-target): post ${u.pathname}${u.search}\nhost: ${u.host}\ndate: ${date}\ndigest: ${digest}`;
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(signing));
  const r=await fetch(inbox,{method:"POST",headers:{Host:u.host,Date:date,Digest:digest,Signature:`keyId="${local.actor_url}#main-key",headers="(request-target) host date digest",signature="${bytesToB64(sig)}"`,"Content-Type":'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',Accept:ACCEPT,"User-Agent":"Testagram-Federation/1.0"},body});
  return {ok:r.ok,status:r.status,text:(await r.text()).slice(0,1000)};
}
async function deliver(uid:string,local:any,inbox:string,type:string,object:any,to?:string){const id=`${local.actor_url}#activities/${crypto.randomUUID()}`,a:any={"@context":CTX,id,type,actor:local.actor_url,object};if(to)a.to=to;const r=await signedPost(local,inbox,a);await db("federation_outbox",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:uid,activity_id:id,activity_type:type,actor_url:local.actor_url,inbox_url:inbox,payload:a,status:r.ok?"delivered":r.status>=500?"pending":"failed",attempts:1,last_attempt_at:new Date().toISOString(),next_attempt_at:r.ok?null:new Date(Date.now()+60000).toISOString(),http_status:r.status,last_error:r.ok?null:r.text})});return {...r,activityId:id,activity:a};}

function sigParts(s:string){const o:any={};for(const p of s.split(/,(?=\w+=)/)){const i=p.indexOf("=");if(i>0)o[p.slice(0,i).trim()]=p.slice(i+1).trim().replace(/^"|"$/g,"");}return o;}
async function verifyInbox(req:Request,body:string,activity:any){
  const sh=req.headers.get("Signature"), date=req.headers.get("Date"), digest=req.headers.get("Digest");if(!sh||!date||!digest)throw new Error("Missing ActivityPub signature headers");
  const t=Date.parse(date);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>12*60*60*1000)throw new Error("Stale ActivityPub signature");
  const expected=`SHA-256=${bytesToB64(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body)))}`;if(digest!==expected)throw new Error("Digest mismatch");
  const p=sigParts(sh), keyId=p.keyId;if(!keyId)throw new Error("Missing signature keyId");const actorUrl=keyId.split("#")[0];const remote=await remoteJson(actorUrl);const pem=remote.publicKey?.publicKeyPem;if(!pem)throw new Error("Remote actor has no public key");
  const b=pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,"");const key=await crypto.subtle.importKey("spki",b64ToBytes(b),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const u=new URL(req.url), signed=(p.headers||"(request-target) host date digest").split(" "), lines=[];for(const h of signed){if(h==="(request-target)")lines.push(`(request-target): ${req.method.toLowerCase()} ${u.pathname}${u.search}`);else if(h==="host")lines.push(`host: ${u.host}`);else if(h==="date")lines.push(`date: ${date}`);else if(h==="digest")lines.push(`digest: ${digest}`);else lines.push(`${h}: ${req.headers.get(h)||""}`);}
  const ok=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64ToBytes(p.signature),new TextEncoder().encode(lines.join("\n")));if(!ok)throw new Error("Invalid ActivityPub HTTP signature");return actorUrl;
}

async function inbox(req:Request,username:string,bodyText:string){
  const activity=JSON.parse(bodyText), actor=await verifyInbox(req,bodyText,activity);const id=activity.id;if(!id)throw new Error("Activity id required");
  const ins=await db("federation_inbox",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({activity_id:id,activity_type:activity.type||"Unknown",actor_url:actor,payload:activity,processing_status:"received",received_at:new Date().toISOString()})});
  if(!ins.ok && ![409].includes(ins.status))throw new Error(`Inbox persistence failed: ${await ins.text()}`);
  if(activity.type==="Accept"||activity.type==="Reject"){
    const followId=typeof activity.object==="string"?activity.object:activity.object?.id;const r=await db(`federation_relationships?activity_id=eq.${enc(followId||"")}&select=user_id,remote_actor_url`);const rows=await r.json();if(rows[0])await db(`federation_relationships?user_id=eq.${enc(rows[0].user_id)}&remote_actor_url=eq.${enc(rows[0].remote_actor_url)}`,{method:"PATCH",body:JSON.stringify({relationship:activity.type==="Accept"?"accepted":"rejected",updated_at:new Date().toISOString(),last_error:null})});
  }
  if(activity.type==="Undo"){const obj=activity.object;const followId=typeof obj==="string"?obj:obj?.id;const r=await db(`federation_relationships?activity_id=eq.${enc(followId||"")}&select=user_id,remote_actor_url`);const rows=await r.json();if(rows[0])await db(`federation_relationships?user_id=eq.${enc(rows[0].user_id)}&remote_actor_url=eq.${enc(rows[0].remote_actor_url)}`,{method:"PATCH",body:JSON.stringify({relationship:"unfollowed",updated_at:new Date().toISOString()})});}
  await db(`federation_inbox?activity_id=eq.${enc(id)}`,{method:"PATCH",body:JSON.stringify({processing_status:"processed",processed_at:new Date().toISOString()})});return json({ok:true,duplicate:!ins.ok&&ins.status===409});
}

async function route(req:Request,path:string,input:any){
  const origin=new URL(req.url).origin;
  if(path==="/health")return json({ok:true,service:"gateway-relay",activityPub:true});
  if(path==="/.well-known/webfinger"||path==="/webfinger"||path.startsWith("/webfinger/")){
    const resource=new URL(req.url).searchParams.get("resource")||decodeURIComponent(path.slice(path.indexOf("/webfinger/")+11));const acct=resource.replace(/^acct:/,"").replace(/^@/,"");const [u,d]=acct.split("@");if(!u||!d)return json({error:"invalid account"},400);const r=await db(`federation_actors?username=eq.${enc(u)}&select=username,actor_url`);const rows=await r.json();if(!rows[0])return json({error:"actor not found"},404);return json({subject:`acct:${u}@${d}`,aliases:[rows[0].actor_url],links:[{rel:"self",type:"application/activity+json",href:rows[0].actor_url}]});
  }
  const am=path.match(/^\/users\/([^/]+)$/);if(am){const r=await db(`federation_actors?username=eq.${enc(decodeURIComponent(am[1]))}&select=*`);const rows=await r.json();if(!rows[0])return json({error:"actor not found"},404);const a=rows[0];return json({"@context":CTX,id:a.actor_url,type:"Person",preferredUsername:a.username,name:a.username,url:a.actor_url,inbox:a.inbox_url,outbox:`${a.actor_url}/outbox`,followers:`${a.actor_url}/followers`,following:`${a.actor_url}/following`,publicKey:{id:`${a.actor_url}#main-key`,owner:a.actor_url,publicKeyPem:a.public_key_pem}});}
  const im=path.match(/^\/users\/([^/]+)\/inbox$/);if(im&&req.method==="POST")return inbox(req,decodeURIComponent(im[1]),JSON.stringify(input.__raw||input));
  const uid=await user(req);if(!uid)return json({error:"Authentication required"},401);const local=await ensureActor(uid,origin);
  if(path==="/timeline/federated"){const r=await db("federation_objects?select=*&order=published_at.desc&limit=100");return json(await r.json());}
  if(path==="/notifications"){const r=await db("federation_inbox?select=*&order=received_at.desc&limit=50");return json(await r.json());}
  if(path==="/follow"||path==="/unfollow"){const remote=await resolveActor(input.target);const f={type:"Follow",actor:local.actor_url,object:remote.actorUrl};const out=path==="/follow"?await deliver(uid,local,remote.inbox,"Follow",remote.actorUrl,remote.actorUrl):await deliver(uid,local,remote.inbox,"Undo",f,remote.actorUrl);await db("federation_relationships",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({user_id:uid,remote_actor_url:remote.actorUrl,relationship:path==="/follow"?(out.ok?"pending":"failed"):(out.ok?"unfollow_pending":"failed"),activity_id:out.activityId,last_error:out.ok?null:out.text,updated_at:new Date().toISOString()})});return json(out,out.ok?200:502);}
  if(["/favorite","/unfavorite","/boost","/unboost"].includes(path)){const post=input.post_id;if(!post)return json({error:"post_id required"},400);let r=await db(`federation_objects?object_url=eq.${enc(post)}&select=object&limit=1`),rows=await r.json(),obj=rows[0]?.object;if(!obj){obj=await remoteJson(post);await db("federation_objects",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({object_url:post,actor_url:obj.attributedTo||obj.actor,object_type:obj.type,object:obj,published_at:obj.published?new Date(obj.published).toISOString():null})});}const remote=await resolveActor(obj.attributedTo||obj.actor),type=path.includes("favorite")?"Like":"Announce",base={type,actor:local.actor_url,object:post};const out=path.includes("unfavorite")||path.includes("unboost")?await deliver(uid,local,remote.inbox,"Undo",base,remote.actorUrl):await deliver(uid,local,remote.inbox,type,post,remote.actorUrl);return json(out,out.ok?200:502);}
  if(path==="/reply"){const obj=await remoteJson(input.post_id),remote=await resolveActor(obj.attributedTo||obj.actor),note={id:`${local.actor_url}#notes/${crypto.randomUUID()}`,type:"Note",attributedTo:local.actor_url,content:String(input.content||""),inReplyTo:input.post_id,to:[remote.actorUrl],cc:[PUBLIC]};const out=await deliver(uid,local,remote.inbox,"Create",note,remote.actorUrl);return json(out,out.ok?200:502);}
  return json({error:"Unknown gateway path",path},404);
}

Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});try{const raw=await req.text();let input:any={};try{input=raw?JSON.parse(raw):{};}catch{};const u=new URL(req.url);let path=input.path||u.pathname.replace(/^\/functions\/v1\/gateway-relay/,"").replace(/^\/gateway-relay/,"")||"/";if(path==="/")path="/health";input.__raw=raw?JSON.parse(raw):{};return await route(req,path,input.__raw?.body||input);}catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Gateway failure"},500)}});
