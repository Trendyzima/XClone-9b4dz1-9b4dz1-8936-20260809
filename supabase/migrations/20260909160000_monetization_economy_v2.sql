-- Testagram Monetization Economy v2
-- Financial foundation: immutable ledger, idempotent entries, creator earnings,
-- pending/available balances, payout lifecycle, and provider-agnostic references.

create extension if not exists pgcrypto;

create table if not exists public.monetization_ledger (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  counterparty_user_id uuid references auth.users(id) on delete set null,
  entry_type text not null check (entry_type in (
    'tip','subscription','paid_content','ad_revenue','sponsorship','product_sale',
    'live_gift','community_payment','referral','refund','fee','adjustment','payout'
  )),
  direction text not null check (direction in ('credit','debit')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  provider text,
  provider_reference text,
  status text not null default 'pending' check (status in ('pending','available','completed','reversed','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  available_at timestamptz
);

create index if not exists monetization_ledger_user_created_idx
  on public.monetization_ledger(user_id, created_at desc);
create index if not exists monetization_ledger_status_idx
  on public.monetization_ledger(status, available_at);

create table if not exists public.creator_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pending_cents bigint not null default 0 check (pending_cents >= 0),
  available_cents bigint not null default 0 check (available_cents >= 0),
  lifetime_earned_cents bigint not null default 0 check (lifetime_earned_cents >= 0),
  lifetime_paid_cents bigint not null default 0 check (lifetime_paid_cents >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  provider text not null,
  provider_reference text,
  status text not null default 'requested' check (status in ('requested','processing','paid','failed','cancelled')),
  failure_reason text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists creator_payouts_user_idx
  on public.creator_payouts(user_id, requested_at desc);

alter table public.monetization_ledger enable row level security;
alter table public.creator_balances enable row level security;
alter table public.creator_payouts enable row level security;

drop policy if exists "Users read own monetization ledger" on public.monetization_ledger;
create policy "Users read own monetization ledger"
  on public.monetization_ledger for select
  using (auth.uid() = user_id or auth.uid() = counterparty_user_id);

drop policy if exists "Users read own creator balance" on public.creator_balances;
create policy "Users read own creator balance"
  on public.creator_balances for select
  using (auth.uid() = user_id);

drop policy if exists "Users read own payouts" on public.creator_payouts;
create policy "Users read own payouts"
  on public.creator_payouts for select
  using (auth.uid() = user_id);

create or replace function public.record_creator_earning(
  p_idempotency_key text,
  p_creator_id uuid,
  p_source_user_id uuid,
  p_entry_type text,
  p_gross_cents bigint,
  p_platform_fee_cents bigint default 0,
  p_currency text default 'USD',
  p_provider text default null,
  p_provider_reference text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_earning_id uuid;
  v_net bigint;
begin
  if p_gross_cents <= 0 or p_platform_fee_cents < 0 or p_platform_fee_cents > p_gross_cents then
    raise exception 'Invalid monetization amounts';
  end if;
  v_net := p_gross_cents - p_platform_fee_cents;

  insert into public.monetization_ledger
    (idempotency_key,user_id,counterparty_user_id,entry_type,direction,amount_cents,currency,provider,provider_reference,status,metadata,available_at)
  values
    (p_idempotency_key,p_creator_id,p_source_user_id,p_entry_type,'credit',v_net,p_currency,p_provider,p_provider_reference,'pending',p_metadata,now())
  on conflict (idempotency_key) do nothing
  returning id into v_earning_id;

  if v_earning_id is null then
    select id into v_earning_id from public.monetization_ledger where idempotency_key = p_idempotency_key;
    return v_earning_id;
  end if;

  insert into public.creator_balances(user_id,pending_cents,lifetime_earned_cents,updated_at)
  values (p_creator_id,v_net,v_net,now())
  on conflict (user_id) do update set
    pending_cents = public.creator_balances.pending_cents + excluded.pending_cents,
    lifetime_earned_cents = public.creator_balances.lifetime_earned_cents + excluded.lifetime_earned_cents,
    updated_at = now();

  if p_platform_fee_cents > 0 then
    insert into public.monetization_ledger
      (idempotency_key,user_id,counterparty_user_id,entry_type,direction,amount_cents,currency,provider,provider_reference,status,metadata,available_at)
    values
      (p_idempotency_key || ':platform-fee',p_source_user_id,p_creator_id,'fee','credit',p_platform_fee_cents,p_currency,p_provider,p_provider_reference,'completed',p_metadata,now())
    on conflict (idempotency_key) do nothing;
  end if;

  return v_earning_id;
end;
$$;

revoke all on function public.record_creator_earning(text,uuid,uuid,text,bigint,bigint,text,text,text,jsonb) from public;
grant execute on function public.record_creator_earning(text,uuid,uuid,text,bigint,bigint,text,text,text,jsonb) to authenticated;
