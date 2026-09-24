-- Least-privilege reads required by the admin-users Edge Function.

grant select on table
  public.profiles,
  public.roles,
  public.role_permissions
to service_role;
