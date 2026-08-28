-- Operations, financial values, guarantees and their many-to-many relations.

create table public.financial_institutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  short_name text,
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

create table public.operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  operation_number text not null check (btrim(operation_number) <> ''),
  institution_id uuid not null,
  purpose text,
  status text not null default 'under_review' check (status in ('under_review', 'active', 'completed', 'cancelled')),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint operations_organization_fk foreign key (organization_id) references public.organizations(id) on delete restrict,
  constraint operations_institution_fk foreign key (organization_id, institution_id) references public.financial_institutions(organization_id, id) on delete restrict,
  unique (organization_id, operation_number),
  unique (organization_id, id),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (deleted_at is not null or deleted_by is null)
);

create table public.operation_registrations (
  organization_id uuid not null,
  operation_id uuid not null,
  registration_id uuid not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint operation_registrations_operation_fk foreign key (organization_id, operation_id) references public.operations(organization_id, id) on delete restrict,
  constraint operation_registrations_registration_fk foreign key (organization_id, registration_id) references public.registrations(organization_id, id) on delete restrict,
  primary key (organization_id, operation_id, registration_id)
);

create unique index operation_registrations_one_primary_idx
  on public.operation_registrations (organization_id, operation_id)
  where is_primary;

create table public.operation_financials (
  operation_id uuid primary key,
  organization_id uuid not null,
  amount numeric(15,2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  constraint operation_financials_operation_fk foreign key (organization_id, operation_id) references public.operations(organization_id, id) on delete restrict
);

create table public.guarantee_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
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

create table public.guarantees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  operation_id uuid not null,
  description text,
  degree text,
  evaluation_year smallint check (evaluation_year is null or evaluation_year between 1900 and 2200),
  status text not null default 'active' check (status in ('active', 'closed', 'cancelled')),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint guarantees_organization_fk foreign key (organization_id) references public.organizations(id) on delete restrict,
  constraint guarantees_operation_fk foreign key (organization_id, operation_id) references public.operations(organization_id, id) on delete restrict,
  unique (organization_id, id),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (deleted_at is not null or deleted_by is null)
);

create table public.guarantee_type_links (
  organization_id uuid not null,
  guarantee_id uuid not null,
  guarantee_type_id uuid not null,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint guarantee_type_links_guarantee_fk foreign key (organization_id, guarantee_id) references public.guarantees(organization_id, id) on delete restrict,
  constraint guarantee_type_links_type_fk foreign key (organization_id, guarantee_type_id) references public.guarantee_types(organization_id, id) on delete restrict,
  unique (organization_id, guarantee_id, guarantee_type_id)
);

create unique index guarantee_type_links_one_primary_idx
  on public.guarantee_type_links (organization_id, guarantee_id)
  where is_primary;

create table public.guarantee_registrations (
  organization_id uuid not null,
  guarantee_id uuid not null,
  registration_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint guarantee_registrations_guarantee_fk foreign key (organization_id, guarantee_id) references public.guarantees(organization_id, id) on delete restrict,
  constraint guarantee_registrations_registration_fk foreign key (organization_id, registration_id) references public.registrations(organization_id, id) on delete restrict,
  unique (organization_id, guarantee_id, registration_id)
);

create table public.guarantee_financials (
  guarantee_id uuid primary key,
  organization_id uuid not null,
  amount numeric(15,2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  constraint guarantee_financials_guarantee_fk foreign key (organization_id, guarantee_id) references public.guarantees(organization_id, id) on delete restrict
);

create table public.guarantee_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  guarantee_id uuid not null,
  category text not null check (btrim(category) <> ''),
  description text not null check (btrim(description) <> ''),
  quantity numeric(15,4) check (quantity is null or quantity >= 0),
  unit text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint guarantee_items_organization_fk foreign key (organization_id) references public.organizations(id) on delete restrict,
  constraint guarantee_items_guarantee_fk foreign key (organization_id, guarantee_id) references public.guarantees(organization_id, id) on delete restrict,
  unique (organization_id, id),
  check (deleted_at is not null or deleted_by is null)
);

create index financial_institutions_organization_idx on public.financial_institutions (organization_id);
create index operations_operation_number_idx on public.operations (operation_number);
create index operations_institution_id_idx on public.operations (institution_id);
create index operation_registrations_registration_id_idx on public.operation_registrations (registration_id);
create index guarantees_operation_id_idx on public.guarantees (operation_id);
create index guarantee_type_links_type_id_idx on public.guarantee_type_links (guarantee_type_id);
create index guarantee_registrations_registration_id_idx on public.guarantee_registrations (registration_id);
create index guarantee_items_guarantee_id_idx on public.guarantee_items (guarantee_id);

create trigger financial_institutions_set_metadata
before insert or update on public.financial_institutions
for each row execute function private.set_row_metadata();

create trigger operations_set_metadata
before insert or update on public.operations
for each row execute function private.set_row_metadata();

create trigger operation_financials_bump_version
before update on public.operation_financials
for each row execute function private.bump_version();

create trigger guarantee_types_set_metadata
before insert or update on public.guarantee_types
for each row execute function private.set_row_metadata();

create trigger guarantees_set_metadata
before insert or update on public.guarantees
for each row execute function private.set_row_metadata();

create trigger guarantee_financials_bump_version
before update on public.guarantee_financials
for each row execute function private.bump_version();

create trigger guarantee_items_set_metadata
before insert or update on public.guarantee_items
for each row execute function private.set_row_metadata();

create or replace function private.validate_guarantee_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_operation_id uuid;
begin
  select guarantee.operation_id
    into related_operation_id
  from public.guarantees guarantee
  where guarantee.id = new.guarantee_id
    and guarantee.organization_id = new.organization_id
    and guarantee.deleted_at is null;

  if related_operation_id is null or not exists (
    select 1
    from public.operation_registrations operation_registration
    where operation_registration.organization_id = new.organization_id
      and operation_registration.operation_id = related_operation_id
      and operation_registration.registration_id = new.registration_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Guarantee registration must also be linked to the corresponding operation.';
  end if;

  return new;
end;
$$;

create trigger guarantee_registrations_validate_operation_link
before insert or update of organization_id, guarantee_id, registration_id
on public.guarantee_registrations
for each row execute function private.validate_guarantee_registration();

create or replace function private.protect_operation_registration_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.guarantee_registrations guarantee_registration
    join public.guarantees guarantee
      on guarantee.id = guarantee_registration.guarantee_id
     and guarantee.organization_id = guarantee_registration.organization_id
    where guarantee.organization_id = old.organization_id
      and guarantee.operation_id = old.operation_id
      and guarantee_registration.registration_id = old.registration_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'Operation registration link is still used by a guarantee.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger operation_registrations_protect_guarantee_delete
before delete on public.operation_registrations
for each row execute function private.protect_operation_registration_link();

create trigger operation_registrations_protect_guarantee_update
before update of organization_id, operation_id, registration_id
on public.operation_registrations
for each row execute function private.protect_operation_registration_link();
