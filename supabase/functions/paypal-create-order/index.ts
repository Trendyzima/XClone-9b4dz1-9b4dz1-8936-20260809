import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, corsHeaders } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET");
const PAYPAL_ENV = (Deno.env.get("PAYPAL_ENV") || "sandbox").toLowerCase();
const PAYPAL_BASE = PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const CORS = { ...corsHeaders, "Access-Control-Allow-Methods": "POST,OPTIONS" };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

async function paypalToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error("PAYPAL_NOT_CONFIGURED");
  const basic = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  if (!r.ok) throw new Error(`PAYPAL_AUTH_${r.status}`);
  return (await r.json()).access_token as string;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Authentication required" }, 401);
    const token = auth.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Invalid authentication" }, 401);
    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    const currency = String(body.currency || "USD").toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return json({ error: "Invalid amount" }, 400);
    if (!/^[A-Z]{3}$/.test(currency)) return json({ error: "Invalid currency" }, 400);
    const returnUrl = typeof body.return_url === "string" && /^https:\/\//i.test(body.return_url) ? body.return_url : null;
    const cancelUrl = typeof body.cancel_url === "string" && /^https:\/\//i.test(body.cancel_url) ? body.cancel_url : null;

    const { data: wallet, error: walletError } = await admin.rpc("ensure_user_wallet", { p_user_id: user.id, p_currency: currency });
    if (walletError || !wallet?.id) return json({ error: "Wallet provisioning failed" }, 500);
    if (wallet.currency !== currency && Number(wallet.balance) !== 0) return json({ error: "Wallet currency is fixed once funded" }, 409);

    const amountCents = Math.round(amount * 100);
    if (amountCents <= 0) return json({ error: "Invalid amount" }, 400);
    const tokenValue = await paypalToken();
    const experience = { brand_name: "Testagram", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", ...(returnUrl && cancelUrl ? { return_url: returnUrl, cancel_url: cancelUrl } : {}) };
    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [{ reference_id: wallet.id, custom_id: user.id, amount: { currency_code: currency, value: amount.toFixed(2) }, description: "Testagram wallet top-up" }],
      application_context: experience
    };
    const paypal = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, { method: "POST", headers: { Authorization: `Bearer ${tokenValue}`, "Content-Type": "application/json", "PayPal-Request-Id": crypto.randomUUID() }, body: JSON.stringify(orderPayload) });
    const raw = await paypal.json();
    if (!paypal.ok) return json({ error: "PayPal order creation failed", detail: raw?.message || raw?.name }, 502);
    const approvalUrl = raw.links?.find((l: any) => l.rel === "approve")?.href || null;
    if (!approvalUrl || !raw.id) return json({ error: "PayPal approval URL was not returned" }, 502);

    const { data: tx, error: txError } = await admin.from("wallet_transactions").insert({ user_id: user.id, wallet_id: wallet.id, kind: "topup", type: "deposit", amount: amount, amount_cents: amountCents, currency, direction: "credit", status: "pending", provider: "paypal", provider_order_id: raw.id, provider_status: raw.status || "CREATED", payment_method: "paypal", description: "PayPal wallet top-up", metadata: { paypal_order_id: raw.id } }).select("id").single();
    if (txError || !tx?.id) return json({ error: "Wallet transaction persistence failed" }, 500);

    const { error: insertError } = await admin.from("paypal_orders").insert({ user_id: user.id, wallet_id: wallet.id, wallet_transaction_id: tx.id, transaction_id: null, paypal_order_id: raw.id, order_id: raw.id, amount_cents: amountCents, amount, currency, status: "created", approval_url: approvalUrl, metadata: { paypal_create_response: raw }, updated_at: new Date().toISOString() });
    if (insertError) { await admin.from("wallet_transactions").delete().eq("id", tx.id); return json({ error: "Order persistence failed" }, 500); }
    return json({ ok: true, orderId: raw.id, status: raw.status, approvalUrl, currency, amount });
  } catch (e) { console.error(e); return json({ error: e instanceof Error ? e.message : "PayPal order creation failed" }, 500); }
});
