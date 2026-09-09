-- CI history-gate reconciliation marker.
-- Production migration history is repaired by the migration workflow before push.
-- This migration intentionally makes no schema change; it provides a deterministic
-- post-repair migration boundary for the production/preview gates.
select 1;
