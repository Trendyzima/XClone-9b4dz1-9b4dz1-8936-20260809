-- Phase 1 authorization hardening.
-- Client applications must use authenticated Edge Functions for money movement.

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((auth.jwt()->'app_metadata'->>'role') in ('admin','super_admin'),false);
$$;

create or replace function public.assert_authenticated_user(p_user_id uuid)
returns void language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if auth.uid() <> p_user_id and not public.is_admin() then raise exception 'user boundary violation'; end if;
end $$;

-- Financial primitives are callable by trusted Edge Functions only.
revoke all on function public.reserve_wallet_funds(uuid,numeric,text,text) from public, anon, authenticated;
revoke all on function public.release_wallet_reservation(uuid,numeric,text) from public, anon, authenticated;
revoke all on function public.finalize_wallet_withdrawal(uuid,numeric,text,text,text) from public, anon, authenticated;
revoke all on function public.credit_wallet_deposit(uuid,numeric,text,text,text,text,numeric,jsonb) from public, anon, authenticated;
revoke all on function public.post_creator_earning(uuid,numeric,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.post_ad_distribution(uuid,date,date,bigint,bigint,numeric,numeric,text) from public, anon, authenticated;
revoke all on function public.issue_wallet_refund(uuid,uuid,numeric,text,text,text) from public, anon, authenticated;
revoke all on function public.consume_rate_limit(text,integer,integer) from public, anon, authenticated;
revoke all on function public.wallet_available_balance(uuid) from public, anon, authenticated;

grant execute on function public.reserve_wallet_funds(uuid,numeric,text,text) to service_role;
grant execute on function public.release_wallet_reservation(uuid,numeric,text) to service_role;
grant execute on function public.finalize_wallet_withdrawal(uuid,numeric,text,text,text) to service_role;
grant execute on function public.credit_wallet_deposit(uuid,numeric,text,text,text,text,numeric,jsonb) to service_role;
grant execute on function public.post_creator_earning(uuid,numeric,text,text,text,jsonb) to service_role;
grant execute on function public.post_ad_distribution(uuid,date,date,bigint,bigint,numeric,numeric,text) to service_role;
grant execute on function public.issue_wallet_refund(uuid,uuid,numeric,text,text,text) to service_role;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;
grant execute on function public.wallet_available_balance(uuid) to authenticated,service_role;

alter table public.platform_exchange_rates enable row level security;
alter table public.platform_fee_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.payment_reconciliation_events enable row level security;

drop policy if exists exchange_rates_read on public.platform_exchange_rates;
create policy exchange_rates_read on public.platform_exchange_rates for select to authenticated using (true);
drop policy if exists fee_settings_read on public.platform_fee_settings;
create policy fee_settings_read on public.platform_fee_settings for select to authenticated using (true);
drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());
drop policy if exists reconciliation_admin_read on public.payment_reconciliation_events;
create policy reconciliation_admin_read on public.payment_reconciliation_events for select to authenticated using (public.is_admin());

-- No client write policies exist for financial configuration, audit logs,
-- reconciliation events, rate-limit state, or payment idempotency state.
