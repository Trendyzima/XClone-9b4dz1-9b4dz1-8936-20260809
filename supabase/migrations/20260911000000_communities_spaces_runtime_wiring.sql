begin;

-- Runtime contract repair for Communities + Audio Spaces.
-- The production schema contains legacy columns used by older clients while
-- the current UI uses the newer canonical names. Keep both contracts safe and
-- make membership/lifecycle transitions server-authoritative.

alter table public.spaces
  add column if not exists is_recording boolean not null default false;
alter table public.spaces
  add column if not exists started_at timestamptz;

alter table public.space_recordings
  add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.space_recordings
  add column if not exists duration integer;

create or replace function public.normalize_space_recording_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
begin
  select s.host_id into v_host from public.spaces s where s.id = new.space_id;
  if v_host is null then raise exception 'Space not found'; end if;
  if auth.uid() is null or auth.uid() <> v_host then
    raise exception 'Only the Space host can save a recording';
  end if;
  new.host_id := v_host;
  if new.user_id is null then new.user_id := v_host; end if;
  if new.duration_seconds is null and new.duration is not null then
    new.duration_seconds := greatest(new.duration, 0);
  end if;
  if new.duration is null and new.duration_seconds is not null then
    new.duration := greatest(new.duration_seconds, 0);
  end if;
  return new;
end;
$$;
revoke all on function public.normalize_space_recording_row() from public;
drop trigger if exists trg_normalize_space_recording_row on public.space_recordings;
create trigger trg_normalize_space_recording_row
before insert or update on public.space_recordings
for each row execute function public.normalize_space_recording_row();

create or replace function public.normalize_space_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_live and new.started_at is null then new.started_at := now(); end if;
  elsif tg_op = 'UPDATE' then
    if new.is_live and not old.is_live and new.started_at is null then new.started_at := now(); end if;
    if not new.is_live and old.is_live and new.ended_at is null then new.ended_at := now(); end if;
    if new.is_archived and new.archived_at is null then new.archived_at := now(); end if;
  end if;
  return new;
end;
$$;
revoke all on function public.normalize_space_lifecycle() from public;
drop trigger if exists trg_normalize_space_lifecycle on public.spaces;
create trigger trg_normalize_space_lifecycle
before insert or update on public.spaces
for each row execute function public.normalize_space_lifecycle();

create or replace function public.create_community(
  p_name text,
  p_display_name text,
  p_description text default '',
  p_is_private boolean default false,
  p_rules jsonb default '[]'::jsonb,
  p_icon_url text default null,
  p_banner_url text default null
)
returns public.communities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '', 'g'));
  v_slug text := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_community public.communities;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_name = '' or char_length(v_name) > 80 then raise exception 'Invalid community name'; end if;
  if trim(coalesce(p_display_name, '')) = '' or char_length(trim(p_display_name)) > 120 then raise exception 'Invalid display name'; end if;
  if exists (select 1 from public.communities c where c.name = v_name or c.slug = v_slug) then
    raise exception 'Community name is already taken';
  end if;
  insert into public.communities (
    owner_id, created_by, name, slug, display_name, description,
    is_private, icon_url, banner_url, rules
  ) values (
    v_user, v_user, v_name, v_slug, trim(p_display_name), coalesce(p_description, ''),
    coalesce(p_is_private, false), p_icon_url, p_banner_url, coalesce(p_rules, '[]'::jsonb)
  ) returning * into v_community;
  insert into public.community_members (community_id, user_id, role, status)
  values (v_community.id, v_user, 'owner', 'active');
  return v_community;
end;
$$;
revoke all on function public.create_community(text,text,text,boolean,jsonb,text,text) from public;
grant execute on function public.create_community(text,text,text,boolean,jsonb,text,text) to authenticated;

create or replace function public.join_community(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_private boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select c.is_private into v_private from public.communities c where c.id = p_community_id;
  if not found then raise exception 'Community not found'; end if;
  insert into public.community_members(community_id,user_id,role,status)
  values(p_community_id,v_user,'member',case when v_private then 'pending' else 'active' end)
  on conflict (community_id,user_id) do update
    set status = case when v_private then 'pending' else 'active' end;
end;
$$;
revoke all on function public.join_community(uuid) from public;
grant execute on function public.join_community(uuid) to authenticated;

create or replace function public.leave_community(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  delete from public.community_members
  where community_id = p_community_id and user_id = v_user and role <> 'owner';
end;
$$;
revoke all on function public.leave_community(uuid) from public;
grant execute on function public.leave_community(uuid) to authenticated;

create or replace function public.join_space(p_space_id uuid, p_role text default 'listener')
returns public.space_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_part public.space_participants;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_role not in ('listener','speaker') then raise exception 'Invalid participant role'; end if;
  if not exists (
    select 1 from public.spaces s
    where s.id = p_space_id and s.is_live = true and s.is_archived = false
  ) then raise exception 'Space is not live'; end if;
  insert into public.space_participants(space_id,user_id,role,is_muted)
  values(p_space_id,v_user,p_role,p_role <> 'speaker')
  on conflict(space_id,user_id) do update
    set left_at=null, role=excluded.role, is_muted=excluded.is_muted
  returning * into v_part;
  return v_part;
end;
$$;
revoke all on function public.join_space(uuid,text) from public;
grant execute on function public.join_space(uuid,text) to authenticated;

create or replace function public.leave_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  delete from public.space_participants where space_id=p_space_id and user_id=v_user;
end;
$$;
revoke all on function public.leave_space(uuid) from public;
grant execute on function public.leave_space(uuid) to authenticated;

drop policy if exists community_events_read on public.community_events;
create policy community_events_read on public.community_events
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.communities c
      where c.id = community_events.community_id
        and (not c.is_private or public.is_community_member(c.id) or c.created_by = (select auth.uid()))
    )
  );

commit;
