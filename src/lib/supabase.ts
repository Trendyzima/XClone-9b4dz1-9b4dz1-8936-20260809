import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Testagram backend is not configured: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const cloudflareApiUrl = (import.meta.env.VITE_CLOUDFLARE_API_URL || '/api').replace(/\/$/, '');

export async function cloudflareHealth() {
  const response = await fetch(`${cloudflareApiUrl}/health`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Cloudflare backend health check failed (${response.status})`);
  return response.json();
}
