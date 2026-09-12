import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "accept,content-type,date,digest,signature,host,x-forwarded-for",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const text = (value: unknown) => typeof value === "string" ? value : "";
const objectUri = (value: unknown) => typeof value === "string" ? value : value && typeof value === "object" ? text((value as Record<string, unknown>).id) : "";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  const contentType = request.headers.get("content-type") || "";
  if (!/(activity\+json|ld\+json|application\/json)/i.test(contentType)) {
    return json({ error: "Unsupported ActivityPub content type" }, 415);
  }

  try {
    const raw = await request.text();
    if (!raw || raw.length > 2_000_000) return json({ error: "Invalid activity body" }, 400);
    const activity = JSON.parse(raw) as Record<string, unknown>;
    const type = text(activity.type);
    const actor = objectUri(activity.actor);
    if (!type || !actor) return json({ error: "Activity type and actor are required" }, 400);

    const activityId = text(activity.id) || `urn:testagram:inbound:${crypto.randomUUID()}`;
    const target = objectUri(activity.object) || objectUri(activity.target);

    const { error } = await admin.from("federated_activities").upsert({
      uri: activityId,
      activity_type: type,
      actor_uri: actor,
      object_uri: target || null,
      target_uri: objectUri(activity.target) || null,
      raw_activity: activity,
      received_at: new Date().toISOString(),
    }, { onConflict: "uri" });

    if (error) {
      console.error("[federation-inbox] persistence failure", error);
      return json({ error: "Activity persistence failed" }, 500);
    }

    return new Response(null, { status: 202, headers: CORS });
  } catch (error) {
    console.error("[federation-inbox] rejected activity", error);
    return json({ error: "Malformed ActivityPub request" }, 400);
  }
});
