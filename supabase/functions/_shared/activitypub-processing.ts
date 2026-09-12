import { ACTIVITY_CONTEXTS, actorKeyMatches, federationFetch, federationJson } from './federation-security.ts';
import { persistRemoteActor } from './remote-materialization.ts';

const now = () => new Date().toISOString();
const text = (v: unknown) => typeof v === 'string' ? v : '';
const uri = (v: unknown) => typeof v === 'string' ? v : v && typeof v === 'object' ? text((v as Record<string, unknown>).id) : '';
const b64 = (x: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(x)));
const MAX_INBOUND_REPLY_DEPTH = 2;

async function localActorForObject(admin: any, objectUri: string) {
  const { data, error } = await admin.from('federated_actors').select('*').or(`uri.eq.${encodeURIComponent(objectUri)},actor_url.eq.${encodeURIComponent(objectUri)}`).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function remoteActor(admin: any, actorUri: string) {
  const a = await federationJson(actorUri);
  if (!actorKeyMatches(a, actorUri)) throw new Error('remote actor identity or public key is invalid');
  const actorRow = await persistRemoteActor(admin, a);
  await admin.from('federated_instances').upsert({ domain: new URL(actorUri).hostname.toLowerCase(), status: 'active', last_seen_at: now(), updated_at: now() }, { onConflict: 'domain' });
  await admin.from('federated_actors').update({ last_fetch_success_at: now(), refresh_failure_count: 0, next_refresh_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), federation_status: 'active' }).eq('id', actorRow.id);
  return a;
}

async function signAndSend(local: any, inbox: string, activity: any) {
  if (!local?.private_key_jwk) throw new Error('local actor has no private signing key');
  const body = JSON.stringify(activity), u = new URL(inbox), date = new Date().toUTCString();
  const digest = `SHA-256=${b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)))}`;
  const key = await crypto.subtle.importKey('jwk', local.private_key_jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signing = `(request-target): post ${u.pathname}${u.search}\nhost: ${u.host}\ndate: ${date}\ndigest: ${digest}`;
  const sig = b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signing)));
  return federationFetch(inbox, { method: 'POST', body, headers: { Date: date, Digest: digest, Host: u.host, Accept: 'application/activity+json, application/ld+json', 'Content-Type': 'application/activity+json', Signature: `keyId=\"${local.uri || local.actor_url}#main-key\",algorithm=\"rsa-sha256\",headers=\"(request-target) host date digest\",signature=\"${sig}\"`, 'User-Agent': 'Testagram-Federation/5.1' } });
}

async function recordDelivery(admin: any, local: any, activity: any, inbox: string, response: Response | null, error?: string) {
  const { data, error: insertError } = await admin.from('federated_activities').insert({ uri: activity.id, activity_type: activity.type, actor_uri: local.uri || local.actor_url, object_uri: uri(activity.object) || null, target_uri: uri(activity.target) || null, raw_activity: activity, received_at: now(), processed_at: now(), processing_state: 'processed', processing_attempts: 0 }).select('id').single();
  if (insertError && insertError.code !== '23505') throw insertError;
  if (!data?.id) return;
  await admin.from('federation_deliveries').upsert({ activity_id: data.id, target_inbox: inbox, instance_domain: new URL(inbox).hostname, status: response?.ok ? 'delivered' : 'retry', attempt_count: 1, next_attempt_at: new Date(Date.now() + 60000).toISOString(), last_attempt_at: now(), last_status_code: response?.status || null, last_error: error || null, delivered_at: response?.ok ? now() : null, activity_payload: activity }, { onConflict: 'activity_id,target_inbox' });
}

async function acceptOrReject(admin: any, local: any, remoteActorUri: string, followActivity: any, accept: boolean) {
  const remote = await remoteActor(admin, remoteActorUri);
  const inbox = remote.endpoints?.sharedInbox || remote.inbox;
  if (typeof inbox !== 'string') throw new Error('remote actor has no inbox');
  const activity = { '@context': ACTIVITY_CONTEXTS, id: `${local.uri || local.actor_url}/activities/${crypto.randomUUID()}`, type: accept ? 'Accept' : 'Reject', actor: local.uri || local.actor_url, object: followActivity };
  try {
    const r = await signAndSend(local, inbox, activity);
    if (!r.ok) throw new Error(`remote inbox returned HTTP ${r.status}`);
    await recordDelivery(admin, local, activity, inbox, r);
  } catch (e) {
    await recordDelivery(admin, local, activity, inbox, null, e instanceof Error ? e.message : String(e));
  }
}

async function persistInboundObject(admin: any, actorUri: string, object: any, instanceId: string | null) {
  const id = uri(object?.id);
  if (!id || !/^https:\/\//i.test(id)) throw new Error('remote object must have an HTTPS id');
  const attributed = uri(object?.attributedTo) || actorUri;
  if (attributed !== actorUri) throw new Error('signed actor does not own the object');
  const type = text(object?.type) || 'Object';
  if (!['Note', 'Article', 'Question', 'Video', 'Image'].includes(type)) return false;
  const { data: existing, error: existingError } = await admin.from('federated_objects').select('actor_uri').eq('uri', id).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.actor_uri && existing.actor_uri !== actorUri) throw new Error('object ownership mismatch');
  const { error } = await admin.from('federated_objects').upsert({ uri: id, object_type: type, actor_uri: actorUri, instance_id: instanceId, url: text(object?.url) || id, content: text(object?.content) || text(object?.name) || null, summary: text(object?.summary) || null, published_at: object?.published ? new Date(object.published).toISOString() : null, updated_at: object?.updated ? new Date(object.updated).toISOString() : now(), sensitive: Boolean(object?.sensitive), in_reply_to_uri: uri(object?.inReplyTo) || null, quote_uri: uri(object?.quote) || null, attachments: Array.isArray(object?.attachment) ? object.attachment : [], tags: Array.isArray(object?.tag) ? object.tag : [], raw_object: object, tombstone: false, deleted_at: null }, { onConflict: 'uri' });
  if (error) throw error;
  return true;
}

async function materializeReplyAncestors(admin: any, actorUri: string, parentUri: string, instanceId: string | null, depth: number): Promise<void> {
  if (!parentUri || depth > MAX_INBOUND_REPLY_DEPTH || !/^https:\/\//i.test(parentUri)) return;
  const { data: existing, error } = await admin.from('federated_objects').select('uri,in_reply_to_uri').eq('uri', parentUri).maybeSingle();
  if (error) throw error;
  if (existing?.uri) { if (existing.in_reply_to_uri) await materializeReplyAncestors(admin, actorUri, existing.in_reply_to_uri, instanceId, depth + 1); return; }
  const parent = await federationJson(parentUri);
  const parentActor = uri(parent?.attributedTo);
  if (parentActor && parentActor !== actorUri) throw new Error('reply ancestor actor mismatch');
  if (!await persistInboundObject(admin, actorUri, parent, instanceId)) return;
  const next = uri(parent?.inReplyTo);
  if (next) await materializeReplyAncestors(admin, actorUri, next, instanceId, depth + 1);
}

async function adjustObjectCount(admin: any, objectUri: string, column: string, delta: number) {
  const { data: row, error } = await admin.from('federated_objects').select(`id,${column}`).eq('uri', objectUri).maybeSingle();
  if (error) throw error;
  if (!row?.id) return;
  const next = Math.max(0, Number(row[column] || 0) + delta);
  const { error: updateError } = await admin.from('federated_objects').update({ [column]: next, updated_at: now() }).eq('id', row.id);
  if (updateError) throw updateError;
}

export async function processActivity(admin: any, a: any, actorUri: string) {
  const type = text(a.type), o = a.object, objectUri = uri(o), targetUri = uri(a.target);
  if (!a.id || !actorUri) throw new Error('activity id and actor are required');

  if (type === 'Follow') {
    if (!targetUri) throw new Error('Follow target is required');
    const local = await localActorForObject(admin, targetUri);
    if (!local) throw new Error('Follow target is not a local actor');
    const blocked = await admin.from('federated_relationships').select('id').eq('local_user_id', local.user_id).eq('remote_actor_uri', actorUri).eq('relationship', 'blocked').in('state', ['active', 'accepted']).maybeSingle();
    const accept = !blocked.data;
    const { error } = await admin.from('federated_relationships').upsert({ local_user_id: local.user_id, remote_actor_uri: actorUri, relationship: 'follower', state: accept ? 'active' : 'rejected', updated_at: now() }, { onConflict: 'local_user_id,remote_actor_uri,relationship' });
    if (error) throw error;
    await acceptOrReject(admin, local, actorUri, a, accept);
    return;
  }

  if (type === 'Accept' || type === 'Reject') {
    const followed = uri(o);
    if (!followed) throw new Error('Accept/Reject missing original Follow');
    const { data: original, error } = await admin.from('federated_activities').select('raw_activity,activity_type,actor_uri').eq('uri', followed).maybeSingle();
    if (error) throw error;
    if (!original || original.activity_type !== 'Follow') throw new Error('Accept/Reject does not reference a stored Follow');
    const followTarget = uri((original.raw_activity as any).object);
    const local = await localActorForObject(admin, followTarget);
    if (!local || original.actor_uri !== (local.uri || local.actor_url)) throw new Error('original Follow actor is not local');
    if (actorUri === local.uri || actorUri === local.actor_url) throw new Error('local actor cannot Accept/Reject its own Follow');
    const { error: relError } = await admin.from('federated_relationships').upsert({ local_user_id: local.user_id, remote_actor_uri: actorUri, relationship: 'following', state: type === 'Accept' ? 'active' : 'rejected', updated_at: now() }, { onConflict: 'local_user_id,remote_actor_uri,relationship' });
    if (relError) throw relError;
    return;
  }

  if (type === 'Create' || type === 'Update') {
    const obj = typeof o === 'object' && o ? o : null;
    if (!obj || !uri(obj.id)) throw new Error('Create/Update object is invalid');
    const attributed = uri(obj.attributedTo) || actorUri;
    if (attributed !== actorUri) throw new Error('signed actor does not own the object');
    const remoteActorDocument = await remoteActor(admin, actorUri);
    const actorRow = await persistRemoteActor(admin, remoteActorDocument);
    const saved = await persistInboundObject(admin, actorUri, obj, actorRow.instance_id);
    if (saved) { const parent = uri(obj.inReplyTo); if (parent) await materializeReplyAncestors(admin, actorUri, parent, actorRow.instance_id, 1); }
    return;
  }

  if (type === 'Like' || type === 'Announce') {
    if (!objectUri || !/^https:\/\//i.test(objectUri)) throw new Error('interaction target must be HTTPS');
    const { data: existing } = await admin.from('federated_interactions').select('activity_uri,active').eq('activity_uri', a.id).maybeSingle();
    if (existing) return;
    const { error } = await admin.from('federated_interactions').insert({ activity_uri: a.id, activity_type: type, actor_uri: actorUri, object_uri: objectUri, active: true, raw_activity: a, updated_at: now() });
    if (error) throw error;
    await adjustObjectCount(admin, objectUri, type === 'Like' ? 'like_count' : 'announce_count', 1);
    return;
  }

  if (type === 'Undo') {
    if (!objectUri) throw new Error('Undo missing referenced activity');
    const { data: original, error } = await admin.from('federated_activities').select('activity_type,actor_uri,raw_activity').eq('uri', objectUri).maybeSingle();
    if (error) throw error;
    if (!original) throw new Error('Undo references an unknown activity');
    if (original.actor_uri !== actorUri) throw new Error('Undo actor does not own referenced activity');
    if (original.activity_type === 'Follow') {
      const target = uri((original.raw_activity as any).object), local = await localActorForObject(admin, target);
      if (!local) throw new Error('Follow target is not local');
      const { error: relError } = await admin.from('federated_relationships').update({ state: 'removed', updated_at: now() }).eq('local_user_id', local.user_id).eq('remote_actor_uri', actorUri).eq('relationship', 'follower');
      if (relError) throw relError;
    } else if (original.activity_type === 'Like' || original.activity_type === 'Announce') {
      const { data: prior } = await admin.from('federated_interactions').select('object_uri,active,activity_type').eq('activity_uri', objectUri).maybeSingle();
      if (prior?.active) await adjustObjectCount(admin, prior.object_uri, original.activity_type === 'Like' ? 'like_count' : 'announce_count', -1);
      const { error: interactionError } = await admin.from('federated_interactions').update({ active: false, updated_at: now() }).eq('activity_uri', objectUri);
      if (interactionError) throw interactionError;
    } else throw new Error('Undo type is unsupported');
    return;
  }

  if (type === 'Delete') {
    if (!objectUri) throw new Error('Delete missing object');
    const { data: existing, error } = await admin.from('federated_objects').select('actor_uri').eq('uri', objectUri).maybeSingle();
    if (error) throw error;
    if (!existing) return;
    if (existing.actor_uri !== actorUri) throw new Error('signed actor does not own deleted object');
    const { error: deleteError } = await admin.from('federated_objects').update({ tombstone: true, deleted_at: now(), raw_object: { id: objectUri, type: 'Tombstone', formerType: 'Note' }, updated_at: now() }).eq('uri', objectUri);
    if (deleteError) throw deleteError;
    return;
  }

  throw new Error(`unsupported ActivityPub type: ${type}`);
}
