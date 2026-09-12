import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const MAX_BODY = 2_000_000;
const MAX_CLOCK_SKEW = 300;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "accept,content-type,date,digest,signature,host", "Access-Control-Allow-Methods": "POST,OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const text = (v: unknown) => typeof v === "string" ? v : "";
const uri = (v: unknown) => typeof v === "string" ? v : v && typeof v === "object" ? text((v as Record<string, unknown>).id) : "";

function pemToBytes(pem: string) {
  const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  const bin = atob(b64); return Uint8Array.from(bin, c => c.charCodeAt(0));
}
async function verifySignature(req: Request, raw: string, actorUri: string) {
  const signature = req.headers.get("signature");
  const digest = req.headers.get("digest");
  const date = req.headers.get("date");
  if (!signature || !digest || !date) throw new Error("missing HTTP signature headers");
  const when = Date.parse(date); if (!Number.isFinite(when) || Math.abs(Date.now() - when) > MAX_CLOCK_SKEW * 1000) throw new Error("stale Date header");
  const expectedDigest = `SHA-256=${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)))))}`;
  if (digest !== expectedDigest) throw new Error("digest mismatch");
  const params: Record<string,string> = {};
  for (const m of signature.matchAll(/(\w+)="([^"]*)"/g)) params[m[1]] = m[2];
  if ((params.algorithm || "").toLowerCase() !== "rsa-sha256" || !params.headers || !params.signature) throw new Error("unsupported HTTP signature");
  const keyId = params.keyId || actorUri;
  const actorResponse = await fetch(actorUri, { headers: { accept: "application/activity+json, application/ld+json" } });
  if (!actorResponse.ok) throw new Error(`actor key fetch failed: ${actorResponse.status}`);
  const actorDoc = await actorResponse.json();
  const key = actorDoc.publicKey || (actorDoc.publicKey as any);
  if (!key?.publicKeyPem || (key.id && key.id !== keyId)) throw new Error("actor public key mismatch");
  const signing = params.headers.split(/\s+/).map((name: string) => `${name.toLowerCase()}: ${name.toLowerCase() === "(request-target)" ? `${req.method.toLowerCase()} ${new URL(req.url).pathname}` : req.headers.get(name) || ""}`).join("\n");
  const cryptoKey = await crypto.subtle.importKey("spki", pemToBytes(key.publicKeyPem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const sigBytes = Uint8Array.from(atob(params.signature), c => c.charCodeAt(0));
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sigBytes, new TextEncoder().encode(signing))) throw new Error("HTTP signature invalid");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  if (!/(activity\+json|ld\+json|application\/json)/i.test(request.headers.get("content-type") || "")) return json({ error: "Unsupported ActivityPub content type" }, 415);
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY) return json({ error: "Invalid activity body" }, 400);
    const activity = JSON.parse(raw) as Record<string, unknown>;
    const type = text(activity.type); const actor = uri(activity.actor);
    if (!type || !actor || !/^https:\/\//i.test(actor)) return json({ error: "Activity type and HTTPS actor are required" }, 400);
    await verifySignature(request, raw, actor);
    const activityId = text(activity.id) || `urn:testagram:inbound:${crypto.randomUUID()}`;
    const objectUri = uri(activity.object); const targetUri = uri(activity.target);
    const { error } = await admin.from("federated_activities").upsert({ uri: activityId, activity_type: type, actor_uri: actor, object_uri: objectUri || null, target_uri: targetUri || null, raw_activity: activity, received_at: new Date().toISOString() }, { onConflict: "uri", ignoreDuplicates: true });
    if (error) { console.error("persistence failure", error); return json({ error: "Activity persistence failed" }, 500); }
    console.log(JSON.stringify({ event: "activity.accepted", activityId, type, actor }));
    return new Response(null, { status: 202, headers: CORS });
  } catch (error) {
    console.error("[federation-inbox] rejected", error);
    return json({ error: error instanceof Error ? error.message : "Malformed ActivityPub request" }, 401);
  }
});
