-- Synthetic staging seed. Run manually with psql only after Auth users have
-- been created in the isolated staging project. This file contains no password,
-- e-mail, token or privileged key and is never part of `supabase db reset`.
\set ON_ERROR_STOP on

\if :{?seed_environment}
\else
  \echo 'Missing seed_environment. Use seed_environment=staging.'
  select 1 / 0 as staging_seed_refused;
\endif

select :'seed_environment' = 'staging' as staging_confirmed \gset
\if :staging_confirmed
\else
  \echo 'Refusing to seed: this script is restricted to staging.'
  select 1 / 0 as staging_seed_refused;
\endif

\if :{?admin_user_id}
\else
  \echo 'Missing admin_user_id from the staging Auth user.'
  select 1 / 0 as staging_seed_refused;
\endif
\if :{?manager_user_id}
\else
  \echo 'Missing manager_user_id from the staging Auth user.'
  select 1 / 0 as staging_seed_refused;
\endif
\if :{?operator_user_id}
\else
  \echo 'Missing operator_user_id from the staging Auth user.'
  select 1 / 0 as staging_seed_refused;
\endif
\if :{?viewer_user_id}
\else
  \echo 'Missing viewer_user_id from the staging Auth user.'
  select 1 / 0 as staging_seed_refused;
\endif

begin;

insert into public.organizations (id, legal_name, trade_name, status, created_by, updated_by)
values (
  '10000000-0000-4000-8000-000000000001',
  'Organização Rural Fictícia de Homologação',
  'Ambiente Fictício de Homologação',
  'active',
  :'admin_user_id'::uuid,
  :'admin_user_id'::uuid
)
on conflict (id) do update set
  legal_name = excluded.legal_name,
  trade_name = excluded.trade_name,
  status = 'active';

insert into public.profiles (id, organization_id, full_name, role_key, status)
values
  (:'admin_user_id'::uuid, '10000000-0000-4000-8000-000000000001', 'Usuário Admin Fictício', 'admin', 'active'),
  (:'manager_user_id'::uuid, '10000000-0000-4000-8000-000000000001', 'Usuário Gestor Fictício', 'manager', 'active'),
  (:'operator_user_id'::uuid, '10000000-0000-4000-8000-000000000001', 'Usuário Operador Fictício', 'operator', 'active'),
  (:'viewer_user_id'::uuid, '10000000-0000-4000-8000-000000000001', 'Usuário Consulta Fictício', 'viewer', 'active')
on conflict (id) do update set
  organization_id = excluded.organization_id,
  full_name = excluded.full_name,
  role_key = excluded.role_key,
  status = 'active';

insert into public.financial_institutions (id, organization_id, name, short_name, status)
values (
  '11000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Banco Fictício de Homologação',
  'BFH',
  'active'
)
on conflict (id) do update set name = excluded.name, short_name = excluded.short_name, status = 'active';

insert into public.guarantee_types (id, organization_id, name, status)
values (
  '12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Hipoteca Fictícia',
  'active'
)
on conflict (id) do update set name = excluded.name, status = 'active';

insert into public.document_types (id, organization_id, name, code, status, requires_expiration)
values
  ('13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Licença Fictícia', 'STG-LIC', 'active', true),
  ('13000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Certidão Fictícia', 'STG-CER', 'active', false)
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  status = 'active',
  requires_expiration = excluded.requires_expiration;

insert into public.owners (id, organization_id, owner_type, name, document_number, status, notes)
values
  ('14000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'individual', 'Proprietário Fictício A', '00000000000', 'active', 'Dado exclusivamente sintético.'),
  ('14000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'company', 'Proprietário Fictício B', '00000000000000', 'active', 'Dado exclusivamente sintético.')
on conflict (id) do update set name = excluded.name, status = 'active', notes = excluded.notes;

insert into public.farms (id, organization_id, name, municipality, state, total_area, reserve_area, consolidated_area, status, notes)
values (
  '15000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Fazenda Horizonte Fictícia',
  'Município Fictício',
  'TO',
  1200.0000,
  240.0000,
  700.0000,
  'active',
  'Dado exclusivamente sintético.'
)
on conflict (id) do update set name = excluded.name, total_area = excluded.total_area, status = 'active';

insert into public.registrations (id, organization_id, farm_id, number, legal_area, certificate_date, status)
values (
  '16000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  'STG-000001',
  1200.0000,
  current_date - 30,
  'active'
)
on conflict (id) do update set number = excluded.number, legal_area = excluded.legal_area, status = 'active';

insert into public.ownership_links (id, organization_id, owner_id, registration_id, ownership_type, percentage, status, start_date)
values (
  '17000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001',
  'owner',
  100.00,
  'active',
  current_date - 365
)
on conflict (id) do update set percentage = excluded.percentage, status = 'active', end_date = null;

insert into public.operations (id, organization_id, operation_number, institution_id, purpose, status, start_date, end_date, notes)
values (
  '18000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'STG-OP-0001',
  '11000000-0000-4000-8000-000000000001',
  'Custeio fictício para homologação',
  'active',
  current_date - 30,
  current_date + 335,
  'Dado exclusivamente sintético.'
)
on conflict (id) do update set purpose = excluded.purpose, status = 'active';

insert into public.operation_registrations (organization_id, operation_id, registration_id, is_primary)
values (
  '10000000-0000-4000-8000-000000000001',
  '18000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001',
  true
)
on conflict (organization_id, operation_id, registration_id) do update set is_primary = true;

insert into public.operation_financials (operation_id, organization_id, amount)
values ('18000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 250000.00)
on conflict (operation_id) do update set amount = excluded.amount;

insert into public.guarantees (id, organization_id, operation_id, description, degree, evaluation_year, status, start_date, end_date, notes)
values (
  '19000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '18000000-0000-4000-8000-000000000001',
  'Garantia fictícia de homologação',
  '1º Grau',
  extract(year from current_date)::smallint,
  'active',
  current_date - 30,
  current_date + 335,
  'Dado exclusivamente sintético.'
)
on conflict (id) do update set description = excluded.description, status = 'active';

insert into public.guarantee_type_links (organization_id, guarantee_id, guarantee_type_id, is_primary)
values (
  '10000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  true
)
on conflict (organization_id, guarantee_id, guarantee_type_id) do update set is_primary = true;

insert into public.guarantee_registrations (organization_id, guarantee_id, registration_id)
values (
  '10000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001'
)
on conflict (organization_id, guarantee_id, registration_id) do nothing;

insert into public.guarantee_financials (guarantee_id, organization_id, amount)
values ('19000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 300000.00)
on conflict (guarantee_id) do update set amount = excluded.amount;

insert into public.guarantee_items (id, organization_id, guarantee_id, category, description, quantity, unit, notes)
values (
  '1a000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000001',
  'Imóvel rural',
  'Item fictício para homologação',
  1,
  'unidade',
  'Dado exclusivamente sintético.'
)
on conflict (id) do update set description = excluded.description, quantity = excluded.quantity;

insert into public.rural_documents (id, organization_id, farm_id, registration_id, document_type_id, document_number, issue_date, expiration_date, purpose, status, notes)
values (
  '1b000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',
  'STG-DOC-0001',
  current_date - 10,
  current_date + 20,
  'Homologação com dados fictícios',
  'active',
  'Dado exclusivamente sintético.'
)
on conflict (id) do update set expiration_date = excluded.expiration_date, status = 'active';

insert into public.car_records (id, organization_id, farm_id, registration_id, car_number, receipt_number, declared_owner_name, status, notes)
values (
  '1c000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001',
  'STG-CAR-0000000001',
  'STG-RECIBO-0001',
  'Proprietário Fictício A',
  'active',
  'Dado exclusivamente sintético.'
)
on conflict (id) do update set receipt_number = excluded.receipt_number, status = 'active';

commit;

\echo 'Synthetic staging seed applied successfully.'
