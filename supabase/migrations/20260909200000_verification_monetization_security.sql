-- Production-applied verification monetization/security migration.
-- Keeps repository migration history aligned with the Supabase production schema.

alter table public.verification_requests
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_amount numeric(12,2) not null default 0,
  add column if not exists admin_notes text,
  add column if not exists processed_at timestamptz;

create or replace function public.submit_verification_request(p_tier text, p_admin_notes text default null)
returns public.verification_requests
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_price numeric(12,2); v_row public.verification_requests;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_tier not in ('blue','gold','business') then raise exception 'Invalid verification tier'; end if;
  v_price := case p_tier when 'blue' then 5 when 'gold' then 15 when 'business' then 25 end;
  if exists (select 1 from public.verification_requests r where r.user_id=v_user and r.status='pending') then raise exception 'A verification request is already under review'; end if;
  insert into public.verification_requests(user_id,tier,status,payment_status,payment_amount,admin_notes)
  values(v_user,p_tier,'pending','pending',v_price,p_admin_notes) returning * into v_row;
  return v_row;
end; $$;

create or replace function public.process_verification_request(p_request_id uuid,p_approve boolean,p_admin_notes text default null)
returns public.verification_requests
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := (select auth.uid()); v_row public.verification_requests; v_status text;
begin
  if v_admin is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.platform_admins a where a.user_id=v_admin) then raise exception 'Admin access required'; end if;
  v_status := case when p_approve then 'approved' else 'rejected' end;
  update public.verification_requests set status=v_status,admin_notes=coalesce(p_admin_notes,admin_notes),reviewed_at=now(),processed_at=now()
  where id=p_request_id and status='pending' returning * into v_row;
  if v_row.id is null then raise exception 'Verification request not found or already processed'; end if;
  if p_approve then
    update public.user_profiles set verified=true,verified_tier=v_row.tier,updated_at=now() where id=v_row.user_id;
    insert into public.notifications(user_id,type,from_user_id) values(v_row.user_id,'verified',v_admin);
  end if;
  return v_row;
end; $$;

revoke all on function public.submit_verification_request(text,text) from public,anon;
grant execute on function public.submit_verification_request(text,text) to authenticated;
revoke all on function public.process_verification_request(uuid,boolean,text) from public,anon;
grant execute on function public.process_verification_request(uuid,boolean,text) to authenticated;

create policy verification_documents_admin_read on storage.objects
for select to authenticated
using (bucket_id='user-media' and (storage.foldername(name))[2]='verifications' and exists (select 1 from public.platform_admins a where a.user_id=(select auth.uid())));
