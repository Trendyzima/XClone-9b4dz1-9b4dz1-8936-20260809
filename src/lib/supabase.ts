import { createClient } from '@supabase/supabase-js';

// Shared Testagram/Social backend. The native Android client and web clients
// use this same Supabase project so accounts, profiles, posts and social data
// are one platform instead of separate databases.
const SHARED_SUPABASE_URL = 'https://aepbqfrmheihfsauzcby.supabase.co';
const SHARED_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_f331BL1gsNy-otXRmQPtrw_SG8tCWLn';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || SHARED_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  SHARED_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const SHARED_BACKEND = {
  supabaseUrl,
  cloudflareRelayUrl: import.meta.env.VITE_CLOUDFLARE_RELAY_URL || '',
};
