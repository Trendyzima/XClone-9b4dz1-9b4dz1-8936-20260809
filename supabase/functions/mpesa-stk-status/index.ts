// M-Pesa STK Push Status Query
// Polls the status of a pending STK Push transaction
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MPESA_BASE = 'https://sandbox.safaricom.co.ke'; // Switch to https://api.safaricom.co.ke for production

async function getMpesaToken(consumerKey: string, consumerSecret: string): Promise<string> {
  const credentials = btoa(`${consumerKey}:${consumerSecret}`);
  const res = await fetch(`${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`Token fetch failed (${res.status})`);
  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in token response');
  return data.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const consumerKey    = Deno.env.get('MPESA_CONSUMER_KEY');
    const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET');
    const shortCode      = Deno.env.get('MPESA_SHORTCODE') ?? '174379';
    const passkey        = Deno.env.get('MPESA_PASSKEY')   ?? 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';

    if (!consumerKey || !consumerSecret) {
      throw new Error('MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set');
    }

    const { checkout_request_id } = await req.json();
    if (!checkout_request_id) throw new Error('checkout_request_id is required');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // First check our local DB — callback may have already updated the row
    const { data: localTxn } = await supabaseAdmin
      .from('mpesa_transactions')
      .select('status, result_code, result_desc, mpesa_receipt_number')
      .eq('checkout_request_id', checkout_request_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (localTxn) {
      console.log(`[mpesa-status] Local record: status=${localTxn.status} result=${localTxn.result_code}`);
      if (localTxn.status === 'completed' || localTxn.result_code === '0') {
        return new Response(JSON.stringify({ status: 'completed', receipt: localTxn.mpesa_receipt_number }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (localTxn.status === 'failed' || (localTxn.result_code && localTxn.result_code !== '0')) {
        return new Response(JSON.stringify({ status: 'failed', reason: localTxn.result_desc }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fallback: query M-Pesa API directly
    const token = await getMpesaToken(consumerKey, consumerSecret);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
                      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const password = btoa(`${shortCode}${passkey}${timestamp}`);

    const queryRes = await fetch(`${MPESA_BASE}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkout_request_id,
      }),
    });

    const queryData = await queryRes.json();
    console.log('[mpesa-status] API query response:', JSON.stringify(queryData));

    // ResultCode 0 = success, 1032 = cancelled by user, anything else = processing/failed
    const resultCode = queryData.ResultCode ?? queryData.ResponseCode;

    if (resultCode === '0' || resultCode === 0) {
      // Update local DB
      await supabaseAdmin.from('mpesa_transactions')
        .update({ status: 'completed', result_code: String(resultCode), result_desc: queryData.ResultDesc })
        .eq('checkout_request_id', checkout_request_id);
      return new Response(JSON.stringify({ status: 'completed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (resultCode === '1032' || resultCode === 1032) {
      await supabaseAdmin.from('mpesa_transactions')
        .update({ status: 'failed', result_code: String(resultCode), result_desc: 'Cancelled by user' })
        .eq('checkout_request_id', checkout_request_id);
      return new Response(JSON.stringify({ status: 'cancelled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Still pending
    return new Response(JSON.stringify({ status: 'pending', raw: queryData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[mpesa-status] Error:', message);
    // Return pending on error so client keeps polling
    return new Response(JSON.stringify({ status: 'pending', error: message }), {
      status: 200, // Return 200 so client keeps polling without triggering FunctionsHttpError
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
