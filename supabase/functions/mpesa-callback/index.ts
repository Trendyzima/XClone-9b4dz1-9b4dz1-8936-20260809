// M-Pesa Callback Handler
// Receives payment confirmations from Safaricom servers
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const USD_TO_KES = 130;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    console.log('[mpesa-callback] Received:', JSON.stringify(body));

    // ── STK Push callback ─────────────────────────────────────
    const stkCallback = body?.Body?.stkCallback;
    if (stkCallback) {
      const checkoutId  = stkCallback.CheckoutRequestID;
      const resultCode  = stkCallback.ResultCode;
      const resultDesc  = stkCallback.ResultDesc;

      console.log(`[mpesa-callback] STK: ${checkoutId} code=${resultCode} desc=${resultDesc}`);

      // Extract receipt number from metadata
      let receiptNumber: string | null = null;
      let mpesaAmount: number | null   = null;
      const items: any[] = stkCallback.CallbackMetadata?.Item ?? [];
      items.forEach((item: any) => {
        if (item.Name === 'MpesaReceiptNumber') receiptNumber = item.Value;
        if (item.Name === 'Amount') mpesaAmount = item.Value;
      });

      const status = resultCode === 0 ? 'completed' : 'failed';

      const { data: txn } = await supabaseAdmin
        .from('mpesa_transactions')
        .update({ status, result_code: String(resultCode), result_desc: resultDesc, mpesa_receipt_number: receiptNumber })
        .eq('checkout_request_id', checkoutId)
        .select('user_id, purpose, metadata')
        .single();

      // On success: credit wallet and send notification
      if (status === 'completed' && txn?.user_id && mpesaAmount) {
        const usdAmount = mpesaAmount / USD_TO_KES;

        await supabaseAdmin.rpc('add_to_wallet', { p_user_id: txn.user_id, p_amount: usdAmount });

        // Record wallet transaction
        const { data: walletRow } = await supabaseAdmin
          .from('user_wallets')
          .select('id')
          .eq('user_id', txn.user_id)
          .single();

        await supabaseAdmin.from('wallet_transactions').insert({
          wallet_id: walletRow?.id ?? null,
          user_id: txn.user_id,
          type: 'deposit',
          amount: usdAmount,
          payment_method: 'mpesa',
          status: 'completed',
          reference: receiptNumber,
          description: `M-Pesa top-up — KES ${mpesaAmount.toLocaleString()} (Ref: ${receiptNumber})`,
        });

        // Wallet notification
        await supabaseAdmin.from('platform_inbox').insert({
          user_id: txn.user_id,
          subject: 'Deposit Confirmed ✅',
          body: `Your M-Pesa deposit of KES ${mpesaAmount.toLocaleString()} ($${usdAmount.toFixed(2)}) has been confirmed and credited to your wallet. Receipt: ${receiptNumber}.`,
          type: 'system',
          icon_emoji: '✅',
        });

        console.log(`[mpesa-callback] Credited $${usdAmount.toFixed(2)} to user ${txn.user_id}`);
      }

      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── B2C callback ──────────────────────────────────────────
    const b2cResult = body?.Result;
    if (b2cResult) {
      const conversationId = b2cResult.ConversationID;
      const resultCode     = b2cResult.ResultCode;
      const resultDesc     = b2cResult.ResultDesc;
      const status         = resultCode === 0 ? 'completed' : 'failed';

      console.log(`[mpesa-callback] B2C: ${conversationId} code=${resultCode} desc=${resultDesc}`);

      const { data: txn } = await supabaseAdmin
        .from('mpesa_transactions')
        .update({ status, result_code: String(resultCode), result_desc: resultDesc })
        .eq('checkout_request_id', conversationId)
        .select('user_id, amount')
        .single();

      if (status === 'failed' && txn?.user_id && txn?.amount) {
        // Refund wallet
        const usdAmount = txn.amount / USD_TO_KES;
        await supabaseAdmin.rpc('add_to_wallet', { p_user_id: txn.user_id, p_amount: usdAmount });

        await supabaseAdmin.from('platform_inbox').insert({
          user_id: txn.user_id,
          subject: 'Withdrawal Failed ❌',
          body: `Your withdrawal of KES ${txn.amount.toLocaleString()} could not be processed (${resultDesc}). Your balance has been restored.`,
          type: 'system',
          icon_emoji: '❌',
        });
      } else if (status === 'completed' && txn?.user_id) {
        await supabaseAdmin.from('platform_inbox').insert({
          user_id: txn.user_id,
          subject: 'Withdrawal Complete ✅',
          body: `Your M-Pesa withdrawal of KES ${txn.amount?.toLocaleString()} has been sent successfully.`,
          type: 'system',
          icon_emoji: '✅',
        });
      }

      // Update wallet_transactions status
      await supabaseAdmin.from('wallet_transactions')
        .update({ status: status === 'completed' ? 'completed' : 'failed' })
        .eq('user_id', txn?.user_id ?? '')
        .eq('type', 'withdrawal')
        .eq('status', 'pending');

      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Unknown payload
    console.warn('[mpesa-callback] Unknown payload structure');
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[mpesa-callback] Error:', message);
    // Always return 200 to Safaricom so they don't retry
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
