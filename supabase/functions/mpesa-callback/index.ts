// M-Pesa Callback Handler
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const USD_TO_KES_FALLBACK = 130;
const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

async function getFxRate(): Promise<number> {
  const { data } = await supabaseAdmin.from('platform_exchange_rates').select('rate')
    .eq('base_currency','USD').eq('quote_currency','KES').lte('effective_at',new Date().toISOString())
    .order('effective_at',{ascending:false}).limit(1).maybeSingle();
  return Number(data?.rate)>0 ? Number(data.rate) : USD_TO_KES_FALLBACK;
}

function acceptedResponse(): Response {
  return new Response(JSON.stringify({ResultCode:0,ResultDesc:'Accepted'}),{status:200,headers:{...corsHeaders,'Content-Type':'application/json'}});
}

Deno.serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  try {
    const body=await req.json();
    const stk=body?.Body?.stkCallback;
    if (stk) {
      const checkoutId=stk.CheckoutRequestID;
      const resultCode=stk.ResultCode;
      const resultDesc=stk.ResultDesc;
      const status=resultCode===0?'completed':'failed';
      let receiptNumber:string|null=null;
      let mpesaAmount:number|null=null;
      for (const item of (stk.CallbackMetadata?.Item ?? [])) {
        if(item.Name==='MpesaReceiptNumber') receiptNumber=String(item.Value);
        if(item.Name==='Amount') mpesaAmount=Number(item.Value);
      }

      const {data:txn,error:txnErr}=await supabaseAdmin.from('mpesa_transactions')
        .select('id,user_id,amount,status,idempotency_key,wallet_transaction_id')
        .eq('checkout_request_id',checkoutId).maybeSingle();
      if(txnErr) throw txnErr;
      if(!txn) return acceptedResponse();
      if(txn.status==='completed'||txn.status==='failed') return acceptedResponse();

      const {data:claimed,error:claimErr}=await supabaseAdmin.from('mpesa_transactions').update({
        status,result_code:String(resultCode),result_desc:resultDesc,mpesa_receipt_number:receiptNumber,updated_at:new Date().toISOString()
      }).eq('id',txn.id).eq('status','pending').select('id').maybeSingle();
      if(claimErr) throw claimErr;
      if(!claimed) return acceptedResponse();

      if(status==='completed'&&txn.user_id&&mpesaAmount) {
        const fxRate=await getFxRate();
        const usdAmount=mpesaAmount/fxRate;
        const idempotencyKey=`mpesa:stk:${checkoutId}`;
        const {data:creditId,error:creditErr}=await supabaseAdmin.rpc('credit_wallet_deposit',{
          p_user_id:txn.user_id,p_amount:usdAmount,p_currency:'USD',p_amount_kes:mpesaAmount,p_fx_rate:fxRate,
          p_provider:'mpesa',p_provider_transaction_id:receiptNumber??checkoutId,p_idempotency_key:idempotencyKey,
          p_reference:receiptNumber,p_description:`M-Pesa top-up — KES ${mpesaAmount.toLocaleString()} (Ref: ${receiptNumber??checkoutId})`,
          p_metadata:{checkout_request_id:checkoutId,result_code:resultCode}
        });
        if(creditErr||!creditId) throw creditErr??new Error('Deposit credit failed');

        await supabaseAdmin.from('mpesa_transactions').update({wallet_transaction_id:creditId,updated_at:new Date().toISOString()}).eq('id',txn.id);
        await supabaseAdmin.from('platform_inbox').insert({
          user_id:txn.user_id,subject:'Deposit Confirmed ✅',
          body:`Your M-Pesa deposit of KES ${mpesaAmount.toLocaleString()} ($${usdAmount.toFixed(2)}) has been confirmed and credited to your wallet. Receipt: ${receiptNumber??'N/A'}.`,
          type:'system',icon_emoji:'✅'
        });
        await supabaseAdmin.from('audit_logs').insert({
          actor_user_id:txn.user_id,action:'mpesa_stk_completed',resource_type:'mpesa_transaction',resource_id:txn.id,status:'success',
          metadata:{amount_kes:mpesaAmount,amount_usd:usdAmount,fx_rate:fxRate,receipt:receiptNumber}
        });
      }
      return acceptedResponse();
    }

    const b2c=body?.Result;
    if(b2c) {
      const conversationId=b2c.ConversationID;
      const resultCode=b2c.ResultCode;
      const resultDesc=b2c.ResultDesc;
      const status=resultCode===0?'completed':'failed';
      const {data:txn}=await supabaseAdmin.from('mpesa_transactions')
        .select('id,user_id,amount,status,wallet_transaction_id').eq('checkout_request_id',conversationId).maybeSingle();
      if(!txn) return acceptedResponse();
      if(txn.status==='completed'||txn.status==='failed') return acceptedResponse();

      const {data:claimed,error:claimErr}=await supabaseAdmin.from('mpesa_transactions').update({
        status,result_code:String(resultCode),result_desc:resultDesc,updated_at:new Date().toISOString()
      }).eq('id',txn.id).eq('status','pending').select('id').maybeSingle();
      if(claimErr) throw claimErr;
      if(!claimed) return acceptedResponse();

      if(txn.wallet_transaction_id) {
        if(status==='completed') await supabaseAdmin.rpc('finalize_wallet_withdrawal',{p_transaction_id:txn.wallet_transaction_id});
        else await supabaseAdmin.rpc('release_wallet_reservation',{p_transaction_id:txn.wallet_transaction_id,p_reason:`M-Pesa withdrawal failed: ${resultDesc}`});
      }
      if(txn.user_id) {
        await supabaseAdmin.from('platform_inbox').insert({
          user_id:txn.user_id,subject:status==='completed'?'Withdrawal Complete ✅':'Withdrawal Failed ❌',
          body:status==='completed'?`Your withdrawal of KES ${txn.amount.toLocaleString()} has been sent successfully.`:`Your withdrawal of KES ${txn.amount.toLocaleString()} could not be processed. Your reserved balance has been released.`,
          type:'system',icon_emoji:status==='completed'?'✅':'❌'
        });
        await supabaseAdmin.from('audit_logs').insert({
          actor_user_id:txn.user_id,action:status==='completed'?'mpesa_b2c_completed':'mpesa_b2c_failed',resource_type:'mpesa_transaction',resource_id:txn.id,status:'success',
          metadata:{amount_kes:txn.amount,result_code:resultCode,result_desc:resultDesc}
        });
      }
      return acceptedResponse();
    }
    return acceptedResponse();
  } catch(err:unknown) {
    console.error('[mpesa-callback] Error:',err instanceof Error?err.message:'Internal error');
    return acceptedResponse();
  }
});
