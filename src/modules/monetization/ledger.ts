/**
 * Monetization Ledger System
 * Tracks all wallet + feature usage events (immutable-style log)
 */

export type LedgerEventType =
  | "wallet_credit"
  | "wallet_debit"
  | "feature_charge"
  | "subscription_charge"
  | "refund";

export interface LedgerEvent {
  id: string;
  userId: string;
  type: LedgerEventType;
  amount: number;
  feature?: string;
  referenceId?: string; // mpesa receipt / checkout id
  timestamp: number;
}

export class Ledger {
  private events: LedgerEvent[] = [];

  record(event: LedgerEvent) {
    this.events.push(event);
  }

  getUserHistory(userId: string) {
    return this.events.filter(e => e.userId === userId);
  }

  getAll() {
    return this.events;
  }

  getBalance(userId: string) {
    return this.getUserHistory(userId).reduce((acc, e) => {
      if (e.type === "wallet_credit") return acc + e.amount;
      if (e.type === "wallet_debit" || e.type === "feature_charge") return acc - e.amount;
      return acc;
    }, 0);
  }
}
