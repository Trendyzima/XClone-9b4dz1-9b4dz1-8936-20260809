// Compatibility module retained while feature modules finish migrating imports.
// It contains no Supabase SDK or Supabase network implementation.
export { supabase, mapSupabaseUser, currentAccessToken, SHARED_BACKEND } from './cloudflare';
export type { User, CloudflareUser, Session } from './cloudflare';
