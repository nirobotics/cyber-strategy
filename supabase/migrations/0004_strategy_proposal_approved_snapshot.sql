-- Store the last approved proposal body so edited proposals can be restored.

alter table public.strategy_proposals
  add column if not exists last_approved_snapshot jsonb;
