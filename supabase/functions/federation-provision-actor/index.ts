import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const ORIGIN = "https://federation.testagram.site";
const CTX = ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"];
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,apikey,content-type", "Access-Control-Allow-Methods": "POST,OPTIONS" };
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

function toBase64(bytes: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function pem(label: string, bytes: ArrayBuffer | Uint8Array) {
  const base64 = toBase64(bytes).match(/.{1,64}/g)?.join("\n") || "";
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----`;
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function provision(userId: string) {
  const { data: profile, error: profileError } = await admin.from("profiles").select("id,username,display_name,avatar_url,bio,cover_url,website,location,created_at,protected_account").eq("id", userId).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.username) throw new Error("A completed Testagram profile is required before federation can be provisioned");

  const actorUrl = `${ORIGIN}/users/${encodeURIComponent(profile.username)}`;
  const { data: existing, error: existingError } = await admin.from("federation_actors").select("id,user_id,username,actor_url,inbox_url,public_key_pem,private_key_jwk").eq("user_id", userId).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.private_key_jwk && existing?.public_key_pem && existing.actor_url === actorUrl) {
    return { created: false, actor: existing };
  }

  const keyPair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicSpki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicPem = pem("PUBLIC KEY", publicSpki);
  const now = new Date().toISOString();

  const row = {
    user_id: userId,
    username: profile.username,
    actor_url: actorUrl,
    inbox_url: `${actorUrl}/inbox`,
    public_key_pem: publicPem,
    private_key_jwk: privateJwk,
    updated_at: now,
  };
  const { data: actor, error } = await admin.from("federation_actors").upsert(row, { onConflict: "user_id", ignoreDuplicates: false }).select("id,user_id,username,actor_url,inbox_url,public_key_pem").single();
  if (error) throw error;

  return { created: !existing, actor };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const user = await authenticatedUser(req);
    if (!user) return json({ error: "Authentication required" }, 401);
    const result = await provision(user.id);
    return json({ ok: true, protocol: "activitypub", federation_origin: ORIGIN, ...result });
  } catch (error) {
    console.error("federation-provision-actor", error);
    return json({ error: error instanceof Error ? error.message : "Federation actor provisioning failed" }, 500);
  }
});
