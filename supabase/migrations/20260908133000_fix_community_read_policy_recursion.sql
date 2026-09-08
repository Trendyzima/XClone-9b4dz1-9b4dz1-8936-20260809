create or replace function public.is_community_member(p_community_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = p_user_id
  );
$$;

revoke all on function public.is_community_member(uuid, uuid) from public;
grant execute on function public.is_community_member(uuid, uuid) to authenticated;

drop policy if exists communities_read on public.communities;
create policy communities_read
on public.communities
for select
to authenticated
using (
  not is_private
  or owner_id = auth.uid()
  or public.is_community_member(id, auth.uid())
);
