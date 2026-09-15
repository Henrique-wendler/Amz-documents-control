-- Least-privilege direct reads required by the file-gateway Edge Function.
-- Gateway mutations remain restricted to the security-definer RPCs created by
-- migrations 015 and 016.

revoke all privileges on table
  public.organizations,
  public.file_gateway_instances,
  public.remote_copy_jobs,
  public.attachment_locations,
  public.file_access_log
from service_role;

grant select on table
  public.organizations,
  public.file_gateway_instances,
  public.remote_copy_jobs,
  public.attachment_locations,
  public.file_access_log
to service_role;
