-- Hybrid document storage, phase A: private Supabase Storage with 1:N physical locations.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rural-documents',
  'rural-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.attachment_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  attachment_id uuid not null,
  storage_type text not null check (storage_type in ('network_share', 'supabase_storage', 'external')),
  bucket_id text,
  object_key text,
  external_reference text,
  is_primary boolean not null default false,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  checksum text check (checksum is null or checksum ~ '^[A-Fa-f0-9]{64}$'),
  status text not null default 'active' check (status in ('uploading', 'active', 'removing', 'inactive', 'failed')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint attachment_locations_organization_fk foreign key (organization_id) references public.organizations(id) on delete restrict,
  constraint attachment_locations_attachment_fk foreign key (organization_id, attachment_id) references public.document_attachments(organization_id, id) on delete restrict,
  constraint attachment_locations_kind_check check (
    (
      storage_type = 'supabase_storage'
      and bucket_id is not null
      and btrim(bucket_id) <> ''
      and object_key is not null
      and btrim(object_key) <> ''
      and external_reference is null
    )
    or (
      storage_type in ('network_share', 'external')
      and bucket_id is null
      and object_key is null
      and external_reference is not null
      and btrim(external_reference) <> ''
      and not private.file_path_has_credentials(external_reference)
    )
  ),
  unique (organization_id, id),
  unique (bucket_id, object_key),
  check (deleted_at is not null or deleted_by is null)
);

create unique index attachment_locations_primary_idx
on public.attachment_locations (attachment_id)
where is_primary and deleted_at is null;

create index attachment_locations_organization_id_idx on public.attachment_locations (organization_id);
create index attachment_locations_attachment_id_idx on public.attachment_locations (attachment_id);
create index attachment_locations_status_idx on public.attachment_locations (status) where deleted_at is null;

create trigger attachment_locations_set_metadata
before insert or update on public.attachment_locations
for each row execute function private.set_row_metadata();

create or replace function private.sync_legacy_attachment_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.attachment_locations (
    organization_id,
    attachment_id,
    storage_type,
    bucket_id,
    object_key,
    external_reference,
    is_primary,
    mime_type,
    file_size,
    checksum,
    status
  ) values (
    new.organization_id,
    new.id,
    new.storage_type,
    case when new.storage_type = 'supabase_storage' then 'rural-documents' else null end,
    case when new.storage_type = 'supabase_storage' then new.file_path else null end,
    case when new.storage_type <> 'supabase_storage' then new.file_path else null end,
    true,
    new.mime_type,
    new.file_size,
    new.checksum,
    case when new.status = 'active' then 'active' else 'inactive' end
  )
  on conflict (attachment_id) where is_primary and deleted_at is null
  do update set
    storage_type = excluded.storage_type,
    bucket_id = excluded.bucket_id,
    object_key = excluded.object_key,
    external_reference = excluded.external_reference,
    mime_type = excluded.mime_type,
    file_size = excluded.file_size,
    checksum = excluded.checksum;

  return new;
end;
$$;

create trigger document_attachments_sync_legacy_location
after insert or update of storage_type, file_path, mime_type, file_size, checksum
on public.document_attachments
for each row execute function private.sync_legacy_attachment_location();

insert into public.attachment_locations (
  organization_id,
  attachment_id,
  storage_type,
  bucket_id,
  object_key,
  external_reference,
  is_primary,
  mime_type,
  file_size,
  checksum,
  status,
  created_at,
  created_by,
  updated_at,
  updated_by
)
select
  attachment.organization_id,
  attachment.id,
  attachment.storage_type,
  case when attachment.storage_type = 'supabase_storage' then 'rural-documents' else null end,
  case when attachment.storage_type = 'supabase_storage' then attachment.file_path else null end,
  case when attachment.storage_type <> 'supabase_storage' then attachment.file_path else null end,
  true,
  attachment.mime_type,
  attachment.file_size,
  attachment.checksum,
  case when attachment.status = 'active' then 'active' else 'inactive' end,
  attachment.created_at,
  attachment.created_by,
  attachment.updated_at,
  attachment.updated_by
from public.document_attachments attachment
where attachment.deleted_at is null
on conflict (attachment_id) where is_primary and deleted_at is null do nothing;

alter table public.file_access_log
  drop constraint file_access_log_action_check,
  add column location_id uuid,
  add constraint file_access_log_action_check check (action in ('view', 'download', 'copy_reference', 'upload', 'remove_location')),
  add constraint file_access_log_location_fk foreign key (organization_id, location_id) references public.attachment_locations(organization_id, id) on delete restrict;

create index file_access_log_location_id_idx on public.file_access_log (location_id);

alter table public.attachment_locations enable row level security;
revoke all on public.attachment_locations from anon;
grant select, insert, update on public.attachment_locations to authenticated;

create policy attachment_locations_select
on public.attachment_locations for select to authenticated
using (
  deleted_at is null
  and private.same_organization(organization_id)
  and private.has_permission('files.read')
);

create policy attachment_locations_insert
on public.attachment_locations for insert to authenticated
with check (
  private.same_organization(organization_id)
  and private.has_permission('files.manage')
);

create policy attachment_locations_update
on public.attachment_locations for update to authenticated
using (
  private.same_organization(organization_id)
  and private.has_permission('files.manage')
)
with check (
  private.same_organization(organization_id)
  and private.has_permission('files.manage')
);

create policy rural_documents_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'rural-documents'
  and (storage.foldername(name))[1] = private.current_user_organization_id()::text
  and (private.has_permission('files.read') or private.has_permission('files.manage'))
);

create policy rural_documents_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'rural-documents'
  and (storage.foldername(name))[1] = private.current_user_organization_id()::text
  and private.has_permission('files.manage')
);

create policy rural_documents_storage_update
on storage.objects for update to authenticated
using (
  bucket_id = 'rural-documents'
  and (storage.foldername(name))[1] = private.current_user_organization_id()::text
  and private.has_permission('files.manage')
)
with check (
  bucket_id = 'rural-documents'
  and (storage.foldername(name))[1] = private.current_user_organization_id()::text
  and private.has_permission('files.manage')
);

create policy rural_documents_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'rural-documents'
  and (storage.foldername(name))[1] = private.current_user_organization_id()::text
  and private.has_permission('files.manage')
);

create or replace function public.begin_document_upload(
  p_document_id uuid,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint
)
returns table (attachment_id uuid, location_id uuid, bucket_id text, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid := private.current_user_organization_id();
  new_attachment_id uuid := gen_random_uuid();
  new_location_id uuid;
  target_bucket_id text := 'rural-documents';
  target_object_key text;
begin
  if target_organization_id is null or not private.has_permission('files.manage') then
    raise exception using errcode = '42501', message = 'Missing files.manage permission.';
  end if;

  if p_file_name is null or btrim(p_file_name) = '' or char_length(p_file_name) > 255 then
    raise exception using errcode = '22023', message = 'Invalid file name.';
  end if;
  if p_mime_type is null or btrim(p_mime_type) = '' or char_length(p_mime_type) > 255 then
    raise exception using errcode = '22023', message = 'Invalid MIME type.';
  end if;
  if p_file_size is null or p_file_size <= 0 or p_file_size > 20971520 then
    raise exception using errcode = '22023', message = 'Invalid file size.';
  end if;

  perform 1
  from public.rural_documents document
  where document.id = p_document_id
    and document.organization_id = target_organization_id
    and document.status = 'active'
    and document.deleted_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'Document is unavailable to the current organization.';
  end if;

  target_object_key := concat(
    target_organization_id::text, '/',
    p_document_id::text, '/',
    new_attachment_id::text, '/',
    gen_random_uuid()::text
  );

  insert into public.document_attachments (
    id,
    organization_id,
    document_id,
    file_name,
    storage_type,
    file_path,
    mime_type,
    file_size,
    status
  ) values (
    new_attachment_id,
    target_organization_id,
    p_document_id,
    btrim(p_file_name),
    'supabase_storage',
    target_object_key,
    lower(btrim(p_mime_type)),
    p_file_size,
    'inactive'
  );

  select location.id
    into new_location_id
  from public.attachment_locations location
  where location.attachment_id = new_attachment_id
    and location.is_primary
    and location.deleted_at is null;

  update public.attachment_locations location
  set status = 'uploading'
  where location.id = new_location_id;

  return query select new_attachment_id, new_location_id, target_bucket_id, target_object_key;
end;
$$;

create or replace function public.finalize_document_upload(
  p_attachment_id uuid,
  p_location_id uuid,
  p_mime_type text,
  p_file_size bigint,
  p_checksum text
)
returns table (attachment_version integer, location_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid := private.current_user_organization_id();
  target_attachment public.document_attachments%rowtype;
  target_location public.attachment_locations%rowtype;
  next_attachment_version integer;
  next_location_version integer;
begin
  if target_organization_id is null or not private.has_permission('files.manage') then
    raise exception using errcode = '42501', message = 'Missing files.manage permission.';
  end if;
  if p_file_size is null or p_file_size <= 0 or p_file_size > 20971520 then
    raise exception using errcode = '22023', message = 'Invalid file size.';
  end if;
  if p_checksum is null or p_checksum !~ '^[A-Fa-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid checksum.';
  end if;

  select attachment.*
    into target_attachment
  from public.document_attachments attachment
  where attachment.id = p_attachment_id
    and attachment.organization_id = target_organization_id
    and attachment.deleted_at is null
  for update;

  select location.*
    into target_location
  from public.attachment_locations location
  where location.id = p_location_id
    and location.attachment_id = p_attachment_id
    and location.organization_id = target_organization_id
    and location.storage_type = 'supabase_storage'
    and location.deleted_at is null
  for update;

  if target_attachment.id is null or target_location.id is null then
    raise exception using errcode = '42501', message = 'Upload is unavailable to the current organization.';
  end if;

  if target_location.status = 'active'
    and target_location.checksum = lower(p_checksum)
    and target_location.file_size = p_file_size then
    return query select target_attachment.version, target_location.version;
    return;
  end if;
  if target_location.status <> 'uploading' then
    raise exception using errcode = '40001', message = 'Upload is not awaiting finalization.';
  end if;
  if target_attachment.file_size is distinct from p_file_size
    or lower(target_attachment.mime_type) is distinct from lower(btrim(p_mime_type)) then
    raise exception using errcode = '22023', message = 'Uploaded object metadata does not match the request.';
  end if;

  update public.document_attachments attachment
  set
    mime_type = lower(btrim(p_mime_type)),
    file_size = p_file_size,
    checksum = lower(p_checksum),
    status = 'active'
  where attachment.id = p_attachment_id
  returning attachment.version into next_attachment_version;

  update public.attachment_locations location
  set
    mime_type = lower(btrim(p_mime_type)),
    file_size = p_file_size,
    checksum = lower(p_checksum),
    status = 'active'
  where location.id = p_location_id
  returning location.version into next_location_version;

  insert into public.file_access_log (
    organization_id,
    attachment_id,
    location_id,
    user_id,
    action,
    context
  ) values (
    target_organization_id,
    p_attachment_id,
    p_location_id,
    auth.uid(),
    'upload',
    jsonb_build_object('source', 'document-files', 'storage_type', 'supabase_storage')
  );

  return query select next_attachment_version, next_location_version;
end;
$$;

create or replace function public.fail_document_upload(
  p_attachment_id uuid,
  p_location_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid := private.current_user_organization_id();
begin
  if target_organization_id is null or not private.has_permission('files.manage') then
    raise exception using errcode = '42501', message = 'Missing files.manage permission.';
  end if;

  update public.attachment_locations location
  set status = 'failed'
  where location.id = p_location_id
    and location.attachment_id = p_attachment_id
    and location.organization_id = target_organization_id
    and location.status in ('uploading', 'inactive');

  update public.document_attachments attachment
  set status = 'inactive'
  where attachment.id = p_attachment_id
    and attachment.organization_id = target_organization_id
    and attachment.status <> 'inactive';
end;
$$;

create or replace function public.log_attachment_location_event(
  p_location_id uuid,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid := private.current_user_organization_id();
  target_attachment_id uuid;
  target_storage_type text;
  required_permission text;
  created_log_id uuid;
begin
  required_permission := case
    when p_action in ('view', 'download') then 'files.read'
    when p_action in ('upload', 'remove_location') then 'files.manage'
    else null
  end;
  if required_permission is null then
    raise exception using errcode = '22023', message = 'Unsupported file location action.';
  end if;
  if target_organization_id is null or not private.has_permission(required_permission) then
    raise exception using errcode = '42501', message = 'Missing file permission.';
  end if;

  select location.attachment_id, location.storage_type
    into target_attachment_id, target_storage_type
  from public.attachment_locations location
  join public.document_attachments attachment
    on attachment.organization_id = location.organization_id
   and attachment.id = location.attachment_id
  where location.id = p_location_id
    and location.organization_id = target_organization_id
    and location.status = 'active'
    and location.deleted_at is null
    and attachment.status = 'active'
    and attachment.deleted_at is null;

  if target_attachment_id is null then
    raise exception using errcode = '42501', message = 'File location is unavailable to the current organization.';
  end if;

  insert into public.file_access_log (
    organization_id,
    attachment_id,
    location_id,
    user_id,
    action,
    context
  ) values (
    target_organization_id,
    target_attachment_id,
    p_location_id,
    auth.uid(),
    p_action,
    jsonb_build_object('source', 'document-files', 'storage_type', target_storage_type)
  ) returning id into created_log_id;

  return created_log_id;
end;
$$;

create or replace function public.begin_remove_attachment_location(
  p_location_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid := private.current_user_organization_id();
  next_version integer;
begin
  if target_organization_id is null or not private.has_permission('files.manage') then
    raise exception using errcode = '42501', message = 'Missing files.manage permission.';
  end if;

  update public.attachment_locations location
  set status = 'removing'
  where location.id = p_location_id
    and location.organization_id = target_organization_id
    and location.storage_type = 'supabase_storage'
    and location.status = 'active'
    and location.version = p_expected_version
    and location.deleted_at is null
  returning location.version into next_version;

  if next_version is null then
    raise exception using errcode = '40001', message = 'File location is unavailable or was changed.';
  end if;
  return next_version;
end;
$$;

create or replace function public.cancel_remove_attachment_location(
  p_location_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid := private.current_user_organization_id();
  next_version integer;
begin
  if target_organization_id is null or not private.has_permission('files.manage') then
    raise exception using errcode = '42501', message = 'Missing files.manage permission.';
  end if;

  update public.attachment_locations location
  set status = 'active'
  where location.id = p_location_id
    and location.organization_id = target_organization_id
    and location.status = 'removing'
    and location.version = p_expected_version
  returning location.version into next_version;

  if next_version is null then
    raise exception using errcode = '40001', message = 'File location removal could not be cancelled.';
  end if;
  return next_version;
end;
$$;

create or replace function public.finalize_remove_attachment_location(
  p_location_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid := private.current_user_organization_id();
  target_attachment_id uuid;
  next_version integer;
begin
  if target_organization_id is null or not private.has_permission('files.manage') then
    raise exception using errcode = '42501', message = 'Missing files.manage permission.';
  end if;

  update public.attachment_locations location
  set status = 'inactive'
  where location.id = p_location_id
    and location.organization_id = target_organization_id
    and location.status = 'removing'
    and location.version = p_expected_version
  returning location.attachment_id, location.version into target_attachment_id, next_version;

  if next_version is null then
    raise exception using errcode = '40001', message = 'File location is unavailable or was changed.';
  end if;

  if not exists (
    select 1
    from public.attachment_locations location
    where location.attachment_id = target_attachment_id
      and location.organization_id = target_organization_id
      and location.status = 'active'
      and location.deleted_at is null
  ) then
    update public.document_attachments attachment
    set status = 'inactive'
    where attachment.id = target_attachment_id
      and attachment.organization_id = target_organization_id;
  end if;

  insert into public.file_access_log (
    organization_id,
    attachment_id,
    location_id,
    user_id,
    action,
    context
  ) values (
    target_organization_id,
    target_attachment_id,
    p_location_id,
    auth.uid(),
    'remove_location',
    jsonb_build_object('source', 'document-files', 'storage_type', 'supabase_storage')
  );

  return next_version;
end;
$$;

create or replace function public.fail_remove_attachment_location(
  p_location_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid := private.current_user_organization_id();
  target_attachment_id uuid;
  next_version integer;
begin
  if target_organization_id is null or not private.has_permission('files.manage') then
    raise exception using errcode = '42501', message = 'Missing files.manage permission.';
  end if;

  update public.attachment_locations location
  set status = 'failed'
  where location.id = p_location_id
    and location.organization_id = target_organization_id
    and location.status = 'removing'
    and location.version = p_expected_version
  returning location.attachment_id, location.version into target_attachment_id, next_version;

  if next_version is null then
    raise exception using errcode = '40001', message = 'File location failure could not be recorded.';
  end if;

  if not exists (
    select 1
    from public.attachment_locations location
    where location.attachment_id = target_attachment_id
      and location.organization_id = target_organization_id
      and location.status = 'active'
      and location.deleted_at is null
  ) then
    update public.document_attachments attachment
    set status = 'inactive'
    where attachment.id = target_attachment_id
      and attachment.organization_id = target_organization_id;
  end if;
  return next_version;
end;
$$;

create or replace function private.redact_audit_payload(table_name text, payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  redacted jsonb;
begin
  redacted := payload - array['updated_at', 'updated_by', 'version', 'notes'];

  case table_name
    when 'organizations' then
      redacted := redacted - array['cnpj', 'phone', 'email', 'address', 'postal_code', 'logo_path'];
    when 'profiles' then
      redacted := redacted - array['full_name'];
    when 'owners' then
      redacted := redacted - array['document_number', 'phone', 'email', 'notes'];
    when 'document_attachments' then
      redacted := redacted - array['file_name', 'file_path', 'checksum'];
    when 'attachment_locations' then
      redacted := redacted - array['object_key', 'external_reference', 'checksum'];
    when 'car_records' then
      redacted := redacted - array['declared_owner_name', 'receipt_number'];
    when 'rural_documents' then
      redacted := redacted - array['document_number'];
    else
      null;
  end case;

  return redacted;
end;
$$;

create trigger attachment_locations_audit_log
after insert or update or delete on public.attachment_locations
for each row execute function private.write_audit_log();

revoke all on function public.begin_document_upload(uuid, text, text, bigint) from public;
revoke all on function public.finalize_document_upload(uuid, uuid, text, bigint, text) from public;
revoke all on function public.fail_document_upload(uuid, uuid) from public;
revoke all on function public.log_attachment_location_event(uuid, text) from public;
revoke all on function public.begin_remove_attachment_location(uuid, integer) from public;
revoke all on function public.cancel_remove_attachment_location(uuid, integer) from public;
revoke all on function public.finalize_remove_attachment_location(uuid, integer) from public;
revoke all on function public.fail_remove_attachment_location(uuid, integer) from public;

grant execute on function public.begin_document_upload(uuid, text, text, bigint) to authenticated;
grant execute on function public.finalize_document_upload(uuid, uuid, text, bigint, text) to authenticated;
grant execute on function public.fail_document_upload(uuid, uuid) to authenticated;
grant execute on function public.log_attachment_location_event(uuid, text) to authenticated;
grant execute on function public.begin_remove_attachment_location(uuid, integer) to authenticated;
grant execute on function public.cancel_remove_attachment_location(uuid, integer) to authenticated;
grant execute on function public.finalize_remove_attachment_location(uuid, integer) to authenticated;
grant execute on function public.fail_remove_attachment_location(uuid, integer) to authenticated;
