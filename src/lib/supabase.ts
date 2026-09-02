// Temporary compatibility entry point for existing feature modules.
// The Supabase SDK and Supabase network calls have been removed.
// New code should import from ./cloudflare directly.
export { supabase, mapSupabaseUser } from './cloudflare';
export type { User, CloudflareUser, Session } from './cloudflare';
