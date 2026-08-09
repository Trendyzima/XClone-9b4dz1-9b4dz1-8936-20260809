# M-Pesa Integration — DB Setup SQL

Run this once the database comes out of recovery mode.

```sql
-- M-Pesa transactions table
create table if not exists public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade,
  checkout_request_id text unique,
  merchant_request_id text,
  phone_number text not null,
  amount numeric(12,2) not null,
  type text not null,             -- 'stk_push' | 'b2c_payout'
  purpose text not null,          -- 'deposit' | 'boost_post' | 'premium' | 'verification' | 'withdrawal' | 'creator_payout'
  status text not null default 'pending',  -- 'pending' | 'completed' | 'failed' | 'cancelled'
  result_code text,
  result_desc text,
  mpesa_receipt_number text,
  transaction_date text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.mpesa_transactions enable row level security;

create policy "authenticated_select_own_mpesa"
  on public.mpesa_transactions for select to authenticated
  using (user_id = auth.uid());

create policy "authenticated_insert_own_mpesa"
  on public.mpesa_transactions for insert to authenticated
  with check (user_id = auth.uid());

create policy "service_all_mpesa"
  on public.mpesa_transactions for all to service_role
  using (true) with check (true);

create index if not exists idx_mpesa_checkout_request_id
  on public.mpesa_transactions(checkout_request_id);

create index if not exists idx_mpesa_user_id
  on public.mpesa_transactions(user_id);
```
