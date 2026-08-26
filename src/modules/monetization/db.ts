import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

// Production Supabase client (service role for backend monetization only)
export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseServiceKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// DB tables used by monetization system
export const Tables = {
  WALLETS: "wallets",
  TRANSACTIONS: "transactions",
  LEDGER: "ledger",
  SUBSCRIPTIONS: "subscriptions",
} as const;

export type DbTables = typeof Tables[keyof typeof Tables];