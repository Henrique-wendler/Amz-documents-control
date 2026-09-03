-- Transactional, tenant-aware profile changes for the user administration Edge Function.

create or replace function private.guard_last_user_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_role_manages_users boolean;
  new_role_manages_users boolean;
  remaining_managers integer;
begin
  if old.status is not distinct from new.status and old.role_key is not distinct from new.role_key then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(old.organization_id::text, 0));

  select exists (
    select 1
    from public.role_permissions permission
    join public.roles role on role.role_key = permission.role_key and role.status = 'active'
    where permission.role_key = old.role_key
      and permission.permission_key = 'users.manage'
  ) into old_role_manages_users;

  select exists (
    select 1
    from public.role_permissions permission
    join public.roles role on role.role_key = permission.role_key and role.status = 'active'
    where permission.role_key = new.role_key
      and permission.permission_key = 'users.manage'
  ) into new_role_manages_users;

  if old.status = 'active'
     and old_role_manages_users
     and (new.status <> 'active' or not new_role_manages_users) then
    select count(*)
      into remaining_managers
    from public.profiles profile
    join public.roles role on role.role_key = profile.role_key and role.status = 'active'
    join public.role_permissions permission
      on permission.role_key = profile.role_key
     and permission.permission_key = 'users.manage'
    where profile.organization_id = old.organization_id
      and profile.status = 'active'
      and profile.id <> old.id;

    if remaining_managers = 0 then
      raise exception using
        errcode = '23514',
        message = 'The organization must keep at least one active user manager.';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_guard_last_user_manager
before update of role_key, status on public.profiles
for each row execute function private.guard_last_user_manager();

create or replace function public.admin_update_user_profile(
  p_target_user_id uuid,
  p_full_name text,
  p_role_key text,
  p_status text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid := private.current_user_organization_id();
  current_profile public.profiles;
  updated_profile public.profiles;
begin
  if actor_organization_id is null or not private.has_permission('users.manage') then
    raise exception using errcode = '42501', message = 'Missing users.manage permission.';
  end if;

  if p_full_name is null or char_length(btrim(p_full_name)) < 3 or char_length(btrim(p_full_name)) > 160 then
    raise exception using errcode = '22023', message = 'Invalid full name.';
  end if;

  if p_status not in ('active', 'inactive') then
    raise exception using errcode = '22023', message = 'Invalid profile status.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_organization_id::text, 0));

  select profile.*
    into current_profile
  from public.profiles profile
  where profile.id = p_target_user_id
    and profile.organization_id = actor_organization_id
  for update;

  if current_profile.id is null then
    raise exception using errcode = 'P0002', message = 'User profile is unavailable.';
  end if;

  if not exists (
    select 1
    from public.roles role
    where role.role_key = p_role_key
      and role.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'Invalid role.';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name),
      role_key = p_role_key,
      status = p_status
  where id = p_target_user_id
    and organization_id = actor_organization_id
  returning * into updated_profile;

  if current_profile.full_name is distinct from updated_profile.full_name then
    insert into public.audit_log (
      organization_id, actor_user_id, entity_type, entity_id, action, changes, context
    ) values (
      actor_organization_id,
      auth.uid(),
      'profiles',
      p_target_user_id,
      'USER_PROFILE_UPDATED',
      jsonb_build_object('full_name', jsonb_build_object('changed', true)),
      jsonb_build_object('source', 'user_administration')
    );
  end if;

  if current_profile.role_key is distinct from updated_profile.role_key then
    insert into public.audit_log (
      organization_id, actor_user_id, entity_type, entity_id, action, changes, context
    ) values (
      actor_organization_id,
      auth.uid(),
      'profiles',
      p_target_user_id,
      'USER_ROLE_CHANGED',
      jsonb_build_object('role_key', jsonb_build_object('old', current_profile.role_key, 'new', updated_profile.role_key)),
      jsonb_build_object('source', 'user_administration')
    );
  end if;

  if current_profile.status is distinct from updated_profile.status then
    insert into public.audit_log (
      organization_id, actor_user_id, entity_type, entity_id, action, changes, context
    ) values (
      actor_organization_id,
      auth.uid(),
      'profiles',
      p_target_user_id,
      case updated_profile.status when 'inactive' then 'USER_INACTIVATED' else 'USER_REACTIVATED' end,
      jsonb_build_object('status', jsonb_build_object('old', current_profile.status, 'new', updated_profile.status)),
      jsonb_build_object('source', 'user_administration')
    );
  end if;

  return updated_profile;
end;
$$;

create or replace function public.record_user_administration_event(
  p_target_user_id uuid,
  p_action text,
  p_changes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid := private.current_user_organization_id();
  created_id uuid;
  safe_changes jsonb := '{}'::jsonb;
begin
  if actor_organization_id is null or not private.has_permission('users.manage') then
    raise exception using errcode = '42501', message = 'Missing users.manage permission.';
  end if;

  if p_action not in ('USER_INVITED', 'PASSWORD_RECOVERY_SENT', 'SESSIONS_REVOKED') then
    raise exception using errcode = '22023', message = 'Unsupported user administration action.';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_target_user_id
      and profile.organization_id = actor_organization_id
  ) then
    raise exception using errcode = 'P0002', message = 'User profile is unavailable.';
  end if;

  if p_action = 'USER_INVITED' then
    safe_changes := jsonb_build_object(
      'role_key', jsonb_build_object('new', p_changes #> array['role_key', 'new']),
      'status', jsonb_build_object('new', p_changes #> array['status', 'new'])
    );
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, entity_type, entity_id, action, changes, context
  ) values (
    actor_organization_id,
    auth.uid(),
    'profiles',
    p_target_user_id,
    p_action,
    safe_changes,
    jsonb_build_object('source', 'user_administration')
  ) returning id into created_id;

  return created_id;
end;
$$;

revoke all on function public.admin_update_user_profile(uuid, text, text, text) from public;
revoke all on function public.record_user_administration_event(uuid, text, jsonb) from public;
grant execute on function public.admin_update_user_profile(uuid, text, text, text) to authenticated;
grant execute on function public.record_user_administration_event(uuid, text, jsonb) to authenticated;
