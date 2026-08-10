import { Deno } from "https://deno.land/std@0.168.0/node/module.ts";
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { user_id, title, body: notifBody, data = {} } = body;

    if (!user_id || !title || !notifBody) {
      return new Response(
        JSON.stringify({ error: "Missing user_id, title, or body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all FCM tokens for this user
    const { data: tokens, error: tokenError } = await supabaseAdmin
      .from("fcm_tokens")
      .select("token, platform")
      .eq("user_id", user_id);

    if (tokenError) throw tokenError;
    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No FCM tokens found for user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY");
    if (!FCM_SERVER_KEY) {
      console.warn("[Push] FCM_SERVER_KEY not set — skipping push");
      return new Response(
        JSON.stringify({ message: "FCM not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send to each token
    const results = await Promise.allSettled(
      tokens.map(async ({ token }: { token: string }) => {
        const fcmPayload = {
          to: token,
          notification: {
            title,
            body: notifBody,
            sound: "default",
            badge: 1,
          },
          data: {
            ...data,
            click_action: "FLUTTER_NOTIFICATION_CLICK",
          },
          priority: "high",
        };

        const res = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            Authorization: `key=${FCM_SERVER_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fcmPayload),
        });

        const result = await res.json();
        console.log("[Push] FCM result:", JSON.stringify(result));

        // Remove invalid tokens
        if (result.results?.[0]?.error === "InvalidRegistration" ||
            result.results?.[0]?.error === "NotRegistered") {
          await supabaseAdmin.from("fcm_tokens").delete().eq("token", token);
          console.log("[Push] Removed invalid token");
        }

        return result;
      })
    );

    return new Response(
      JSON.stringify({ success: true, sent: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[Push] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
