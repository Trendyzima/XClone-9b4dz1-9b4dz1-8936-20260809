-- =============================================================================
-- Migration: Schedule daily earnings distribution + Revenue rate system
-- Run in Supabase SQL Editor (requires pg_cron + pg_net extensions)
-- =============================================================================

-- Step 1: Enable extensions (run as postgres superuser)
-- If you see "can only create extension in database postgres", run these two
-- lines directly in the Supabase SQL editor as the default admin user:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
-- Both extensions are pre-installed on all Supabase projects.

-- Step 2: Schedule distribute-earnings daily at midnight UTC
-- Replace YOUR_SUPABASE_URL and YOUR_SERVICE_ROLE_KEY with your actual values
-- from Settings → API in the Supabase dashboard.
--
-- select cron.schedule(
--   'distribute-earnings-daily',      -- job name (unique)
--   '0 0 * * *',                       -- cron: daily at 00:00 UTC
--   $$
--   select
--     net.http_post(
--       url        := 'YOUR_SUPABASE_URL/functions/v1/distribute-earnings',
--       headers    := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--       body       := '{}'::jsonb,
--       timeout_milliseconds := 30000
--     ) as request_id;
--   $$
-- );

-- Step 3: View scheduled jobs
-- select * from cron.job;

-- Step 4: View job execution history
-- select * from cron.job_run_details order by start_time desc limit 20;

-- Step 5: To remove the job:
-- select cron.unschedule('distribute-earnings-daily');

-- =============================================================================
-- Revenue Rate Tiers Reference
-- =============================================================================
-- tier         | cpm_usd | condition
-- -------------|---------|------------------------------------------
-- top_creator  | $3.50   | verified + 100k+ total video views
-- premium      | $2.50   | verified creator
-- rising       | $2.00   | unverified + 10k+ total video views
-- standard     | $1.50   | all other creators (default)
-- =============================================================================
-- Revenue formula per video:
--   earned = floor(views / 1000) × cpm_rate
-- Example (top_creator, 50,000 views):
--   earned = floor(50000 / 1000) × $3.50 = 50 × $3.50 = $175.00
-- =============================================================================

-- Alternative: Use Supabase Scheduled Functions (Edge Runtime)
-- Go to: Dashboard → Database → Extensions → Enable pg_cron
-- Then run the cron.schedule() query above in the SQL editor.
