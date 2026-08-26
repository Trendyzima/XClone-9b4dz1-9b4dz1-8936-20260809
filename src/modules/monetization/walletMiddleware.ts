import { featureRegistry } from "./featureRegistry";
import { deductFromWallet } from "../payments/walletService.db";
import { canAccessFeature } from "./accessControl";

/**
 * Middleware that executes feature usage with wallet deduction
 */
export async function executeFeature(userId: string, featureKey: string, fn: () => Promise<any>) {
  const allowed = await canAccessFeature(userId, featureKey);

  if (!allowed) {
    throw new Error("Insufficient wallet balance");
  }

  const cost = featureRegistry[featureKey]?.cost || 0;

  // Deduct BEFORE execution for safety (atomic-like flow)
  await deductFromWallet(userId, cost, featureKey);

  try {
    const result = await fn();
    return result;
  } catch (err) {
    // Optional: refund logic could be added here
    throw err;
  }
}