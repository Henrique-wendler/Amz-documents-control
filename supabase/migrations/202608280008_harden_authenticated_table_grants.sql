-- Supabase grants broad table privileges to API roles by default.
-- Reset authenticated privileges and reapply only the reviewed allowlist.

revoke all privileges on all tables in schema public from authenticated;
alter default privileges in schema public revoke all privileges on tables from anon, authenticated;

grant select, insert, update on
  public.profiles,
  public.owners,
  public.farms,
  public.registrations,
  public.financial_institutions,
  public.operations,
  public.operation_financials,
  public.guarantee_types,
  public.guarantees,
  public.guarantee_financials,
  public.guarantee_items,
  public.document_types,
  public.rural_documents,
  public.document_attachments,
  public.car_records,
  public.report_templates
to authenticated;

grant select, update on public.organizations to authenticated;

grant select, insert, update, delete on
  public.operation_registrations,
  public.guarantee_type_links,
  public.guarantee_registrations
to authenticated;

grant select on
  public.roles,
  public.permissions,
  public.role_permissions,
  public.ownership_links,
  public.file_access_log,
  public.audit_log,
  public.rural_documents_with_validity
to authenticated;

grant insert, update on public.roles, public.permissions to authenticated;
grant insert, update, delete on public.role_permissions to authenticated;

grant select, insert on public.report_log to authenticated;
grant update (downloaded_at, context) on public.report_log to authenticated;
