import { supabase, Tables } from "./db";

// M-Pesa webhook payload (simplified safe parsing)
export type MpesaCallback = {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value?: any }>;
      };
    };
  };
};

function extractAmount(items: any[]) {
  return items.find(i => i.Name === "Amount")?.Value;
}

function extractPhone(items: any[]) {
  return items.find(i => i.Name === "PhoneNumber")?.Value;
}

function extractReceipt(items: any[]) {
  return items.find(i => i.Name === "MpesaReceiptNumber")?.Value;
}

export async function handleMpesaWebhook(payload: MpesaCallback) {
  const callback = payload.Body.stkCallback;

  // Ignore failed payments
  if (callback.ResultCode !== 0) {
    return { status: "failed", reason: callback.ResultDesc };
  }

  const items = callback.CallbackMetadata?.Item || [];

  const amount = extractAmount(items);
  const phone = extractPhone(items);
  const receipt = extractReceipt(items);

  // Find wallet by phone
  const { data: wallet } = await supabase
    .from(Tables.WALLETS)
    .select("*")
    .eq("phone", phone)
    .single();

  if (!wallet) {
    return { status: "error", message: "Wallet not found" };
  }

  // Update wallet balance
  const newBalance = (wallet.balance || 0) + (amount || 0);

  await supabase
    .from(Tables.WALLETS)
    .update({ balance: newBalance })
    .eq("id", wallet.id);

  // Log transaction
  await supabase.from(Tables.TRANSACTIONS).insert({
    wallet_id: wallet.id,
    amount,
    phone,
    receipt,
    status: "completed",
    provider: "mpesa",
  });

  return {
    status: "success",
    credited: amount,
    newBalance,
  };
}