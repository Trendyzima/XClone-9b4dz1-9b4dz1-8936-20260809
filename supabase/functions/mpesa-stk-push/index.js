import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const MPESA_CONSUMER_KEY = Deno.env.get("MPESA_CONSUMER_KEY") ?? "";
const MPESA_CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET") ?? "";
// Shortcode: use env or fall back to Safaricom sandbox shortcode
const MPESA_SHORTCODE = Deno.env.get("MPESA_SHORTCODE") ?? "174379";
// Passkey: use env or fall back to Safaricom sandbox passkey
const MPESA_PASSKEY =
  Deno.env.get("MPESA_PASSKEY") ??
  "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
// Callback URL: use env or construct from backend URL
const BACKEND_URL = Deno.env.get("SUPABASE_URL") ?? "";
const MPESA_CALLBACK_URL =
  Deno.env.get("MPESA_CALLBACK_URL") ??
  `${BACKEND_URL}/functions/v1/mpesa-callback`;

// Toggle true → sandbox, false → production
const IS_SANDBOX = !Deno.env.get("MPESA_SHORTCODE"); // auto-detect: if no real shortcode set, use sandbox

const BASE_URL = IS_SANDBOX
  ? "https://sandbox.safaricom.co.ke"
  : "https://api.safaricom.co.ke";

/** Get OAuth access token */
async function getAccessToken(): Promise<string> {
  const credentials = btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`);
  const res = await fetch(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: "GET",
      headers: { Authorization: `Basic ${credentials}` },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`M-Pesa OAuth failed: ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

/** Generate Base64 password for STK push */
function generatePassword(timestamp: string): string {
  const raw = `${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`;
  return btoa(raw);
}

/** Format phone: strip leading 0 / + and ensure 254 prefix */
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

    // Authenticate user via JWT
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { phone, amount, purpose, metadata = {} } = body;

    if (!phone || !amount || !purpose) {
      return new Response(
        JSON.stringify({ error: "phone, amount, and purpose are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const formattedPhone = formatPhone(phone);
    const amountInt = Math.ceil(Number(amount)); // M-Pesa requires integer KES

    console.log(
      `STK Push: user=${user.id} phone=${formattedPhone} amount=${amountInt} KES purpose=${purpose}`
    );

    // Get access token
    const accessToken = await getAccessToken();

    // Generate timestamp & password
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);
    const password = generatePassword(timestamp);

    // Initiate STK Push
    const stkRes = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amountInt,
        PartyA: formattedPhone,
        PartyB: MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: MPESA_CALLBACK_URL,
        AccountReference: `TSOCIAL-${purpose.toUpperCase()}`,
        TransactionDesc: `T Social - ${purpose.replace(/_/g, " ")}`,
      }),
    });

    const stkData = await stkRes.json();
    console.log("STK Push response:", JSON.stringify(stkData));

    if (stkData.ResponseCode !== "0") {
      throw new Error(
        `STK Push failed: ${stkData.ResponseDescription || stkData.errorMessage}`
      );
    }

    // Save transaction record
    const { data: txn, error: dbError } = await supabase
      .from("mpesa_transactions")
      .insert({
        user_id: user.id,
        checkout_request_id: stkData.CheckoutRequestID,
        merchant_request_id: stkData.MerchantRequestID,
        phone_number: formattedPhone,
        amount: amountInt,
        type: "stk_push",
        purpose,
        status: "pending",
        metadata: {
          ...metadata,
          response_description: stkData.ResponseDescription,
          customer_message: stkData.CustomerMessage,
        },
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB insert error:", dbError);
      // Still return success — STK was sent, DB is recovering
    }

    return new Response(
      JSON.stringify({
        success: true,
        checkout_request_id: stkData.CheckoutRequestID,
        merchant_request_id: stkData.MerchantRequestID,
        customer_message:
          stkData.CustomerMessage ||
          "Please check your phone and enter your M-Pesa PIN.",
        transaction_id: txn?.id ?? null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("M-Pesa STK Push Error:", err);
    return new Response(
      JSON.stringify({ error: `M-Pesa: ${err.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
