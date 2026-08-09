import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * M-Pesa STK Push Callback Handler
 * Safaricom POSTs the payment result to this endpoint.
 * No auth required — Safaricom calls this directly.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const payload = await req.json();
    console.log("M-Pesa Callback payload:", JSON.stringify(payload));

    const body = payload?.Body?.stkCallback;
    if (!body) {
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      CheckoutRequestID,
      MerchantRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = body;

    const isSuccess = ResultCode === 0;

    // Parse metadata items when payment succeeded
    let mpesaReceiptNumber = null;
    let transactionDate = null;
    let phoneNumber = null;
    let paidAmount = null;

    if (isSuccess && CallbackMetadata?.Item) {
      for (const item of CallbackMetadata.Item) {
        switch (item.Name) {
          case "MpesaReceiptNumber":
            mpesaReceiptNumber = item.Value;
            break;
          case "TransactionDate":
            transactionDate = String(item.Value);
            break;
          case "PhoneNumber":
            phoneNumber = String(item.Value);
            break;
          case "Amount":
            paidAmount = item.Value;
            break;
        }
      }
    }

    console.log(
      `Callback: CheckoutRequestID=${CheckoutRequestID} ResultCode=${ResultCode} Receipt=${mpesaReceiptNumber}`
    );

    // Update mpesa_transactions
    const { data: txn, error: updateError } = await supabase
      .from("mpesa_transactions")
      .update({
        status: isSuccess ? "completed" : "failed",
        result_code: String(ResultCode),
        result_desc: ResultDesc,
        mpesa_receipt_number: mpesaReceiptNumber,
        transaction_date: transactionDate,
        updated_at: new Date().toISOString(),
      })
      .eq("checkout_request_id", CheckoutRequestID)
      .select()
      .single();

    if (updateError) {
      console.error("DB update error:", updateError);
    }

    // On success, fulfil the purpose
    if (isSuccess && txn) {
      await fulfillPurpose(supabase, txn, paidAmount ?? txn.amount);
    }

    // Always respond 200 to Safaricom
    return new Response(
      JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("M-Pesa Callback Error:", err);
    return new Response(
      JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/** Handle post-payment fulfilment based on the transaction purpose */
async function fulfillPurpose(
  supabase: ReturnType<typeof createClient>,
  txn: any,
  amount: number
) {
  const { purpose, user_id, metadata } = txn;

  try {
    switch (purpose) {
      case "deposit": {
        // Credit user wallet
        const { data: wallet } = await supabase
          .from("wallets")
          .select("id, balance")
          .eq("user_id", user_id)
          .single();

        if (wallet) {
          await supabase
            .from("wallets")
            .update({ balance: wallet.balance + Number(amount) })
            .eq("id", wallet.id);

          await supabase.from("wallet_transactions").insert({
            wallet_id: wallet.id,
            user_id,
            type: "deposit",
            amount: Number(amount),
            payment_method: "mpesa",
            status: "completed",
            description: `M-Pesa deposit — Receipt: ${txn.mpesa_receipt_number}`,
          });
        }
        break;
      }

      case "boost_post": {
        const { post_id, budget, duration, target_audience } = metadata ?? {};
        if (post_id) {
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + (duration ?? 7));
          await supabase.from("boosted_posts").insert({
            post_id,
            user_id,
            boost_type: "promoted",
            budget: budget ?? amount,
            target_audience: target_audience ?? {},
            end_date: endDate.toISOString(),
            is_active: true,
          });
        }
        break;
      }

      case "premium": {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        await supabase
          .from("user_profiles")
          .update({ is_premium: true, premium_expires_at: expiresAt.toISOString() })
          .eq("id", user_id);
        break;
      }

      case "verification": {
        // Auto-verify on payment confirmation
        await supabase
          .from("user_profiles")
          .update({ verified: true })
          .eq("id", user_id);

        // Mark verification request as approved
        await supabase
          .from("verification_requests")
          .update({ status: 'approved', payment_status: 'paid', processed_at: new Date().toISOString() })
          .eq("user_id", user_id)
          .eq("status", 'pending');

        console.log(`[Verification] Auto-verified user ${user_id}`);
        break;
      }

      case "ad_payment": {
        // Auto-activate ad on M-Pesa payment
        const { adId } = metadata ?? {};
        if (adId) {
          await supabase.from("user_ads").update({
            payment_status: 'paid',
            status: 'active',
            payment_reference: txn.mpesa_receipt_number,
            start_date: new Date().toISOString(),
            end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          }).eq("id", adId);

          // Run AI auto-verification
          try {
            await supabase.rpc('auto_verify_ad', { ad_id_param: adId });
          } catch (e) { console.warn('auto_verify_ad error:', e); }

          console.log(`[Ad] Auto-activated ad ${adId} after payment`);
        }
        break;
      }

      case "creator_monetization": {
        // Auto-enable monetization on payment
        await supabase.from("user_monetization").upsert({
          user_id,
          is_monetized: true,
          eligibility_status: 'approved',
        }, { onConflict: 'user_id' });
        await supabase.from("user_profiles")
          .update({ is_creator: true, can_monetize: true, creator_tier: 'basic' })
          .eq("id", user_id);
        console.log(`[Monetization] Auto-enabled for user ${user_id}`);
        break;
      }

      default:
        console.log(`No fulfilment logic for purpose: ${purpose}`);
    }

    // Send in-app notification
    await supabase.from("notifications").insert({
      user_id,
      type: "payment_success",
      from_user_id: user_id,
      metadata: {
        purpose,
        amount,
        receipt: txn.mpesa_receipt_number,
        message: `M-Pesa payment of KES ${amount} confirmed.`,
      },
    });

    console.log(`Fulfilled purpose=${purpose} for user=${user_id}`);
  } catch (err) {
    console.error(`Error fulfilling purpose=${purpose}:`, err);
  }
}
