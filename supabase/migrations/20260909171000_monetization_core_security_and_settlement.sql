-- Harden the monetization core: financial credits are server-side only and payout
-- lifetime totals move only when the provider confirms the payout.

revoke execute on function public.record_creator_earning(uuid,text,bigint,text,text,text,text,text,text,jsonb,integer) from authenticated;
grant execute on function public.record_creator_earning(uuid,text,bigint,text,text,text,text,text,text,jsonb,integer) to service_role;

create or replace function public.complete_monetization_payout(
  p_payout_id uuid,
  p_provider_payout_id text
)
returns public.monetization_payouts
language plpgsql security definer set search_path = public
as $$
declare
  payout public.monetization_payouts;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select * into payout from public.monetization_payouts where id = p_payout_id for update;
  if not found then raise exception 'payout not found'; end if;
  if payout.status = 'paid' then return payout; end if;
  if payout.status not in ('requested','processing') then raise exception 'payout is not payable'; end if;

  update public.monetization_payouts
    set status = 'paid', provider_payout_id = p_provider_payout_id, processed_at = now(), failure_reason = null
    where id = p_payout_id
    returning * into payout;

  update public.monetization_accounts
    set lifetime_paid_cents = lifetime_paid_cents + payout.amount_cents,
        updated_at = now()
    where user_id = payout.user_id;
  return payout;
end;
$$;
revoke all on function public.complete_monetization_payout(uuid,text) from public;
grant execute on function public.complete_monetization_payout(uuid,text) to service_role;

create or replace function public.fail_monetization_payout(
  p_payout_id uuid,
  p_failure_reason text default 'Provider payout failed'
)
returns public.monetization_payouts
language plpgsql security definer set search_path = public
as $$
declare
  payout public.monetization_payouts;
  a public.monetization_accounts;
  reversed boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select * into payout from public.monetization_payouts where id = p_payout_id for update;
  if not found then raise exception 'payout not found'; end if;
  if payout.status = 'failed' then return payout; end if;
  if payout.status not in ('requested','processing') then raise exception 'payout cannot be failed'; end if;

  update public.monetization_payouts
    set status = 'failed', failure_reason = left(coalesce(p_failure_reason, 'Provider payout failed'), 500), processed_at = now()
    where id = p_payout_id
    returning * into payout;

  select * into a from public.monetization_accounts where user_id = payout.user_id for update;
  if not found then raise exception 'monetization account not found'; end if;

  select exists(
    select 1 from public.monetization_ledger
    where source_type='payout' and source_id=p_payout_id::text and entry_type='adjustment'
      and direction='credit' and state <> 'voided'
  ) into reversed;

  if not reversed then
    insert into public.monetization_ledger(
      account_user_id, entry_type, direction, amount_cents, currency, state,
      source_type, source_id, description, metadata, reverses_entry_id, settled_at
    )
    select payout.user_id, 'adjustment', 'credit', payout.amount_cents, payout.currency, 'available',
      'payout', payout.id::text, 'Payout reversal after provider failure',
      jsonb_build_object('reason', payout.failure_reason), l.id, now()
    from public.monetization_ledger l
    where l.source_type='payout' and l.source_id=payout.id::text and l.entry_type='payout'
    order by l.created_at desc limit 1;

    update public.monetization_accounts
      set available_cents = available_cents + payout.amount_cents,
          updated_at = now()
      where user_id = payout.user_id;
  end if;
  return payout;
end;
$$;
revoke all on function public.fail_monetization_payout(uuid,text) from public;
grant execute on function public.fail_monetization_payout(uuid,text) to service_role;

create or replace function public.reverse_monetization_earning(
  p_entry_id uuid,
  p_reason text default 'Refund or chargeback'
)
returns public.monetization_ledger
language plpgsql security definer set search_path = public
as $$
declare
  original public.monetization_ledger;
  reversal public.monetization_ledger;
  a public.monetization_accounts;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select * into original from public.monetization_ledger where id = p_entry_id for update;
  if not found then raise exception 'earning not found'; end if;
  if original.direction <> 'credit' then raise exception 'only credit entries can be reversed'; end if;
  if original.state in ('reversed','voided') then return original; end if;

  if original.reverses_entry_id is not null then raise exception 'invalid original entry'; end if;
  if exists(select 1 from public.monetization_ledger where reverses_entry_id=p_entry_id) then
    select * into reversal from public.monetization_ledger where reverses_entry_id=p_entry_id order by created_at desc limit 1;
    return reversal;
  end if;

  insert into public.monetization_ledger(
    account_user_id, counterparty_user_id, entry_type, direction, amount_cents, currency,
    state, gross_cents, platform_fee_cents, creator_share_bps, provider, provider_event_id,
    provider_reference, source_type, source_id, description, metadata, reverses_entry_id, settled_at
  ) values (
    original.account_user_id, original.counterparty_user_id,
    case when p_reason ilike '%chargeback%' then 'chargeback' else 'refund' end,
    'debit', original.amount_cents, original.currency, 'settled',
    original.gross_cents, original.platform_fee_cents, original.creator_share_bps,
    original.provider, original.provider_event_id, original.provider_reference,
    original.source_type, original.source_id, left(coalesce(p_reason,'Refund or chargeback'),500),
    original.metadata, original.id, now()
  ) returning * into reversal;

  select * into a from public.monetization_accounts where user_id=original.account_user_id for update;
  if original.state='pending' then
    update public.monetization_accounts set pending_cents=greatest(pending_cents-original.amount_cents,0), lifetime_earned_cents=greatest(lifetime_earned_cents-original.amount_cents,0), updated_at=now() where user_id=original.account_user_id;
  elsif original.state='available' then
    if a.available_cents < original.amount_cents then raise exception 'insufficient balance for reversal'; end if;
    update public.monetization_accounts set available_cents=available_cents-original.amount_cents, lifetime_earned_cents=greatest(lifetime_earned_cents-original.amount_cents,0), updated_at=now() where user_id=original.account_user_id;
  end if;
  update public.monetization_ledger set state='reversed', settled_at=now() where id=p_entry_id;
  return reversal;
end;
$$;
revoke all on function public.reverse_monetization_earning(uuid,text) from public;
grant execute on function public.reverse_monetization_earning(uuid,text) to service_role;

-- Supabase views are exposed through PostgREST; use invoker security so the
-- caller's RLS remains effective rather than turning the summary into a data leak.
alter view public.creator_monetization_summary set (security_invoker = true);
