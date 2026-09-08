begin;

-- Production repair for the observed PostgREST PGRST204 on
-- public.communities.created_by. This migration is intentionally idempotent:
-- it repairs an incomplete/drifted production schema without dropping data.
alter table if exists public.communities
  add column if not exists created_by uuid;

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

create index if not exists idx_communities_created_by
  on public.communities(created_by);

alter table public.communities enable row level security;

drop policy if exists communities_create_own on public.communities;
create policy communities_create_own on public.communities
  for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists communities_manage_own on public.communities;
create policy communities_manage_own on public.communities
  for update to authenticated
  using (created_by = (select auth.uid()) or public.can_manage_community(id))
  with check (created_by = (select auth.uid()) or public.can_manage_community(id));

grant select on public.communities to anon, authenticated;
grant insert, update, delete on public.communities to authenticated;

-- PostgREST caches database metadata. Explicitly invalidate that cache after
-- repairing the column so the Data API sees created_by immediately.
notify pgrst, 'reload schema';

commit;
