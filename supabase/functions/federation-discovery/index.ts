import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!;
const ORIGIN = "https://federation.testagram.site";
const PUBLIC = "https://www.w3.org/ns/activitystreams#Public";
const CTX = ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"];
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,apikey,content-type,accept", "Access-Control-Allow-Methods": "GET,OPTIONS" };
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...CORS, "Content-Type": "application/activity+json; charset=utf-8", "Cache-Control": "public, max-age=30, s-maxage=60" } });
const enc = (v: string) => encodeURIComponent(v);

async function db(path: string) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`database ${r.status}: ${(await r.text()).slice(0, 500)}`);
  return r.json();
}

async function getActor(username: string) {
  const rows = await db(`federation_actors?username=eq.${enc(username)}&select=*`) as any[];
  if (!rows[0]) return null;
  const profiles = await db(`profiles?id=eq.${enc(rows[0].user_id)}&select=username,display_name,avatar_url,bio,cover_url,website,location,created_at,protected_account`) as any[];
  return { ...rows[0], profile: profiles[0] || {} };
}

function tags(content: string) {
  return [...new Set([...content.matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/gu)].map(m => m[2].toLowerCase()))].map(tag => ({ type: "Hashtag", name: `#${tag}`, href: `${ORIGIN}/tags/${enc(tag)}` }));
}

function attachments(media: unknown) {
  if (!Array.isArray(media)) return [];
  return media.map((item: any) => {
    const url = typeof item === "string" ? item : item?.url || item?.publicUrl || item?.media_url;
    if (!url) return null;
    const type = typeof item === "object" ? item?.mime_type || item?.mimeType || "" : "";
    return { type: type.startsWith("video/") ? "Video" : type.startsWith("audio/") ? "Audio" : "Image", mediaType: type || undefined, url };
  }).filter(Boolean);
}

function note(actor: any, post: any) {
  const id = `${ORIGIN}/users/${enc(actor.username)}/statuses/${enc(post.id)}`;
  const followerCollection = `${ORIGIN}/users/${enc(actor.username)}/followers`;
  return {
    "@context": CTX,
    id,
    type: "Note",
    attributedTo: actor.actor_url,
    content: String(post.content || post.body || ""),
    published: post.created_at,
    updated: post.updated_at || post.created_at,
    url: `https://testagram.site/post/${encodeURIComponent(post.id)}`,
    to: [PUBLIC],
    cc: [followerCollection],
    tag: tags(String(post.content || post.body || "")),
    attachment: attachments(post.media_urls),
    sensitive: false,
  };
}

function actorDocument(actor: any) {
  const profile = actor.profile || {};
  const id = actor.actor_url;
  return {
    "@context": CTX,
    id,
    type: "Person",
    preferredUsername: actor.username,
    name: profile.display_name || actor.username,
    summary: profile.bio || "",
    url: `https://testagram.site/profile/${encodeURIComponent(actor.username)}`,
    icon: profile.avatar_url ? { type: "Image", mediaType: "image/*", url: profile.avatar_url } : undefined,
    image: profile.cover_url ? { type: "Image", mediaType: "image/*", url: profile.cover_url } : undefined,
    attachment: [
      ...(profile.website ? [{ type: "PropertyValue", name: "Website", value: profile.website }] : []),
      ...(profile.location ? [{ type: "PropertyValue", name: "Location", value: profile.location }] : []),
    ],
    inbox: actor.inbox_url,
    outbox: `${id}/outbox`,
    followers: `${id}/followers`,
    following: `${id}/following`,
    discoverable: true,
    indexable: true,
    manuallyApprovesFollowers: Boolean(profile.protected_account),
    published: profile.created_at || actor.created_at,
    publicKey: { id: `${id}#main-key`, owner: id, publicKeyPem: actor.public_key_pem },
  };
}

async function webfinger(req: Request) {
  const resource = new URL(req.url).searchParams.get("resource") || "";
  const match = resource.match(/^acct:([^@]+)@([^@]+)$/i);
  if (!match || match[2].toLowerCase() !== new URL(ORIGIN).hostname) return json({ error: "resource not found" }, 404);
  const username = decodeURIComponent(match[1]);
  const actor = await getActor(username);
  if (!actor) return json({ error: "actor not found" }, 404);
  return new Response(JSON.stringify({ subject: `acct:${actor.username}@${new URL(ORIGIN).hostname}`, aliases: [actor.actor_url], links: [{ rel: "self", type: "application/activity+json", href: actor.actor_url }, { rel: "http://webfinger.net/rel/profile-page", type: "text/html", href: `https://testagram.site/profile/${encodeURIComponent(actor.username)}` }] }), { headers: { ...CORS, "Content-Type": "application/jrd+json; charset=utf-8", "Cache-Control": "public, max-age=60, s-maxage=300" } });
}

async function actor(username: string) {
  const value = await getActor(username);
  if (!value || !value.public_key_pem) return json({ error: "actor not found" }, 404);
  return json(actorDocument(value));
}

async function outbox(username: string) {
  const value = await getActor(username);
  if (!value) return json({ error: "actor not found" }, 404);
  const posts = await db(`posts?author_id=eq.${enc(value.user_id)}&visibility=in.(public,unlisted)&order=created_at.desc&limit=40`) as any[];
  const items = posts.map(post => {
    const object = note(value, post);
    return { "@context": CTX, id: `${object.id}/activity`, type: "Create", actor: value.actor_url, published: post.created_at, to: [PUBLIC], cc: [object.cc[0]], object };
  });
  return json({ "@context": CTX, id: `${value.actor_url}/outbox`, type: "OrderedCollection", totalItems: items.length, first: `${value.actor_url}/outbox?page=true`, orderedItems: items });
}

async function collection(username: string, kind: "followers" | "following") {
  const value = await getActor(username);
  if (!value) return json({ error: "actor not found" }, 404);
  const id = `${value.actor_url}/${kind}`;
  return json({ "@context": CTX, id, type: "OrderedCollection", totalItems: 0, orderedItems: [] });
}

async function object(username: string, postId: string) {
  const actorValue = await getActor(username);
  if (!actorValue) return json({ error: "actor not found" }, 404);
  const rows = await db(`posts?id=eq.${enc(postId)}&author_id=eq.${enc(actorValue.user_id)}&visibility=in.(public,unlisted)&select=*`) as any[];
  if (!rows[0]) return json({ error: "object not found" }, 404);
  return json(note(actorValue, rows[0]));
}

async function tagsCollection(tag: string) {
  const normalized = tag.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const rows = await db(`posts?visibility=eq.public&content=ilike.*%23${enc(normalized)}*&order=created_at.desc&limit=40`) as any[];
  return json({ "@context": CTX, id: `${ORIGIN}/tags/${enc(normalized)}`, type: "Collection", totalItems: rows.length, orderedItems: rows.map(p => p.id) });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "GET required" }, 405);
  try {
    const path = new URL(req.url).pathname;
    if (path === "/.well-known/webfinger") return webfinger(req);
    const actorMatch = path.match(/^\/users\/([^/]+)$/);
    if (actorMatch) return actor(decodeURIComponent(actorMatch[1]));
    const out = path.match(/^\/users\/([^/]+)\/outbox$/);
    if (out) return outbox(decodeURIComponent(out[1]));
    const followers = path.match(/^\/users\/([^/]+)\/(followers|following)$/);
    if (followers) return collection(decodeURIComponent(followers[1]), followers[2] as "followers" | "following");
    const status = path.match(/^\/users\/([^/]+)\/statuses\/([^/]+)$/);
    if (status) return object(decodeURIComponent(status[1]), decodeURIComponent(status[2]));
    const obj = path.match(/^\/objects\/posts\/([^/]+)$/);
    if (obj) {
      const actors = await db(`federation_actors?select=username&limit=100`) as any[];
      for (const a of actors) { const r = await object(a.username, decodeURIComponent(obj[1])); if (r.status !== 404) return r; }
      return json({ error: "object not found" }, 404);
    }
    const tag = path.match(/^\/tags\/([^/]+)$/);
    if (tag) return tagsCollection(decodeURIComponent(tag[1]));
    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Federation discovery failed" }, 500);
  }
});
