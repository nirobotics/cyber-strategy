-- cyber-strategy 初始 schema
-- 全部 RLS 锁到 service_role；前端经 React Router loader/action 走服务端访问。
-- 幂等：可重复执行。

create table if not exists public.profiles (
  open_id    text primary key,
  name       text not null default '',
  avatar_url text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.scouting_datasets (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  event_key       text not null,
  source_filename text,
  team_data       jsonb not null,
  team_photos     jsonb not null default '{}'::jsonb,
  is_active       boolean not null default false,
  created_by      text references public.profiles(open_id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists scouting_datasets_updated_idx on public.scouting_datasets(updated_at desc);
create unique index if not exists scouting_datasets_one_active_idx
  on public.scouting_datasets(is_active)
  where is_active;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scouting_datasets_updated_at on public.scouting_datasets;
create trigger scouting_datasets_updated_at
before update on public.scouting_datasets
for each row execute function public.set_updated_at();

create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  actor_open_id   text,
  action          text not null,
  changed_fields  jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

alter table public.profiles enable row level security;
alter table public.scouting_datasets enable row level security;
alter table public.audit_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='service_role_all') then
    create policy service_role_all on public.profiles for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='scouting_datasets' and policyname='service_role_all') then
    create policy service_role_all on public.scouting_datasets for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='service_role_insert') then
    create policy service_role_insert on public.audit_logs for insert
      with check (auth.role() = 'service_role');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='service_role_select') then
    create policy service_role_select on public.audit_logs for select
      using (auth.role() = 'service_role');
  end if;
end $$;
