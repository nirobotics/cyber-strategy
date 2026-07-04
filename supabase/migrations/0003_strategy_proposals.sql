-- Shared strategy proposal workflow.

create table if not exists public.strategy_proposals (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  match_key text not null,
  match_label text not null,
  own_team text not null check (own_team in ('8214', '9635')),
  proposal_type text not null check (proposal_type in ('auto', 'self_strategy', 'partner_strategy')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  title text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by text references public.profiles(open_id) on delete set null,
  reviewed_by text references public.profiles(open_id) on delete set null,
  review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists strategy_proposals_event_updated_idx
  on public.strategy_proposals(event_key, updated_at desc);

create index if not exists strategy_proposals_status_idx
  on public.strategy_proposals(status);

drop trigger if exists strategy_proposals_updated_at on public.strategy_proposals;
create trigger strategy_proposals_updated_at
before update on public.strategy_proposals
for each row execute function public.set_updated_at();

alter table public.strategy_proposals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='strategy_proposals' and policyname='service_role_all') then
    create policy service_role_all on public.strategy_proposals for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;
