import { featureRegistry } from "./featureRegistry";
import { getWalletBalance } from "../payments/walletService.db";

/**
 * Core access control engine for monetized features
 */
export async function canAccessFeature(userId: string, featureKey: string): Promise<boolean> {
  const feature = featureRegistry[featureKey];

  if (!feature) return false;

  const cost = feature.cost || 0;

  const balance = await getWalletBalance(userId);

  return balance >= cost;
}

/**
 * Returns remaining balance after hypothetical usage
 */
export async function projectedBalance(userId: string, featureKey: string): Promise<number> {
  const feature = featureRegistry[featureKey];
  const cost = feature?.cost || 0;

  const balance = await getWalletBalance(userId);

  return balance - cost;
}