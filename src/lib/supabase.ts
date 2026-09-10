import { createClient } from '@supabase/supabase-js';

const PRODUCTION_SUPABASE_URL = 'https://aepbqfrmheihfsauzcby.supabase.co';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || PRODUCTION_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Testagram backend is not configured: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) are required.');
}

// Cloudflare Worker is the public media delivery layer. Upload authorization,
// R2 multipart signing and media_assets ownership remain in Supabase Edge Functions.
const DIRECT_CLOUDFLARE_API = 'https://testagram-api.nahashonnyaga794.workers.dev/api';
export const cloudflareApiUrl = (import.meta.env.VITE_CLOUDFLARE_API_URL || DIRECT_CLOUDFLARE_API).replace(/\/$/, '');
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

const baseClient: any = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export async function cloudflareHealth() {
  const response = await fetch(`${cloudflareApiUrl}/health`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Cloudflare backend health check failed (${response.status})`);
  return response.json();
}

/** Browser -> Supabase media-upload Edge Function -> signed Cloudflare R2 parts -> Supabase metadata -> Cloudflare Worker. */
export async function uploadMedia(file: File, mediaType: 'image' | 'video' | 'audio' | 'document') {
  if (file.size <= 0) throw new Error('The selected media file is empty.');
  if (file.size > MAX_MEDIA_BYTES) throw new Error('Media exceeds the 20 MiB limit.');
  const { data: { session } } = await baseClient.auth.getSession();
  if (!session?.access_token) throw new Error('You must be signed in to upload media.');

  const functionUrl = `${supabaseUrl}/functions/v1/media-upload`;
  const authHeaders = { Authorization: `Bearer ${session.access_token}`, apikey: supabasePublishableKey, 'Content-Type': 'application/json' };
  const createResponse = await fetch(functionUrl, { method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'create', size: file.size, filename: file.name, contentType: file.type || 'application/octet-stream', mediaType }) });
  const createPayload = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) throw new Error(createPayload.error || `Media upload initialization failed (${createResponse.status})`);
  const { uploadId, key, partSize, partCount, assetId } = createPayload;
  if (!uploadId || !key || !partSize || !partCount || !assetId) throw new Error('Media upload initialization returned incomplete R2 metadata.');

  const completedParts: Array<{ PartNumber: number; ETag: string }> = [];
  try {
    for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(file.size, start + partSize);
      const signResponse = await fetch(functionUrl, { method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'sign-part', uploadId, key, partNumber }) });
      const signPayload = await signResponse.json().catch(() => ({}));
      if (!signResponse.ok || !signPayload.url) throw new Error(signPayload.error || `Could not sign R2 upload part ${partNumber}.`);
      const partResponse = await fetch(signPayload.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file.slice(start, end) });
      if (!partResponse.ok) throw new Error(`Cloudflare R2 rejected upload part ${partNumber} (${partResponse.status}).`);
      const etag = partResponse.headers.get('ETag');
      if (!etag) throw new Error(`Cloudflare R2 did not return an ETag for upload part ${partNumber}.`);
      completedParts.push({ PartNumber: partNumber, ETag: etag.replace(/^"|"$/g, '') });
    }

    const completeResponse = await fetch(functionUrl, { method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'complete', uploadId, key, parts: completedParts, size: file.size, filename: file.name, contentType: file.type || 'application/octet-stream', mediaType }) });
    const completePayload = await completeResponse.json().catch(() => ({}));
    if (!completeResponse.ok) throw new Error(completePayload.error || `Media upload finalization failed (${completeResponse.status})`);
    const finalAssetId = completePayload.assetId || assetId;
    return { id: finalAssetId, storage: 'cloudflare-r2' as const, storageKey: completePayload.key || key, url: `${cloudflareApiUrl}/media/${finalAssetId}`, byteSize: file.size, mediaType, mimeType: file.type || 'application/octet-stream' };
  } catch (error) {
    await fetch(functionUrl, { method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'abort', uploadId, key }) }).catch(() => undefined);
    throw error;
  }
}

const postMediaPublicUrls = new Map<string, string>();
function cloudflarePostsBucket() {
  const fallback = baseClient.storage.from('posts');
  return {
    ...fallback,
    upload: async (path: string, file: File) => {
      const mediaType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
      const asset = await uploadMedia(file, mediaType);
      postMediaPublicUrls.set(path, asset.url);
      return { data: { path: asset.id, id: asset.id, fullPath: asset.url }, error: null };
    },
    getPublicUrl: (path: string) => {
      const knownUrl = postMediaPublicUrls.get(path);
      if (knownUrl) return { data: { publicUrl: knownUrl } };
      if (/^[0-9a-f-]{36}$/i.test(path)) return { data: { publicUrl: `${cloudflareApiUrl}/media/${path}` } };
      return fallback.getPublicUrl(path);
    },
  };
}

// Keep the Supabase client compatible with existing feature code while routing only the post-media bucket through R2.
export const supabase: any = new Proxy(baseClient, {
  get(target, property, receiver) {
    if (property === 'storage') return { ...target.storage, from(bucket: string) { return bucket === 'posts' ? cloudflarePostsBucket() : target.storage.from(bucket); } };
    return Reflect.get(target, property, receiver);
  },
});
