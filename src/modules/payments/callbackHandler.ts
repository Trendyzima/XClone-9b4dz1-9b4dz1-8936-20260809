import { isPaymentSuccessful, extractPaymentData } from "./verifyPayment";
import { updateTransactionStatus } from "./transactionService";

/**
 * Main M-Pesa callback processor
 * This is the bridge between Safaricom and your wallet system (future step)
 */

export function handleMpesaCallback(callback: any) {
  const success = isPaymentSuccessful(callback);

  const data = extractPaymentData(callback);

  const checkoutId = data.checkoutRequestID;

  if (!checkoutId) {
    return { error: "Missing checkoutRequestID" };
  }

  if (success) {
    const tx = updateTransactionStatus(
      checkoutId,
      "success",
      data.receipt
    );

    return {
      status: "success",
      transaction: tx,
      walletUpdateRequired: true
    };
  } else {
    const tx = updateTransactionStatus(checkoutId, "failed");

    return {
      status: "failed",
      transaction: tx
    };
  }
}
