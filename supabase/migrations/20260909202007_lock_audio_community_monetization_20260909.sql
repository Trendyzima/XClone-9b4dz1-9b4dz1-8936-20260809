-- Restore the original audio/community monetization schema boundary that is already
-- recorded in production migration history at version 20260909202007.
-- The IF NOT EXISTS guards keep this recovery migration safe for environments where
-- the schema objects were already materialized by the historical production run.

create table if not exists public.community_monetization (
  community_id uuid primary key references public.communities(id) on delete cascade,
  enabled boolean not null default false,
  membership_price_cents bigint not null default 0,
  currency text not null default 'USD',
  paid_content_enabled boolean not null default false,
  events_enabled boolean not null default false,
  gifts_enabled boolean not null default true,
  ads_enabled boolean not null default false,
  sponsorships_enabled boolean not null default false,
  creator_share_bps integer not null default 7000,
  updated_at timestamptz not null default now(),
  check (membership_price_cents >= 0),
  check (currency ~ '^[A-Z]{3}$'),
  check (creator_share_bps between 0 and 10000)
);

create table if not exists public.audio_space_monetization (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  enabled boolean not null default false,
  ticket_price_cents bigint not null default 0,
  recording_price_cents bigint not null default 0,
  currency text not null default 'USD',
  gifts_enabled boolean not null default true,
  ads_enabled boolean not null default false,
  sponsorships_enabled boolean not null default false,
  creator_share_bps integer not null default 7000,
  updated_at timestamptz not null default now(),
  check (ticket_price_cents >= 0),
  check (recording_price_cents >= 0),
  check (currency ~ '^[A-Z]{3}$'),
  check (creator_share_bps between 0 and 10000)
);

create table if not exists public.community_memberships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  amount_cents bigint not null,
  currency text not null default 'USD',
  provider text,
  provider_reference text,
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (community_id, user_id, status),
  check (status in ('active','cancelled','expired','refunded')),
  check (amount_cents > 0),
  check (currency ~ '^[A-Z]{3}$')
);

create table if not exists public.audio_space_access (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.audio_spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_type text not null,
  status text not null default 'active',
  amount_cents bigint not null,
  currency text not null default 'USD',
  provider text,
  provider_reference text,
  created_at timestamptz not null default now(),
  unique (space_id, user_id, access_type, status),
  check (access_type in ('ticket','recording')),
  check (status in ('active','refunded','expired')),
  check (amount_cents > 0),
  check (currency ~ '^[A-Z]{3}$')
);

create index if not exists community_memberships_community_idx
  on public.community_memberships (community_id, created_at desc);
create index if not exists community_memberships_user_idx
  on public.community_memberships (user_id, created_at desc);
create index if not exists audio_space_access_space_idx
  on public.audio_space_access (space_id, created_at desc);
create index if not exists audio_space_access_user_idx
  on public.audio_space_access (user_id, created_at desc);

alter table public.community_monetization enable row level security;
alter table public.audio_space_monetization enable row level security;
alter table public.community_memberships enable row level security;
alter table public.audio_space_access enable row level security;

drop policy if exists community_monetization_select on public.community_monetization;
create policy community_monetization_select
  on public.community_monetization for select
  using (true);

drop policy if exists audio_space_monetization_select on public.audio_space_monetization;
create policy audio_space_monetization_select
  on public.audio_space_monetization for select
  using (true);

drop policy if exists community_memberships_select_self_or_owner on public.community_memberships;
create policy community_memberships_select_self_or_owner
  on public.community_memberships for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.communities c
      where c.id = community_memberships.community_id
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists audio_space_access_select_self_or_host on public.audio_space_access;
create policy audio_space_access_select_self_or_host
  on public.audio_space_access for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.audio_spaces s
      where s.id = audio_space_access.space_id
        and s.host_id = auth.uid()
    )
  );

create or replace function public.set_community_monetization(
  p_community_id uuid,
  p_enabled boolean,
  p_membership_price_cents bigint default 0,
  p_paid_content_enabled boolean default false,
  p_events_enabled boolean default false,
  p_gifts_enabled boolean default true,
  p_ads_enabled boolean default false,
  p_sponsorships_enabled boolean default false
) returns public.community_monetization
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.community_monetization;
  v_owner uuid;
  v_followers bigint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select owner_id into v_owner from public.communities where id = p_community_id;
  if v_owner is null or v_owner <> auth.uid() then raise exception 'COMMUNITY_OWNER_REQUIRED'; end if;
  select public.creator_follower_count(v_owner) into v_followers;
  if p_enabled and v_followers < 400 then
    raise exception 'CREATOR_MONETIZATION_REQUIRES_400_FOLLOWERS: % followers found', v_followers;
  end if;
  if p_membership_price_cents < 0 then raise exception 'INVALID_MEMBERSHIP_PRICE'; end if;
  insert into public.community_monetization (
    community_id, enabled, membership_price_cents, paid_content_enabled,
    events_enabled, gifts_enabled, ads_enabled, sponsorships_enabled
  ) values (
    p_community_id, p_enabled, p_membership_price_cents, p_paid_content_enabled,
    p_events_enabled, p_gifts_enabled, p_ads_enabled, p_sponsorships_enabled
  )
  on conflict (community_id) do update set
    enabled = excluded.enabled,
    membership_price_cents = excluded.membership_price_cents,
    paid_content_enabled = excluded.paid_content_enabled,
    events_enabled = excluded.events_enabled,
    gifts_enabled = excluded.gifts_enabled,
    ads_enabled = excluded.ads_enabled,
    sponsorships_enabled = excluded.sponsorships_enabled,
    updated_at = now();
  select * into v from public.community_monetization where community_id = p_community_id;
  return v;
end;
$$;

create or replace function public.set_audio_space_monetization(
  p_space_id uuid,
  p_enabled boolean,
  p_ticket_price_cents bigint default 0,
  p_recording_price_cents bigint default 0,
  p_gifts_enabled boolean default true,
  p_ads_enabled boolean default false,
  p_sponsorships_enabled boolean default false
) returns public.audio_space_monetization
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.audio_space_monetization;
  v_host uuid;
  v_followers bigint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select host_id into v_host from public.audio_spaces where id = p_space_id;
  if v_host is null or v_host <> auth.uid() then raise exception 'SPACE_HOST_REQUIRED'; end if;
  select public.creator_follower_count(v_host) into v_followers;
  if p_enabled and v_followers < 400 then
    raise exception 'CREATOR_MONETIZATION_REQUIRES_400_FOLLOWERS: % followers found', v_followers;
  end if;
  if p_ticket_price_cents < 0 or p_recording_price_cents < 0 then raise exception 'INVALID_SPACE_PRICE'; end if;
  insert into public.audio_space_monetization (
    space_id, enabled, ticket_price_cents, recording_price_cents,
    gifts_enabled, ads_enabled, sponsorships_enabled
  ) values (
    p_space_id, p_enabled, p_ticket_price_cents, p_recording_price_cents,
    p_gifts_enabled, p_ads_enabled, p_sponsorships_enabled
  )
  on conflict (space_id) do update set
    enabled = excluded.enabled,
    ticket_price_cents = excluded.ticket_price_cents,
    recording_price_cents = excluded.recording_price_cents,
    gifts_enabled = excluded.gifts_enabled,
    ads_enabled = excluded.ads_enabled,
    sponsorships_enabled = excluded.sponsorships_enabled,
    updated_at = now();
  select * into v from public.audio_space_monetization where space_id = p_space_id;
  return v;
end;
$$;

revoke all on function public.set_community_monetization(uuid,boolean,bigint,boolean,boolean,boolean,boolean,boolean) from public;
revoke all on function public.set_audio_space_monetization(uuid,boolean,bigint,bigint,boolean,boolean,boolean) from public;
grant execute on function public.set_community_monetization(uuid,boolean,bigint,boolean,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.set_audio_space_monetization(uuid,boolean,bigint,bigint,boolean,boolean,boolean) to authenticated;
