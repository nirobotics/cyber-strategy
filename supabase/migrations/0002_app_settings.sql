-- 通用应用设置：当前用于保存队伍分档百分比。

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by text references public.profiles(open_id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists app_settings_updated_at on public.app_settings;
create trigger app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_settings' and policyname='service_role_all') then
    create policy service_role_all on public.app_settings for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;
