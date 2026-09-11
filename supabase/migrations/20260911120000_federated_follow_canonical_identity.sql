-- Canonical Fediverse follow identity hardening.
create table if not exists public.federated_follow_relationships (
  id uuid primary key default gen_random_uuid(),
  local_user_id uuid not null references public.profiles(id) on delete cascade,
  remote_actor_uri text not null,
  state text not null default 'pending' check (state in ('pending','accepted','rejected','removed')),
  follow_activity_uri text,
  undo_activity_uri text,
  accept_activity_uri text,
  remote_inbox_uri text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint federated_follow_relationships_actor_https check (remote_actor_uri ~ '^https://[^[:space:]]+$'),
  constraint federated_follow_relationships_unique_actor unique (local_user_id, remote_actor_uri)
);
create index if not exists federated_follow_relationships_user_state_idx on public.federated_follow_relationships(local_user_id, state, updated_at desc);
create index if not exists federated_follow_relationships_actor_idx on public.federated_follow_relationships(remote_actor_uri);
alter table public.federated_follow_relationships enable row level security;
create policy federated_follow_relationships_owner_read on public.federated_follow_relationships for select to authenticated using (local_user_id = auth.uid());
-- Enforce one canonical relationship per local user and actor in the existing table.
delete from public.federated_relationships a using public.federated_relationships b where a.id > b.id and a.local_user_id = b.local_user_id and a.remote_actor_uri = b.remote_actor_uri;
create unique index if not exists federated_relationships_user_actor_uidx on public.federated_relationships(local_user_id, remote_actor_uri);
alter table public.federated_relationships add constraint federated_relationships_remote_actor_uri_check check (remote_actor_uri ~ '^https://[^[:space:]]+$');
