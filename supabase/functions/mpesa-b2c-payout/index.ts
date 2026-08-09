import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const MPESA_CONSUMER_KEY = Deno.env.get("MPESA_CONSUMER_KEY") ?? "";
const MPESA_CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET") ?? "";
const MPESA_SHORTCODE = Deno.env.get("MPESA_SHORTCODE") ?? "174379";
const BACKEND_URL = Deno.env.get("SUPABASE_URL") ?? "";
const IS_SANDBOX = !Deno.env.get("MPESA_SHORTCODE");
const BASE_URL = IS_SANDBOX
  ? "https://sandbox.safaricom.co.ke"
  : "https://api.safaricom.co.ke";

// B2C Initiator credentials — must be registered on Safaricom portal
const INITIATOR_NAME = Deno.env.get("MPESA_INITIATOR_NAME") ?? "testapi";
const INITIATOR_PASSWORD =
  Deno.env.get("MPESA_INITIATOR_PASSWORD") ?? "Safaricom999!*!";

async function getAccessToken(): Promise<string> {
  const credentials = btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`);
  const res = await fetch(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { method: "GET", headers: { Authorization: `Basic ${credentials}` } }
  );
  if (!res.ok) throw new Error("Failed to get M-Pesa access token");
  const data = await res.json();
  return data.access_token;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
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

    // Admin-only: check requesting user is admin
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    // Allow admin or self-withdrawal
    const body = await req.json();
    const { recipient_user_id, phone, amount, purpose = "creator_payout" } = body;

    if (!phone || !amount) {
      return new Response(JSON.stringify({ error: "phone and amount required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetUserId = recipient_user_id ?? user.id;

    // Non-admins can only withdraw for themselves
    if (!profile?.is_admin && targetUserId !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formattedPhone = formatPhone(phone);
    const amountInt = Math.floor(Number(amount));

    console.log(
      `B2C Payout: to=${formattedPhone} amount=${amountInt} KES purpose=${purpose}`
    );

    const accessToken = await getAccessToken();

    const resultURL = `${BACKEND_URL}/functions/v1/mpesa-callback`;
    const timeoutURL = `${BACKEND_URL}/functions/v1/mpesa-callback`;

    const b2cRes = await fetch(`${BASE_URL}/mpesa/b2c/v1/paymentrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        InitiatorName: INITIATOR_NAME,
        SecurityCredential: INITIATOR_PASSWORD,
        CommandID: "BusinessPayment",
        Amount: amountInt,
        PartyA: MPESA_SHORTCODE,
        PartyB: formattedPhone,
        Remarks: `T Social ${purpose.replace(/_/g, " ")}`,
        QueueTimeOutURL: timeoutURL,
        ResultURL: resultURL,
        Occasion: purpose,
      }),
    });

    const b2cData = await b2cRes.json();
    console.log("B2C Response:", JSON.stringify(b2cData));

    if (b2cData.ResponseCode !== "0") {
      throw new Error(
        `B2C failed: ${b2cData.ResponseDescription || b2cData.errorMessage}`
      );
    }

    // Record payout transaction
    await supabase.from("mpesa_transactions").insert({
      user_id: targetUserId,
      checkout_request_id: b2cData.ConversationID,
      merchant_request_id: b2cData.OriginatorConversationID,
      phone_number: formattedPhone,
      amount: amountInt,
      type: "b2c_payout",
      purpose,
      status: "pending",
      metadata: { initiated_by: user.id },
    });

    return new Response(
      JSON.stringify({
        success: true,
        conversation_id: b2cData.ConversationID,
        message: b2cData.ResponseDescription,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("M-Pesa B2C Error:", err);
    return new Response(JSON.stringify({ error: `M-Pesa: ${err.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
