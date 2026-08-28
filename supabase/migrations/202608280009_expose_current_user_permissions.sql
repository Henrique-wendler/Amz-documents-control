-- Expose only the authenticated user's effective permission keys.
-- No user identifier is accepted, preventing permission enumeration.

create or replace function public.current_user_permissions()
returns table (permission_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select role_permission.permission_key
  from public.profiles profile
  join public.organizations organization on organization.id = profile.organization_id
  join public.roles role on role.role_key = profile.role_key
  join public.role_permissions role_permission on role_permission.role_key = role.role_key
  join public.permissions permission on permission.permission_key = role_permission.permission_key
  where profile.id = auth.uid()
    and profile.status = 'active'
    and organization.status = 'active'
    and organization.deleted_at is null
    and role.status = 'active'
  order by role_permission.permission_key;
$$;

revoke all on function public.current_user_permissions() from public;
grant execute on function public.current_user_permissions() to authenticated;
