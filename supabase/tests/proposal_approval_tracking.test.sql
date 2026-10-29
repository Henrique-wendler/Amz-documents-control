begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_table('public','operation_approval_tracking','Tracking is an extension table');
select col_is_pk('public','operation_approval_tracking','operation_id','At most one tracking per operation');
select col_type_is('public','operation_approval_tracking','approval_deadline','date','Deadline is a civil DATE');
select hasnt_column('public','operation_approval_tracking','overdue_days','Delay is not persisted');
select hasnt_column('public','operation_approval_tracking','is_overdue','Overdue flag is not persisted');
select hasnt_column('public','operation_approval_tracking','amount','Financial amount is not duplicated');
select is(private.proposal_overdue_days('pending','2026-10-27','2026-10-26'),0,'Tomorrow is not overdue');
select is(private.proposal_overdue_days('pending','2026-10-26','2026-10-26'),0,'Today has zero overdue days');
select is(private.proposal_overdue_days('pending','2026-10-25','2026-10-26'),1,'Yesterday has one overdue day');
select is(private.proposal_overdue_days('pending','2026-10-20','2026-10-26'),6,'Official example is six days');
select is(private.proposal_overdue_days('approved','2026-10-20','2026-10-26'),0,'Approved is not active delay');
select is(private.proposal_overdue_days('rejected','2026-10-20','2026-10-26'),0,'Rejected is not active delay');
select is(private.proposal_overdue_days('cancelled','2026-10-20','2026-10-26'),0,'Cancelled is not active delay');
select is(private.proposal_overdue_days('pending',null,'2026-10-26'),0,'No deadline is not overdue');

insert into public.organizations(id,legal_name) values
 ('10000000-0000-0000-0000-000000000001','Organization A QA'),('10000000-0000-0000-0000-000000000002','Organization B QA');
insert into public.roles(role_key,name) values('tracking_report_only','Tracking report only QA'),('tracking_financial_only','Tracking financial only QA'),('tracking_editor_only','Tracking editor only QA'),('tracking_read_only','Tracking read only QA');
insert into public.role_permissions(role_key,permission_key) values
 ('tracking_report_only','proposal_reports.read'),('tracking_report_only','financial.read'),('tracking_financial_only','proposal_reports.financial'),
 ('tracking_editor_only','proposal_tracking.manage'),('tracking_editor_only','proposal_tracking.read'),('tracking_read_only','proposal_tracking.read');
insert into auth.users(id,email) select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'tracking-qa-'||n||'@example.invalid' from generate_series(1,8) n;
insert into public.profiles(id,organization_id,full_name,role_key) select
 ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 ('10000000-0000-0000-0000-'||lpad((case when n=8 then 2 else 1 end)::text,12,'0'))::uuid,
 'User QA '||n, (array['manager','operator','viewer','tracking_report_only','tracking_financial_only','tracking_editor_only','tracking_read_only','manager'])[n]
 from generate_series(1,8) n;
insert into public.financial_institutions(id,organization_id,name) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Bank A QA'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Bank B QA');
insert into public.operations(id,organization_id,operation_number,institution_id,purpose) select
 ('40000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 ('10000000-0000-0000-0000-'||lpad((case when n=10 then 2 else 1 end)::text,12,'0'))::uuid,
 'QA-'||lpad(n::text,3,'0'),
 ('30000000-0000-0000-0000-'||lpad((case when n=10 then 2 else 1 end)::text,12,'0'))::uuid,'QA purpose'
 from generate_series(1,12) n;
insert into public.operation_financials(operation_id,organization_id,amount) select id,organization_id,
 case operation_number when 'QA-001' then 500000 when 'QA-002' then 350000 when 'QA-003' then 900000 else 999999 end
 from public.operations;
-- SQL fixtures model real Auth sessions required by migration 025.
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select id,id,now(),now(),'aal2' from auth.users;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","session_id":"20000000-0000-0000-0000-000000000001"}',true);
insert into public.operation_approval_tracking(operation_id,organization_id,approval_deadline,approval_status,technician_name_snapshot,responsible_name_snapshot)
select id,organization_id,
 case operation_number when 'QA-001' then (now() at time zone 'America/Araguaina')::date-6
 when 'QA-002' then (now() at time zone 'America/Araguaina')::date-1
 when 'QA-003' then (now() at time zone 'America/Araguaina')::date-10
 when 'QA-004' then (now() at time zone 'America/Araguaina')::date
 when 'QA-005' then (now() at time zone 'America/Araguaina')::date+1
 when 'QA-009' then null else (now() at time zone 'America/Araguaina')::date-30 end,
 case operation_number when 'QA-006' then 'approved' when 'QA-007' then 'rejected' when 'QA-008' then 'cancelled' else 'pending' end,
 case when operation_number='QA-003' then 'Technician B QA' else 'Technician A QA' end,
 case when operation_number='QA-002' then 'Maria QA' else 'Gustavo QA' end
 from public.operations where operation_number between 'QA-001' and 'QA-010';

set local role authenticated;
select is((public.proposal_tracking_report()->'kpis'->>'overdue_count')::int,3,'Only own organization pending overdue proposals counted');
select is((public.proposal_tracking_report()->'kpis'->>'overdue_amount_total')::numeric,1750000::numeric,'Amount is principal sum only, without interest or fees');
select is((public.proposal_tracking_report()->'kpis'->>'maximum_days')::int,10,'Maximum delay');
select ok(abs((public.proposal_tracking_report()->'kpis'->>'average_days')::numeric-(17::numeric/3))<0.0001,'Average delay uses active overdue only');
select is((public.proposal_tracking_report()->'kpis'->>'without_deadline_count')::int,1,'Pending without deadline is separate');
select is(public.proposal_tracking_report()->>'today',(statement_timestamp() at time zone 'America/Araguaina')::date::text,'Server uses operational date, not UTC day');
select is(public.proposal_tracking_report()->>'timezone','America/Araguaina','Timezone is explicit');
select is((public.proposal_tracking_report()->>'total_rows')::int,9,'No rows from other tenant or untracked operations');
select is(jsonb_array_length(public.proposal_tracking_report()->'technicians'),2,'Overdue grouped by technician');
select is(jsonb_array_length(public.proposal_tracking_report()->'responsibles'),2,'Overdue grouped independently by responsible');
select is((public.proposal_tracking_report()->'rows'->0->>'overdue_days')::int,10,'Default ordering is highest delay first');
select is((public.proposal_tracking_report('{"only_overdue":true}')->>'total_rows')::int,3,'Only overdue filter');
select is((public.proposal_tracking_report('{"without_deadline":true}')->>'total_rows')::int,1,'Without deadline filter');
select is((public.proposal_tracking_report('{"status":"approved"}')->'kpis'->>'overdue_count')::int,0,'Approved filter never creates active overdue');
select is((public.proposal_tracking_report('{"query":"QA-002"}')->>'total_rows')::int,1,'Operation number search is server-side');
select is((public.proposal_tracking_report('{"technician":"name:Technician B QA","only_overdue":true}')->>'total_rows')::int,1,'Technician filter');
select is((public.proposal_tracking_report('{"responsible":"name:Maria QA","only_overdue":true}')->>'total_rows')::int,1,'Responsible filter is independent');
select is((public.proposal_tracking_report('{"bank_id":"30000000-0000-0000-0000-000000000002"}')->>'total_rows')::int,0,'Other tenant bank cannot leak data');
select is((public.proposal_tracking_report(jsonb_build_object('start_date',((now() at time zone 'America/Araguaina')::date)::text,'end_date',((now() at time zone 'America/Araguaina')::date)::text))->>'total_rows')::int,1,'Period filters approval deadline inclusively');
select is(jsonb_array_length(public.proposal_tracking_report('{}',1,2)->'rows'),2,'Details paginated in database');
select throws_ok($$select public.proposal_tracking_report('{}',0,25)$$,'22023',null,'Invalid pagination rejected');
select throws_ok($$select public.proposal_tracking_report('{"organization_id":"10000000-0000-0000-0000-000000000002"}')$$,'22023',null,'Client organization cannot override tenant');
select throws_ok($$select public.save_proposal_tracking('40000000-0000-0000-0000-000000000010',1,'{"approval_status":"approved"}')$$,'42501',null,'Manager cannot mutate other organization');
select ok((select rejected_at is not null from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000007'),'Rejection timestamp recorded');
select ok((select cancelled_at is not null from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000008'),'Cancellation timestamp recorded');
select is(public.save_proposal_tracking('40000000-0000-0000-0000-000000000001',1,'{"approval_status":"approved","delay_reason":"sigiloso reason","delay_notes":"sigiloso notes"}'),2,'Manager can approve with optimistic version');
select is((select approval_deadline from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000001'),(now() at time zone 'America/Araguaina')::date-6,'Status-only change preserves historical deadline');
select is((select responsible_name_snapshot from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000001'),'Gustavo QA','Status-only change preserves responsible snapshot');
select is((public.proposal_tracking_report()->'kpis'->>'overdue_count')::int,2,'Approval immediately removes active delay');
select is((public.proposal_tracking_report()->'kpis'->>'overdue_amount_total')::numeric,1250000::numeric,'Approval immediately removes principal from overdue total');
select ok((select approved_at is not null from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000001'),'Approval timestamp recorded');
select ok((select created_by='20000000-0000-0000-0000-000000000001' and updated_by=created_by and last_follow_up_at is not null from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000001'),'Server metadata and follow-up recorded');
select throws_ok($$select public.save_proposal_tracking('40000000-0000-0000-0000-000000000001',1,'{"approval_status":"pending"}')$$,'40001',null,'Stale edit rejected');
select throws_ok($$update public.operation_approval_tracking set approval_status='pending'$$,'42501',null,'REST cannot bypass write RPC metadata or version checks');
select ok(exists(select 1 from public.audit_log where entity_type='operation_approval_tracking' and entity_id='40000000-0000-0000-0000-000000000001' and action='UPDATE' and changes?'approval_status' and changes?'delay_notes' and changes::text not like '%sigiloso%'),'Audit captures change without free text content');
select throws_ok($$select public.save_proposal_tracking('40000000-0000-0000-0000-000000000011',null,'{"approval_status":"pending","technician_profile_id":"20000000-0000-0000-0000-000000000008"}')$$,'23503',null,'Cross-organization profile denied');
select throws_ok($$select public.save_proposal_tracking('40000000-0000-0000-0000-000000000011',null,'{"approval_deadline":"infinity"}')$$,'22023',null,'Non-civil deadline rejected');
select throws_ok($$select public.save_proposal_tracking('40000000-0000-0000-0000-000000000011',null,'{"approval_status":"pending","created_by":"20000000-0000-0000-0000-000000000008"}')$$,'22023',null,'Client cannot forge metadata');
select is(public.save_proposal_tracking('40000000-0000-0000-0000-000000000011',null,'{"approval_status":"pending","technician_profile_id":"20000000-0000-0000-0000-000000000001","responsible_profile_id":"20000000-0000-0000-0000-000000000004"}'),1,'Existing operation adopts tracking without duplicated operation');
select is((select technician_name_snapshot from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000011'),'User QA 1','Technician snapshot comes from linked profile');
select throws_ok($$select public.save_proposal_tracking('40000000-0000-0000-0000-000000000011',null,'{"approval_status":"pending"}')$$,'40001',null,'Second creation cannot duplicate tracking');
reset role;
update public.profiles set full_name='Renamed QA' where id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select technician_name_snapshot from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000011'),'User QA 1','Profile rename preserves historical tracking snapshot');
select is(public.save_proposal_tracking('40000000-0000-0000-0000-000000000011',1,'{"approval_status":"pending","technician_profile_id":"20000000-0000-0000-0000-000000000001","responsible_profile_id":"20000000-0000-0000-0000-000000000004"}'),2,'Following up preserves linked profiles');
select is((select technician_name_snapshot from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000011'),'User QA 1','Following up does not rewrite historical snapshot');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal2","session_id":"20000000-0000-0000-0000-000000000004"}',true);
select is((public.proposal_tracking_report()->>'total_rows')::int,10,'Report-only role can read without operations permission');
select ok(private.has_permission('financial.read'),'Existing operations financial permission does not authorize report finances');
select ok(not(public.proposal_tracking_report()->'kpis'?'overdue_amount_total'),'Financial KPI key omitted without permission');
select ok(not jsonb_path_exists(public.proposal_tracking_report(),'$.**.amount'),'Detail financial amount absent from API without permission');
select ok(not jsonb_path_exists(public.proposal_tracking_report(),'$.**.overdue_amount_total'),'Group and KPI financial values absent from API without permission');
select is((select count(*)::int from public.operation_approval_tracking),10,'RLS report-only access does not require unrelated operations.read');
select throws_ok($$select public.save_proposal_tracking('40000000-0000-0000-0000-000000000001',2,'{"approval_status":"pending"}')$$,'42501',null,'Read-only cannot manage tracking');
select is(jsonb_array_length(public.proposal_tracking_options()->'profiles'),0,'Read-only does not receive editing profile catalog');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2","session_id":"20000000-0000-0000-0000-000000000002"}',true);
select is((select count(*)::int from public.operation_approval_tracking),0,'Operator has zero tracking rows by default');
select throws_ok($$select public.proposal_tracking_report()$$,'42501',null,'Operator dashboard RPC denied');
select throws_ok($$select public.proposal_tracking_options()$$,'42501',null,'Operator report options denied');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2","session_id":"20000000-0000-0000-0000-000000000003"}',true);
select throws_ok($$select public.proposal_tracking_report()$$,'42501',null,'Viewer dashboard denied');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal2","session_id":"20000000-0000-0000-0000-000000000005"}',true);
select throws_ok($$select public.proposal_tracking_report()$$,'42501',null,'Financial permission alone does not authorize report');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000007","role":"authenticated","aal":"aal2","session_id":"20000000-0000-0000-0000-000000000007"}',true);
select is((select count(*)::int from public.operation_approval_tracking),10,'Tracking read permission can read operational extension');
select throws_ok($$select public.proposal_tracking_report()$$,'42501',null,'Tracking read does not grant managerial dashboard');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated","aal":"aal2","session_id":"20000000-0000-0000-0000-000000000006"}',true);
select is(public.save_proposal_tracking('40000000-0000-0000-0000-000000000012',null,'{"approval_status":"pending"}'),1,'Explicit tracking manager can adopt operation');
select throws_ok($$select public.proposal_tracking_report()$$,'42501',null,'Tracking manage does not implicitly grant report');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000008","role":"authenticated","aal":"aal2","session_id":"20000000-0000-0000-0000-000000000008"}',true);
select is((public.proposal_tracking_report()->>'total_rows')::int,1,'Second organization sees only its own row');
select is((select count(*)::int from public.operation_approval_tracking),1,'Direct RLS isolates second organization');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.proposal_tracking_report()$$,'42501',null,'Missing authenticated identity denied');
reset role;
set local role anon;
select throws_ok($$select public.proposal_tracking_report()$$,'42501',null,'Anonymous cannot execute report');
reset role;

-- Pre-commit regressions: current-state timestamps and immutable decision history.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","session_id":"20000000-0000-0000-0000-000000000001"}',true);
set local role authenticated;
select set_config('qa.original_approved_at',(select approved_at::text from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000001'),true);
select is(public.save_proposal_tracking('40000000-0000-0000-0000-000000000001',2,'{"delay_notes":"Follow-up only QA"}'),3,'Same-status follow-up increments version');
select is((select approved_at::text from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000001'),current_setting('qa.original_approved_at'),'Same-status follow-up preserves decision timestamp');
select is(public.save_proposal_tracking('40000000-0000-0000-0000-000000000001',3,'{"approval_status":"pending"}'),4,'Approved proposal can be reopened coherently');
select ok((select approved_at is null and rejected_at is null and cancelled_at is null from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000001'),'Pending never has a terminal timestamp');
select is((public.proposal_tracking_report('{"only_overdue":true,"query":"QA-001"}')->>'total_rows')::int,1,'Reopened pending proposal follows retained deadline');
select ok(exists(select 1 from public.audit_log where entity_type='operation_approval_tracking' and entity_id='40000000-0000-0000-0000-000000000001' and changes->'approved_at'->>'old'=current_setting('qa.original_approved_at')::timestamptz::text) or exists(select 1 from public.audit_log where entity_type='operation_approval_tracking' and entity_id='40000000-0000-0000-0000-000000000001' and (changes->'approved_at'->>'old')::timestamptz=current_setting('qa.original_approved_at')::timestamptz and changes->'approved_at'->'new'='null'::jsonb),'Audit retains prior approval timestamp when reopened');
select is(public.save_proposal_tracking('40000000-0000-0000-0000-000000000001',4,'{"approval_status":"rejected"}'),5,'Rejection transition accepted');
select ok((select approved_at is null and rejected_at is not null and cancelled_at is null from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000001'),'Rejected has only rejected_at');
select is((public.proposal_tracking_report('{"only_overdue":true,"query":"QA-001"}')->>'total_rows')::int,0,'Rejection leaves active overdue set');
select is(public.save_proposal_tracking('40000000-0000-0000-0000-000000000001',5,'{"approval_status":"approved"}'),6,'New approval transition accepted');
select ok((select approved_at is not null and rejected_at is null and cancelled_at is null from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000001'),'Approved has only approved_at');
select is(public.save_proposal_tracking('40000000-0000-0000-0000-000000000001',6,'{"approval_status":"cancelled"}'),7,'Cancellation transition accepted');
select ok((select approved_at is null and rejected_at is null and cancelled_at is not null from public.operation_approval_tracking where operation_id='40000000-0000-0000-0000-000000000001'),'Cancelled has only cancelled_at');
select is((public.proposal_tracking_report('{"only_overdue":true,"query":"QA-001"}')->>'total_rows')::int,0,'Cancellation leaves active overdue set');
select ok(not jsonb_path_exists((select jsonb_agg(to_jsonb(a)) from public.audit_log a where entity_type='operation_approval_tracking'),'$.**.amount') and not jsonb_path_exists((select jsonb_agg(to_jsonb(a)) from public.audit_log a where entity_type='operation_approval_tracking'),'$.**.overdue_amount_total'),'Tracking audit contains no financial keys');
reset role;
-- Disable triggers only inside this rolled-back fixture to exercise the CHECK itself.
set local session_replication_role=replica;
select throws_ok($$update public.operation_approval_tracking set approval_status='pending',approved_at=now(),rejected_at=null,cancelled_at=null where operation_id='40000000-0000-0000-0000-000000000001'$$,'23514',null,'Constraint rejects pending with approved_at even without guard');
select throws_ok($$update public.operation_approval_tracking set approval_status='approved',approved_at=now(),rejected_at=now(),cancelled_at=null where operation_id='40000000-0000-0000-0000-000000000001'$$,'23514',null,'Constraint rejects conflicting terminal timestamps');
select throws_ok($$update public.operation_approval_tracking set approval_status='rejected',approved_at=null,rejected_at=null,cancelled_at=null where operation_id='40000000-0000-0000-0000-000000000001'$$,'23514',null,'Constraint rejects terminal state without its timestamp');
set local session_replication_role=origin;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2","session_id":"20000000-0000-0000-0000-000000000002"}',true);
set local role authenticated;
select is(private.proposal_tracking_operation_visible('40000000-0000-0000-0000-000000000001'),false,'RLS helper denies operation existence to unauthorized operator');
select throws_ok($$select * from private.proposal_tracking_rows('{}',current_date,true)$$,'42501',null,'Private rows helper cannot bypass financial permission');
reset role;

select ok(not exists(select 1 from public.role_permissions where role_key in ('operator','viewer') and permission_key in ('proposal_reports.read','proposal_reports.financial')),'Operator and viewer defaults preserved');
select is((select count(*)::int from public.role_permissions where role_key in ('admin','manager') and permission_key in ('proposal_tracking.read','proposal_tracking.manage','proposal_reports.read','proposal_reports.financial')),8,'Admin and manager get all four permissions');
select ok((select relrowsecurity from pg_class where oid='public.operation_approval_tracking'::regclass),'RLS enabled');
select ok(not exists(select 1 from public.operation_approval_tracking t left join public.operations o on (o.organization_id,o.id)=(t.organization_id,t.operation_id) where o.id is null),'Referential integrity preserved');
-- The deployed staging baseline requires a completed MFA challenge.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1","session_id":"20000000-0000-0000-0000-000000000001"}',true);
set local role authenticated;
select throws_ok($$select public.proposal_tracking_report()$$,'42501',null,'AAL1 manager cannot read report');
select throws_ok($$select public.proposal_tracking_options()$$,'42501',null,'AAL1 manager cannot read options');
select throws_ok($$select public.proposal_tracking_operation_search('QA')$$,'42501',null,'AAL1 manager cannot search operations');
select throws_ok($$select public.save_proposal_tracking('40000000-0000-0000-0000-000000000011',null,'{}')$$,'42501',null,'AAL1 manager cannot create tracking');
select is((select count(*)::int from public.operation_approval_tracking),0,'AAL1 manager cannot read tracking table');
select is(private.proposal_tracking_operation_visible('40000000-0000-0000-0000-000000000001'),false,'AAL1 manager cannot infer operation visibility');
reset role;
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='operation_approval_tracking' and policyname='operation_approval_tracking_require_aal2' and permissive='RESTRICTIVE'),'Tracking table has restrictive MFA policy');

select * from finish();
rollback;
