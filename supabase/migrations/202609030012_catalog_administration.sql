-- Tenant-scoped administration permission and RLS for business catalogs.

insert into public.permissions (permission_key, description)
values ('catalogs.manage', 'Gerenciar catálogos empresariais')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role_key, permission_key)
values ('admin', 'catalogs.manage')
on conflict do nothing;

drop policy if exists financial_institutions_select on public.financial_institutions;
drop policy if exists financial_institutions_insert on public.financial_institutions;
drop policy if exists financial_institutions_update on public.financial_institutions;

create policy financial_institutions_select
on public.financial_institutions for select to authenticated
using (
  deleted_at is null
  and private.same_organization(organization_id)
  and (private.has_permission('operations.read') or private.has_permission('catalogs.manage'))
);

create policy financial_institutions_insert
on public.financial_institutions for insert to authenticated
with check (
  private.same_organization(organization_id)
  and private.has_permission('catalogs.manage')
);

create policy financial_institutions_update
on public.financial_institutions for update to authenticated
using (private.same_organization(organization_id) and private.has_permission('catalogs.manage'))
with check (private.same_organization(organization_id) and private.has_permission('catalogs.manage'));

drop policy if exists guarantee_types_select on public.guarantee_types;
drop policy if exists guarantee_types_insert on public.guarantee_types;
drop policy if exists guarantee_types_update on public.guarantee_types;

create policy guarantee_types_select
on public.guarantee_types for select to authenticated
using (
  deleted_at is null
  and private.same_organization(organization_id)
  and (private.has_permission('guarantees.read') or private.has_permission('catalogs.manage'))
);

create policy guarantee_types_insert
on public.guarantee_types for insert to authenticated
with check (
  private.same_organization(organization_id)
  and private.has_permission('catalogs.manage')
);

create policy guarantee_types_update
on public.guarantee_types for update to authenticated
using (private.same_organization(organization_id) and private.has_permission('catalogs.manage'))
with check (private.same_organization(organization_id) and private.has_permission('catalogs.manage'));

drop policy if exists document_types_select on public.document_types;
drop policy if exists document_types_insert on public.document_types;
drop policy if exists document_types_update on public.document_types;

create policy document_types_select
on public.document_types for select to authenticated
using (
  deleted_at is null
  and private.same_organization(organization_id)
  and (private.has_permission('documents.read') or private.has_permission('catalogs.manage'))
);

create policy document_types_insert
on public.document_types for insert to authenticated
with check (
  private.same_organization(organization_id)
  and private.has_permission('catalogs.manage')
);

create policy document_types_update
on public.document_types for update to authenticated
using (private.same_organization(organization_id) and private.has_permission('catalogs.manage'))
with check (private.same_organization(organization_id) and private.has_permission('catalogs.manage'));
