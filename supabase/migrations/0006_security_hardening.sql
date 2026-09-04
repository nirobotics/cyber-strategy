-- 认证撤销、账号停用和不可变审计日志。

alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists session_valid_after timestamptz not null default 'epoch'::timestamptz;

alter table public.audit_logs
  add column if not exists target_type text,
  add column if not exists target_id text;

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only
before update or delete on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();
