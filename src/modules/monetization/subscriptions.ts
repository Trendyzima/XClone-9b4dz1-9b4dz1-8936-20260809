/**
 * Subscription system
 * Handles recurring plans (weekly/monthly)
 */

export type PlanType = "free" | "pro" | "premium";

export interface Subscription {
  userId: string;
  plan: PlanType;
  expiresAt: number;
}

export class SubscriptionManager {
  private subscriptions: Subscription[] = [];

  createOrUpdate(userId: string, plan: PlanType, durationDays: number) {
    const expiresAt = Date.now() + durationDays * 24 * 60 * 60 * 1000;

    const existing = this.subscriptions.find(s => s.userId === userId);

    if (existing) {
      existing.plan = plan;
      existing.expiresAt = expiresAt;
      return existing;
    }

    const sub = { userId, plan, expiresAt };
    this.subscriptions.push(sub);
    return sub;
  }

  get(userId: string) {
    return this.subscriptions.find(s => s.userId === userId);
  }

  isActive(userId: string) {
    const sub = this.get(userId);
    return sub ? sub.expiresAt > Date.now() : false;
  }
}
