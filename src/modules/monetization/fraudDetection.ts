/**
 * Production-grade fraud detection layer (rule-based baseline)
 * Protects wallet + monetization system from abuse patterns.
 *
 * esbuild-safe: no Set<T> generics, no useState<T>, no useRef<T>.
 * Uses project-standard @/lib/supabase — NOT a phantom "./db" module.
 */
import { supabase } from '@/lib/supabase';

// ── Result type ──────────────────────────────────────────────────────────
export type FraudCheckResult = {
  allowed: boolean;
  reason?: string;
  riskScore: number;
};

// ── Pure risk rules (module-level constants, esbuild-safe) ───────────────
const RULE_HIGH_AMOUNT     = 40;  // +40 risk if amount > 50,000 KES
const RULE_RAPID_FIRE      = 30;  // +30 risk if 5+ recent transactions
const RULE_NEW_USER        = 20;  // +20 risk if no transaction history
const RULE_FOREIGN_PHONE   = 10;  // +10 risk if phone doesn't start with 254
const RISK_BLOCK_THRESHOLD = 70;  // block if total risk >= 70

// ── Engine ───────────────────────────────────────────────────────────────
export class FraudDetectionEngine {
  async evaluatePayment(input: {
    userId: string;
    amount: number;
    phone: string;
  }): Promise<FraudCheckResult> {
    let riskScore = 0;

    // Rule 1: High-value transaction anomaly (KES 50,000+)
    if (input.amount > 50000) riskScore += RULE_HIGH_AMOUNT;

    // Rule 2: Rapid-fire transactions — 5+ in recent history
    const { data: recent } = await supabase
      .from('wallet_transactions')
      .select('id, created_at')
      .eq('user_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recent && recent.length >= 5) riskScore += RULE_RAPID_FIRE;

    // Rule 3: New user with no transaction history
    if (!recent || recent.length === 0) riskScore += RULE_NEW_USER;

    // Rule 4: Phone number not in Kenyan format (254XXXXXXXXX)
    if (!input.phone.startsWith('254')) riskScore += RULE_FOREIGN_PHONE;

    if (riskScore >= RISK_BLOCK_THRESHOLD) {
      console.warn('[FraudDetection] Payment blocked:', {
        userId: input.userId,
        amount: input.amount,
        riskScore,
      });
      return {
        allowed: false,
        riskScore,
        reason: 'High fraud risk detected',
      };
    }

    return {
      allowed: true,
      riskScore,
    };
  }

  // Lightweight synchronous check for amount-only heuristics
  evaluateAmountOnly(amount: number): FraudCheckResult {
    let riskScore = 0;
    if (amount > 50000) riskScore += RULE_HIGH_AMOUNT;
    return {
      allowed: riskScore < RISK_BLOCK_THRESHOLD,
      riskScore,
      reason: riskScore >= RISK_BLOCK_THRESHOLD ? 'Amount exceeds safe threshold' : undefined,
    };
  }
}

export const fraudDetection = new FraudDetectionEngine();
