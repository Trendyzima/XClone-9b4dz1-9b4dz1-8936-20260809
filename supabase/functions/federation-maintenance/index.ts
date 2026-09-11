import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const AP = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/activity+json';
const CTX = ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"];
const MAX_BATCH = 20;
const MAX_ATTEMPTS = 8;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-federation-internal", "Access-Control-Allow-Methods": "POST,OPTIONS" };
const enc = (v: string) => encodeURIComponent(v);
const b64 = (v: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(v)));
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

function authorized(req: Request) {
  const token = req.headers.get("x-federation-internal");
  const auth = req.headers.get("authorization");
  return Boolean(SERVICE_KEY && (token === SERVICE_KEY || auth === `Bearer ${SERVICE_KEY}`));
}

async function db(path: string, init: RequestInit = {}) {
  if (!SERVICE_KEY) throw new Error("Federation service credential is not configured");
  const headers = new Headers(init.headers);
  headers.set("apikey", SERVICE_KEY);
  headers.set("Authorization", `Bearer ${SERVICE_KEY}`);
  headers.set("Content-Type", "application/json");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  if (!r.ok) throw new Error(`database ${r.status}: ${(await r.text()).slice(0, 800)}`);
  return r;
}

async function rows(path: string) {
  const r = await db(path);
  return await r.json() as any[];
}

function retryDelay(attempt: number, retryAfter?: string | null) {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 3600) * 1000;
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1)) * 1000;
}

async function sign(local: any, url: string, body: string) {
  const target = new URL(url);
  const date = new Date().toUTCString();
  const digest = `sha-256=${b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))}`;
  const key = await crypto.subtle.importKey("jwk", local.private_key_jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signingString = `(request-target): post ${target.pathname}${target.search}\nhost: ${target.host}\ndate: ${date}\ndigest: ${digest}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingString));
  return fetch(url, {
    method: "POST",
    redirect: "manual",
    body,
    headers: {
      Date: date,
      Digest: digest,
      Accept: AP,
      "Content-Type": AP,
      "User-Agent": "Testagram-Federation/4.0",
      Signature: `keyId="${local.actor_url}#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${b64(signature)}"`,
    },
  });
}

async function recordEvent(row: any, eventType: string, status: number | null, error: string | null, responseBody: string | null, attempt: number) {
  await db("federation_delivery_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ outbox_id: row.id, activity_id: row.activity_id, event_type: eventType, http_status: status, error, response_body: responseBody?.slice(0, 1600) ?? null, attempt_number: attempt }),
  });
}

async function process(row: any) {
  const attempts = Number(row.attempts || 0) + 1;
  const claim = await db(`federation_outbox?id=eq.${enc(row.id)}&status=eq.${enc(row.status || "pending")}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "in_flight", attempts, last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  const claimed = await claim.json() as any[];
  if (!claimed[0]) return { skipped: true };
  row = claimed[0];
  await recordEvent(row, "attempt", null, null, null, attempts);

  const actors = await rows(`federation_actors?actor_url=eq.${enc(row.actor_url)}&select=*&limit=1`);
  if (!actors[0]) {
    const error = "Local federation actor not found";
    await db(`federation_outbox?id=eq.${enc(row.id)}`, { method: "PATCH", body: JSON.stringify({ status: "dead", last_error: error, updated_at: new Date().toISOString() }) });
    await recordEvent(row, "dead", null, error, null, attempts);
    return { ok: false, dead: true, error };
  }

  const body = JSON.stringify(row.payload || {});
  let response: Response;
  try {
    response = await sign(actors[0], row.inbox_url, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network delivery failed";
    if (attempts >= MAX_ATTEMPTS) {
      await db(`federation_outbox?id=eq.${enc(row.id)}`, { method: "PATCH", body: JSON.stringify({ status: "dead", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }) });
      await recordEvent(row, "dead", null, message, null, attempts);
      return { ok: false, dead: true, error: message };
    }
    const next = new Date(Date.now() + retryDelay(attempts));
    await db(`federation_outbox?id=eq.${enc(row.id)}`, { method: "PATCH", body: JSON.stringify({ status: "pending", next_attempt_at: next.toISOString(), last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }) });
    await recordEvent(row, "retry", null, message, null, attempts);
    return { ok: false, retry: true, error: message };
  }

  const text = (await response.text()).slice(0, 1600);
  if (response.ok) {
    await db(`federation_outbox?id=eq.${enc(row.id)}`, { method: "PATCH", body: JSON.stringify({ status: "delivered", http_status: response.status, last_error: null, next_attempt_at: null, updated_at: new Date().toISOString() }) });
    await recordEvent(row, "delivered", response.status, null, text, attempts);
    return { ok: true, status: response.status };
  }

  const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
  if (retryable && attempts < MAX_ATTEMPTS) {
    const next = new Date(Date.now() + retryDelay(attempts, response.headers.get("retry-after")));
    await db(`federation_outbox?id=eq.${enc(row.id)}`, { method: "PATCH", body: JSON.stringify({ status: "pending", next_attempt_at: next.toISOString(), http_status: response.status, last_error: text.slice(0, 1000), updated_at: new Date().toISOString() }) });
    await recordEvent(row, "retry", response.status, text, text, attempts);
    return { ok: false, retry: true, status: response.status };
  }

  const terminal = retryable ? "dead" : "failed";
  await db(`federation_outbox?id=eq.${enc(row.id)}`, { method: "PATCH", body: JSON.stringify({ status: terminal, http_status: response.status, last_error: text.slice(0, 1000), next_attempt_at: null, updated_at: new Date().toISOString() }) });
  await recordEvent(row, terminal === "dead" ? "dead" : "rejected", response.status, text, text, attempts);
  return { ok: false, status: response.status, terminal };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  if (!authorized(req)) return json({ error: "Internal federation maintenance only" }, 403);
  try {
    const requested = Math.min(Math.max(Number((await req.json().catch(() => ({})))?.limit ?? MAX_BATCH), 1), MAX_BATCH);
    const due = await rows(`federation_outbox?status=in.(pending,retry)&or=(next_attempt_at.is.null,next_attempt_at.lte.${enc(new Date().toISOString())})&order=created_at.asc&limit=${requested}`);
    const results = [];
    for (const row of due) results.push(await process(row));
    const pending = await rows("federation_outbox?status=eq.pending&select=id&limit=1000");
    return json({ ok: true, processed: results.length, results, remainingPending: pending.length, version: "4.0" });
  } catch (error) {
    console.error("federation-maintenance", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Federation maintenance failed" }, 500);
  }
});
