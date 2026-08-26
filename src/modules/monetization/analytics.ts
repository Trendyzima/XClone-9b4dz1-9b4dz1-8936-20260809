// Production-grade monetization analytics engine
// Tracks revenue, feature usage, wallet flows

export type AnalyticsEvent =
  | "wallet.credit"
  | "wallet.debit"
  | "feature.used"
  | "subscription.created"
  | "subscription.renewed"
  | "payment.failed";

export interface AnalyticsRecord {
  userId: string;
  event: AnalyticsEvent;
  amount?: number;
  feature?: string;
  timestamp: number;
}

class AnalyticsEngine {
  private events: AnalyticsRecord[] = [];

  track(record: AnalyticsRecord) {
    this.events.push(record);
  }

  getUserEvents(userId: string) {
    return this.events.filter(e => e.userId === userId);
  }

  getRevenue() {
    return this.events
      .filter(e => e.event === "wallet.credit")
      .reduce((sum, e) => sum + (e.amount || 0), 0);
  }

  getFeatureUsage(feature: string) {
    return this.events.filter(e => e.feature === feature).length;
  }
}

export const analytics = new AnalyticsEngine();