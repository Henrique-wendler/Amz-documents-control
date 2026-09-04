-- Hybrid document storage, phase C: authorized on-demand local -> private Cloud copies.

create table public.remote_copy_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  attachment_id uuid not null,
  source_location_id uuid not null,
  target_location_id uuid,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  claimed_by uuid,
  lease_until timestamptz,
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,64}$'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remote_copy_jobs_organization_fk foreign key (organization_id) references public.organizations(id) on delete restrict,
  constraint remote_copy_jobs_attachment_fk foreign key (organization_id, attachment_id) references public.document_attachments(organization_id, id) on delete restrict,
  constraint remote_copy_jobs_source_location_fk foreign key (organization_id, source_location_id) references public.attachment_locations(organization_id, id) on delete restrict,
  constraint remote_copy_jobs_target_location_fk foreign key (organization_id, target_location_id) references public.attachment_locations(organization_id, id) on delete restrict,
  constraint remote_copy_jobs_gateway_fk foreign key (organization_id, claimed_by) references public.file_gateway_instances(organization_id, id) on delete restrict,
  constraint remote_copy_jobs_processing_check check (
    (status = 'processing' and claimed_by is not null and lease_until is not null)
    or (status <> 'processing' and claimed_by is null and lease_until is null)
  ),
  constraint remote_copy_jobs_completed_check check (
    (status = 'completed' and target_location_id is not null and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  unique (organization_id, id)
);

create unique index remote_copy_jobs_active_source_idx
on public.remote_copy_jobs (organization_id, source_location_id)
where status in ('pending', 'processing');

create index remote_copy_jobs_claim_idx
on public.remote_copy_jobs (organization_id, status, next_attempt_at, lease_until, created_at);

create index remote_copy_jobs_attachment_idx
on public.remote_copy_jobs (attachment_id, created_at desc);

create trigger remote_copy_jobs_touch_updated_at
before update on public.remote_copy_jobs
for each row execute function private.touch_updated_at();

create trigger remote_copy_jobs_audit_log
after insert or update or delete on public.remote_copy_jobs
for each row execute function private.write_audit_log();

alter table public.remote_copy_jobs enable row level security;
revoke all on public.remote_copy_jobs from anon, authenticated;
grant select on public.remote_copy_jobs to authenticated;

create policy remote_copy_jobs_select
on public.remote_copy_jobs for select to authenticated
using (
  private.same_organization(organization_id)
  and (private.has_permission('files.read') or private.has_permission('files.manage'))
);

alter table public.file_access_log
  drop constraint file_access_log_action_check,
  add constraint file_access_log_action_check check (
    action in (
      'view', 'download', 'copy_reference', 'upload', 'remove_location',
      'FILE_SYNC_STARTED', 'FILE_SYNCED', 'FILE_SYNC_FAILED',
      'REMOTE_COPY_REQUESTED', 'REMOTE_COPY_STARTED', 'REMOTE_COPY_COMPLETED', 'REMOTE_COPY_FAILED'
    )
  );

create or replace function private.prepare_attachment_location_sync_state()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_is_network boolean := false;
begin
  if new.storage_type = 'supabase_storage'
    and new.status = 'active'
    and new.source_location_id is not null then
    select exists (
      select 1
      from public.attachment_locations source
      where source.id = new.source_location_id
        and source.organization_id = new.organization_id
        and source.attachment_id = new.attachment_id
        and source.storage_type = 'network_share'
        and source.status = 'active'
        and source.deleted_at is null
    ) into source_is_network;
  end if;

  if new.storage_type = 'supabase_storage'
    and new.status = 'active'
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or new.sync_status is null
    ) then
    new.sync_status := case when source_is_network then 'synced' else 'pending' end;
    new.synced_at := case when source_is_network then coalesce(new.synced_at, now()) else new.synced_at end;
    new.sync_claimed_by := null;
    new.sync_lease_until := null;
    new.sync_next_attempt_at := null;
    new.sync_error_code := null;
  end if;
  return new;
end;
$$;

create or replace function public.request_attachment_remote_copy(
  p_attachment_id uuid,
  p_source_location_id uuid
)
returns public.remote_copy_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid := private.current_user_organization_id();
  source_location public.attachment_locations%rowtype;
  existing_job public.remote_copy_jobs%rowtype;
  created_job public.remote_copy_jobs;
begin
  if auth.uid() is null or target_organization_id is null or not private.has_permission('files.manage') then
    raise exception using errcode = '42501', message = 'Missing files.manage permission.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_source_location_id::text, 0));

  select location.*
    into source_location
  from public.attachment_locations location
  join public.document_attachments attachment
    on attachment.organization_id = location.organization_id
   and attachment.id = location.attachment_id
  join public.rural_documents document
    on document.organization_id = attachment.organization_id
   and document.id = attachment.document_id
  where location.id = p_source_location_id
    and location.attachment_id = p_attachment_id
    and location.organization_id = target_organization_id
    and location.storage_type = 'network_share'
    and location.status = 'active'
    and location.deleted_at is null
    and attachment.status = 'active'
    and attachment.deleted_at is null
    and document.status = 'active'
    and document.deleted_at is null
  for update of location;

  if source_location.id is null then
    raise exception using errcode = '42501', message = 'Network file is unavailable to the current organization.';
  end if;

  select job.*
    into existing_job
  from public.remote_copy_jobs job
  where job.organization_id = target_organization_id
    and job.source_location_id = source_location.id
    and job.status in ('pending', 'processing')
  order by job.created_at desc
  limit 1
  for update;
  if existing_job.id is not null then
    return existing_job;
  end if;

  select job.*
    into existing_job
  from public.remote_copy_jobs job
  join public.attachment_locations target
    on target.organization_id = job.organization_id
   and target.id = job.target_location_id
  where job.organization_id = target_organization_id
    and job.source_location_id = source_location.id
    and job.status = 'completed'
    and target.storage_type = 'supabase_storage'
    and target.status = 'active'
    and target.deleted_at is null
    and source_location.checksum is not null
    and lower(target.checksum) = lower(source_location.checksum)
  order by job.completed_at desc
  limit 1;
  if existing_job.id is not null then
    return existing_job;
  end if;

  insert into public.remote_copy_jobs (
    organization_id,
    attachment_id,
    source_location_id,
    requested_by
  ) values (
    target_organization_id,
    p_attachment_id,
    p_source_location_id,
    auth.uid()
  ) returning * into created_job;

  insert into public.file_access_log (
    organization_id, attachment_id, location_id, user_id, action, context
  ) values (
    target_organization_id,
    p_attachment_id,
    p_source_location_id,
    auth.uid(),
    'REMOTE_COPY_REQUESTED',
    jsonb_build_object('source', 'frontend', 'job_id', created_job.id)
  );

  return created_job;
end;
$$;

create or replace function public.claim_remote_copy_jobs(
  p_gateway_id uuid,
  p_limit integer default 20,
  p_lease_seconds integer default 300,
  p_max_attempts integer default 10
)
returns table (
  job_id uuid,
  source_location_id uuid,
  attachment_id uuid,
  document_id uuid,
  organization_id uuid,
  source_reference text,
  file_name text,
  expected_mime_type text,
  expected_file_size bigint,
  expected_checksum text,
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
    raise exception using errcode = '22023', message = 'Invalid remote-copy claim parameters.';
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

  update public.file_gateway_instances set last_seen_at = now() where id = p_gateway_id;

  return query
  with candidates as (
    select job.id
    from public.remote_copy_jobs job
    join public.attachment_locations source
      on source.organization_id = job.organization_id
     and source.id = job.source_location_id
    join public.document_attachments attachment
      on attachment.organization_id = job.organization_id
     and attachment.id = job.attachment_id
    join public.rural_documents document
      on document.organization_id = attachment.organization_id
     and document.id = attachment.document_id
    where job.organization_id = target_organization_id
      and job.attempt_count < p_max_attempts
      and (job.next_attempt_at is null or job.next_attempt_at <= now())
      and (
        job.status in ('pending', 'failed')
        or (job.status = 'processing' and job.lease_until < now())
      )
      and source.storage_type = 'network_share'
      and source.status = 'active'
      and source.deleted_at is null
      and attachment.status = 'active'
      and attachment.deleted_at is null
      and document.status = 'active'
      and document.deleted_at is null
    order by job.next_attempt_at nulls first, job.created_at
    for update of job skip locked
    limit p_limit
  ), updated as (
    update public.remote_copy_jobs job
    set
      status = 'processing',
      attempt_count = job.attempt_count + 1,
      next_attempt_at = null,
      claimed_by = p_gateway_id,
      lease_until = now() + make_interval(secs => p_lease_seconds),
      error_code = null
    from candidates
    where job.id = candidates.id
    returning job.*
  ), logged as (
    insert into public.file_access_log (
      organization_id, attachment_id, location_id, user_id, action, context
    )
    select
      updated.organization_id,
      updated.attachment_id,
      updated.source_location_id,
      updated.requested_by,
      'REMOTE_COPY_STARTED',
      jsonb_build_object('source', 'file-gateway', 'gateway_id', p_gateway_id, 'job_id', updated.id, 'attempt', updated.attempt_count)
    from updated
  )
  select
    updated.id,
    source.id,
    attachment.id,
    attachment.document_id,
    updated.organization_id,
    source.external_reference,
    attachment.file_name,
    coalesce(source.mime_type, attachment.mime_type),
    coalesce(source.file_size, attachment.file_size),
    coalesce(source.checksum, attachment.checksum),
    updated.attempt_count
  from updated
  join public.attachment_locations source
    on source.organization_id = updated.organization_id
   and source.id = updated.source_location_id
  join public.document_attachments attachment
    on attachment.organization_id = updated.organization_id
   and attachment.id = updated.attachment_id;
end;
$$;

create or replace function public.prepare_remote_copy_upload(
  p_gateway_id uuid,
  p_job_id uuid,
  p_mime_type text,
  p_file_size bigint,
  p_checksum text
)
returns table (
  job_status text,
  cloud_location_id uuid,
  bucket_id text,
  object_key text,
  mime_type text,
  file_size bigint,
  checksum text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  target_job public.remote_copy_jobs%rowtype;
  source_location public.attachment_locations%rowtype;
  target_attachment public.document_attachments%rowtype;
  target_document_id uuid;
  cloud_location public.attachment_locations%rowtype;
  normalized_mime_type text := lower(btrim(p_mime_type));
  normalized_checksum text := lower(p_checksum);
  target_bucket_id text := 'rural-documents';
  target_object_key text;
begin
  if normalized_mime_type = '' or char_length(normalized_mime_type) > 255
    or p_file_size is null or p_file_size <= 0 or p_file_size > 20971520
    or normalized_checksum !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid local file metadata.';
  end if;

  select gateway.organization_id
    into target_organization_id
  from public.file_gateway_instances gateway
  where gateway.id = p_gateway_id and gateway.status = 'active';
  if target_organization_id is null then
    raise exception using errcode = '42501', message = 'Gateway is not active.';
  end if;

  select job.*
    into target_job
  from public.remote_copy_jobs job
  where job.id = p_job_id
    and job.organization_id = target_organization_id
  for update;
  if target_job.id is null then
    raise exception using errcode = '42501', message = 'Remote-copy job is outside the gateway scope.';
  end if;
  if target_job.status = 'completed' then
    return query
    select
      'completed'::text,
      target_job.target_location_id,
      location.bucket_id,
      location.object_key,
      location.mime_type,
      location.file_size,
      lower(location.checksum)
    from public.attachment_locations location
    where location.id = target_job.target_location_id
      and location.organization_id = target_organization_id;
    return;
  end if;
  if target_job.status <> 'processing'
    or target_job.claimed_by <> p_gateway_id
    or target_job.lease_until < now() then
    raise exception using errcode = '42501', message = 'Remote-copy job is not leased by this gateway.';
  end if;

  select source.*
    into source_location
  from public.attachment_locations source
  where source.id = target_job.source_location_id
    and source.organization_id = target_organization_id
    and source.attachment_id = target_job.attachment_id
    and source.storage_type = 'network_share'
    and source.status = 'active'
    and source.deleted_at is null
  for update;

  select attachment.*
    into target_attachment
  from public.document_attachments attachment
  join public.rural_documents document
    on document.organization_id = attachment.organization_id
   and document.id = attachment.document_id
  where attachment.id = target_job.attachment_id
    and attachment.organization_id = target_organization_id
    and attachment.status = 'active'
    and attachment.deleted_at is null
    and document.status = 'active'
    and document.deleted_at is null
  for update of attachment, document;

  if source_location.id is null or target_attachment.id is null then
    raise exception using errcode = '42501', message = 'Remote-copy source is unavailable.';
  end if;
  target_document_id := target_attachment.document_id;
  if (source_location.checksum is not null and lower(source_location.checksum) <> normalized_checksum)
    or (target_attachment.checksum is not null and lower(target_attachment.checksum) <> normalized_checksum)
    or (source_location.file_size is not null and source_location.file_size <> p_file_size)
    or (target_attachment.file_size is not null and target_attachment.file_size <> p_file_size)
    or (source_location.mime_type is not null and lower(source_location.mime_type) <> normalized_mime_type)
    or (target_attachment.mime_type is not null and lower(target_attachment.mime_type) <> normalized_mime_type) then
    raise exception using errcode = '22023', message = 'Local file metadata conflicts with the persisted reference.';
  end if;

  update public.attachment_locations
  set checksum = normalized_checksum, file_size = p_file_size, mime_type = normalized_mime_type
  where id = source_location.id;
  update public.document_attachments attachment_to_update
  set
    checksum = coalesce(attachment_to_update.checksum, normalized_checksum),
    file_size = coalesce(attachment_to_update.file_size, p_file_size),
    mime_type = coalesce(attachment_to_update.mime_type, normalized_mime_type)
  where attachment_to_update.id = target_attachment.id;

  select location.*
    into cloud_location
  from public.attachment_locations location
  where location.organization_id = target_organization_id
    and location.attachment_id = target_attachment.id
    and location.storage_type = 'supabase_storage'
    and location.status = 'active'
    and location.deleted_at is null
  order by location.created_at
  limit 1
  for update;

  if cloud_location.id is not null then
    if lower(cloud_location.checksum) is distinct from normalized_checksum
      or cloud_location.file_size is distinct from p_file_size
      or lower(cloud_location.mime_type) is distinct from normalized_mime_type then
      raise exception using errcode = '23505', message = 'Existing Cloud location conflicts with the local file.';
    end if;
    update public.remote_copy_jobs
    set target_location_id = cloud_location.id
    where id = target_job.id;
    return query select 'existing'::text, cloud_location.id, cloud_location.bucket_id, cloud_location.object_key, cloud_location.mime_type, cloud_location.file_size, lower(cloud_location.checksum);
    return;
  end if;

  select location.*
    into cloud_location
  from public.attachment_locations location
  where location.organization_id = target_organization_id
    and location.attachment_id = target_attachment.id
    and location.source_location_id = source_location.id
    and location.storage_type = 'supabase_storage'
    and location.status in ('uploading', 'failed')
    and location.deleted_at is null
  order by location.created_at desc
  limit 1
  for update;

  target_object_key := concat(
    target_organization_id::text, '/',
    target_document_id::text, '/',
    target_attachment.id::text, '/',
    target_job.id::text
  );

  if cloud_location.id is null then
    insert into public.attachment_locations (
      organization_id, attachment_id, source_location_id, storage_type,
      bucket_id, object_key, is_primary, mime_type, file_size, checksum, status
    ) values (
      target_organization_id, target_attachment.id, source_location.id, 'supabase_storage',
      target_bucket_id, target_object_key, false, normalized_mime_type, p_file_size, normalized_checksum, 'uploading'
    ) returning * into cloud_location;
  else
    if cloud_location.object_key <> target_object_key
      or lower(cloud_location.checksum) is distinct from normalized_checksum
      or cloud_location.file_size is distinct from p_file_size
      or lower(cloud_location.mime_type) is distinct from normalized_mime_type then
      raise exception using errcode = '23505', message = 'Pending Cloud location conflicts with the local file.';
    end if;
    update public.attachment_locations
    set status = 'uploading'
    where id = cloud_location.id
    returning * into cloud_location;
  end if;

  update public.remote_copy_jobs
  set target_location_id = cloud_location.id
  where id = target_job.id;

  return query select 'uploading'::text, cloud_location.id, cloud_location.bucket_id, cloud_location.object_key, cloud_location.mime_type, cloud_location.file_size, lower(cloud_location.checksum);
end;
$$;

create or replace function public.complete_remote_copy_upload(
  p_gateway_id uuid,
  p_job_id uuid,
  p_cloud_location_id uuid,
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
  target_job public.remote_copy_jobs%rowtype;
  cloud_location public.attachment_locations%rowtype;
begin
  select gateway.organization_id into target_organization_id
  from public.file_gateway_instances gateway
  where gateway.id = p_gateway_id and gateway.status = 'active';
  if target_organization_id is null then
    raise exception using errcode = '42501', message = 'Gateway is not active.';
  end if;

  select job.* into target_job
  from public.remote_copy_jobs job
  where job.id = p_job_id and job.organization_id = target_organization_id
  for update;
  if target_job.id is null then
    raise exception using errcode = '42501', message = 'Remote-copy job is outside the gateway scope.';
  end if;
  if target_job.status = 'completed' then
    return target_job.target_location_id;
  end if;
  if target_job.status <> 'processing'
    or target_job.claimed_by <> p_gateway_id
    or target_job.lease_until < now()
    or target_job.target_location_id <> p_cloud_location_id then
    raise exception using errcode = '42501', message = 'Remote-copy job is not leased by this gateway.';
  end if;

  select location.* into cloud_location
  from public.attachment_locations location
  where location.id = p_cloud_location_id
    and location.organization_id = target_organization_id
    and location.attachment_id = target_job.attachment_id
    and location.source_location_id = target_job.source_location_id
    and location.storage_type = 'supabase_storage'
    and location.status in ('uploading', 'active')
    and location.deleted_at is null
  for update;
  if cloud_location.id is null
    or lower(cloud_location.checksum) is distinct from lower(p_checksum)
    or cloud_location.file_size is distinct from p_file_size
    or lower(cloud_location.mime_type) is distinct from lower(p_mime_type) then
    raise exception using errcode = '22023', message = 'Uploaded Cloud object metadata is inconsistent.';
  end if;

  update public.attachment_locations
  set status = 'active', sync_status = 'synced', synced_at = now(), sync_error_code = null
  where id = cloud_location.id;
  update public.remote_copy_jobs
  set
    status = 'completed',
    completed_at = now(),
    claimed_by = null,
    lease_until = null,
    next_attempt_at = null,
    error_code = null
  where id = target_job.id;

  insert into public.file_access_log (
    organization_id, attachment_id, location_id, user_id, action, context
  ) values (
    target_organization_id,
    target_job.attachment_id,
    cloud_location.id,
    target_job.requested_by,
    'REMOTE_COPY_COMPLETED',
      jsonb_build_object('source', 'file-gateway', 'gateway_id', p_gateway_id, 'job_id', target_job.id, 'existing_cloud', cloud_location.status = 'active')
  );
  return cloud_location.id;
end;
$$;

create or replace function public.fail_remote_copy_job(
  p_gateway_id uuid,
  p_job_id uuid,
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
  target_job public.remote_copy_jobs%rowtype;
begin
  if p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,64}$'
    or p_retry_after_seconds < 5 or p_retry_after_seconds > 86400 then
    raise exception using errcode = '22023', message = 'Invalid remote-copy failure metadata.';
  end if;
  select gateway.organization_id into target_organization_id
  from public.file_gateway_instances gateway
  where gateway.id = p_gateway_id and gateway.status = 'active';
  if target_organization_id is null then
    raise exception using errcode = '42501', message = 'Gateway is not active.';
  end if;

  select job.* into target_job
  from public.remote_copy_jobs job
  where job.id = p_job_id
    and job.organization_id = target_organization_id
    and job.status = 'processing'
    and job.claimed_by = p_gateway_id
  for update;
  if target_job.id is null then
    raise exception using errcode = '42501', message = 'Remote-copy job is outside the gateway scope.';
  end if;

  update public.remote_copy_jobs
  set
    status = 'failed',
    next_attempt_at = now() + make_interval(secs => p_retry_after_seconds),
    claimed_by = null,
    lease_until = null,
    error_code = p_error_code
  where id = target_job.id;
  if target_job.target_location_id is not null then
    update public.attachment_locations
    set status = 'failed'
    where id = target_job.target_location_id and status = 'uploading';
  end if;

  insert into public.file_access_log (
    organization_id, attachment_id, location_id, user_id, action, context
  ) values (
    target_organization_id,
    target_job.attachment_id,
    target_job.source_location_id,
    target_job.requested_by,
    'REMOTE_COPY_FAILED',
    jsonb_build_object('source', 'file-gateway', 'gateway_id', p_gateway_id, 'job_id', target_job.id, 'error_code', p_error_code)
  );
end;
$$;

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
  select gateway.organization_id into target_organization_id
  from public.file_gateway_instances gateway
  join public.organizations organization on organization.id = gateway.organization_id
  where gateway.id = p_gateway_id and gateway.status = 'active'
    and organization.status = 'active' and organization.deleted_at is null
  for update of gateway;
  if target_organization_id is null then
    raise exception using errcode = '42501', message = 'Gateway is not active.';
  end if;
  update public.file_gateway_instances set last_seen_at = now() where id = p_gateway_id;

  return query
  with candidates as (
    select location.id
    from public.attachment_locations location
    join public.document_attachments attachment on attachment.organization_id = location.organization_id and attachment.id = location.attachment_id
    join public.rural_documents document on document.organization_id = attachment.organization_id and document.id = attachment.document_id
    where location.organization_id = target_organization_id
      and location.storage_type = 'supabase_storage' and location.status = 'active' and location.deleted_at is null
      and location.bucket_id = 'rural-documents' and location.object_key is not null
      and location.checksum is not null and location.mime_type is not null and location.file_size is not null
      and attachment.status = 'active' and attachment.deleted_at is null
      and document.status = 'active' and document.deleted_at is null
      and location.sync_attempt_count < p_max_attempts
      and (location.sync_next_attempt_at is null or location.sync_next_attempt_at <= now())
      and (location.sync_status in ('pending', 'failed') or (location.sync_status = 'syncing' and location.sync_lease_until < now()))
      and not exists (
        select 1 from public.attachment_locations local_location
        where local_location.organization_id = location.organization_id
          and local_location.attachment_id = location.attachment_id
          and local_location.storage_type = 'network_share'
          and local_location.status = 'active'
          and local_location.deleted_at is null
          and (local_location.source_location_id = location.id or location.source_location_id = local_location.id)
      )
    order by location.sync_last_attempt_at nulls first, location.created_at
    for update of location skip locked
    limit p_limit
  ), updated as (
    update public.attachment_locations location
    set sync_status = 'syncing', sync_attempt_count = location.sync_attempt_count + 1,
        sync_last_attempt_at = now(), sync_next_attempt_at = null, sync_error_code = null,
        sync_claimed_by = p_gateway_id, sync_lease_until = now() + make_interval(secs => p_lease_seconds)
    from candidates where location.id = candidates.id returning location.*
  ), logged as (
    insert into public.file_access_log (organization_id, attachment_id, location_id, user_id, action, context)
    select updated.organization_id, updated.attachment_id, updated.id, null, 'FILE_SYNC_STARTED',
      jsonb_build_object('source', 'file-gateway', 'gateway_id', p_gateway_id, 'attempt', updated.sync_attempt_count)
    from updated
  )
  select updated.id, updated.attachment_id, attachment.document_id, updated.organization_id,
    updated.bucket_id, updated.object_key, updated.mime_type, updated.file_size,
    lower(updated.checksum), updated.version, updated.sync_attempt_count
  from updated
  join public.document_attachments attachment on attachment.organization_id = updated.organization_id and attachment.id = updated.attachment_id;
end;
$$;

revoke all on function public.request_attachment_remote_copy(uuid, uuid) from public, anon;
revoke all on function public.claim_remote_copy_jobs(uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.prepare_remote_copy_upload(uuid, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.complete_remote_copy_upload(uuid, uuid, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.fail_remote_copy_job(uuid, uuid, text, integer) from public, anon, authenticated;

grant execute on function public.request_attachment_remote_copy(uuid, uuid) to authenticated;
grant execute on function public.claim_remote_copy_jobs(uuid, integer, integer, integer) to service_role;
grant execute on function public.prepare_remote_copy_upload(uuid, uuid, text, bigint, text) to service_role;
grant execute on function public.complete_remote_copy_upload(uuid, uuid, uuid, text, bigint, text) to service_role;
grant execute on function public.fail_remote_copy_job(uuid, uuid, text, integer) to service_role;
