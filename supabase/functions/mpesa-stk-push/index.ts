// M-Pesa STK Push (Lipa Na M-Pesa Online)
// Triggers a payment prompt on the customer's phone
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MPESA_BASE = 'https://sandbox.safaricom.co.ke'; // Switch to https://api.safaricom.co.ke for production

async function getMpesaToken(consumerKey: string, consumerSecret: string): Promise<string> {
  const credentials = btoa(`${consumerKey}:${consumerSecret}`);
  const res = await fetch(`${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[mpesa-token] Failed:', res.status, text);
    throw new Error(`Token fetch failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in M-Pesa response: ' + JSON.stringify(data));
  return data.access_token;
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0')   && digits.length === 10) return '254' + digits.slice(1);
  if (digits.startsWith('7')   && digits.length === 9)  return '254' + digits;
  if (digits.startsWith('1')   && digits.length === 9)  return '254' + digits;
  throw new Error(`Invalid phone number: "${raw}". Use format 0712345678 or +254712345678`);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const consumerKey    = Deno.env.get('MPESA_CONSUMER_KEY');
    const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET');
    const shortCode      = Deno.env.get('MPESA_SHORTCODE')       ?? '174379';   // Sandbox default
    const passkey        = Deno.env.get('MPESA_PASSKEY')         ?? 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
    const callbackUrl    = Deno.env.get('MPESA_CALLBACK_URL')    ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-callback`;

    if (!consumerKey || !consumerSecret) {
      throw new Error('MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set in Edge Function secrets');
    }

    const body = await req.json();
    const { phone, amount, purpose, metadata } = body;

    if (!phone)  throw new Error('phone is required');
    if (!amount) throw new Error('amount is required');

    const normalisedPhone = normalisePhone(String(phone));
    const intAmount = Math.ceil(Number(amount));
    if (intAmount < 1) throw new Error('Amount must be at least KES 1');

    console.log(`[mpesa-stk] Initiating STK Push: phone=${normalisedPhone} amount=KES${intAmount} purpose=${purpose}`);

    const token = await getMpesaToken(consumerKey, consumerSecret);

    // Generate timestamp & password
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
                      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const password = btoa(`${shortCode}${passkey}${timestamp}`);

    const stkPayload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: intAmount,
      PartyA: normalisedPhone,
      PartyB: shortCode,
      PhoneNumber: normalisedPhone,
      CallBackURL: callbackUrl,
      AccountReference: purpose ?? 'WalletTopUp',
      TransactionDesc: purpose ?? 'Testagram Wallet Top-Up',
    };

    const stkRes = await fetch(`${MPESA_BASE}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(stkPayload),
    });

    const stkData = await stkRes.json();
    console.log('[mpesa-stk] STK response:', JSON.stringify(stkData));

    if (!stkRes.ok || stkData.ResponseCode !== '0') {
      const errMsg = stkData.errorMessage ?? stkData.ResponseDescription ?? `STK Push failed (${stkRes.status})`;
      throw new Error(`M-Pesa: ${errMsg}`);
    }

    // Persist transaction record for polling
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get user_id from JWT if available
    let userId: string | null = metadata?.user_id ?? null;
    const authHeader = req.headers.get('Authorization');
    if (!userId && authHeader) {
      const token2 = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabaseAdmin.auth.getUser(token2);
      userId = user?.id ?? null;
    }

    const { error: insertErr } = await supabaseAdmin.from('mpesa_transactions').insert({
      user_id: userId,
      checkout_request_id: stkData.CheckoutRequestID,
      merchant_request_id: stkData.MerchantRequestID,
      phone_number: normalisedPhone,
      amount: intAmount,
      type: 'stk_push',
      purpose: purpose ?? 'wallet_topup',
      status: 'pending',
      metadata: metadata ?? {},
    });
    if (insertErr) console.warn('[mpesa-stk] Insert error (non-fatal):', insertErr.message);

    // Save phone number to wallet for future auto-fill
    if (userId) {
      const { error: phoneErr } = await supabaseAdmin
        .from('user_wallets')
        .update({ mpesa_phone: normalisedPhone })
        .eq('user_id', userId);
      if (phoneErr) console.warn('[mpesa-stk] Phone save error (non-fatal):', phoneErr.message);
    }

    return new Response(JSON.stringify({
      success: true,
      checkout_request_id: stkData.CheckoutRequestID,
      merchant_request_id: stkData.MerchantRequestID,
      customer_message: `M-Pesa PIN prompt sent to ${normalisedPhone}. Enter your PIN to complete payment.`,
      response_description: stkData.ResponseDescription,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[mpesa-stk] Error:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
