-- Keep the compatibility views subject to the caller's RLS policies.
-- Postgres 15+ otherwise evaluates ordinary views with the view owner's privileges.
alter view public.federated_followers set (security_invoker = true);
alter view public.federated_following set (security_invoker = true);
