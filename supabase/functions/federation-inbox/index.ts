import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const MAX_BODY = 2_000_000;
const MAX_CLOCK_SKEW = 300;
const PUBLIC = "https://www.w3.org/ns/activitystreams#Public";
const CTX = ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"];
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "accept,content-type,date,digest,signature,host", "Access-Control-Allow-Methods": "POST,OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const text = (v: unknown) => typeof v === "string" ? v : "";
const uri = (v: unknown) => typeof v === "string" ? v : v && typeof v === "object" ? text((v as Record<string, unknown>).id) : "";
const now = () => new Date().toISOString();
const enc = (v: string) => encodeURIComponent(v);
const b64 = (x: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(x)));

function pemToBytes(pem: string) {
  const b64pem = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  const bin = atob(b64pem); return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function verifySignature(req: Request, raw: string, actorUri: string) {
  const signature = req.headers.get("signature"), digest = req.headers.get("digest"), date = req.headers.get("date");
  if (!signature || !digest || !date) throw new Error("missing HTTP signature headers");
  const when = Date.parse(date);
  if (!Number.isFinite(when) || Math.abs(Date.now() - when) > MAX_CLOCK_SKEW * 1000) throw new Error("stale Date header");
  const expected = `SHA-256=${b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)))}`;
  if (digest !== expected) throw new Error("digest mismatch");
  const params: Record<string,string> = {};
  for (const m of signature.matchAll(/([A-Za-z][A-Za-z0-9_-]*)="([^"]*)"/g)) params[m[1].toLowerCase()] = m[2];
  if ((params.algorithm || "").toLowerCase() !== "rsa-sha256" || !params.headers || !params.signature) throw new Error("unsupported HTTP signature");
  const keyId = params.keyid || actorUri;
  if (!keyId.startsWith("https://")) throw new Error("invalid signature keyId");
  const keyUrl = keyId.split("#")[0];
  if (keyUrl !== actorUri) throw new Error("signature key owner does not match actor");
  const actorResponse = await fetch(actorUri, { headers: { accept: "application/activity+json, application/ld+json" } });
  if (!actorResponse.ok) throw new Error(`actor key fetch failed: ${actorResponse.status}`);
  const actorDoc = await actorResponse.json();
  const key = actorDoc.publicKey;
  if (!key?.publicKeyPem || (key.id && key.id !== keyId)) throw new Error("actor public key mismatch");
  const signing = params.headers.split(/\s+/).map((name: string) => {
    const lower = name.toLowerCase();
    if (lower === "(request-target)") return `(request-target): ${req.method.toLowerCase()} ${new URL(req.url).pathname}${new URL(req.url).search}`;
    const value = req.headers.get(name); if (value === null) throw new Error(`signed header missing: ${name}`);
    return `${lower}: ${value}`;
  }).join("\n");
  const cryptoKey = await crypto.subtle.importKey("spki", pemToBytes(key.publicKeyPem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const sigBytes = Uint8Array.from(atob(params.signature), c => c.charCodeAt(0));
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sigBytes, new TextEncoder().encode(signing))) throw new Error("HTTP signature invalid");
  return { keyId, expiresAt: new Date(when + MAX_CLOCK_SKEW * 1000).toISOString() };
}

async function localActorForObject(objectUri: string) {
  const { data, error } = await admin.from("federated_actors").select("*").or(`uri.eq.${enc(objectUri)},actor_url.eq.${enc(objectUri)}`).limit(1);
  if (error) throw error; return data?.[0] || null;
}
async function remoteActor(actorUri: string) {
  const r = await fetch(actorUri, { headers: { accept: "application/activity+json, application/ld+json" } });
  if (!r.ok) throw new Error(`remote actor fetch failed: ${r.status}`);
  return await r.json();
}
async function signAndSend(local: any, inbox: string, activity: any) {
  if (!local?.private_key_jwk) throw new Error("local actor has no private signing key");
  const body = JSON.stringify(activity), u = new URL(inbox), date = new Date().toUTCString();
  const digest = `SHA-256=${b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))}`;
  const key = await crypto.subtle.importKey("jwk", local.private_key_jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signing = `(request-target): post ${u.pathname}${u.search}\nhost: ${u.host}\ndate: ${date}\ndigest: ${digest}`;
  const sig = b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signing)));
  return fetch(inbox, { method: "POST", body, headers: { Date: date, Digest: digest, Host: u.host, Accept: "application/activity+json, application/ld+json", "Content-Type": "application/activity+json", Signature: `keyId="${local.uri || local.actor_url}#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${sig}"`, "User-Agent": "Testagram-Federation/4.0" } });
}
async function recordDelivery(local: any, activity: any, inbox: string, response: Response | null, error?: string) {
  const { data: inserted } = await admin.from("federated_activities").insert({ uri: activity.id, activity_type: activity.type, actor_uri: local.uri || local.actor_url, object_uri: uri(activity.object) || null, target_uri: uri(activity.target) || null, raw_activity: activity, received_at: now(), processed_at: now() }).select("id").single();
  if (!inserted?.id) return;
  await admin.from("federation_deliveries").upsert({ activity_id: inserted.id, target_inbox: inbox, instance_domain: new URL(inbox).hostname, status: response?.ok ? "delivered" : error ? "retry" : "retry", attempt_count: 1, next_attempt_at: new Date(Date.now() + 60000).toISOString(), last_attempt_at: now(), last_status_code: response?.status || null, last_error: error || null, delivered_at: response?.ok ? now() : null, activity_payload: activity }, { onConflict: "activity_id,target_inbox" });
}

async function acceptOrReject(local: any, remoteActorUri: string, followActivity: any, accept: boolean) {
  const remote = await remoteActor(remoteActorUri);
  const inbox = remote.endpoints?.sharedInbox || remote.inbox;
  if (!inbox || !local) return;
  const activity = { "@context": CTX, id: `${local.uri || local.actor_url}/activities/${crypto.randomUUID()}`, type: accept ? "Accept" : "Reject", actor: local.uri || local.actor_url, object: followActivity };
  try { const r = await signAndSend(local, inbox, activity); await recordDelivery(local, activity, inbox, r); }
  catch (e) { await recordDelivery(local, activity, inbox, null, e instanceof Error ? e.message : String(e)); }
}

async function processActivity(activity: any, actorUri: string) {
  const type = text(activity.type), objectValue = activity.object, objectUri = uri(objectValue), targetUri = uri(activity.target);
  if (type === "Follow") {
    const local = await localActorForObject(objectUri || targetUri);
    if (!local) return;
    const blocked = await admin.from("federated_relationships").select("id").eq("local_user_id", local.user_id).eq("remote_actor_uri", actorUri).eq("relationship", "blocked").eq("state", "active").maybeSingle();
    const accept = !blocked.data;
    await admin.from("federated_relationships").upsert({ local_user_id: local.user_id, remote_actor_uri: actorUri, relationship: "follower", state: accept ? "active" : "rejected", updated_at: now() }, { onConflict: "local_user_id,remote_actor_uri,relationship" });
    if (activity.id) await acceptOrReject(local, actorUri, activity, accept);
    return;
  }
  if (type === "Accept" || type === "Reject") {
    const followed = uri(objectValue);
    if (followed) {
      const local = await localActorForObject(followed);
      if (local) await admin.from("federated_relationships").upsert({ local_user_id: local.user_id, remote_actor_uri: actorUri, relationship: "following", state: type === "Accept" ? "active" : "rejected", updated_at: now() }, { onConflict: "local_user_id,remote_actor_uri,relationship" });
    }
    return;
  }
  if (type === "Create" || type === "Update") {
    const o = typeof objectValue === "object" && objectValue ? objectValue : null;
    if (!o || !uri(o.id)) return;
    const id = uri(o.id);
    await admin.from("federated_objects").upsert({ uri: id, object_type: text(o.type) || "Object", actor_uri: uri(o.attributedTo) || actorUri, url: text(o.url) || id, content: text(o.content) || text(o.name) || null, summary: text(o.summary) || null, published_at: o.published ? new Date(o.published).toISOString() : null, updated_at: o.updated ? new Date(o.updated).toISOString() : now(), sensitive: Boolean(o.sensitive), in_reply_to_uri: uri(o.inReplyTo) || null, quote_uri: uri(o.quote) || null, attachments: Array.isArray(o.attachment) ? o.attachment : [], tags: Array.isArray(o.tag) ? o.tag : [], raw_object: o, tombstone: false, deleted_at: null }, { onConflict: "uri" });
    return;
  }
  if (type === "Like" || type === "Announce") {
    if (!objectUri) return;
    await admin.from("federated_interactions").upsert({ activity_uri: text(activity.id) || `urn:testagram:${crypto.randomUUID()}`, activity_type: type, actor_uri: actorUri, object_uri: objectUri, active: true, raw_activity: activity, updated_at: now() }, { onConflict: "activity_uri" });
    return;
  }
  if (type === "Undo") {
    const inner = typeof objectValue === "object" && objectValue ? objectValue : null;
    const innerId = uri(objectValue);
    if (inner?.type === "Follow" || innerId) {
      const { data: rows } = await admin.from("federated_relationships").select("id,local_user_id,remote_actor_uri,relationship").eq("remote_actor_uri", actorUri).eq("relationship", "follower");
      if (rows?.length) for (const row of rows) await admin.from("federated_relationships").update({ state: "removed", updated_at: now() }).eq("id", row.id);
      if (innerId) await admin.from("federated_interactions").update({ active: false, updated_at: now() }).eq("activity_uri", innerId);
    }
    return;
  }
  if (type === "Delete") {
    if (!objectUri) return;
    await admin.from("federated_objects").update({ tombstone: true, deleted_at: now(), raw_object: { id: objectUri, type: "Tombstone", formerType: "Note" }, updated_at: now() }).eq("uri", objectUri);
    return;
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  if (!/(activity\+json|ld\+json|application\/json)/i.test(request.headers.get("content-type") || "")) return json({ error: "Unsupported ActivityPub content type" }, 415);
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY) return json({ error: "Invalid activity body" }, 400);
    const activity = JSON.parse(raw) as Record<string, unknown>;
    const type = text(activity.type), actor = uri(activity.actor);
    if (!type || !actor || !/^https:\/\//i.test(actor)) return json({ error: "Activity type and HTTPS actor are required" }, 400);
    const verified = await verifySignature(request, raw, actor);
    const activityId = text(activity.id) || `urn:testagram:inbound:${crypto.randomUUID()}`;
    const replay = await admin.from("federation_replays").insert({ activity_uri: activityId, actor_uri: actor, signature_key_id: verified.keyId, expires_at: verified.expiresAt });
    if (replay.error) {
      if (replay.error.code === "23505") return new Response(null, { status: 202, headers: CORS });
      throw replay.error;
    }
    const objectUri = uri(activity.object), targetUri = uri(activity.target);
    const persisted = await admin.from("federated_activities").upsert({ uri: activityId, activity_type: type, actor_uri: actor, object_uri: objectUri || null, target_uri: targetUri || null, raw_activity: activity, received_at: now(), processed_at: null, processing_error: null, processing_attempts: 1 }, { onConflict: "uri" }).select("id").single();
    if (persisted.error) throw persisted.error;
    try {
      await processActivity(activity, actor);
      await admin.from("federated_activities").update({ processed_at: now(), processing_error: null }).eq("uri", activityId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await admin.from("federated_activities").update({ processing_error: message }).eq("uri", activityId);
      console.error("[federation-inbox] processing failure", message);
      return json({ error: "Activity accepted but processing failed" }, 202);
    }
    return new Response(null, { status: 202, headers: CORS });
  } catch (error) {
    console.error("[federation-inbox] rejected", error);
    return json({ error: error instanceof Error ? error.message : "Malformed ActivityPub request" }, 401);
  }
});
