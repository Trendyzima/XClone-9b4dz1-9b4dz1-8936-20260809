import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, corsHeaders } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const CLIENT = Deno.env.get("PAYPAL_CLIENT_ID");
const SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET");
const ENV = (Deno.env.get("PAYPAL_ENV") || "sandbox").toLowerCase();
const BASE = ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const CORS = { ...corsHeaders, "Access-Control-Allow-Methods": "POST,OPTIONS" };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

async function token() {
  if (!CLIENT || !SECRET) throw new Error("PAYPAL_NOT_CONFIGURED");
  const r = await fetch(`${BASE}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${btoa(`${CLIENT}:${SECRET}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  if (!r.ok) throw new Error(`PAYPAL_AUTH_${r.status}`);
  return (await r.json()).access_token as string;
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
    const { orderId } = await req.json();
    if (!orderId || typeof orderId !== "string") return json({ error: "orderId is required" }, 400);

    const { data: order, error: orderError } = await admin.from("paypal_orders").select("*").or(`order_id.eq.${orderId},paypal_order_id.eq.${orderId}`).eq("user_id", user.id).maybeSingle();
    if (orderError || !order) return json({ error: "Order not found" }, 404);
    const existingCapture = order.capture_id || order.paypal_capture_id;
    if (existingCapture) return json({ ok: true, alreadyCaptured: true, orderId, captureId: existingCapture });

    const access = await token();
    const r = await fetch(`${BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json", "PayPal-Request-Id": crypto.randomUUID() } });
    const raw = await r.json();
    if (!r.ok) return json({ error: "PayPal capture failed", detail: raw?.message || raw?.name }, 502);

    const capture = raw.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture?.id || capture.status !== "COMPLETED") return json({ error: "Payment not completed", status: capture?.status || raw.status }, 409);
    const paidAmount = Number(capture.amount?.value);
    const paidCurrency = String(capture.amount?.currency_code || "").toUpperCase();
    if (paidAmount !== Number(order.amount ?? Number(order.amount_cents) / 100) || paidCurrency !== String(order.currency).toUpperCase()) return json({ error: "Captured amount mismatch" }, 409);

    const { data: finalized, error: finalizeError } = await admin.rpc("finalize_paypal_topup", { p_order_id: orderId, p_capture_id: capture.id });
    if (finalizeError) return json({ error: "Wallet credit failed", detail: finalizeError.message }, 500);
    return json({ ok: true, orderId, captureId: capture.id, wallet: finalized });
  } catch (e) { console.error(e); return json({ error: e instanceof Error ? e.message : "PayPal capture failed" }, 500); }
});
