// Production-grade fraud detection layer (rule-based baseline)
// This protects wallet + monetization system from abuse patterns

import { supabase } from "./db";

export type FraudCheckResult = {
  allowed: boolean;
  reason?: string;
  riskScore: number;
};

export class FraudDetectionEngine {
  async evaluatePayment(input: {
    userId: string;
    amount: number;
    phone: string;
  }): Promise<FraudCheckResult> {
    let riskScore = 0;

    // Rule 1: High amount anomaly
    if (input.amount > 50000) riskScore += 40;

    // Rule 2: Frequent transactions (basic heuristic)
    const { data: recent } = await supabase
      .from("transactions")
      .select("id, created_at")
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (recent && recent.length >= 5) riskScore += 30;

    // Rule 3: New user risk (no history)
    if (!recent || recent.length === 0) riskScore += 20;

    // Rule 4: Phone mismatch risk (placeholder rule)
    if (!input.phone.startsWith("254")) riskScore += 10;

    if (riskScore >= 70) {
      return {
        allowed: false,
        riskScore,
        reason: "High fraud risk detected",
      };
    }

    return {
      allowed: true,
      riskScore,
    };
  }
}

export const fraudDetection = new FraudDetectionEngine();