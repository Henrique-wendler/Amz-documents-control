begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_table('public','proposal_number_sequences','Sequence table exists');
select has_table('public','proposal_number_reservations','Reservation table exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.proposal_number_reservations'::regclass),'Reservations FORCE RLS');
select ok(not has_table_privilege('authenticated','public.proposal_number_reservations','SELECT,INSERT,UPDATE,DELETE'),'No direct user access');
select ok(not has_function_privilege('authenticated','public.reserve_proposal_number(uuid,uuid,timestamptz)','EXECUTE'),'Only Edge can reserve');
select ok(not has_function_privilege('service_role','private.sync_desktop_proposal_v1(uuid,jsonb,bigint,bigint)','EXECUTE'),'No service bypass around reservation guard');
insert into public.organizations(id,legal_name) values('a6102900-0000-4000-8000-000000000001','Numbering QA A'),('a6102900-0000-4000-8000-000000000002','Numbering QA B');
insert into auth.users(id,email) values('b6102900-0000-4000-8000-000000000001','number-a@example.invalid'),('b6102900-0000-4000-8000-000000000002','number-b@example.invalid'),('b6102900-0000-4000-8000-000000000003','number-denied@example.invalid');
insert into public.profiles(id,organization_id,full_name,role_key,status) values
 ('b6102900-0000-4000-8000-000000000001','a6102900-0000-4000-8000-000000000001','QA A','manager','active'),
 ('b6102900-0000-4000-8000-000000000002','a6102900-0000-4000-8000-000000000002','QA B','manager','active'),
 ('b6102900-0000-4000-8000-000000000003','a6102900-0000-4000-8000-000000000001','QA denied','operator','active');
insert into public.financial_institutions(id,organization_id,name) values('c6102900-0000-4000-8000-000000000001','a6102900-0000-4000-8000-000000000001','Numbering QA Bank');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function pg_temp.reserve(p_id uuid,p_date timestamptz default '2026-10-29T12:00:00Z',p_actor uuid default 'b6102900-0000-4000-8000-000000000001') returns jsonb language sql as $$select public.reserve_proposal_number(p_actor,p_id,p_date)$$;
select is(pg_temp.reserve('d6102900-0000-4000-8000-000000000001')->>'proposal_number','2026-0001','First annual reservation');
select is(pg_temp.reserve('d6102900-0000-4000-8000-000000000002')->>'proposal_number','2026-0002','Second reservation');
select is(pg_temp.reserve('d6102900-0000-4000-8000-000000000001')->>'proposal_number','2026-0001','Idempotency');
select is((select count(*)::integer from public.audit_log where action='PROPOSAL_NUMBER_RESERVED' and organization_id='a6102900-0000-4000-8000-000000000001'),2,'Retry does not duplicate audit');
select is(pg_temp.reserve('d6102900-0000-4000-8000-000000000001','2026-10-29T12:00:00Z','b6102900-0000-4000-8000-000000000002')->>'proposal_number','2026-0001','Independent tenant sequence and idempotency scope');
select is(pg_temp.reserve('d6102900-0000-4000-8000-000000000003','2027-01-01T02:50:00Z')->>'proposal_number','2026-0003','Dec31 Araguaina stays prior year despite UTC Jan1');
select is(pg_temp.reserve('d6102900-0000-4000-8000-000000000004','2027-01-01T03:00:00Z')->>'proposal_number','2027-0001','Local Jan1 uses new year');
select throws_ok($$select pg_temp.reserve('d6102900-0000-4000-8000-000000000001','2026-10-30T12:00:00Z')$$,'PN409','proposal_number_reservation_mismatch','Same sync cannot change creation identity');
select throws_ok($$select pg_temp.reserve('d6102900-0000-1000-8000-000000000001')$$,'DS400','invalid_payload','UUID v4 required');
select throws_ok($$select pg_temp.reserve('d6102900-0000-4000-8000-000000000005','infinity')$$,'DS400','invalid_payload','Finite timestamp required');
select throws_ok($$select pg_temp.reserve('d6102900-0000-4000-8000-000000000005',null)$$,'DS400','invalid_payload','Creation timestamp required');
select throws_ok($$select pg_temp.reserve('d6102900-0000-4000-8000-000000000005','2026-10-29T12:00:00Z','b6102900-0000-4000-8000-000000000003')$$,'DS403','permission_denied','Existing operator matrix unchanged');
select throws_ok($$delete from public.proposal_number_reservations where sync_id='d6102900-0000-4000-8000-000000000001'$$,'PN409','proposal_number_reservation_mismatch','Abandoned numbers never freed');
insert into public.operations(organization_id,operation_number,institution_id) values('a6102900-0000-4000-8000-000000000001','2028-0014','c6102900-0000-4000-8000-000000000001');
select is(pg_temp.reserve('d6102900-0000-4000-8000-000000000006','2028-02-01T12:00:00Z')->>'proposal_number','2028-0015','Occupied manual numbers floor sequence; no hole reuse');
select throws_ok($$insert into public.operations(organization_id,operation_number,institution_id) values('a6102900-0000-4000-8000-000000000001','2028-0015','c6102900-0000-4000-8000-000000000001')$$,'PN409','proposal_number_reservation_mismatch','Manual operation cannot steal reservation');
insert into public.proposal_number_sequences values('a6102900-0000-4000-8000-000000000001',2029,9998,now());
select is(pg_temp.reserve('d6102900-0000-4000-8000-000000000007','2029-02-01T12:00:00Z')->>'proposal_number','2029-9999','Last four-digit number');
select throws_ok($$select pg_temp.reserve('d6102900-0000-4000-8000-000000000008','2029-02-01T12:00:00Z')$$,'PN999','sequence_exhausted','No silent 10000');
select is(pg_temp.reserve('d6102900-0000-4000-8000-000000000007','2029-02-01T12:00:00Z')->>'proposal_number','2029-9999','Retry works after exhaustion');
create function pg_temp.payload(p_id uuid,p_number text) returns jsonb language sql as $$
 select jsonb_build_object('sync_id',p_id,'proposal_number',p_number,'proponent_name','Synthetic applicant','created_at','2026-10-29T12:00:00Z','updated_at','2026-10-29T13:00:00Z','created_by_technician_name','Creator QA','responsible_name','Responsible QA','technician_name','Technician QA','bank','Numbering QA Bank','purpose','QA','total_value','100000.00','fno_value','70000.00','of_value','30000.00')$$;
select throws_ok($$select public.sync_desktop_proposal('b6102900-0000-4000-8000-000000000001',pg_temp.payload('d6102900-0000-4000-8000-000000000001','2026-0099'))$$,'PN409','proposal_number_reservation_mismatch','Sync mismatch controlled');
select throws_ok($$select public.sync_desktop_proposal('b6102900-0000-4000-8000-000000000001',pg_temp.payload('d6102900-0000-4000-8000-000000000099','2026-0099'))$$,'PN404','proposal_number_not_reserved','Unknown legacy identity requires reconciliation');
select is(public.sync_desktop_proposal('b6102900-0000-4000-8000-000000000001',pg_temp.payload('d6102900-0000-4000-8000-000000000001','2026-0001'))->>'result','created','Reserved number syncs through unchanged 13 fields');
select is((select o.operation_number from public.operations o join public.desktop_proposals d on d.operation_id=o.id where d.sync_id='d6102900-0000-4000-8000-000000000001'),'2026-0001','Canonical operation coherent');
select throws_ok($$update public.operations set operation_number='2026-0099' where id=(select operation_id from public.desktop_proposals where sync_id='d6102900-0000-4000-8000-000000000001')$$,'PN409','proposal_number_reservation_mismatch','Web cannot rename a synchronized official identity');
select ok(not exists(select 1 from public.audit_log where action='PROPOSAL_NUMBER_RESERVED' and changes::text ~* 'token|password|secret|total_value|fno_value'),'Audit contains no credentials or financials');
-- Reproduce a previously synchronized nonstandard identity through the old, now private implementation.
select private.sync_desktop_proposal_v1('b6102900-0000-4000-8000-000000000001',pg_temp.payload('d6102900-0000-4000-8000-000000000098','LEGACY/98'));
select is(public.sync_desktop_proposal('b6102900-0000-4000-8000-000000000001',pg_temp.payload('d6102900-0000-4000-8000-000000000098','LEGACY/98'))->>'result','unchanged','Historical canonical proposals without reservation remain valid');
select * from finish();
rollback;
