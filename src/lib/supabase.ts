// Safe supabase client — no import-time throws so Vite builds don't fail when env vars are missing.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Native fetch with retry (helps low/slow networks for images & videos)
const fetchWithRetry = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);
      if (response.ok || attempt === maxRetries) {
        return response;
      }
      // Exponential backoff: 1s → 2s → 4s
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastError || new Error('Network request failed after retries');
};

let supabaseClient: ReturnType<typeof createClient> | any = null;

if (supabaseUrl && supabaseAnonKey) {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      fetch: fetchWithRetry,
    },
  });
} else {
  // Don't throw here — export a proxy that throws only when used.
  // This keeps build/SSR systems happy while giving clear runtime errors when the client is actually used.
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Supabase client will throw when used.'
  );

  const missingMessage =
    'Supabase client not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.';

  supabaseClient = new Proxy(
    {},
    {
      get() {
        return () => {
          throw new Error(missingMessage);
        };
      },
      apply() {
        throw new Error(missingMessage);
      },
    }
  );
}

export const supabase = supabaseClient;
