# Shared Testagram backend

XClone is being unified with the native Testagram/TV social platform instead of maintaining a second social database.

## Runtime ownership

| Concern | Shared service |
| --- | --- |
| Authentication/session | Supabase Auth |
| Profiles/social graph | Supabase PostgreSQL |
| Posts/replies/likes/reposts/bookmarks | Supabase PostgreSQL |
| Notifications | Supabase PostgreSQL / Realtime |
| Social media objects | Supabase Storage where applicable |
| Live HLS relay/cache | Cloudflare Worker + Durable Objects + R2 |

The shared Supabase project is `aepbqfrmheihfsauzcby`.

The Cloudflare Worker is the `tv49eastz-relay` deployment from the native platform. Its public viewer endpoint is `/v1/relay`; its health endpoint is `/health`.

### Important security rule

Browser/Android clients may contain only the Supabase publishable/anonymous key and short-lived user/session tokens. Cloudflare relay signing secrets and device secrets stay server-side. Never add `RELAY_SIGNING_SECRET`, `RELAY_DEVICE_SECRET`, `EDGE_PUBLISH_SECRET`, or service-role keys to Vite variables or an APK.

## Environment

Set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_CLOUDFLARE_RELAY_URL`

`VITE_CLOUDFLARE_RELAY_URL` must be the deployed HTTPS relay base ending in `/v1/relay`. The actual Cloudflare public URL is intentionally not guessed in source; it must come from the successful Wrangler deployment/custom-domain configuration.

## Migration status

The client is now pointed at the same Supabase project used by the native platform. The remaining work is schema compatibility for XClone-only tables/features and wiring any live-stream ticket minting through the trusted control plane. Those operations must not be implemented with browser-held secrets.
