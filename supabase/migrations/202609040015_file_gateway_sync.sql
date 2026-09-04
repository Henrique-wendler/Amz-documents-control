-- Hybrid document storage, phase B: outbound-only Cloud -> internal gateway synchronization.

create table public.file_gateway_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> '' and char_length(name) <= 160),
  token_hash text not null check (token_hash ~ '^[A-Fa-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create index file_gateway_instances_organization_id_idx on public.file_gateway_instances (organization_id);
create unique index file_gateway_instances_token_hash_idx on public.file_gateway_instances (token_hash);

create trigger file_gateway_instances_touch_updated_at
before update on public.file_gateway_instances
for each row execute function private.touch_updated_at();

alter table public.file_gateway_instances enable row level security;
revoke all on public.file_gateway_instances from anon, authenticated;

alter table public.attachment_locations
  add column source_location_id uuid,
  add column sync_status text check (sync_status in ('pending', 'syncing', 'synced', 'failed')),
  add column sync_attempt_count integer not null default 0 check (sync_attempt_count >= 0),
  add column sync_last_attempt_at timestamptz,
  add column sync_next_attempt_at timestamptz,
  add column synced_at timestamptz,
  add column sync_error_code text,
  add column sync_claimed_by uuid references public.file_gateway_instances(id) on delete set null,
  add column sync_lease_until timestamptz,
  add constraint attachment_locations_source_fk foreign key (organization_id, source_location_id) references public.attachment_locations(organization_id, id) on delete restrict,
  add constraint attachment_locations_sync_state_check check (
    (sync_status = 'syncing' and sync_claimed_by is not null and sync_lease_until is not null)
    or (sync_status is distinct from 'syncing' and sync_lease_until is null)
  );

create unique index attachment_locations_source_storage_idx
on public.attachment_locations (source_location_id, storage_type)
where source_location_id is not null and deleted_at is null;

create index attachment_locations_sync_queue_idx
on public.attachment_locations (organization_id, sync_status, sync_next_attempt_at, sync_lease_until)
where storage_type = 'supabase_storage' and status = 'active' and deleted_at is null;

create or replace function private.prepare_attachment_location_sync_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.storage_type = 'supabase_storage'
    and new.status = 'active'
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or new.sync_status is null
    ) then
    new.sync_status := 'pending';
    new.sync_claimed_by := null;
    new.sync_lease_until := null;
    new.sync_next_attempt_at := null;
    new.sync_error_code := null;
  end if;
  return new;
end;
$$;

create trigger attachment_locations_prepare_sync_state
before insert or update on public.attachment_locations
for each row execute function private.prepare_attachment_location_sync_state();

update public.attachment_locations
set sync_status = 'pending'
where storage_type = 'supabase_storage'
  and status = 'active'
  and deleted_at is null
  and sync_status is null;

alter table public.file_access_log
  drop constraint file_access_log_action_check,
  add constraint file_access_log_action_check check (
    action in (
      'view', 'download', 'copy_reference', 'upload', 'remove_location',
      'FILE_SYNC_STARTED', 'FILE_SYNCED', 'FILE_SYNC_FAILED'
    )
  );

create or replace function public.claim_file_sync_candidates(
  p_gateway_id uuid,
  p_limit integer default 20,
  p_lease_seconds integer default 300,
  p_max_attempts integer default 10
)
returns table (
  cloud_location_id uuid,
  attachment_id uuid,
  document_id uuid,
  organization_id uuid,
  bucket_id text,
  object_key text,
  mime_type text,
  file_size bigint,
  checksum text,
  location_version integer,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
begin
  if p_limit < 1 or p_limit > 100
    or p_lease_seconds < 30 or p_lease_seconds > 3600
    or p_max_attempts < 1 or p_max_attempts > 100 then
    raise exception using errcode = '22023', message = 'Invalid gateway claim parameters.';
  end if;

  select gateway.organization_id
    into target_organization_id
  from public.file_gateway_instances gateway
  join public.organizations organization on organization.id = gateway.organization_id
  where gateway.id = p_gateway_id
    and gateway.status = 'active'
    and organization.status = 'active'
    and organization.deleted_at is null
  for update of gateway;
  if target_organization_id is null then
    raise exception using errcode = '42501', message = 'Gateway is not active.';
  end if;

  update public.file_gateway_instances
  set last_seen_at = now()
  where id = p_gateway_id;

  return query
  with candidates as (
    select location.id
    from public.attachment_locations location
    join public.document_attachments attachment
      on attachment.organization_id = location.organization_id
     and attachment.id = location.attachment_id
    join public.rural_documents document
      on document.organization_id = attachment.organization_id
     and document.id = attachment.document_id
    where location.organization_id = target_organization_id
      and location.storage_type = 'supabase_storage'
      and location.status = 'active'
      and location.deleted_at is null
      and location.bucket_id = 'rural-documents'
      and location.object_key is not null
      and location.checksum is not null
      and location.mime_type is not null
      and location.file_size is not null
      and attachment.status = 'active'
      and attachment.deleted_at is null
      and document.status = 'active'
      and document.deleted_at is null
      and location.sync_attempt_count < p_max_attempts
      and (location.sync_next_attempt_at is null or location.sync_next_attempt_at <= now())
      and (
        location.sync_status in ('pending', 'failed')
        or (location.sync_status = 'syncing' and location.sync_lease_until < now())
      )
      and not exists (
        select 1
        from public.attachment_locations local_location
        where local_location.source_location_id = location.id
          and local_location.storage_type = 'network_share'
          and local_location.status = 'active'
          and local_location.deleted_at is null
      )
    order by location.sync_last_attempt_at nulls first, location.created_at
    for update of location skip locked
    limit p_limit
  ), updated as (
    update public.attachment_locations location
    set
      sync_status = 'syncing',
      sync_attempt_count = location.sync_attempt_count + 1,
      sync_last_attempt_at = now(),
      sync_next_attempt_at = null,
      sync_error_code = null,
      sync_claimed_by = p_gateway_id,
      sync_lease_until = now() + make_interval(secs => p_lease_seconds)
    from candidates
    where location.id = candidates.id
    returning location.*
  ), logged as (
    insert into public.file_access_log (
      organization_id,
      attachment_id,
      location_id,
      user_id,
      action,
      context
    )
    select
      updated.organization_id,
      updated.attachment_id,
      updated.id,
      null,
      'FILE_SYNC_STARTED',
      jsonb_build_object('source', 'file-gateway', 'gateway_id', p_gateway_id, 'attempt', updated.sync_attempt_count)
    from updated
  )
  select
    updated.id,
    updated.attachment_id,
    attachment.document_id,
    updated.organization_id,
    updated.bucket_id,
    updated.object_key,
    updated.mime_type,
    updated.file_size,
    lower(updated.checksum),
    updated.version,
    updated.sync_attempt_count
  from updated
  join public.document_attachments attachment
    on attachment.organization_id = updated.organization_id
   and attachment.id = updated.attachment_id;
end;
$$;

create or replace function public.complete_file_sync(
  p_gateway_id uuid,
  p_cloud_location_id uuid,
  p_relative_path text,
  p_mime_type text,
  p_file_size bigint,
  p_checksum text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  cloud_location public.attachment_locations%rowtype;
  target_attachment public.document_attachments%rowtype;
  network_location public.attachment_locations%rowtype;
  expected_relative_path text;
begin
  select gateway.organization_id
    into target_organization_id
  from public.file_gateway_instances gateway
  where gateway.id = p_gateway_id and gateway.status = 'active';
  if target_organization_id is null then
    raise exception using errcode = '42501', message = 'Gateway is not active.';
  end if;

  select location.*
    into cloud_location
  from public.attachment_locations location
  where location.id = p_cloud_location_id
    and location.organization_id = target_organization_id
    and location.storage_type = 'supabase_storage'
    and location.status = 'active'
    and location.deleted_at is null
    and (
      (location.sync_status = 'syncing' and location.sync_claimed_by = p_gateway_id and location.sync_lease_until >= now())
      or location.sync_status = 'synced'
    )
  for update;
  if cloud_location.id is null then
    raise exception using errcode = '42501', message = 'Cloud location is outside the gateway scope.';
  end if;

  select attachment.*
    into target_attachment
  from public.document_attachments attachment
  where attachment.id = cloud_location.attachment_id
    and attachment.organization_id = target_organization_id
    and attachment.status = 'active'
    and attachment.deleted_at is null
  for update;
  if target_attachment.id is null then
    raise exception using errcode = '42501', message = 'Attachment is unavailable.';
  end if;

  expected_relative_path := concat(
    target_organization_id::text, '/',
    target_attachment.document_id::text, '/',
    target_attachment.id::text, '/',
    regexp_replace(cloud_location.object_key, '^.*/', '')
  );
  if p_relative_path is null
    or p_relative_path <> expected_relative_path
    or p_relative_path ~ '(^|/)\.\.(/|$)'
    or p_relative_path ~ '^[\\/]'
    or p_relative_path ~ '^[A-Za-z]:' then
    raise exception using errcode = '22023', message = 'Invalid relative path.';
  end if;
  if p_checksum is null or lower(p_checksum) <> lower(cloud_location.checksum)
    or p_file_size is distinct from cloud_location.file_size
    or lower(p_mime_type) is distinct from lower(cloud_location.mime_type) then
    raise exception using errcode = '22023', message = 'Synchronized file metadata does not match the cloud location.';
  end if;

  select location.*
    into network_location
  from public.attachment_locations location
  where location.source_location_id = cloud_location.id
    and location.storage_type = 'network_share'
    and location.deleted_at is null
  for update;

  if network_location.id is not null then
    if network_location.external_reference is distinct from p_relative_path
      or lower(network_location.checksum) is distinct from lower(p_checksum)
      or network_location.file_size is distinct from p_file_size then
      raise exception using errcode = '23505', message = 'Existing synchronized location conflicts with the completed file.';
    end if;
    if cloud_location.sync_status = 'synced' and network_location.status = 'active' then
      return network_location.id;
    end if;
    update public.attachment_locations
    set status = 'active', synced_at = now(), sync_status = 'synced', sync_error_code = null
    where id = network_location.id;
  else
    insert into public.attachment_locations (
      organization_id,
      attachment_id,
      source_location_id,
      storage_type,
      external_reference,
      is_primary,
      mime_type,
      file_size,
      checksum,
      status,
      sync_status,
      synced_at
    ) values (
      target_organization_id,
      target_attachment.id,
      cloud_location.id,
      'network_share',
      p_relative_path,
      false,
      lower(p_mime_type),
      p_file_size,
      lower(p_checksum),
      'active',
      'synced',
      now()
    ) returning * into network_location;
  end if;

  update public.attachment_locations
  set
    sync_status = 'synced',
    synced_at = now(),
    sync_error_code = null,
    sync_next_attempt_at = null,
    sync_claimed_by = null,
    sync_lease_until = null
  where id = cloud_location.id;

  insert into public.file_access_log (
    organization_id,
    attachment_id,
    location_id,
    user_id,
    action,
    context
  ) values (
    target_organization_id,
    target_attachment.id,
    cloud_location.id,
    null,
    'FILE_SYNCED',
    jsonb_build_object('source', 'file-gateway', 'gateway_id', p_gateway_id, 'network_location_id', network_location.id)
  );
  return network_location.id;
end;
$$;

create or replace function public.fail_file_sync(
  p_gateway_id uuid,
  p_cloud_location_id uuid,
  p_error_code text,
  p_retry_after_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  target_attachment_id uuid;
begin
  if p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception using errcode = '22023', message = 'Invalid sync error code.';
  end if;
  if p_retry_after_seconds < 5 or p_retry_after_seconds > 86400 then
    raise exception using errcode = '22023', message = 'Invalid retry delay.';
  end if;
  select gateway.organization_id
    into target_organization_id
  from public.file_gateway_instances gateway
  where gateway.id = p_gateway_id and gateway.status = 'active';
  if target_organization_id is null then
    raise exception using errcode = '42501', message = 'Gateway is not active.';
  end if;

  update public.attachment_locations location
  set
    sync_status = 'failed',
    sync_error_code = p_error_code,
    sync_next_attempt_at = now() + make_interval(secs => p_retry_after_seconds),
    sync_claimed_by = null,
    sync_lease_until = null
  where location.id = p_cloud_location_id
    and location.organization_id = target_organization_id
    and location.storage_type = 'supabase_storage'
    and location.status = 'active'
    and location.sync_status = 'syncing'
    and location.sync_claimed_by = p_gateway_id
  returning location.attachment_id into target_attachment_id;

  if target_attachment_id is null then
    raise exception using errcode = '42501', message = 'Sync claim is outside the gateway scope.';
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
    p_cloud_location_id,
    null,
    'FILE_SYNC_FAILED',
    jsonb_build_object('source', 'file-gateway', 'gateway_id', p_gateway_id, 'error_code', p_error_code)
  );
end;
$$;

revoke all on function public.claim_file_sync_candidates(uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_file_sync(uuid, uuid, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.fail_file_sync(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_file_sync_candidates(uuid, integer, integer, integer) to service_role;
grant execute on function public.complete_file_sync(uuid, uuid, text, text, bigint, text) to service_role;
grant execute on function public.fail_file_sync(uuid, uuid, text, integer) to service_role;
