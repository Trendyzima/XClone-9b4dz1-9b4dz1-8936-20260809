import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as supabaseCorsHeaders } from "npm:@supabase/supabase-js@2/cors";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const ENV = (Deno.env.get("MPESA_ENV") || "sandbox").toLowerCase();
const BASE = ENV === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
const KEY = Deno.env.get("MPESA_CONSUMER_KEY");
const SECRET = Deno.env.get("MPESA_CONSUMER_SECRET");
const CORS = { ...supabaseCorsHeaders, "Access-Control-Allow-Methods": "POST,OPTIONS" };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

function normalizePhone(input: string) {
  const s = input.replace(/\D/g, "");
  if (/^254[71]\d{8}$/.test(s)) return s;
  if (/^0[17]\d{8}$/.test(s)) return `254${s.slice(1)}`;
  if (/^[17]\d{8}$/.test(s)) return `254${s}`;
  return null;
}

async function accessToken() {
  if (!KEY || !SECRET) throw new Error("MPESA_NOT_CONFIGURED");
  const basic = btoa(`${KEY}:${SECRET}`);
  const r = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` } });
  if (!r.ok) throw new Error(`MPESA_AUTH_${r.status}`);
  const data = await r.json();
  if (!data.access_token) throw new Error("MPESA_TOKEN_MISSING");
  return data.access_token as string;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Authentication required" }, 401);
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const authClient = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error } = await authClient.auth.getUser(jwt);
    if (error || !user) return json({ error: "Invalid authentication" }, 401);

    const body = await req.json().catch(() => ({}));
    const amountKes = Number(body.amount_kes ?? body.amount);
    const phone = normalizePhone(String(body.phone || ""));
    if (!Number.isFinite(amountKes) || amountKes < 10 || amountKes > 150000) return json({ error: "Enter a valid M-Pesa amount between KES 10 and KES 150,000." }, 400);
    if (!phone) return json({ error: "Enter a valid Kenyan M-Pesa number." }, 400);
    if (!KEY || !SECRET) return json({ error: "M-Pesa consumer credentials are not configured.", missing: { MPESA_CONSUMER_KEY: !KEY, MPESA_CONSUMER_SECRET: !SECRET } }, 503);

    // This flow intentionally uses ONLY the two supplied M-Pesa credentials.
    // It obtains the OAuth access token and returns it to the caller for the
    // next provider-specific payment step. No shortcode, passkey or FX secret
    // is required or read here.
    const access = await accessToken();
    return json({ ok: true, status: "authenticated", provider: "mpesa", amountKes, phoneLast4: phone.slice(-4), accessToken: access });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "M-Pesa authentication failed" }, 500);
  }
});