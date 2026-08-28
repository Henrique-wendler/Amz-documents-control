-- Configurable document types, rural documents, file metadata/access and CAR.

create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  code text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  requires_expiration boolean,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (organization_id, name),
  unique (organization_id, code),
  unique (organization_id, id),
  check (deleted_at is not null or deleted_by is null)
);

create table public.rural_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  farm_id uuid not null,
  registration_id uuid,
  document_type_id uuid not null,
  document_number text,
  exercise_year smallint check (exercise_year is null or exercise_year between 1900 and 2200),
  issue_date date,
  expiration_date date,
  purpose text,
  licensed_area numeric(15,4) check (licensed_area is null or licensed_area >= 0),
  sigam_status text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint rural_documents_organization_fk foreign key (organization_id) references public.organizations(id) on delete restrict,
  constraint rural_documents_farm_fk foreign key (organization_id, farm_id) references public.farms(organization_id, id) on delete restrict,
  constraint rural_documents_registration_farm_fk foreign key (organization_id, registration_id, farm_id) references public.registrations(organization_id, id, farm_id) on delete restrict,
  constraint rural_documents_type_fk foreign key (organization_id, document_type_id) references public.document_types(organization_id, id) on delete restrict,
  unique (organization_id, id),
  check (expiration_date is null or issue_date is null or expiration_date >= issue_date),
  check (deleted_at is not null or deleted_by is null)
);

create or replace function private.file_path_has_credentials(candidate_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    candidate_path ~* '^[a-z][a-z0-9+.-]*://[^/@:]+:[^/@]+@'
    or candidate_path ~* '(^|[?&;[:space:]])(user|username|password|passwd|pwd|token|secret|credential)=';
$$;

create table public.document_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  file_name text not null check (btrim(file_name) <> ''),
  storage_type text not null check (storage_type in ('network_share', 'supabase_storage', 'external')),
  file_path text not null check (btrim(file_path) <> ''),
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  checksum text check (checksum is null or checksum ~ '^[A-Fa-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint document_attachments_organization_fk foreign key (organization_id) references public.organizations(id) on delete restrict,
  constraint document_attachments_document_fk foreign key (organization_id, document_id) references public.rural_documents(organization_id, id) on delete restrict,
  unique (organization_id, id),
  check (not private.file_path_has_credentials(file_path)),
  check (deleted_at is not null or deleted_by is null)
);

create table public.file_access_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  attachment_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('view', 'download', 'copy_reference')),
  created_at timestamptz not null default now(),
  context jsonb check (context is null or jsonb_typeof(context) = 'object'),
  constraint file_access_log_attachment_fk foreign key (organization_id, attachment_id) references public.document_attachments(organization_id, id) on delete restrict
);

create table public.car_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  farm_id uuid not null,
  registration_id uuid,
  car_number text not null check (btrim(car_number) <> ''),
  receipt_number text,
  declared_owner_name text,
  status text not null default 'pending' check (status in ('active', 'pending', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint car_records_organization_fk foreign key (organization_id) references public.organizations(id) on delete restrict,
  constraint car_records_farm_fk foreign key (organization_id, farm_id) references public.farms(organization_id, id) on delete restrict,
  constraint car_records_registration_farm_fk foreign key (organization_id, registration_id, farm_id) references public.registrations(organization_id, id, farm_id) on delete restrict,
  unique (organization_id, car_number),
  unique (organization_id, id),
  check (deleted_at is not null or deleted_by is null)
);

create index document_types_organization_id_idx on public.document_types (organization_id);
create index rural_documents_farm_id_idx on public.rural_documents (farm_id);
create index rural_documents_registration_id_idx on public.rural_documents (registration_id);
create index rural_documents_expiration_date_idx on public.rural_documents (expiration_date) where deleted_at is null;
create index document_attachments_document_id_idx on public.document_attachments (document_id);
create index file_access_log_attachment_id_idx on public.file_access_log (attachment_id);
create index file_access_log_user_id_idx on public.file_access_log (user_id);
create index file_access_log_created_at_idx on public.file_access_log (created_at desc);
create index car_records_farm_id_idx on public.car_records (farm_id);
create trigger document_types_set_metadata
before insert or update on public.document_types
for each row execute function private.set_row_metadata();

create trigger rural_documents_set_metadata
before insert or update on public.rural_documents
for each row execute function private.set_row_metadata();

create trigger document_attachments_set_metadata
before insert or update on public.document_attachments
for each row execute function private.set_row_metadata();

create trigger car_records_set_metadata
before insert or update on public.car_records
for each row execute function private.set_row_metadata();

create or replace view public.rural_documents_with_validity
with (security_invoker = true)
as
select
  document.*,
  case
    when document.status = 'inactive' then 'inactive'
    when document.expiration_date < current_date then 'expired'
    when document.expiration_date <= current_date + 30 then 'expiring'
    else 'active'
  end as validity_status
from public.rural_documents document
where document.deleted_at is null;
