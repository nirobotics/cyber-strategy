create table public.picklist_groups (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  name text not null,
  leader_id text not null,
  leader_name text not null,
  roster_version integer not null default 0,
  main_board jsonb not null default '{}',
  main_version integer not null default 0,
  main_updated_at timestamptz not null default now(),
  submission jsonb
);
create index picklist_groups_event_idx on public.picklist_groups(event_key);

create table public.picklist_group_students (
  group_id uuid references public.picklist_groups(id) on delete cascade,
  open_id text not null,
  name text not null,
  primary key (group_id, open_id)
);

create table public.picklist_group_personals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.picklist_groups(id) on delete cascade,
  owner_id text not null,
  client_id text not null,
  name text not null,
  board jsonb not null,
  updated_at timestamptz not null default now(),
  unique (group_id, owner_id, client_id)
);

alter table public.picklist_groups enable row level security;
alter table public.picklist_group_students enable row level security;
alter table public.picklist_group_personals enable row level security;
revoke all on public.picklist_groups, public.picklist_group_students, public.picklist_group_personals from anon, authenticated;
grant select, insert, update, delete on public.picklist_groups, public.picklist_group_students, public.picklist_group_personals to service_role;

create function public.read_picklist_groups(p_event text, p_actor text, p_group uuid)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_admin boolean;
  v_group picklist_groups;
  v_choices jsonb;
  v_content jsonb := null;
  v_submissions jsonb := '[]';
begin
  select is_admin into v_admin from profiles where open_id = p_actor and coalesce((to_jsonb(profiles)->>'is_active')::boolean, true);
  if not found then raise exception '无权访问 Picklist' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'rosterVersion', g.roster_version, 'leaderId', g.leader_id, 'leaderName', g.leader_name,
    'joined', g.leader_id = p_actor or membership.open_id is not null,
    'students', case when v_admin or g.leader_id = p_actor then (
      select coalesce(jsonb_agg(jsonb_build_object('openId', s.open_id, 'name', s.name) order by s.name, s.open_id), '[]')
      from picklist_group_students s where s.group_id = g.id
    ) else '[]'::jsonb end
  ) order by g.name, g.id), '[]') into v_choices
  from picklist_groups g
  left join picklist_group_students membership on membership.group_id = g.id and membership.open_id = p_actor
  where g.event_key = p_event and (v_admin or g.leader_id = p_actor or membership.open_id is not null);

  if p_group is not null then
    select g.* into v_group from picklist_groups g where g.id = p_group and g.event_key = p_event
      and (g.leader_id = p_actor or exists (select 1 from picklist_group_students s where s.group_id = g.id and s.open_id = p_actor));
    if not found then raise exception '无权访问此 Group' using errcode = '42501'; end if;
    v_content := jsonb_build_object('group', to_jsonb(v_group) - 'submission', 'submittedVersion', v_group.submission->'version', 'personals', (
      select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('owner_name', coalesce(s.name, v_group.leader_name)) order by p.updated_at desc), '[]')
      from picklist_group_personals p
      left join picklist_group_students s on s.group_id = p.group_id and s.open_id = p.owner_id
      where p.group_id = p_group and (p.owner_id = p_actor or (v_group.leader_id = p_actor and s.open_id is not null))
    ));
  elsif v_admin then
    select coalesce(jsonb_agg(g.submission order by g.submission->>'submittedAt' desc), '[]') into v_submissions
      from picklist_groups g where g.event_key = p_event and g.submission is not null;
  end if;
  return jsonb_build_object('isEventAdmin', v_admin, 'groups', v_choices, 'content', v_content, 'submissions', v_submissions);
end;
$$;

create function public.write_picklist_group(p_event text, p_actor text, p_group uuid, p_intent text, p_data jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_admin boolean;
  v_group picklist_groups;
  v_leader boolean;
  v_personal picklist_group_personals;
  v_result jsonb := '{}';
begin
  select is_admin into v_admin from profiles where open_id = p_actor and coalesce((to_jsonb(profiles)->>'is_active')::boolean, true) for share;
  if not found then raise exception '无权访问 Picklist' using errcode = '42501'; end if;

  if p_intent = 'create-group' then
    if not v_admin then raise exception '只有管理员可以创建 Group' using errcode = '42501'; end if;
    insert into picklist_groups (event_key, name, leader_id, leader_name)
    values (p_event, p_data->>'name', p_data->'leader'->>'openId', p_data->'leader'->>'name') returning * into v_group;
  else
    select * into v_group from picklist_groups where id = p_group and event_key = p_event for update;
    if not found then raise exception '无权访问此 Group' using errcode = '42501'; end if;
  end if;
  v_leader := v_group.leader_id = p_actor;

  case p_intent
    when 'create-group', 'update-group', 'update-students' then
      if (p_intent = 'update-students' and not v_leader) or (p_intent <> 'update-students' and not v_admin) then
        raise exception '无权管理此 Group' using errcode = '42501';
      end if;
      if p_intent <> 'create-group' and v_group.roster_version is distinct from (p_data->>'rosterVersion')::integer then
        raise exception '成员名单已有更新，请重新打开分组设置' using errcode = '40001';
      end if;
      if p_intent = 'update-group' then
        update picklist_groups set name = p_data->>'name', leader_id = p_data->'leader'->>'openId', leader_name = p_data->'leader'->>'name'
          where id = v_group.id returning * into v_group;
      end if;
      update picklist_groups set roster_version = roster_version + 1 where id = v_group.id;
      delete from picklist_group_students where group_id = v_group.id;
      insert into picklist_group_students(group_id, open_id, name)
        select v_group.id, student->>'openId', student->>'name' from jsonb_array_elements(p_data->'students') student
        where student->>'openId' <> v_group.leader_id;
    when 'save-group-main', 'submit-group-main' then
      if not v_leader then raise exception '只有此 Group 的 Leader 可以操作 Main' using errcode = '42501'; end if;
      if v_group.main_version is distinct from (p_data->>'version')::integer then
        raise exception 'Group Main 已有更新，请重新打开看板后再操作' using errcode = '40001';
      end if;
      if p_intent = 'save-group-main' then
        update picklist_groups set main_board = p_data->'board', main_version = main_version + 1, main_updated_at = clock_timestamp()
          where id = v_group.id returning * into v_group;
        v_result := jsonb_build_object('group', to_jsonb(v_group) - 'submission');
      else
        if v_group.main_version = 0 then raise exception '请先保存 Group Main' using errcode = '22023'; end if;
        if (v_group.submission->>'version')::integer is distinct from v_group.main_version
          or v_group.submission->>'createdBy' is distinct from p_actor
          or v_group.submission->>'name' is distinct from v_group.name then
          update picklist_groups set submission = jsonb_build_object(
            'version', main_version, 'name', name, 'board', main_board, 'createdBy', p_actor,
            'createdByName', leader_name, 'submittedAt', clock_timestamp(), 'id', id
          ) where id = v_group.id;
        end if;
        v_result := jsonb_build_object('submittedVersion', v_group.main_version);
      end if;
    when 'submit-personal', 'delete-personal' then
      if not v_leader and not exists (select 1 from picklist_group_students where group_id = v_group.id and open_id = p_actor) then
        raise exception '无权修改此 Group 的 Personal' using errcode = '42501';
      end if;
      if p_intent = 'submit-personal' then
        insert into picklist_group_personals(group_id, owner_id, client_id, name, board)
          values (v_group.id, p_actor, p_data->>'clientId', p_data->>'name', p_data->'board')
          on conflict (group_id, owner_id, client_id) do update set name = excluded.name, board = excluded.board, updated_at = clock_timestamp()
          returning * into v_personal;
        v_result := jsonb_build_object('personal', to_jsonb(v_personal) || jsonb_build_object('owner_name', coalesce(
          (select name from picklist_group_students where group_id = v_group.id and open_id = p_actor), v_group.leader_name)));
      else
        delete from picklist_group_personals where id = (p_data->>'id')::uuid and group_id = v_group.id and owner_id = p_actor returning * into v_personal;
        if not found then raise exception '无权删除此 Personal Picklist' using errcode = '42501'; end if;
        v_result := jsonb_build_object('deletedId', v_personal.id);
      end if;
    else raise exception '未知 Group 操作' using errcode = '22023';
  end case;

  insert into audit_logs(actor_open_id, action) values (p_actor, 'picklist.' || p_intent);
  return v_result;
end;
$$;

revoke execute on function public.read_picklist_groups(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.write_picklist_group(text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.read_picklist_groups(text, text, uuid) to service_role;
grant execute on function public.write_picklist_group(text, text, uuid, text, jsonb) to service_role;
