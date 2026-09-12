import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const admin = createClient(URL, SERVICE, { auth: { persistSession:false, autoRefreshToken:false } });
const enc=(v:string)=>encodeURIComponent(v);
const b64=(x:ArrayBuffer|Uint8Array)=>btoa(String.fromCharCode(...new Uint8Array(x)));
async function send(local:any,inbox:string,activity:any){
  if(!local?.private_key_jwk) throw new Error("local actor has no private signing key");
  const body=JSON.stringify(activity),u=new URL(inbox),date=new Date().toUTCString();
  const digest=`SHA-256=${b64(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body)))}`;
  const key=await crypto.subtle.importKey("jwk",local.private_key_jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signing=`(request-target): post ${u.pathname}${u.search}\nhost: ${u.host}\ndate: ${date}\ndigest: ${digest}`;
  const sig=b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(signing)));
  return fetch(inbox,{method:"POST",body,headers:{Date:date,Digest:digest,Host:u.host,Accept:"application/activity+json, application/ld+json","Content-Type":"application/activity+json",Signature:`keyId=\"${local.uri || local.actor_url}#main-key\",algorithm=\"rsa-sha256\",headers=\"(request-target) host date digest\",signature=\"${sig}\"`,'User-Agent':'Testagram-Federation/4.0'}});
}
Deno.serve(async req=>{
  if(req.method!=="POST") return new Response(JSON.stringify({error:"POST required"}),{status:405,headers:{"Content-Type":"application/json"}});
  const supplied=req.headers.get("x-federation-worker-key")||"";
  const expected=Deno.env.get("FEDERATION_WORKER_KEY")||"";
  if(!expected || supplied!==expected) return new Response(JSON.stringify({error:"Forbidden"}),{status:403,headers:{"Content-Type":"application/json"}});
  const limit=Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")||25),1),100);
  const {data:jobs,error}=await admin.from("federation_deliveries").select("*").in("status",["pending","retry"]).lte("next_attempt_at",new Date().toISOString()).order("next_attempt_at",{ascending:true}).limit(limit);
  if(error) return new Response(JSON.stringify({error:error.message}),{status:500});
  let delivered=0,failed=0;
  for(const job of jobs||[]){
    await admin.from("federation_deliveries").update({status:"in_flight",attempt_count:(job.attempt_count||0)+1,last_attempt_at:new Date().toISOString(),locked_at:new Date().toISOString()}).eq("id",job.id).in("status",["pending","retry"]);
    try{
      const activity=job.activity_payload;
      if(!activity) throw new Error("missing activity payload");
      const actor=activity.actor;
      const {data:local}=await admin.from("federated_actors").select("*").or(`uri.eq.${enc(actor)},actor_url.eq.${enc(actor)}`).limit(1).maybeSingle();
      if(!local) throw new Error("local actor not found");
      const r=await send(local,job.target_inbox,activity); const body=(await r.text()).slice(0,1000);
      if(!r.ok) throw new Error(`HTTP ${r.status}: ${body}`);
      await admin.from("federation_deliveries").update({status:"delivered",last_status_code:r.status,last_error:null,delivered_at:new Date().toISOString(),locked_at:null}).eq("id",job.id);
      delivered++;
    }catch(e){
      const attempts=(job.attempt_count||0)+1; const dead=attempts>=8; const delay=Math.min(3600,30*Math.pow(2,Math.max(0,attempts-1)));
      await admin.from("federation_deliveries").update({status:dead?"dead":"retry",next_attempt_at:new Date(Date.now()+delay*1000).toISOString(),last_error:e instanceof Error?e.message:String(e),locked_at:null}).eq("id",job.id);
      failed++;
    }
  }
  await admin.from("federation_replays").delete().lt("expires_at",new Date().toISOString());
  return new Response(JSON.stringify({ok:true,processed:(jobs||[]).length,delivered,failed}),{headers:{"Content-Type":"application/json"}});
});
