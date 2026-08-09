import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const MPESA_CONSUMER_KEY = Deno.env.get("MPESA_CONSUMER_KEY") ?? "";
const MPESA_CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET") ?? "";
const MPESA_SHORTCODE = Deno.env.get("MPESA_SHORTCODE") ?? "174379";
const MPESA_PASSKEY =
  Deno.env.get("MPESA_PASSKEY") ??
  "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
const IS_SANDBOX = !Deno.env.get("MPESA_SHORTCODE");
const BASE_URL = IS_SANDBOX
  ? "https://sandbox.safaricom.co.ke"
  : "https://api.safaricom.co.ke";

async function getAccessToken(): Promise<string> {
  const credentials = btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`);
  const res = await fetch(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { method: "GET", headers: { Authorization: `Basic ${credentials}` } }
  );
  const data = await res.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { checkout_request_id } = await req.json();
    if (!checkout_request_id) {
      return new Response(JSON.stringify({ error: "checkout_request_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // First check local DB
    const { data: localTxn } = await supabase
      .from("mpesa_transactions")
      .select("*")
      .eq("checkout_request_id", checkout_request_id)
      .eq("user_id", user.id)
      .single();

    if (localTxn && localTxn.status !== "pending") {
      return new Response(
        JSON.stringify({ status: localTxn.status, transaction: localTxn }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query M-Pesa API for live status
    const accessToken = await getAccessToken();
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);
    const password = btoa(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`);

    const statusRes = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkout_request_id,
      }),
    });

    const statusData = await statusRes.json();
    console.log("STK Status response:", JSON.stringify(statusData));

    const isPending =
      statusData.ResultCode === undefined ||
      statusData.errorCode === "500.001.1001";
    const isSuccess = statusData.ResultCode === "0";

    return new Response(
      JSON.stringify({
        status: isPending ? "pending" : isSuccess ? "completed" : "failed",
        result_code: statusData.ResultCode,
        result_desc: statusData.ResultDesc,
        raw: statusData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("STK Status Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
