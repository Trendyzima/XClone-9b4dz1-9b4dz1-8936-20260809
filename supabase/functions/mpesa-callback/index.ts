// M-Pesa Callback Handler
// Receives payment confirmations from Safaricom servers.
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const USD_TO_KES_FALLBACK = 130;
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

async function getFxRate(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('platform_exchange_rates')
    .select('rate')
    .eq('base_currency', 'USD')
    .eq('quote_currency', 'KES')
    .lte('effective_at', new Date().toISOString())
    .order('effective_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.rate) > 0 ? Number(data.rate) : USD_TO_KES_FALLBACK;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    console.log('[mpesa-callback] Received:', JSON.stringify(body));

    // ── STK Push callback ────────────────────────────────────────────────────
    const stkCallback = body?.Body?.stkCallback;
    if (stkCallback) {
      const checkoutId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;
      const resultDesc = stkCallback.ResultDesc;
      const status = resultCode === 0 ? 'completed' : 'failed';

      let receiptNumber: string | null = null;
      let mpesaAmount: number | null = null;
      const items: any[] = stkCallback.CallbackMetadata?.Item ?? [];
      for (const item of items) {
        if (item.Name === 'MpesaReceiptNumber') receiptNumber = String(item.Value);
        if (item.Name === 'Amount') mpesaAmount = Number(item.Value);
      }

      const { data: txn, error: txnErr } = await supabaseAdmin
        .from('mpesa_transactions')
        .select('id,user_id,amount,status,idempotency_key,wallet_transaction_id')
        .eq('checkout_request_id', checkoutId)
        .maybeSingle();

      if (txnErr) throw txnErr;
      if (!txn) {
        console.warn(`[mpesa-callback] Unknown STK CheckoutRequestID: ${checkoutId}`);
        return acceptedResponse();
      }

      // Idempotent terminal-state guard: Safaricom may retry callbacks.
      if (txn.status === 'completed' || txn.status === 'failed') return acceptedResponse();

      const { error: updateErr } = await supabaseAdmin
        .from('mpesa_transactions')
        .update({
          status,
          result_code: String(resultCode),
          result_desc: resultDesc,
          mpesa_receipt_number: receiptNumber,
          updated_at: new Date().toISOString(),
        })
        .eq('id', txn.id)
        .eq('status', 'pending');
      if (updateErr) throw updateErr;

      if (status === 'completed' && txn.user_id && mpesaAmount) {
        const fxRate = await getFxRate();
        const usdAmount = mpesaAmount / fxRate;

        // The provider transaction itself is the idempotency key. A unique
        // wallet transaction prevents a repeated callback from double-crediting.
        const idempotencyKey = `mpesa:stk:${checkoutId}`;
        const { data: existingCredit } = await supabaseAdmin
          .from('wallet_transactions')
          .select('id')
          .eq('user_id', txn.user_id)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();

        if (!existingCredit) {
          await supabaseAdmin.rpc('add_to_wallet', { p_user_id: txn.user_id, p_amount: usdAmount });
          const { data: walletRow } = await supabaseAdmin
            .from('user_wallets').select('id').eq('user_id', txn.user_id).single();

          const { data: creditRow, error: creditErr } = await supabaseAdmin.from('wallet_transactions').insert({
            wallet_id: walletRow?.id ?? null,
            user_id: txn.user_id,
            type: 'deposit',
            amount: usdAmount,
            currency: 'USD',
            amount_kes: mpesaAmount,
            fx_rate: fxRate,
            payment_method: 'mpesa',
            provider: 'mpesa',
            provider_transaction_id: receiptNumber ?? checkoutId,
            status: 'completed',
            idempotency_key: idempotencyKey,
            reference: receiptNumber,
            description: `M-Pesa top-up — KES ${mpesaAmount.toLocaleString()} (Ref: ${receiptNumber ?? checkoutId})`,
            metadata: { checkout_request_id: checkoutId, result_code: resultCode },
          }).select('id').single();
          if (creditErr) throw creditErr;

          await supabaseAdmin.from('mpesa_transactions')
            .update({ wallet_transaction_id: creditRow.id, updated_at: new Date().toISOString() })
            .eq('id', txn.id);

          await supabaseAdmin.from('platform_inbox').insert({
            user_id: txn.user_id,
            subject: 'Deposit Confirmed ✅',
            body: `Your M-Pesa deposit of KES ${mpesaAmount.toLocaleString()} ($${usdAmount.toFixed(2)}) has been confirmed and credited to your wallet. Receipt: ${receiptNumber ?? 'N/A'}.`,
            type: 'system',
            icon_emoji: '✅',
          });

          await supabaseAdmin.from('audit_logs').insert({
            actor_user_id: txn.user_id,
            action: 'mpesa_stk_completed',
            resource_type: 'mpesa_transaction',
            resource_id: txn.id,
            status: 'success',
            metadata: { amount_kes: mpesaAmount, amount_usd: usdAmount, fx_rate: fxRate, receipt: receiptNumber },
          });
        }
      }

      return acceptedResponse();
    }

    // ── B2C callback ─────────────────────────────────────────────────────────
    const b2cResult = body?.Result;
    if (b2cResult) {
      const conversationId = b2cResult.ConversationID;
      const resultCode = b2cResult.ResultCode;
      const resultDesc = b2cResult.ResultDesc;
      const status = resultCode === 0 ? 'completed' : 'failed';

      const { data: txn } = await supabaseAdmin
        .from('mpesa_transactions')
        .select('id,user_id,amount,status,wallet_transaction_id')
        .eq('checkout_request_id', conversationId)
        .maybeSingle();

      if (!txn) return acceptedResponse();
      if (txn.status === 'completed' || txn.status === 'failed') return acceptedResponse();

      const { error: updateErr } = await supabaseAdmin
        .from('mpesa_transactions')
        .update({ status, result_code: String(resultCode), result_desc: resultDesc, updated_at: new Date().toISOString() })
        .eq('id', txn.id)
        .eq('status', 'pending');
      if (updateErr) throw updateErr;

      if (txn.wallet_transaction_id) {
        if (status === 'completed') {
          await supabaseAdmin.rpc('finalize_wallet_withdrawal', { p_transaction_id: txn.wallet_transaction_id });
        } else {
          await supabaseAdmin.rpc('release_wallet_reservation', {
            p_transaction_id: txn.wallet_transaction_id,
            p_reason: `M-Pesa withdrawal failed: ${resultDesc}`,
          });
        }
      }

      if (txn.user_id) {
        await supabaseAdmin.from('wallet_transactions')
          .update({ provider: 'mpesa', updated_at: new Date().toISOString() })
          .eq('id', txn.wallet_transaction_id ?? '00000000-0000-0000-0000-000000000000');

        await supabaseAdmin.from('platform_inbox').insert({
          user_id: txn.user_id,
          subject: status === 'completed' ? 'Withdrawal Complete ✅' : 'Withdrawal Failed ❌',
          body: status === 'completed'
            ? `Your withdrawal of KES ${txn.amount.toLocaleString()} has been sent successfully.`
            : `Your withdrawal of KES ${txn.amount.toLocaleString()} could not be processed. Your reserved balance has been released.`,
          type: 'system',
          icon_emoji: status === 'completed' ? '✅' : '❌',
        });

        await supabaseAdmin.from('audit_logs').insert({
          actor_user_id: txn.user_id,
          action: status === 'completed' ? 'mpesa_b2c_completed' : 'mpesa_b2c_failed',
          resource_type: 'mpesa_transaction',
          resource_id: txn.id,
          status: 'success',
          metadata: { amount_kes: txn.amount, result_code: resultCode, result_desc: resultDesc },
        });
      }

      return acceptedResponse();
    }

    console.warn('[mpesa-callback] Unknown payload structure');
    return acceptedResponse();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[mpesa-callback] Error:', message);
    // Safaricom expects an accepted response. Failed local processing is logged
    // for retry/reconciliation rather than being silently converted to success.
    return acceptedResponse();
  }
});

function acceptedResponse(): Response {
  return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
