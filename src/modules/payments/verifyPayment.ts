import { MpesaService } from "./mpesa";

/**
 * Basic verification layer for M-Pesa STK payments
 * (expanded later with DB + idempotency)
 */

export interface MpesaCallback {
  Body: {
    stkCallback: {
      ResultCode: number;
      CheckoutRequestID: string;
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value?: any }>;
      };
    };
  };
}

export function isPaymentSuccessful(callback: MpesaCallback): boolean {
  return callback?.Body?.stkCallback?.ResultCode === 0;
}

export function extractPaymentData(callback: MpesaCallback) {
  const items = callback?.Body?.stkCallback?.CallbackMetadata?.Item || [];

  const get = (name: string) =>
    items.find((i) => i.Name === name)?.Value;

  return {
    amount: get("Amount"),
    receipt: get("MpesaReceiptNumber"),
    phone: get("PhoneNumber"),
    date: get("TransactionDate"),
    checkoutRequestID: callback.Body.stkCallback.CheckoutRequestID,
  };
}
