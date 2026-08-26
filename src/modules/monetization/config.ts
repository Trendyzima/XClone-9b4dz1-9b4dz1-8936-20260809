// Production-grade environment configuration
// Centralized config validation for monetization system

export type MonetizationConfig = {
  mpesaConsumerKey: string;
  mpesaConsumerSecret: string;
  mpesaShortCode: string;
  mpesaPassKey: string;
  mpesaCallbackUrl: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  environment: "development" | "production";
};

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config: MonetizationConfig = {
  mpesaConsumerKey: required("MPESA_CONSUMER_KEY", process.env.MPESA_CONSUMER_KEY),
  mpesaConsumerSecret: required("MPESA_CONSUMER_SECRET", process.env.MPESA_CONSUMER_SECRET),
  mpesaShortCode: required("MPESA_SHORTCODE", process.env.MPESA_SHORTCODE),
  mpesaPassKey: required("MPESA_PASSKEY", process.env.MPESA_PASSKEY),
  mpesaCallbackUrl: required("MPESA_CALLBACK_URL", process.env.MPESA_CALLBACK_URL),
  supabaseUrl: required("SUPABASE_URL", process.env.SUPABASE_URL),
  supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  environment: (process.env.NODE_ENV as any) || "development"
};