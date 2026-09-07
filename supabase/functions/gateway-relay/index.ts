import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_COLLECTION = "https://www.w3.org/ns/activitystreams#Public";
const ACTIVITY_CONTEXT = ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"];
const ACTIVITY_ACCEPT = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/activity+json';

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

async function db(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", SERVICE_KEY);
  headers.set("Authorization", `Bearer ${SERVICE_KEY}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
}

async function currentUser(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u.id || null;
}

async function ensureActor(userId: string, origin: string) {
  const existing = await db(`federation_actors?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  const rows = await existing.json();
  if (rows[0]) return rows[0];

  const profileRes = await db(`profiles?id=eq.${encodeURIComponent(userId)}&select=username,display_name,bio,avatar_url`);
  const profiles = await profileRes.json();
  const raw = profiles[0]?.username || `user_${userId.replaceAll("-", "").slice(0, 12)}`;
  const username = String(raw).toLowerCase().replace(/[^a-z0-9_\-]/g, "_").slice(0, 32);
  const actorUrl = `${origin}/users/${encodeURIComponent(username)}`;
  const inboxUrl = `${origin}/users/${encodeURIComponent(username)}/inbox`;
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", keys.privateKey);
  const publicSpki = new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey));
  const b64 = btoa(String.fromCharCode(...publicSpki));
  const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
  const insert = await db("federation_actors", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: userId, username, actor_url: actorUrl, inbox_url: inboxUrl, public_key_pem: pem, private_key_jwk: privateJwk }) });
  if (!insert.ok) throw new Error(`actor creation failed: ${await insert.text()}`);
  return (await insert.json())[0];
}

async function fetchJson(url: string, accept = ACTIVITY_ACCEPT) {
  const r = await fetch(url, { headers: { Accept: accept, "User-Agent": "Testagram-Federation/1.0" } });
  if (!r.ok) throw new Error(`remote fetch ${r.status}: ${url}`);
  return r.json();
}

async function resolveActor(target: string) {
  let actorUrl = target.replace(/^@/, "");
  if (!actorUrl.startsWith("http")) {
    const parts = actorUrl.split("@");
    if (parts.length !== 2) throw new Error("Remote account must be @user@domain or an ActivityPub actor URL");
    const [user, domain] = parts;
    const resource = `acct:${user}@${domain}`;
    const wf = await fetchJson(`https://${domain}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`, "application/jrd+json");
    const link = (wf.links || []).find((x: any) => x.rel === "self" && x.href && (String(x.type || "").includes("activity+json") || String(x.type || "").includes("activitystreams")));
    actorUrl = link?.href;
    if (!actorUrl) throw new Error("WebFinger did not return an ActivityPub actor");
  }
  const actor = await fetchJson(actorUrl);
  const inbox = actor.inbox || actor.endpoints?.sharedInbox;
  if (!inbox) throw new Error("Remote actor has no inbox");
  await db("federation_remote_actors?on_conflict=actor_url", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ actor_url: actor.id || actorUrl, acct: actor.preferredUsername && new URL(actor.id || actorUrl).hostname ? `${actor.preferredUsername}@${new URL(actor.id || actorUrl).hostname}` : null, username: actor.preferredUsername || null, domain: new URL(actor.id || actorUrl).hostname, inbox_url: actor.inbox || null, shared_inbox_url: actor.endpoints?.sharedInbox || null, actor, fetched_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
  return { actorUrl: actor.id || actorUrl, actor, inbox: actor.inbox || actor.endpoints?.sharedInbox };
}

function b64(bytes: ArrayBuffer | Uint8Array) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }

async function signedPost(actor: any, inbox: string, activity: any) {
  const body = JSON.stringify(activity);
  const url = new URL(inbox);
  const date = new Date().toUTCString();
  const digestBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const digest = `SHA-256=${b64(digestBytes)}`;
  const key = await crypto.subtle.importKey("jwk", actor.private_key_jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signing = `(request-target): post ${url.pathname}${url.search}\nhost: ${url.host}\ndate: ${date}\ndigest: ${digest}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signing));
  const signature = `keyId="${actor.actor_url}#main-key",headers="(request-target) host date digest",signature="${b64(sig)}"`;
  const r = await fetch(inbox, { method: "POST", headers: { Host: url.host, Date: date, Digest: digest, Signature: signature, "Content-Type": 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"', Accept: ACTIVITY_ACCEPT, "User-Agent": "Testagram-Federation/1.0" }, body });
  return { ok: r.ok, status: r.status, text: (await r.text()).slice(0, 1000) };
}

async function deliver(userId: string, actor: any, inbox: string, type: string, object: any, to?: string) {
  const id = `${actor.actor_url}#activities/${crypto.randomUUID()}`;
  const activity: any = { "@context": ACTIVITY_CONTEXT, id, type, actor: actor.actor_url, object };
  if (to) activity.to = to;
  const result = await signedPost(actor, inbox, activity);
  await db("federation_outbox", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: userId, activity_id: id, activity_type: type, actor_url: actor.actor_url, inbox_url: inbox, payload: activity, status: result.ok ? "delivered" : (result.status >= 500 ? "pending" : "failed"), attempts: 1, last_attempt_at: new Date().toISOString(), next_attempt_at: result.ok ? null : new Date(Date.now() + 60_000).toISOString(), http_status: result.status, last_error: result.ok ? null : result.text }) });
  return { ...result, activityId: id, activity };
}

async function route(req: Request, path: string, body: any) {
  const origin = new URL(req.url).origin;
  if (path === "/health") return json({ ok: true, service: "gateway-relay", activityPub: true });

  if (path === "/webfinger" || path.startsWith("/webfinger/")) {
    const acct = decodeURIComponent(path.slice("/webfinger/".length)).replace(/^@/, "");
    const [username, domain] = acct.split("@");
    if (!username || !domain) return json({ error: "invalid account" }, 400);
    const rows = await db(`federation_actors?username=eq.${encodeURIComponent(username)}&select=username,actor_url`);
    const data = await rows.json();
    if (!data[0]) return json({ error: "actor not found" }, 404);
    return json({ subject: `acct:${username}@${domain}`, aliases: [data[0].actor_url], links: [{ rel: "self", type: "application/activity+json", href: data[0].actor_url }] });
  }

  const actorMatch = path.match(/^\/users\/([^/]+)$/);
  if (actorMatch) {
    const username = decodeURIComponent(actorMatch[1]);
    const r = await db(`federation_actors?username=eq.${encodeURIComponent(username)}&select=*`);
    const rows = await r.json();
    if (!rows[0]) return json({ error: "actor not found" }, 404);
    const actor = rows[0];
    return json({ "@context": ACTIVITY_CONTEXT, id: actor.actor_url, type: "Person", preferredUsername: actor.username, name: actor.username, url: actor.actor_url, inbox: actor.inbox_url, outbox: `${actor.actor_url}/outbox`, followers: `${actor.actor_url}/followers`, following: `${actor.actor_url}/following`, publicKey: { id: `${actor.actor_url}#main-key`, owner: actor.actor_url, publicKeyPem: actor.public_key_pem } });
  }

  const userId = await currentUser(req);
  if (!userId) return json({ error: "Authentication required" }, 401);
  const actor = await ensureActor(userId, origin);

  if (path === "/timeline/federated") {
    const r = await db("federation_objects?select=*&order=published_at.desc&limit=100");
    return json(await r.json());
  }
  if (path === "/notifications") {
    const r = await db(`federation_inbox?select=*&order=received_at.desc&limit=${Math.min(Number(body?.limit || 50), 100)}`);
    return json(await r.json());
  }

  if (path === "/follow" || path === "/unfollow") {
    const remote = await resolveActor(body?.target);
    const followActivity = { type: "Follow", actor: actor.actor_url, object: remote.actorUrl };
    const result = path === "/follow" ? await deliver(userId, actor, remote.inbox, "Follow", remote.actorUrl, remote.actorUrl) : await deliver(userId, actor, remote.inbox, "Undo", followActivity, remote.actorUrl);
    await db("federation_relationships", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: userId, remote_actor_url: remote.actorUrl, relationship: path === "/follow" ? (result.ok ? "pending" : "failed") : (result.ok ? "unfollow_pending" : "failed"), activity_id: result.activityId, last_error: result.ok ? null : result.text, updated_at: new Date().toISOString() }) });
    return json(result, result.ok ? 200 : 502);
  }

  const postId = body?.post_id;
  if (["/favorite","/unfavorite","/boost","/unboost"].includes(path)) {
    if (!postId) return json({ error: "post_id required" }, 400);
    const r = await db(`federation_objects?object_url=eq.${encodeURIComponent(postId)}&select=object,actor_url&limit=1`);
    let rows = await r.json();
    let object: any = rows[0]?.object;
    if (!object) { object = await fetchJson(postId); await db("federation_objects", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ object_url: postId, actor_url: object.attributedTo || object.actor, object_type: object.type, object, published_at: object.published ? new Date(object.published).toISOString() : null }) }); }
    const remote = await resolveActor(object.attributedTo || object.actor);
    const baseType = path.includes("favorite") ? "Like" : "Announce";
    const baseObject = postId;
    const activity = { type: baseType, actor: actor.actor_url, object: baseObject };
    const result = path.includes("unfavorite") || path.includes("unboost") ? await deliver(userId, actor, remote.inbox, "Undo", activity, remote.actorUrl) : await deliver(userId, actor, remote.inbox, baseType, baseObject, remote.actorUrl);
    return json(result, result.ok ? 200 : 502);
  }

  if (path === "/reply") {
    const remote = await resolveActor((await fetchJson(body.post_id)).attributedTo);
    const noteId = `${actor.actor_url}#notes/${crypto.randomUUID()}`;
    const note = { id: noteId, type: "Note", attributedTo: actor.actor_url, content: String(body.content || ""), inReplyTo: body.postId || body.post_id, to: [remote.actorUrl], cc: [PUBLIC_COLLECTION] };
    const result = await deliver(userId, actor, remote.inbox, "Create", note, remote.actorUrl);
    return json(result, result.ok ? 200 : 502);
  }

  return json({ error: "Unknown gateway path", path }, 404);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const input = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const path = input.path || new URL(req.url).pathname.replace(/^\/gateway-relay/, "");
    return await route(req, path, input.body || input);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Gateway failure" }, 500);
  }
});
