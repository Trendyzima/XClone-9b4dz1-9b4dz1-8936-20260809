import { serve } from "https://deno.land/std/http/server.ts";

const BASE_URL = "https://pay.pesapal.com/v3";

serve(async (req) => {
  try {
    const { amount, email, phone } = await req.json();

    const tokenRes = await fetch(`${BASE_URL}/api/Auth/RequestToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consumer_key: Deno.env.get("PESAPAL_KEY"),
        consumer_secret: Deno.env.get("PESAPAL_SECRET"),
      }),
    });

    const tokenData = await tokenRes.json();
    const token = tokenData.token;

    const orderRes = await fetch(`${BASE_URL}/api/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: Date.now().toString(),
        currency: "KES",
        amount,
        description: "XClone Payment",
        callback_url: Deno.env.get("APP_URL") + "/payment/callback",
        notification_id: "XCLONE",
        billing_address: {
          email_address: email,
          phone_number: phone,
          country_code: "KE",
          first_name: "User",
          last_name: "XClone"
        }
      })
    });

    const data = await orderRes.json();

    return new Response(JSON.stringify({ redirect_url: data.redirect_url }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500
    });
  }
});