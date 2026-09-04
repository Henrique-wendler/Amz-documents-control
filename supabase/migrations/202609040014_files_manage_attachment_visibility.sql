-- Allow metadata-only management flows to work when files.manage is granted independently.
-- Download/content access remains protected by files.read in the Edge Function and Storage policy.

create policy document_attachments_manage_select
on public.document_attachments for select to authenticated
using (
  deleted_at is null
  and private.same_organization(organization_id)
  and private.has_permission('files.manage')
);

create policy attachment_locations_manage_select
on public.attachment_locations for select to authenticated
using (
  deleted_at is null
  and private.same_organization(organization_id)
  and private.has_permission('files.manage')
);
