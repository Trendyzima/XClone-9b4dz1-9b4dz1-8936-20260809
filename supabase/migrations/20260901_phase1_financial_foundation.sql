-- Phase 1 financial foundation
-- Canonical ledger: user_wallets + wallet_transactions.
-- All money-changing primitives are SECURITY DEFINER, atomic, and idempotent.

create extension if not exists pgcrypto;

create table if not exists public.user_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  balance numeric(20,6) not null default 0,
  reserved_balance numeric(20,6) not null default 0,
  currency text not null default 'USD',
  budget_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_wallets_balance_nonnegative check (balance >= 0),
  constraint user_wallets_reserved_nonnegative check (reserved_balance >= 0),
  constraint user_wallets_reserved_not_over_balance check (reserved_balance <= balance)
);

alter table public.user_wallets add column if not exists reserved_balance numeric(20,6) not null default 0;
alter table public.user_wallets add column if not exists currency text not null default 'USD';
alter table public.user_wallets add column if not exists budget_settings jsonb not null default '{}'::jsonb;
alter table public.user_wallets add column if not exists updated_at timestamptz not null default now();

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  wallet_id uuid references public.user_wallets(id) on delete restrict,
  amount numeric(20,6) not null,
  currency text not null default 'USD',
  type text not null,
  status text not null default 'completed',
  reference text,
  idempotency_key text,
  provider text,
  provider_transaction_id text,
  fx_rate numeric(20,10),
  fee_amount numeric(20,6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wallet_transactions_idem_uq
  on public.wallet_transactions(user_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists wallet_transactions_provider_uq
  on public.wallet_transactions(provider, provider_transaction_id)
  where provider is not null and provider_transaction_id is not null;
create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions(user_id, created_at desc);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  wallet_id uuid not null references public.user_wallets(id) on delete restrict,
  amount numeric(20,6) not null,
  fee_amount numeric(20,6) not null default 0,
  currency text not null default 'USD',
  payout_currency text not null default 'KES',
  fx_rate numeric(20,10),
  status text not null default 'pending',
  idempotency_key text not null,
  provider text,
  provider_transaction_id text,
  provider_reference text,
  failure_code text,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint withdrawal_amount_positive check (amount > 0)
);
create unique index if not exists withdrawal_idem_uq on public.withdrawal_requests(user_id,idempotency_key);
create unique index if not exists withdrawal_provider_uq on public.withdrawal_requests(provider,provider_transaction_id)
  where provider is not null and provider_transaction_id is not null;
create index if not exists withdrawal_status_idx on public.withdrawal_requests(status,created_at);

create table if not exists public.payment_idempotency (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  operation text not null,
  idempotency_key text not null,
  request_hash text,
  status text not null default 'processing',
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(operation,idempotency_key)
);

create table if not exists public.platform_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null,
  quote_currency text not null,
  rate numeric(20,10) not null,
  source text not null default 'manual',
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint fx_positive check (rate > 0)
);
create index if not exists fx_pair_effective_idx on public.platform_exchange_rates(base_currency,quote_currency,effective_at desc);

create table if not exists public.platform_fee_settings (
  id uuid primary key default gen_random_uuid(),
  operation text not null unique,
  percentage numeric(10,6) not null default 0,
  fixed_amount numeric(20,6) not null default 0,
  currency text not null default 'USD',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint fee_percentage_valid check (percentage >= 0 and percentage <= 100),
  constraint fee_fixed_valid check (fixed_amount >= 0)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null,
  entity_type text,
  entity_id text,
  request_id text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type,entity_id,created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_user_id,created_at desc);

create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_earning_postings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,
  user_id uuid not null,
  amount numeric(20,6) not null,
  currency text not null default 'USD',
  wallet_transaction_id uuid references public.wallet_transactions(id),
  creator_earning_id uuid,
  created_at timestamptz not null default now(),
  unique(source,source_id,user_id)
);

create table if not exists public.ad_revenue_distributions (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  user_id uuid not null,
  views bigint not null default 0,
  total_views bigint not null default 0,
  gross_revenue numeric(20,6) not null default 0,
  creator_share numeric(20,6) not null default 0,
  currency text not null default 'USD',
  wallet_transaction_id uuid references public.wallet_transactions(id),
  created_at timestamptz not null default now(),
  unique(period_start,period_end,user_id)
);

create table if not exists public.refund_transactions (
  id uuid primary key default gen_random_uuid(),
  original_transaction_id uuid not null references public.wallet_transactions(id),
  user_id uuid not null,
  amount numeric(20,6) not null,
  currency text not null,
  reason text not null,
  idempotency_key text not null unique,
  status text not null default 'completed',
  refund_transaction_id uuid references public.wallet_transactions(id),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_transaction_id text not null,
  event_type text not null,
  expected_status text,
  observed_status text,
  payload_hash text,
  payload jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique(provider,provider_transaction_id,event_type,payload_hash)
);

create or replace function public.wallet_available_balance(p_user_id uuid)
returns numeric language sql stable security definer set search_path = public
as $$
  select coalesce((select balance-reserved_balance from public.user_wallets where user_id=p_user_id),0);
$$;

create or replace function public.consume_rate_limit(p_bucket_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public
as $$
declare r rate_limit_buckets%rowtype; now_ts timestamptz:=clock_timestamp();
begin
  insert into rate_limit_buckets(bucket_key,window_started_at,request_count,updated_at)
  values(p_bucket_key,now_ts,1,now_ts)
  on conflict(bucket_key) do update set
    window_started_at=case when now_ts-rate_limit_buckets.window_started_at >= make_interval(secs=>p_window_seconds) then now_ts else rate_limit_buckets.window_started_at end,
    request_count=case when now_ts-rate_limit_buckets.window_started_at >= make_interval(secs=>p_window_seconds) then 1 else rate_limit_buckets.request_count+1 end,
    updated_at=now_ts;
  select * into r from rate_limit_buckets where bucket_key=p_bucket_key;
  return r.request_count <= p_limit;
end $$;

create or replace function public.reserve_wallet_funds(p_user_id uuid,p_amount numeric,p_idempotency_key text,p_currency text default 'USD')
returns uuid language plpgsql security definer set search_path = public
as $$
declare w user_wallets%rowtype; tx_id uuid;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  select * into w from user_wallets where user_id=p_user_id for update;
  if not found then
    insert into user_wallets(user_id,currency) values(p_user_id,p_currency) returning * into w;
  end if;
  select id into tx_id from wallet_transactions where user_id=p_user_id and idempotency_key=p_idempotency_key limit 1;
  if tx_id is not null then return tx_id; end if;
  if (w.balance-w.reserved_balance) < p_amount then raise exception 'insufficient available balance'; end if;
  update user_wallets set reserved_balance=reserved_balance+p_amount,updated_at=now() where id=w.id;
  insert into wallet_transactions(user_id,wallet_id,amount,currency,type,status,idempotency_key)
  values(p_user_id,w.id,p_amount,p_currency,'withdrawal_reservation','reserved',p_idempotency_key) returning id into tx_id;
  return tx_id;
end $$;

create or replace function public.release_wallet_reservation(p_user_id uuid,p_amount numeric,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare w user_wallets%rowtype; tx_id uuid;
begin
  select * into w from user_wallets where user_id=p_user_id for update;
  if not found then raise exception 'wallet not found'; end if;
  select id into tx_id from wallet_transactions where user_id=p_user_id and idempotency_key=p_idempotency_key limit 1;
  if tx_id is null then raise exception 'reservation not found'; end if;
  if exists(select 1 from wallet_transactions where user_id=p_user_id and type='withdrawal_release' and reference=tx_id::text) then return tx_id; end if;
  if w.reserved_balance < p_amount then raise exception 'reservation exceeds reserved balance'; end if;
  update user_wallets set reserved_balance=reserved_balance-p_amount,updated_at=now() where id=w.id;
  insert into wallet_transactions(user_id,wallet_id,amount,currency,type,status,reference)
  values(p_user_id,w.id,p_amount,w.currency,'withdrawal_release','completed',tx_id::text) returning id into tx_id;
  return tx_id;
end $$;

create or replace function public.finalize_wallet_withdrawal(p_user_id uuid,p_amount numeric,p_reservation_key text,p_idempotency_key text,p_currency text default 'USD')
returns uuid language plpgsql security definer set search_path = public
as $$
declare w user_wallets%rowtype; tx_id uuid; reserve_tx uuid;
begin
  select * into w from user_wallets where user_id=p_user_id for update;
  if not found then raise exception 'wallet not found'; end if;
  select id into tx_id from wallet_transactions where user_id=p_user_id and idempotency_key=p_idempotency_key limit 1;
  if tx_id is not null then return tx_id; end if;
  select id into reserve_tx from wallet_transactions where user_id=p_user_id and idempotency_key=p_reservation_key and status='reserved' limit 1;
  if reserve_tx is null then raise exception 'reservation not found'; end if;
  if w.reserved_balance < p_amount or (w.balance-w.reserved_balance) < 0 then raise exception 'invalid reservation state'; end if;
  update user_wallets set balance=balance-p_amount,reserved_balance=reserved_balance-p_amount,updated_at=now() where id=w.id;
  insert into wallet_transactions(user_id,wallet_id,amount,currency,type,status,idempotency_key,reference)
  values(p_user_id,w.id,-p_amount,p_currency,'withdrawal','completed',p_idempotency_key,reserve_tx::text) returning id into tx_id;
  update wallet_transactions set status='finalized',updated_at=now() where id=reserve_tx;
  return tx_id;
end $$;

create or replace function public.credit_wallet_deposit(p_user_id uuid,p_amount numeric,p_currency text,p_idempotency_key text,p_provider text default null,p_provider_transaction_id text default null,p_fx_rate numeric default null,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare w user_wallets%rowtype; tx_id uuid;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  select id into tx_id from wallet_transactions where (user_id=p_user_id and idempotency_key=p_idempotency_key) or (p_provider is not null and provider=p_provider and provider_transaction_id=p_provider_transaction_id) limit 1;
  if tx_id is not null then return tx_id; end if;
  select * into w from user_wallets where user_id=p_user_id for update;
  if not found then insert into user_wallets(user_id,currency) values(p_user_id,p_currency) returning * into w; end if;
  update user_wallets set balance=balance+p_amount,updated_at=now() where id=w.id;
  insert into wallet_transactions(user_id,wallet_id,amount,currency,type,status,idempotency_key,provider,provider_transaction_id,fx_rate,metadata)
  values(p_user_id,w.id,p_amount,p_currency,'deposit','completed',p_idempotency_key,p_provider,p_provider_transaction_id,p_fx_rate,p_metadata) returning id into tx_id;
  return tx_id;
end $$;

create or replace function public.post_creator_earning(p_user_id uuid,p_amount numeric,p_source text,p_source_id text,p_currency text default 'USD',p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare existing uuid; tx_id uuid; w user_wallets%rowtype;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  select wallet_transaction_id into tx_id from creator_earning_postings where source=p_source and source_id=p_source_id and user_id=p_user_id limit 1;
  if tx_id is not null then return tx_id; end if;
  select * into w from user_wallets where user_id=p_user_id for update;
  if not found then insert into user_wallets(user_id,currency) values(p_user_id,p_currency) returning * into w; end if;
  update user_wallets set balance=balance+p_amount,updated_at=now() where id=w.id;
  insert into wallet_transactions(user_id,wallet_id,amount,currency,type,status,idempotency_key,metadata)
  values(p_user_id,w.id,p_amount,p_currency,'creator_earning','completed','creator:'||p_source||':'||p_source_id,p_metadata) returning id into tx_id;
  insert into creator_earning_postings(source,source_id,user_id,amount,currency,wallet_transaction_id)
  values(p_source,p_source_id,p_user_id,p_amount,p_currency,tx_id);
  return tx_id;
end $$;

create or replace function public.post_ad_distribution(p_user_id uuid,p_period_start date,p_period_end date,p_views bigint,p_total_views bigint,p_gross numeric,p_share numeric,p_currency text default 'USD')
returns uuid language plpgsql security definer set search_path = public
as $$
declare tx_id uuid; w user_wallets%rowtype;
begin
  if p_share <= 0 then raise exception 'share must be positive'; end if;
  select wallet_transaction_id into tx_id from ad_revenue_distributions where period_start=p_period_start and period_end=p_period_end and user_id=p_user_id;
  if tx_id is not null then return tx_id; end if;
  select * into w from user_wallets where user_id=p_user_id for update;
  if not found then insert into user_wallets(user_id,currency) values(p_user_id,p_currency) returning * into w; end if;
  update user_wallets set balance=balance+p_share,updated_at=now() where id=w.id;
  insert into wallet_transactions(user_id,wallet_id,amount,currency,type,status,idempotency_key)
  values(p_user_id,w.id,p_share,p_currency,'ad_revenue_share','completed','ad:'||p_period_start||':'||p_period_end||':'||p_user_id) returning id into tx_id;
  insert into ad_revenue_distributions(period_start,period_end,user_id,views,total_views,gross_revenue,creator_share,currency,wallet_transaction_id)
  values(p_period_start,p_period_end,p_user_id,p_views,p_total_views,p_gross,p_share,p_currency,tx_id);
  return tx_id;
end $$;

create or replace function public.issue_wallet_refund(p_original_transaction_id uuid,p_user_id uuid,p_amount numeric,p_reason text,p_idempotency_key text,p_currency text default 'USD')
returns uuid language plpgsql security definer set search_path = public
as $$
declare tx_id uuid; w user_wallets%rowtype;
begin
  select refund_transaction_id into tx_id from refund_transactions where idempotency_key=p_idempotency_key;
  if tx_id is not null then return tx_id; end if;
  if not exists(select 1 from wallet_transactions where id=p_original_transaction_id and user_id=p_user_id) then raise exception 'original transaction not found'; end if;
  select * into w from user_wallets where user_id=p_user_id for update;
  if not found then raise exception 'wallet not found'; end if;
  update user_wallets set balance=balance+p_amount,updated_at=now() where id=w.id;
  insert into wallet_transactions(user_id,wallet_id,amount,currency,type,status,idempotency_key,reference)
  values(p_user_id,w.id,p_amount,p_currency,'refund','completed','refund:'||p_idempotency_key,p_original_transaction_id::text) returning id into tx_id;
  insert into refund_transactions(original_transaction_id,user_id,amount,currency,reason,idempotency_key,refund_transaction_id)
  values(p_original_transaction_id,p_user_id,p_amount,p_currency,p_reason,p_idempotency_key,tx_id);
  return tx_id;
end $$;

alter table public.user_wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.payment_idempotency enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limit_buckets enable row level security;

-- Users can see their own wallet and ledger; service-role/security-definer code handles mutations.
drop policy if exists user_wallets_select_own on public.user_wallets;
create policy user_wallets_select_own on public.user_wallets for select using (auth.uid()=user_id);
drop policy if exists wallet_transactions_select_own on public.wallet_transactions;
create policy wallet_transactions_select_own on public.wallet_transactions for select using (auth.uid()=user_id);
drop policy if exists withdrawals_select_own on public.withdrawal_requests;
create policy withdrawals_select_own on public.withdrawal_requests for select using (auth.uid()=user_id);

-- Explicitly deny client-side inserts/updates/deletes by providing no write policies.
-- Service-role bypass is retained for Edge Functions and reconciliation workers.

comment on table public.user_wallets is 'Canonical wallet state. balance includes reserved funds; available = balance - reserved_balance.';
comment on table public.wallet_transactions is 'Immutable financial ledger. Money-changing code must use security-definer atomic RPCs.';
comment on table public.withdrawal_requests is 'External payout state machine: pending/reserved -> processing -> completed OR failed/released.';
