import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MPESA_BASE = 'https://api.safaricom.co.ke';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function getMpesaToken(key: string, secret: string) {
  const res = await fetch(`${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` } });
  if (!res.ok) throw new Error(`Token fetch failed (${res.status})`);
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error('No access_token');
  return data.access_token;
}

function phone(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('254') && d.length === 12) return d;
  if (d.startsWith('0') && d.length === 10) return `254${d.slice(1)}`;
  if ((d.startsWith('7') || d.startsWith('1')) && d.length === 9) return `254${d}`;
  throw new Error('Invalid phone number');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!service || !supabaseUrl) throw new Error('Supabase service configuration is missing');
    const admin = createClient(supabaseUrl, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ success: false, error: 'Unauthorized' }, 401);
    const { data: { user }, error: authError } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (authError || !user) return json({ success: false, error: 'Unauthorized — invalid session' }, 401);

    const key = Deno.env.get('MPESA_CONSUMER_KEY');
    const secret = Deno.env.get('MPESA_CONSUMER_SECRET');
    const shortCode = Deno.env.get('MPESA_SHORTCODE');
    const passkey = Deno.env.get('MPESA_PASSKEY');
    const callbackUrl = Deno.env.get('MPESA_CALLBACK_URL') ?? `${supabaseUrl}/functions/v1/mpesa-callback`;
    if (!key || !secret || !shortCode || !passkey) throw new Error('M-Pesa STK secrets are not configured');

    const body = await req.json() as { phone?: string; amount?: number | string; purpose?: string; metadata?: Record<string, unknown> };
    const destination = phone(String(body.phone ?? ''));
    const amount = Math.ceil(Number(body.amount));
    if (!Number.isFinite(amount) || amount < 1) throw new Error('Amount must be at least KES 1');

    const token = await getMpesaToken(key, secret);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const payload = {
      BusinessShortCode: shortCode,
      Password: btoa(`${shortCode}${passkey}${timestamp}`),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: destination,
      PartyB: shortCode,
      PhoneNumber: destination,
      CallBackURL: callbackUrl,
      AccountReference: body.purpose ?? 'WalletTopUp',
      TransactionDesc: 'Testagram Wallet Top-Up',
    };
    const response = await fetch(`${MPESA_BASE}/mpesa/stkpush/v1/processrequest`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json() as { ResponseCode?: string; errorMessage?: string; ResponseDescription?: string; CheckoutRequestID?: string; MerchantRequestID?: string };
    if (!response.ok || String(data.ResponseCode) !== '0' || !data.CheckoutRequestID) throw new Error(data.errorMessage ?? data.ResponseDescription ?? `STK Push failed (${response.status})`);

    const metadata = { ...(body.metadata ?? {}), wallet_user_id: user.id, kes_amount: amount, provider: 'mpesa', provider_flow: 'stk_push' };
    const { error: insertError } = await admin.from('mpesa_transactions').insert({ user_id: user.id, checkout_request_id: data.CheckoutRequestID, merchant_request_id: data.MerchantRequestID, phone_number: destination, amount, type: 'stk_push', purpose: body.purpose ?? 'wallet_topup', status: 'pending', metadata });
    if (insertError) throw new Error(`Unable to persist M-Pesa payment intent: ${insertError.message}`);

    const { error: phoneError } = await admin.rpc('update_wallet_payment_methods', { p_mpesa_phone: destination, p_paypal_email: null });
    if (phoneError) console.warn('[mpesa-stk] phone save:', phoneError.message);
    return json({ success: true, checkout_request_id: data.CheckoutRequestID, merchant_request_id: data.MerchantRequestID, customer_message: `M-Pesa PIN prompt sent to ${destination}. Enter your PIN to complete payment.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return json({ success: false, error: message }, 400);
  }
});
