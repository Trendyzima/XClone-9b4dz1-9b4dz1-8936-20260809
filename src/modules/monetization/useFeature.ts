import { featureRegistry } from "./featureRegistry";

/**
 * Frontend-safe feature trigger wrapper
 */
export async function useFeature(userId: string, featureKey: string, executor: () => Promise<any>) {
  const feature = featureRegistry[featureKey];

  if (!feature) {
    throw new Error("Feature not found");
  }

  const res = await fetch("/api/monetization/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, featureKey }),
  });

  const data = await res.json();

  if (!data.allowed) {
    throw new Error("Wallet balance too low");
  }

  return executor();
}