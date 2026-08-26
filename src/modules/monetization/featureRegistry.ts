/**
 * Feature Registry
 * Maps monetized features to wallet costs
 */

export type FeatureKey =
  | "ai_generation"
  | "premium_feed"
  | "boost_post"
  | "api_access"
  | "analytics"
  | "export_data";

export interface FeatureMeta {
  key: FeatureKey;
  cost: number;
  description: string;
  enabled: boolean;
}

export const featureRegistry: Record<FeatureKey, FeatureMeta> = {
  ai_generation: {
    key: "ai_generation",
    cost: 5,
    description: "Generate AI content",
    enabled: true,
  },
  premium_feed: {
    key: "premium_feed",
    cost: 3,
    description: "Access premium feed",
    enabled: true,
  },
  boost_post: {
    key: "boost_post",
    cost: 10,
    description: "Boost visibility of posts",
    enabled: true,
  },
  api_access: {
    key: "api_access",
    cost: 15,
    description: "Access developer API",
    enabled: true,
  },
  analytics: {
    key: "analytics",
    cost: 4,
    description: "View advanced analytics",
    enabled: true,
  },
  export_data: {
    key: "export_data",
    cost: 8,
    description: "Export user data",
    enabled: true,
  },
};
