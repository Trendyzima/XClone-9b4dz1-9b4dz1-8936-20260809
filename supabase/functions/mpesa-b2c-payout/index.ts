// M-Pesa B2C (Business to Customer) Payout
// Sends money from business account to customer M-Pesa
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
  if (!data.access_token) throw new Error('No access_token in response');
  return data.access_token;
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0')   && digits.length === 10) return '254' + digits.slice(1);
  if (digits.startsWith('7')   && digits.length === 9)  return '254' + digits;
  if (digits.startsWith('1')   && digits.length === 9)  return '254' + digits;
  throw new Error(`Invalid phone number: "${raw}"`);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const consumerKey      = Deno.env.get('MPESA_CONSUMER_KEY');
    const consumerSecret   = Deno.env.get('MPESA_CONSUMER_SECRET');
    const shortCode        = Deno.env.get('MPESA_B2C_SHORTCODE')    ?? Deno.env.get('MPESA_SHORTCODE') ?? '174379';
    const initiatorName    = Deno.env.get('MPESA_INITIATOR_NAME')   ?? 'testapi';
    const securityCred     = Deno.env.get('MPESA_SECURITY_CRED')    ?? '';
    const resultUrl        = Deno.env.get('MPESA_B2C_RESULT_URL')   ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-callback`;
    const timeoutUrl       = Deno.env.get('MPESA_B2C_TIMEOUT_URL')  ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-callback`;

    if (!consumerKey || !consumerSecret) throw new Error('MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set');
    if (!securityCred) throw new Error('MPESA_SECURITY_CRED must be set for B2C payouts');

    // Authenticate caller via JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const jwtToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(jwtToken);
    if (userErr || !user) throw new Error('Unauthorized — invalid session');

    const body = await req.json();
    const { phone, amount, purpose } = body;
    if (!phone)  throw new Error('phone is required');
    if (!amount) throw new Error('amount is required');

    const normalisedPhone = normalisePhone(String(phone));
    const intAmount = Math.floor(Number(amount));
    if (intAmount < 10) throw new Error('Minimum B2C amount is KES 10');

    // Check user wallet balance
    const { data: wallet } = await supabaseAdmin
      .from('user_wallets')
      .select('balance, daily_spend_limit, spend_limit_enabled')
      .eq('user_id', user.id)
      .single();

    if (!wallet) throw new Error('Wallet not found');

    const usdAmount = intAmount / 130; // USD_TO_KES rate
    if (Number(wallet.balance) < usdAmount) {
      throw new Error(`Insufficient balance. Available: $${Number(wallet.balance).toFixed(2)}`);
    }

    // Check daily spend limit
    if (wallet.spend_limit_enabled && wallet.daily_spend_limit !== null) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data: todayTxns } = await supabaseAdmin
        .from('wallet_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'withdrawal')
        .gte('created_at', since.toISOString());

      const todaySpent = (todayTxns ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
      const limitUsd = Number(wallet.daily_spend_limit);
      if (todaySpent + usdAmount > limitUsd) {
        throw new Error(`Daily spend limit of $${limitUsd.toFixed(2)} exceeded. Already spent $${todaySpent.toFixed(2)} today.`);
      }
    }

    console.log(`[mpesa-b2c] Initiating B2C: phone=${normalisedPhone} amount=KES${intAmount} user=${user.id}`);

    const token = await getMpesaToken(consumerKey, consumerSecret);

    const b2cPayload = {
      InitiatorName: initiatorName,
      SecurityCredential: securityCred,
      CommandID: 'BusinessPayment',
      Amount: intAmount,
      PartyA: shortCode,
      PartyB: normalisedPhone,
      Remarks: purpose ?? 'Creator Payout',
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: purpose ?? 'Testagram Payout',
    };

    const b2cRes = await fetch(`${MPESA_BASE}/mpesa/b2c/v1/paymentrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(b2cPayload),
    });

    const b2cData = await b2cRes.json();
    console.log('[mpesa-b2c] Response:', JSON.stringify(b2cData));

    if (!b2cRes.ok || b2cData.ResponseCode !== '0') {
      const errMsg = b2cData.errorMessage ?? b2cData.ResponseDescription ?? `B2C failed (${b2cRes.status})`;
      throw new Error(`M-Pesa B2C: ${errMsg}`);
    }

    // Record transaction
    const { data: walletRow } = await supabaseAdmin
      .from('user_wallets')
      .select('id')
      .eq('user_id', user.id)
      .single();

    await supabaseAdmin.from('mpesa_transactions').insert({
      user_id: user.id,
      checkout_request_id: b2cData.ConversationID,
      merchant_request_id: b2cData.OriginatorConversationID,
      phone_number: normalisedPhone,
      amount: intAmount,
      type: 'b2c',
      purpose: purpose ?? 'creator_payout',
      status: 'pending',
    });

    await supabaseAdmin.from('wallet_transactions').insert({
      wallet_id: walletRow?.id ?? null,
      user_id: user.id,
      type: 'withdrawal',
      amount: usdAmount,
      payment_method: 'mpesa',
      status: 'pending',
      description: `M-Pesa withdrawal — KES ${intAmount.toLocaleString()} to ${normalisedPhone}`,
    });

    // Save phone to wallet for auto-fill
    await supabaseAdmin
      .from('user_wallets')
      .update({ mpesa_phone: normalisedPhone })
      .eq('user_id', user.id);

    // Send wallet notification
    await supabaseAdmin.from('platform_inbox').insert({
      user_id: user.id,
      subject: 'Withdrawal Initiated 💸',
      body: `Your withdrawal of KES ${intAmount.toLocaleString()} ($${usdAmount.toFixed(2)}) to M-Pesa number ${normalisedPhone} has been initiated. Funds typically arrive within 5 minutes.`,
      type: 'system',
      icon_emoji: '💸',
    });

    return new Response(JSON.stringify({
      success: true,
      conversation_id: b2cData.ConversationID,
      originator_id: b2cData.OriginatorConversationID,
      message: `KES ${intAmount.toLocaleString()} is being sent to your M-Pesa`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[mpesa-b2c] Error:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
