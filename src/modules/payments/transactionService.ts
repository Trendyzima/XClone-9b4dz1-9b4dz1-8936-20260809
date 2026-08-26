export interface Transaction {
  id: string;
  checkoutRequestID: string;
  amount: number;
  phone: string;
  receipt?: string;
  status: "pending" | "success" | "failed";
  createdAt: number;
}

/**
 * In-memory transaction store (replace with DB later)
 * This is intentionally simple to match your current repo state
 */

const transactions: Record<string, Transaction> = {};

export function createTransaction(data: Omit<Transaction, "status" | "createdAt">) {
  const tx: Transaction = {
    ...data,
    status: "pending",
    createdAt: Date.now(),
  };

  transactions[tx.checkoutRequestID] = tx;
  return tx;
}

export function updateTransactionStatus(
  checkoutRequestID: string,
  status: Transaction["status"],
  receipt?: string
) {
  const tx = transactions[checkoutRequestID];
  if (!tx) return null;

  tx.status = status;
  if (receipt) tx.receipt = receipt;

  transactions[checkoutRequestID] = tx;
  return tx;
}

export function getTransaction(checkoutRequestID: string) {
  return transactions[checkoutRequestID];
}
