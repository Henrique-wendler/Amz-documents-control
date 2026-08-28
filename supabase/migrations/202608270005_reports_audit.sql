-- Immutable audit trail and report configuration/generation logs.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  changes jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now(),
  request_id text,
  context jsonb check (context is null or jsonb_typeof(context) = 'object')
);

create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  report_type text not null check (btrim(report_type) <> ''),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (organization_id, name),
  unique (organization_id, id),
  check (deleted_at is not null or deleted_by is null)
);

create table public.report_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  report_type text not null check (btrim(report_type) <> ''),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  included_sections jsonb not null default '{}'::jsonb check (jsonb_typeof(included_sections) = 'object'),
  format text not null check (format in ('pdf', 'xlsx', 'csv')),
  generated_at timestamptz not null default now(),
  downloaded_at timestamptz,
  context jsonb check (context is null or jsonb_typeof(context) = 'object'),
  check (downloaded_at is null or downloaded_at >= generated_at),
  check (
    not (included_sections ? 'include_financial_values')
    or jsonb_typeof(included_sections -> 'include_financial_values') = 'boolean'
  )
);

create index audit_log_entity_id_idx on public.audit_log (entity_id);
create index audit_log_actor_user_id_idx on public.audit_log (actor_user_id);
create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_organization_id_idx on public.audit_log (organization_id);
create index report_templates_organization_id_idx on public.report_templates (organization_id);
create index report_log_user_id_idx on public.report_log (user_id);
create index report_log_generated_at_idx on public.report_log (generated_at desc);
create index report_log_organization_id_idx on public.report_log (organization_id);

create trigger report_templates_set_metadata
before insert or update on public.report_templates
for each row execute function private.set_row_metadata();

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

create or replace function private.audit_changed_fields(old_payload jsonb, new_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      coalesce(new_entry.key, old_entry.key),
      jsonb_build_object('old', old_entry.value, 'new', new_entry.value)
    ) filter (where old_entry.value is distinct from new_entry.value),
    '{}'::jsonb
  )
  from jsonb_each(old_payload) old_entry
  full join jsonb_each(new_payload) new_entry on new_entry.key = old_entry.key;
$$;

create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_payload jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_payload jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  source_payload jsonb;
  audit_action text := tg_op;
  audit_entity_id uuid;
  audit_organization_id uuid;
begin
  source_payload := case when tg_op = 'DELETE' then old_payload else new_payload end;
  audit_entity_id := coalesce(
    nullif(source_payload ->> 'id', '')::uuid,
    nullif(source_payload ->> 'operation_id', '')::uuid,
    nullif(source_payload ->> 'guarantee_id', '')::uuid
  );
  audit_organization_id := case
    when tg_table_name = 'organizations' then audit_entity_id
    else nullif(source_payload ->> 'organization_id', '')::uuid
  end;

  if tg_op = 'UPDATE' then
    if old_payload ->> 'deleted_at' is null and new_payload ->> 'deleted_at' is not null then
      audit_action := 'SOFT_DELETE';
    elsif old_payload ->> 'deleted_at' is not null and new_payload ->> 'deleted_at' is null then
      audit_action := 'RESTORE';
    elsif old_payload ->> 'status' is distinct from new_payload ->> 'status' then
      audit_action := case new_payload ->> 'status'
        when 'inactive' then 'INACTIVATE'
        when 'completed' then 'CLOSE'
        when 'closed' then 'CLOSE'
        when 'cancelled' then 'CANCEL'
        else 'UPDATE_STATUS'
      end;
    end if;
  end if;

  insert into public.audit_log (
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    changes,
    request_id,
    context
  ) values (
    audit_organization_id,
    auth.uid(),
    tg_table_name,
    audit_entity_id,
    audit_action,
    case tg_op
      when 'INSERT' then jsonb_build_object('new', private.redact_audit_payload(tg_table_name, new_payload))
      when 'DELETE' then jsonb_build_object('old', private.redact_audit_payload(tg_table_name, old_payload))
      else private.audit_changed_fields(
        private.redact_audit_payload(tg_table_name, old_payload),
        private.redact_audit_payload(tg_table_name, new_payload)
      )
    end,
    nullif(current_setting('app.request_id', true), ''),
    jsonb_build_object('source', 'database_trigger')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  audited_table text;
begin
  foreach audited_table in array array[
    'organizations', 'profiles',
    'owners', 'farms', 'registrations', 'ownership_links',
    'financial_institutions', 'operations', 'operation_registrations', 'operation_financials',
    'guarantee_types', 'guarantees', 'guarantee_type_links', 'guarantee_registrations',
    'guarantee_financials', 'guarantee_items',
    'document_types', 'rural_documents', 'document_attachments', 'car_records',
    'report_templates'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.write_audit_log()',
      audited_table || '_audit_log',
      audited_table
    );
  end loop;
end;
$$;
