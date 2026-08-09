-- ============================================================
-- pg_cron: Schedule daily-earnings-notification edge function
-- Run this SQL once in the Supabase SQL editor.
-- Requires: pg_cron extension (enabled by default on Supabase)
-- ============================================================

-- 1. Enable pg_cron if not already active
create extension if not exists pg_cron;

-- 2. Enable pg_net for HTTP requests (required to call edge functions)
create extension if not exists pg_net;

-- 3. Remove any existing schedule with this name (safe to re-run)
select cron.unschedule('daily-earnings-notification')
  where exists (
    select 1 from cron.job where jobname = 'daily-earnings-notification'
  );

-- 4. Schedule: every day at 08:00 UTC
--    Calls the daily-earnings-notification edge function via HTTP POST.
--    Replace <SUPABASE_URL> and <SERVICE_ROLE_KEY> with your actual values,
--    or use Supabase Vault secrets.
select cron.schedule(
  'daily-earnings-notification',          -- job name
  '0 8 * * *',                            -- cron: 08:00 UTC every day
  $$
    select net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/daily-earnings-notification',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- 5. Verify the schedule was created
select jobid, jobname, schedule, command
from cron.job
where jobname = 'daily-earnings-notification';

-- ============================================================
-- HOW TO SET app.supabase_url / app.service_role_key
-- Run once in the SQL editor:
--
--   alter database postgres set app.supabase_url = 'https://lrqqpudyrkmitbeilrqq.backend.onspace.ai';
--   alter database postgres set app.service_role_key = '<your-service-role-key>';
--
-- Or replace current_setting() calls above with the literal strings.
-- ============================================================
