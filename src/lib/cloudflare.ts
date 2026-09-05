import { supabase, SHARED_BACKEND } from '@/lib/supabase';

/**
 * Shared Cloudflare media edge used by the native Testagram/TV platform.
 *
 * The relay is intentionally separate from the Supabase social API:
 * - Supabase owns identity, profiles, posts, follows, notifications, etc.
 * - Cloudflare owns the high-throughput live-media relay/cache path.
 *
 * No relay signing/device secret is ever exposed to this browser client.
 */
export const cloudflareRelayUrl = SHARED_BACKEND.cloudflareRelayUrl;

export function isCloudflareRelayConfigured(): boolean {
  return Boolean(cloudflareRelayUrl);
}

export async function cloudflareHealth(): Promise<any> {
  if (!cloudflareRelayUrl) {
    throw new Error('Cloudflare relay URL is not configured');
  }
  const base = cloudflareRelayUrl.replace(/\/+$/, '').replace(/\/v1\/relay$/, '');
  const response = await fetch(`${base}/health`, { method: 'GET' });
  if (!response.ok) throw new Error(`Cloudflare relay health failed: ${response.status}`);
  return response.json();
}

/**
 * Build the viewer URL for an already-issued short-lived relay ticket.
 * Ticket minting remains a trusted server-side operation and is never done
 * from this browser module.
 */
export function buildRelayUrl(streamId: string, viewerTicket: string, hlsPath: string): string {
  if (!cloudflareRelayUrl) throw new Error('Cloudflare relay URL is not configured');
  const url = new URL(cloudflareRelayUrl);
  url.searchParams.set('id', streamId);
  url.searchParams.set('ticket', viewerTicket);
  url.searchParams.set('path', hlsPath.startsWith('/') ? hlsPath : `/${hlsPath}`);
  return url.toString();
}

export async function currentAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
