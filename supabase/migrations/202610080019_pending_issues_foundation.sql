-- Central de Pendências, phase 1: authorization, management and business timeline.
-- Detection, reconciliation and financial reads are intentionally deferred.

insert into public.permissions (permission_key, description)
values
  ('pending_issues.read', 'Consultar a Central de Pendências'),
  ('pending_issues.manage', 'Gerenciar o acompanhamento das pendências'),
  ('pending_issues.financial_read', 'Consultar valores financeiros somente pelo contrato da Central de Pendências')
on conflict (permission_key) do update set description = excluded.description;

insert into public.roles (role_key, name)
values ('technician', 'Técnico')
on conflict (role_key) do update set name = excluded.name, status = 'active';

insert into public.role_permissions (role_key, permission_key)
select role_key, permission_key
from (values ('admin'), ('technician')) as granted_roles(role_key)
cross join (values
  ('pending_issues.read'),
  ('pending_issues.manage'),
  ('pending_issues.financial_read')
) as granted_permissions(permission_key)
on conflict do nothing;

-- The existing profiles primary key covers id alone. This tenant-qualified key
-- lets an assignee FK enforce the organization relationship in the database.
alter table public.profiles
  add constraint profiles_organization_id_id_key unique (organization_id, id);

create table public.pending_issue_management (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  issue_type text not null check (issue_type in (
    'document_expired', 'document_expiring',
    'guarantee_expired', 'guarantee_expiring',
    'operation_active_after_end_date'
  )),
  operation_id uuid,
  guarantee_id uuid,
  document_id uuid,
  assigned_to uuid,
  status text not null default 'open' check (status in (
    'open', 'in_analysis', 'in_progress', 'resolved', 'justified'
  )),
  resolution_due_date date,
  justification text,
  identified_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  constraint pending_issue_management_operation_fk foreign key (organization_id, operation_id)
    references public.operations(organization_id, id) on delete restrict,
  constraint pending_issue_management_guarantee_fk foreign key (organization_id, guarantee_id)
    references public.guarantees(organization_id, id) on delete restrict,
  constraint pending_issue_management_document_fk foreign key (organization_id, document_id)
    references public.rural_documents(organization_id, id) on delete restrict,
  constraint pending_issue_management_assignee_fk foreign key (organization_id, assigned_to)
    references public.profiles(organization_id, id) on delete restrict,
  constraint pending_issue_management_one_source check (
    num_nonnulls(operation_id, guarantee_id, document_id) = 1
  ),
  constraint pending_issue_management_type_source check (
    (issue_type in ('document_expired', 'document_expiring') and document_id is not null)
    or (issue_type in ('guarantee_expired', 'guarantee_expiring') and guarantee_id is not null)
    or (issue_type = 'operation_active_after_end_date' and operation_id is not null)
  ),
  constraint pending_issue_management_justification check (
    (status = 'justified' and justification is not null and btrim(justification) <> '')
    or (status <> 'justified' and justification is null)
  ),
  constraint pending_issue_management_resolution check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null)
  ),
  unique (organization_id, id)
);

create unique index pending_issue_management_operation_key_idx
  on public.pending_issue_management (organization_id, issue_type, operation_id)
  where operation_id is not null;
create unique index pending_issue_management_guarantee_key_idx
  on public.pending_issue_management (organization_id, issue_type, guarantee_id)
  where guarantee_id is not null;
create unique index pending_issue_management_document_key_idx
  on public.pending_issue_management (organization_id, issue_type, document_id)
  where document_id is not null;
create index pending_issue_management_status_idx
  on public.pending_issue_management (organization_id, status);
create index pending_issue_management_due_date_idx
  on public.pending_issue_management (organization_id, resolution_due_date)
  where resolution_due_date is not null;
create index pending_issue_management_assignee_idx
  on public.pending_issue_management (organization_id, assigned_to)
  where assigned_to is not null;

create table public.pending_issue_events (
  id uuid primary key default gen_random_uuid(),
  event_order bigint generated always as identity,
  organization_id uuid not null,
  pending_issue_id uuid not null,
  event_type text not null check (event_type in (
    'detected', 'assigned', 'status_changed', 'deadline_changed',
    'note', 'justified', 'resolved', 'reopened'
  )),
  actor_id uuid,
  note text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  constraint pending_issue_events_issue_fk foreign key (organization_id, pending_issue_id)
    references public.pending_issue_management(organization_id, id) on delete restrict,
  constraint pending_issue_events_actor_fk foreign key (organization_id, actor_id)
    references public.profiles(organization_id, id) on delete restrict,
  constraint pending_issue_events_note_check check (
    event_type not in ('note', 'justified')
    or (note is not null and btrim(note) <> '')
  )
);

create index pending_issue_events_issue_created_at_idx
  on public.pending_issue_events (pending_issue_id, created_at desc, event_order desc);

-- Existing assignees remain valid historical references if their profiles are
-- later deactivated. Validate eligibility only when an assignee is selected.
create or replace function private.prepare_pending_issue_management()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  validate_assignee boolean := false;
begin
  if new.status = 'justified' then
    new.justification := btrim(new.justification);
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'open' then
      raise exception using errcode = '23514', message = 'A new pending issue must be open.';
    end if;
    new.created_at := now();
    new.created_by := auth.uid();
    new.updated_at := now();
    new.updated_by := auth.uid();
    new.identified_at := now();
    new.resolved_at := null;
    validate_assignee := new.assigned_to is not null;
  else
    if row(new.organization_id, new.issue_type, new.operation_id, new.guarantee_id, new.document_id, new.identified_at)
       is distinct from
       row(old.organization_id, old.issue_type, old.operation_id, old.guarantee_id, old.document_id, old.identified_at) then
      raise exception using errcode = '23514', message = 'The pending issue identity is immutable.';
    end if;

    if new.status is distinct from old.status then
      new.resolved_at := case when new.status = 'resolved' then now() else null end;
    else
      new.resolved_at := old.resolved_at;
    end if;
    validate_assignee := new.assigned_to is not null
      and new.assigned_to is distinct from old.assigned_to;
  end if;

  if validate_assignee then
    -- Hold the eligibility rows until commit so a concurrent deactivation or
    -- permission revocation cannot overtake this assignment.
    perform 1
    from public.profiles profile
    join public.roles role on role.role_key = profile.role_key and role.status = 'active'
    join public.role_permissions role_permission
      on role_permission.role_key = profile.role_key
     and role_permission.permission_key = 'pending_issues.manage'
    where profile.id = new.assigned_to
      and profile.organization_id = new.organization_id
      and profile.status = 'active'
    for share of profile, role, role_permission;

    if not found then
      raise exception using errcode = '23514', message = 'The assignee must be an active pending issue manager in this organization.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_pending_issue_management() from public, anon, authenticated;

create trigger pending_issue_management_prepare
before insert or update on public.pending_issue_management
for each row execute function private.prepare_pending_issue_management();

create trigger pending_issue_management_set_metadata
before insert or update on public.pending_issue_management
for each row execute function private.set_row_metadata();

-- Business events are derived from persisted management changes, so a client
-- cannot submit an arbitrary assignment or status history entry.
create or replace function private.write_pending_issue_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  status_event text;
begin
  if tg_op = 'INSERT' then
    insert into public.pending_issue_events (
      organization_id, pending_issue_id, event_type, actor_id, metadata
    ) values (
      new.organization_id, new.id, 'detected', auth.uid(),
      jsonb_build_object('issue_type', new.issue_type)
    );
    if new.assigned_to is not null then
      insert into public.pending_issue_events (
        organization_id, pending_issue_id, event_type, actor_id, metadata
      ) values (
        new.organization_id, new.id, 'assigned', auth.uid(),
        jsonb_build_object('old', null, 'new', new.assigned_to)
      );
    end if;
    if new.resolution_due_date is not null then
      insert into public.pending_issue_events (
        organization_id, pending_issue_id, event_type, actor_id, metadata
      ) values (
        new.organization_id, new.id, 'deadline_changed', auth.uid(),
        jsonb_build_object('old', null, 'new', new.resolution_due_date)
      );
    end if;
    return new;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.pending_issue_events (
      organization_id, pending_issue_id, event_type, actor_id, metadata
    ) values (
      new.organization_id, new.id, 'assigned', auth.uid(),
      jsonb_build_object('old', old.assigned_to, 'new', new.assigned_to)
    );
  end if;

  if new.resolution_due_date is distinct from old.resolution_due_date then
    insert into public.pending_issue_events (
      organization_id, pending_issue_id, event_type, actor_id, metadata
    ) values (
      new.organization_id, new.id, 'deadline_changed', auth.uid(),
      jsonb_build_object('old', old.resolution_due_date, 'new', new.resolution_due_date)
    );
  end if;

  if new.status is distinct from old.status then
    status_event := case
      when new.status = 'justified' then 'justified'
      when new.status = 'resolved' then 'resolved'
      when old.status in ('resolved', 'justified') then 'reopened'
      else 'status_changed'
    end;
    insert into public.pending_issue_events (
      organization_id, pending_issue_id, event_type, actor_id, note, metadata
    ) values (
      new.organization_id, new.id, status_event, auth.uid(),
      case when status_event = 'justified' then new.justification else null end,
      jsonb_build_object('old', old.status, 'new', new.status)
    );
  elsif new.status = 'justified' and new.justification is distinct from old.justification then
    insert into public.pending_issue_events (
      organization_id, pending_issue_id, event_type, actor_id, note, metadata
    ) values (
      new.organization_id, new.id, 'justified', auth.uid(), new.justification,
      jsonb_build_object('old', old.status, 'new', new.status)
    );
  end if;

  return new;
end;
$$;

revoke all on function private.write_pending_issue_history() from public, anon, authenticated;

create trigger pending_issue_management_history
after insert or update on public.pending_issue_management
for each row execute function private.write_pending_issue_history();

-- Free-form observations have a narrow, tenant-scoped write contract. No
-- authenticated role receives direct INSERT/UPDATE/DELETE on the event table.
create or replace function public.add_pending_issue_note(p_pending_issue_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid := private.current_user_organization_id();
  created_event_id uuid;
begin
  if actor_organization_id is null or not private.has_permission('pending_issues.manage') then
    raise exception using errcode = '42501', message = 'Missing pending_issues.manage permission.';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception using errcode = '22023', message = 'A note must not be empty.';
  end if;
  if not exists (
    select 1 from public.pending_issue_management issue
    where issue.id = p_pending_issue_id
      and issue.organization_id = actor_organization_id
  ) then
    raise exception using errcode = 'P0002', message = 'Pending issue is unavailable.';
  end if;

  insert into public.pending_issue_events (
    organization_id, pending_issue_id, event_type, actor_id, note
  ) values (
    actor_organization_id, p_pending_issue_id, 'note', auth.uid(), btrim(p_note)
  ) returning id into created_event_id;
  return created_event_id;
end;
$$;

revoke all on function public.add_pending_issue_note(uuid, text) from public, anon, authenticated;
grant execute on function public.add_pending_issue_note(uuid, text) to authenticated;

alter table public.pending_issue_management enable row level security;
alter table public.pending_issue_events enable row level security;
revoke all on public.pending_issue_management, public.pending_issue_events from anon, authenticated;
grant select, insert, update on public.pending_issue_management to authenticated;
grant select on public.pending_issue_events to authenticated;

create policy pending_issue_management_select
on public.pending_issue_management for select to authenticated
using (
  private.same_organization(organization_id)
  and private.has_permission('pending_issues.read')
);

create policy pending_issue_management_insert
on public.pending_issue_management for insert to authenticated
with check (
  private.same_organization(organization_id)
  and private.has_permission('pending_issues.manage')
);

create policy pending_issue_management_update
on public.pending_issue_management for update to authenticated
using (
  private.same_organization(organization_id)
  and private.has_permission('pending_issues.manage')
)
with check (
  private.same_organization(organization_id)
  and private.has_permission('pending_issues.manage')
);

create policy pending_issue_events_select
on public.pending_issue_events for select to authenticated
using (
  private.same_organization(organization_id)
  and private.has_permission('pending_issues.read')
);

-- Preserve the existing technical audit trail while keeping comments in the
-- domain timeline. Omit private free text from technical audit payloads.
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
    when 'pending_issue_management' then
      redacted := redacted - array['justification'];
    when 'pending_issue_events' then
      redacted := redacted - array['note', 'metadata'];
    else
      null;
  end case;

  return redacted;
end;
$$;

create trigger pending_issue_management_audit_log
after insert or update or delete on public.pending_issue_management
for each row execute function private.write_audit_log();

create trigger pending_issue_events_audit_log
after insert or update or delete on public.pending_issue_events
for each row execute function private.write_audit_log();

-- audit.read alone must not disclose Central-specific records, including
-- events. Other audit visibility remains identical to migration 006.
drop policy audit_log_select on public.audit_log;
create policy audit_log_select
on public.audit_log for select to authenticated
using (
  private.same_organization(organization_id)
  and private.has_permission('audit.read')
  and (
    entity_type not in ('operation_financials', 'guarantee_financials')
    or private.has_permission('financial.read')
  )
  and (
    entity_type not in ('pending_issue_management', 'pending_issue_events')
    or private.has_permission('pending_issues.read')
  )
);
