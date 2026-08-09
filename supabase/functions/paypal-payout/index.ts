import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const PAYPAL_API_BASE = Deno.env.get('PAYPAL_MODE') === 'live' 
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

interface PayoutRequest {
  amount: number;
  recipient_email: string;
  user_id: string;
  note?: string;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { amount, recipient_email, user_id, note } = await req.json() as PayoutRequest;

    if (!amount || !recipient_email || !user_id) {
      throw new Error('Missing required fields');
    }

    // Get PayPal access token
    const clientId = Deno.env.get('PAYPAL_CLIENT_ID');
    const secret = Deno.env.get('PAYPAL_SECRET');

    if (!clientId || !secret) {
      throw new Error('PayPal credentials not configured');
    }

    const auth = btoa(`${clientId}:${secret}`);
    const tokenResponse = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const { access_token } = await tokenResponse.json();

    // Create payout
    const payoutResponse = await fetch(`${PAYPAL_API_BASE}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: `batch_${Date.now()}`,
          email_subject: 'You have a payout from T Social!',
          email_message: 'You have received a payout. Thank you for using T Social!',
        },
        items: [
          {
            recipient_type: 'EMAIL',
            amount: {
              value: amount.toFixed(2),
              currency: 'USD',
            },
            receiver: recipient_email,
            note: note || 'T Social payout',
            sender_item_id: `payout_${user_id}_${Date.now()}`,
          },
        ],
      }),
    });

    const payoutData = await payoutResponse.json();

    if (!payoutResponse.ok) {
      console.error('PayPal error:', payoutData);
      throw new Error(payoutData.message || 'PayPal payout failed');
    }

    // Update transaction status
    const { data: wallet } = await supabaseClient
      .from('user_wallets')
      .select('id')
      .eq('user_id', user_id)
      .single();

    await supabaseClient
      .from('wallet_transactions')
      .insert({
        wallet_id: wallet!.id,
        user_id: user_id,
        type: 'withdrawal',
        amount: amount,
        payment_method: 'paypal',
        status: 'completed',
        reference: payoutData.batch_header.payout_batch_id,
        description: 'PayPal withdrawal completed',
        metadata: {
          paypal_batch_id: payoutData.batch_header.payout_batch_id,
          recipient_email: recipient_email,
        },
      });

    return new Response(
      JSON.stringify({
        success: true,
        batch_id: payoutData.batch_header.payout_batch_id,
        status: payoutData.batch_header.batch_status,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('PayPal payout error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
