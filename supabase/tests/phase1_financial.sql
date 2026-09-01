-- Phase 1 database regression tests.
-- Run only in an isolated test database.
-- These tests intentionally use a fixed synthetic UUID and clean up afterwards.

begin;

DO $$
declare
  u uuid := '00000000-0000-0000-0000-000000000901';
  credit_id uuid;
  credit_id_2 uuid;
  reserve_id uuid;
  reserve_id_2 uuid;
  release_id uuid;
  earning_id uuid;
  earning_id_2 uuid;
  ad_id uuid;
  ad_id_2 uuid;
  refund_id uuid;
  refund_id_2 uuid;
  bal numeric;
  reserved numeric;
begin
  delete from public.refund_transactions where user_id=u;
  delete from public.ad_revenue_distributions where user_id=u;
  delete from public.creator_earning_postings where user_id=u;
  delete from public.wallet_transactions where user_id=u;
  delete from public.withdrawal_requests where user_id=u;
  delete from public.user_wallets where user_id=u;

  credit_id := public.credit_wallet_deposit(u, 100, 'USD', 'test:deposit:1', 'test', 'provider-deposit-1', 130, '{"test":true}');
  credit_id_2 := public.credit_wallet_deposit(u, 100, 'USD', 'test:deposit:1', 'test', 'provider-deposit-1', 130, '{"test":true}');
  if credit_id <> credit_id_2 then raise exception 'deposit idempotency failed'; end if;

  select balance,reserved_balance into bal,reserved from public.user_wallets where user_id=u;
  if bal <> 100 or reserved <> 0 then raise exception 'unexpected deposit balance: %, %',bal,reserved; end if;

  reserve_id := public.reserve_wallet_funds(u, 40, 'test:withdrawal:1', 'USD');
  reserve_id_2 := public.reserve_wallet_funds(u, 40, 'test:withdrawal:1', 'USD');
  if reserve_id <> reserve_id_2 then raise exception 'reservation idempotency failed'; end if;
  if public.wallet_available_balance(u) <> 60 then raise exception 'available balance after reservation is wrong'; end if;

  begin
    perform public.reserve_wallet_funds(u, 61, 'test:withdrawal:2', 'USD');
    raise exception 'insufficient funds reservation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%insufficient available balance%' then raise; end if;
  end;

  release_id := public.release_wallet_reservation(u,40,'test:withdrawal:1');
  if release_id is null then raise exception 'release failed'; end if;
  if public.wallet_available_balance(u) <> 100 then raise exception 'release did not restore available balance'; end if;

  reserve_id := public.reserve_wallet_funds(u, 25, 'test:withdrawal:3', 'USD');
  perform public.finalize_wallet_withdrawal(u,25,'test:withdrawal:3','test:withdrawal:3:final','USD');
  select balance,reserved_balance into bal,reserved from public.user_wallets where user_id=u;
  if bal <> 75 or reserved <> 0 then raise exception 'finalization produced wrong balances: %, %',bal,reserved; end if;

  earning_id := public.post_creator_earning(u,5,'video_fund','video-1','USD','{"test":true}');
  earning_id_2 := public.post_creator_earning(u,5,'video_fund','video-1','USD','{"test":true}');
  if earning_id <> earning_id_2 then raise exception 'creator earning idempotency failed'; end if;

  ad_id := public.post_ad_distribution(u,current_date,current_date,100,1000,10,4,'USD');
  ad_id_2 := public.post_ad_distribution(u,current_date,current_date,100,1000,10,4,'USD');
  if ad_id <> ad_id_2 then raise exception 'ad distribution idempotency failed'; end if;

  refund_id := public.issue_wallet_refund((select id from public.wallet_transactions where user_id=u and type='creator_earning' limit 1),u,5,'test refund','test:refund:1','USD');
  refund_id_2 := public.issue_wallet_refund((select id from public.wallet_transactions where user_id=u and type='creator_earning' limit 1),u,5,'test refund','test:refund:1','USD');
  if refund_id <> refund_id_2 then raise exception 'refund idempotency failed'; end if;

  select balance,reserved_balance into bal,reserved from public.user_wallets where user_id=u;
  if reserved <> 0 then raise exception 'reserved balance leaked: %',reserved; end if;

  raise notice 'PHASE1 financial regression tests passed; final balance=%',bal;

  delete from public.refund_transactions where user_id=u;
  delete from public.ad_revenue_distributions where user_id=u;
  delete from public.creator_earning_postings where user_id=u;
  delete from public.wallet_transactions where user_id=u;
  delete from public.user_wallets where user_id=u;
end $$;

rollback;
