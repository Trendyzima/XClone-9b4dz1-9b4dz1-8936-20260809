begin;

-- Production repair for the observed PostgREST PGRST204 on
-- public.communities.created_by. This migration is intentionally idempotent
-- and preserves existing community data.
alter table if exists public.communities
  add column if not exists created_by uuid;

-- The historical schema called the owner column owner_id. Keep both names
-- compatible and backfill the canonical created_by field.
alter table if exists public.communities
  add column if not exists owner_id uuid;

update public.communities
set created_by = owner_id
where created_by is null and owner_id is not null;

update public.communities
set owner_id = created_by
where owner_id is null and created_by is not null;

-- Historical community_members rows did not always have a status column.
-- Normalize it before any authorization helper references it.
alter table if exists public.community_members
  add column if not exists status text not null default 'active';

update public.community_members
set status = 'active'
where status is null or status = '';

do $$
begin
  if exists (select 1 from pg_class where oid = 'public.communities'::regclass)
     and exists (select 1 from pg_class where oid = 'public.profiles'::regclass)
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.communities'::regclass
         and conname = 'communities_created_by_profiles_fkey'
     ) then
    alter table public.communities
      add constraint communities_created_by_profiles_fkey
      foreign key (created_by) references public.profiles(id) on delete cascade;
  end if;
exception when duplicate_object then null;
end $$;

create or replace function public.can_manage_community(
  p_community_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.communities c
    where c.id = p_community_id
      and (c.created_by = p_user_id or c.owner_id = p_user_id)
  ) or exists (
    select 1 from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = p_user_id
      and cm.role in ('owner','moderator','admin')
      and cm.status = 'active'
  );
$$;

revoke all on function public.can_manage_community(uuid, uuid) from public;
grant execute on function public.can_manage_community(uuid, uuid) to authenticated;

create index if not exists idx_communities_created_by
  on public.communities(created_by);

alter table public.communities enable row level security;

drop policy if exists communities_create_own on public.communities;
create policy communities_create_own on public.communities
  for insert to authenticated
  with check (created_by = (select auth.uid()) or owner_id = (select auth.uid()));

drop policy if exists communities_manage_own on public.communities;
create policy communities_manage_own on public.communities
  for update to authenticated
  using (public.can_manage_community(id))
  with check (public.can_manage_community(id));

grant select on public.communities to anon, authenticated;
grant insert, update, delete on public.communities to authenticated;

notify pgrst, 'reload schema';

commit;
