/**
 * Canonical identity helpers shared by every Testagram Fediverse surface.
 * Never use an internal database UUID ahead of the ActivityPub object URI.
 */

export function firstHttp(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
  }
  return '';
}

export function canonicalObjectUrl(value: any): string {
  const raw = value?.raw_object ?? value?.object ?? value?.activity ?? {};
  return firstHttp(
    value?.object_url,
    value?.canonical_url,
    value?.uri,
    value?.url,
    raw?.id,
    raw?.url,
    value?.object_id,
  );
}

export function canonicalObjectKey(value: any): string {
  const url = canonicalObjectUrl(value);
  if (url) return url;
  const stable = value?.federated_object_id ?? value?._canonical_federated_object_id ?? value?.id;
  return typeof stable === 'string' || typeof stable === 'number' ? String(stable).trim() : '';
}

export function normalizedRemoteActor(value: any): any {
  const candidates = [
    value?.remote_accounts,
    value?.remote_account,
    value?.actor,
    value?.account,
    value?.author,
    value?.raw_object?.attributedTo,
    value,
  ].filter(Boolean);
  return Object.assign({}, ...candidates.reverse(), ...candidates);
}

export function actorUrl(value: any): string {
  const actor = normalizedRemoteActor(value);
  return firstHttp(actor?.url, actor?.id, actor?.actor_url, value?.actor_url, value?.actor_uri);
}

export function actorHandle(value: any): string {
  const actor = normalizedRemoteActor(value);
  const username = String(
    actor?.preferredUsername ?? actor?.username ?? actor?.acct ?? value?.actor_username ?? value?.username ?? '',
  ).replace(/^@/, '').trim();
  if (username.includes('@')) return username;
  const url = actorUrl(value);
  if (!url) return username;
  try {
    return username ? `${username}@${new URL(url).hostname}` : new URL(url).hostname;
  } catch {
    return username;
  }
}

export function internalFediversePostPath(value: any): string {
  const key = canonicalObjectKey(value);
  return key ? `/fediverse/post?url=${encodeURIComponent(key)}` : '/fediverse';
}

export function internalFediverseProfilePath(value: any): string {
  const target = actorUrl(value) || actorHandle(value);
  return target ? `/fediverse/profile?actor=${encodeURIComponent(target)}` : '/fediverse';
}

export function isFederatedObject(value: any): boolean {
  return Boolean(
    value?._is_federated ||
    value?._canonical_federated_object_id ||
    value?.federated_object_id ||
    value?.object_type === 'Note' && (value?.actor_uri || value?.raw_object),
  );
}

export function dedupeFederatedObjects<T>(items: T[], keyOf: (item: T) => any = value => value): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = canonicalObjectKey(keyOf(item));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
