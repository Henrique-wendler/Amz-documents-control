begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_table('public','desktop_proposals','Integration table exists');
select col_is_unique('public','desktop_proposals','operation_id','One integration per central operation');
select hasnt_column('public','desktop_proposals','amount','Total is not duplicated outside operation_financials');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.desktop_proposals'::regclass),'RLS enabled and forced');
select ok(not has_table_privilege('authenticated','public.desktop_proposals','SELECT'),'No direct user reads of financial snapshots');
select ok(not has_table_privilege('authenticated','public.desktop_proposals','INSERT,UPDATE,DELETE'),'No direct user writes');
select ok(not has_function_privilege('authenticated','public.sync_desktop_proposal(uuid,jsonb,bigint,bigint)','EXECUTE'),'User cannot bypass Edge RPC boundary');
select ok(not has_function_privilege('anon','public.sync_desktop_proposal(uuid,jsonb,bigint,bigint)','EXECUTE'),'Anon cannot call sync RPC');
select ok(has_function_privilege('service_role','public.sync_desktop_proposal(uuid,jsonb,bigint,bigint)','EXECUTE'),'Server role has narrow RPC grant');
select ok(exists(select 1 from public.role_permissions where role_key='admin' and permission_key='desktop_proposals.sync'),'Admin gets dedicated permission');
select ok(exists(select 1 from public.role_permissions where role_key='manager' and permission_key='desktop_proposals.sync'),'Manager follows existing financial authoring pattern');
select ok(not exists(select 1 from public.role_permissions where role_key in ('operator','viewer') and permission_key='desktop_proposals.sync'),'No automatic operator or viewer grant');

insert into public.organizations(id,legal_name) values
 ('a6102800-0000-4000-8000-000000000001','Desktop sync QA A'),('a6102800-0000-4000-8000-000000000002','Desktop sync QA B');
insert into public.roles(role_key,name) values('desktop_sync_only','Desktop sync only QA');
insert into public.role_permissions(role_key,permission_key) values('desktop_sync_only','desktop_proposals.sync');
insert into auth.users(id,email) select ('b6102800-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'desktop-sql-'||n||'@example.invalid' from generate_series(1,5)n;
insert into public.profiles(id,organization_id,full_name,role_key,status) select
 ('b6102800-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=3 then 'a6102800-0000-4000-8000-000000000002'::uuid else 'a6102800-0000-4000-8000-000000000001'::uuid end,
 'Synthetic name '||n,(array['manager','operator','manager','manager','desktop_sync_only'])[n],case when n=4 then 'inactive' else 'active' end from generate_series(1,5)n;
insert into public.financial_institutions(id,organization_id,name,short_name) values
 ('c6102800-0000-4000-8000-000000000001','a6102800-0000-4000-8000-000000000001','Banco da Amazônia QA','BASA QA'),
 ('c6102800-0000-4000-8000-000000000002','a6102800-0000-4000-8000-000000000002','Banco da Amazônia QA','BASA QA');

create function pg_temp.payload(p_sync uuid default 'd6102800-0000-4000-8000-000000000001',p_number text default '2026-0001') returns jsonb language sql as $$
 select jsonb_build_object('sync_id',p_sync,'proposal_number',p_number,'proponent_name','Synthetic applicant',
  'created_at','2026-10-28T09:00:00+00:00','updated_at','2026-10-28T10:00:00+00:00',
  'created_by_technician_name','Historical creator','responsible_name','Synthetic name 5','technician_name','Synthetic name 1',
  'bank','  BANCO  DA AMAZÔNIA QA  ','purpose','Synthetic purpose','total_value','2000000.00','fno_value','1500000.00','of_value','500000.00');
$$;
create function pg_temp.call_sync(p_actor uuid,p_values jsonb,p_revision bigint default null,p_expected bigint default null) returns jsonb language plpgsql as $$
declare v_old text:=current_setting('request.jwt.claims',true); v_result jsonb;
begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 v_result:=private.sync_desktop_proposal_v1(p_actor,p_values,p_revision,p_expected);
 perform set_config('request.jwt.claims',coalesce(v_old,'{}'),true);
 return v_result;
end; $$;

select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000002',pg_temp.payload())$$,'DS403','permission_denied','Operator without sync permission denied');
select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000004',pg_temp.payload())$$,'DS403','permission_denied','Inactive profile denied');
select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',pg_temp.payload()||'{"organization_id":"a6102800-0000-4000-8000-000000000002"}')$$,'DS400','invalid_payload','Client tenant rejected');
select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',pg_temp.payload()||'{"created_by":"b6102800-0000-4000-8000-000000000003"}')$$,'DS400','invalid_payload','Client actor rejected');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()||'{"approval_status":"approved"}')$$,'DS400','invalid_payload','Management field rejected');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()-'total_value')$$,'DS400','invalid_payload','Required key cannot be omitted');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()||'{"sync_id":"invalid"}')$$,'DS400','invalid_payload','UUID required');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()||'{"sync_id":"d6102800-0000-1000-8000-000000000001"}')$$,'DS400','invalid_payload','UUID must be v4');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()||'{"total_value":1.25}')$$,'DS400','invalid_payload','JSON numeric money rejected');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()||'{"total_value":"1e3"}')$$,'DS400','invalid_payload','Exponent rejected');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()||'{"total_value":"-1"}')$$,'DS400','invalid_payload','Negative money rejected');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()||'{"total_value":"1.001"}')$$,'DS400','invalid_payload','No implicit rounding beyond cents');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()||'{"total_value":"10000000000000"}')$$,'DS400','invalid_payload','Database numeric limit enforced');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()||'{"updated_at":"2026-02-30T10:00:00Z"}')$$,'DS400','invalid_payload','Invalid civil timestamp rejected');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()||'{"updated_at":"2026-10-28"}')$$,'DS400','invalid_payload','Timestamp needs time and timezone');
select throws_ok($$select private.desktop_sync_payload(pg_temp.payload()||'{"updated_at":"2026-10-28T08:00:00Z"}')$$,'DS400','invalid_payload','Updated cannot precede known creation');
select throws_ok($$select private.desktop_sync_payload(jsonb_set(pg_temp.payload(),'{proponent_name}',to_jsonb(repeat('X',201))))$$,'DS400','invalid_payload','Text limit enforced in database too');
select is(private.desktop_sync_payload(pg_temp.payload()||'{"total_value":"12.3400"}')->>'total_value','12.34','Exact trailing zeros normalized without float');
select is(private.desktop_sync_payload(pg_temp.payload()||'{"total_value":"9999999999999.99"}')->>'total_value','9999999999999.99','Maximum exact numeric value preserved');
select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',pg_temp.payload()||'{"bank":"Unknown bank QA"}')$$,'DS404','institution_not_found','Missing bank is controlled error');
select is((select count(*) from public.desktop_proposals),0::bigint,'Failed validation leaves no partial integration');
select is((select count(*) from public.operations where organization_id='a6102800-0000-4000-8000-000000000001'),0::bigint,'Failed validation leaves no operation');

create temp table results(label text primary key,data jsonb);
insert into results values('created',pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',pg_temp.payload(),1));
select is((select data->>'result' from results where label='created'),'created','First sync creates');
select is((select data->>'remote_version' from results where label='created'),'1','Initial remote version');
select ok((select (data->>'ok')::boolean and (data->>'success')::boolean from results where label='created'),'Response supports both phase contracts');
select is((select data->>'server_version' from results where label='created'),'1','Phase 1 server_version compatibility');
select is((select count(*) from public.operations),1::bigint,'Exactly one central operation');
select is((select institution_id from public.operations),'c6102800-0000-4000-8000-000000000001'::uuid,'Bank matched by case/space normalization');
select is((select count(*) from public.financial_institutions),2::bigint,'No bank was created');
select is((select amount from public.operation_financials),2000000::numeric,'Total feeds operation_financials.amount directly');
select is((select fno_value from public.desktop_proposals),1500000::numeric,'FNO preserved separately');
select is((select of_value from public.desktop_proposals),500000::numeric,'OF preserved separately');
select is((select desktop_proposal_number from public.desktop_proposals),'2026-0001','Local public number retained');
select is((select created_by_technician_name from public.desktop_proposals),'Historical creator','Historical creator is text snapshot');
select ok((select technician_profile_id is null and responsible_profile_id is null from public.operation_approval_tracking),'Matching names do not imply profiles');
select ok((select approval_status='pending' and approval_deadline is null and last_follow_up_at is null from public.operation_approval_tracking),'New tracking has no invented deadline/follow-up');
select ok((select t.desktop_proposal_id=d.id from public.operation_approval_tracking t join public.desktop_proposals d using(operation_id)),'Tracking has unambiguous integration identity');
select is((select created_by from public.operations),'b6102800-0000-4000-8000-000000000001'::uuid,'Central actor is verified caller, not historical name');
select is((select created_by from public.desktop_proposals),'b6102800-0000-4000-8000-000000000001'::uuid,'Integration actor populated by server');
select ok(exists(select 1 from public.audit_log where entity_type='desktop_proposals' and actor_user_id='b6102800-0000-4000-8000-000000000001' and context->>'source'='desktop_sync' and context->>'sync_id'='d6102800-0000-4000-8000-000000000001' and context->>'result'='created'),'Creation audited with actor/org/identity/source');
select ok(not exists(select 1 from public.audit_log where context->>'source'='desktop_sync' and changes::text ~ '(2000000|1500000|500000)'),'Financial amounts absent from sync audit');
select ok(exists(select 1 from public.audit_log where entity_type='operation_financials' and changes->'amount'->>'redacted'='true'),'Underlying financial trigger redacts sync amount');
create temp table before_retry as select count(*) n from public.audit_log;
insert into results values('retry',pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',pg_temp.payload(),1,1));
select is((select data->>'result' from results where label='retry'),'unchanged','Identical retry is no-op');
select is((select count(*) from public.audit_log),(select n from before_retry),'No-op does not duplicate audit events');
select is((select count(*) from public.desktop_proposals),1::bigint,'No duplicate integration');
select is((select version from public.desktop_proposals),1::bigint,'No-op preserves version');

-- The web owns all management data after creation, including assignments and snapshots.
-- SQL fixtures model real Auth sessions required by migration 025.
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select id,id,now(),now(),'aal2' from auth.users;
select set_config('request.jwt.claims','{"sub":"b6102800-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"b6102800-0000-4000-8000-000000000001"}',true);
select public.save_proposal_tracking((select operation_id from public.desktop_proposals),1,
 '{"approval_status":"approved","approval_deadline":"2026-10-20","delay_reason":"QA management reason","delay_notes":"QA management notes","responsible_profile_id":"b6102800-0000-4000-8000-000000000005"}');
create temp table tracking_before as select to_jsonb(t) value from public.operation_approval_tracking t;
create temp table changed as select pg_temp.payload()||'{"updated_at":"2026-10-28T10:05:00Z","proponent_name":"Edited applicant QA","responsible_name":"Edited responsible QA","technician_name":"Edited technician QA","purpose":"Edited purpose QA","bank":"BASA QA","total_value":"2100000.25","fno_value":"1600000.25"}'::jsonb value;
insert into results values('updated',pg_temp.call_sync('b6102800-0000-4000-8000-000000000005',(select value from changed),2,1));
select is((select data->>'result' from results where label='updated'),'updated','Narrow permission is sufficient; broad financial.write not needed');
select is((select version from public.desktop_proposals),2::bigint,'New revision increments remote version');
select is((select amount from public.operation_financials),2100000.25::numeric,'New total retains cents');
select is((select fno_value from public.desktop_proposals),1600000.25::numeric,'Updated FNO preserved');
select is((select of_value from public.desktop_proposals),500000::numeric,'OF not inferred from total');
select is((select purpose from public.operations),'Edited purpose QA','Desktop purpose updated');
select is((select responsible_name from public.desktop_proposals),'Edited responsible QA','Desktop snapshot updated independently');
select is((select to_jsonb(t) from public.operation_approval_tracking t),(select value from tracking_before),'Entire existing management row preserved byte-for-byte');
select is((select updated_by from public.desktop_proposals),'b6102800-0000-4000-8000-000000000005'::uuid,'Update actor is current caller');
select is((select created_by from public.desktop_proposals),'b6102800-0000-4000-8000-000000000001'::uuid,'Central creation actor remains historical');
select is(pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',(select value from changed),2,1)->>'result','unchanged','Retry after lost acknowledgement ignores stale If-Match for identical data');
select is(pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',pg_temp.payload(),1)->>'result','stale','Older source timestamp cannot overwrite');
select is((select amount from public.operation_financials),2100000.25::numeric,'Stale payload preserves current amount');
select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',(select value||'{"purpose":"different"}' from changed),2)$$,'DS409','domain_conflict','Same source instant with different content conflicts');
select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',(select value||'{"updated_at":"2026-10-28T10:10:00Z"}' from changed),3,1)$$,'DS409','domain_conflict','Version guard rejects a stale writer');
select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',(select value||'{"updated_at":"2026-10-28T10:10:00Z","proposal_number":"2026-9999"}' from changed),3,2)$$,'DS409','domain_conflict','A bound proposal cannot silently change its public number');
select throws_ok($$update public.desktop_proposals set sync_id='d6102800-0000-4000-8000-000000000099'$$,'DS409','domain_conflict','Database trigger protects global identity too');
select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',pg_temp.payload('d6102800-0000-4000-8000-000000000002','2026-0001'))$$,'DS409','domain_conflict','Different UUID with same local number does not hijack operation');

insert into results values('tenant_b',pg_temp.call_sync('b6102800-0000-4000-8000-000000000003',pg_temp.payload(),1));
select is((select data->>'organization_id' from results where label='tenant_b'),'a6102800-0000-4000-8000-000000000002','Tenant derived only from authenticated actor');
select isnt((select data->>'operation_id' from results where label='tenant_b'),(select data->>'operation_id' from results where label='created'),'Same UUID in a different tenant is isolated');
select is((select count(*) from public.desktop_proposals where organization_id='a6102800-0000-4000-8000-000000000001'),1::bigint,'Other tenant did not alter or append A');
select is((select amount from public.operation_financials where organization_id='a6102800-0000-4000-8000-000000000001'),2100000.25::numeric,'Tenant A financial data preserved');

-- Explicit official-name/alias coverage, and exact approved financial example.
create temp table exact_example as select pg_temp.payload('d6102800-0000-4000-8000-000000000042','2026-0042')||
 '{"bank":"Banco da Amazônia QA","total_value":"100000.00","fno_value":"70000.00","of_value":"30000.00"}'::jsonb value;
select is(pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',(select value from exact_example),1)->>'result','created','Official institution name resolves deterministically');
select is((select o.institution_id from public.operations o join public.desktop_proposals d on d.operation_id=o.id where d.sync_id='d6102800-0000-4000-8000-000000000042'),'c6102800-0000-4000-8000-000000000001'::uuid,'Official name selects existing tenant bank');
select is((select f.amount::text from public.operation_financials f join public.desktop_proposals d using(operation_id) where d.sync_id='d6102800-0000-4000-8000-000000000042'),'100000.00','Approved total remains exact numeric');
select is((select fno_value::text from public.desktop_proposals where sync_id='d6102800-0000-4000-8000-000000000042'),'70000.00','Approved FNO remains exact numeric');
select is((select of_value::text from public.desktop_proposals where sync_id='d6102800-0000-4000-8000-000000000042'),'30000.00','Approved OF remains exact numeric');
select is(pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',(select value||'{"bank":"BASA QA","updated_at":"2026-10-28T11:00:00Z"}' from exact_example),2)->>'result','updated','Short name resolves to existing bank');
select is(pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',(select value||'{"bank":"  basa   qa  ","updated_at":"2026-10-28T11:05:00Z"}' from exact_example),3)->>'result','updated','Alias case and repeated spaces normalize deterministically');
select is((select count(*) from public.financial_institutions),2::bigint,'Name/alias normalization never creates a catalog entry');

insert into public.financial_institutions(organization_id,name) values('a6102800-0000-4000-8000-000000000001',' BANCO DA AMAZÔNIA QA ');
select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',pg_temp.payload('d6102800-0000-4000-8000-000000000003','2026-0003'))$$,'DS409','domain_conflict','Ambiguous normalized bank does not choose arbitrarily');
select is((select count(*) from public.desktop_proposals),3::bigint,'Ambiguous bank leaves no partial records');

-- Inject failure AFTER operation/integration/audit writes, inside this rolled-back test transaction only.
create function pg_temp.fail_desktop_financial_write() returns trigger language plpgsql as $$
begin
 if current_setting('qa.desktop_financial_failure',true)='enabled'
  and (tg_op='UPDATE' or not exists(select 1 from public.operation_financials where operation_id=new.operation_id)) then
  raise exception using errcode='P0001',message='Synthetic financial failure';
 end if;
 return new;
end; $$;
create trigger qa_desktop_financial_failure before insert or update on public.operation_financials
for each row execute function pg_temp.fail_desktop_financial_write();
create function pg_temp.integration_state() returns jsonb language sql as $$
 select jsonb_build_object(
  'operations',(select jsonb_agg(to_jsonb(o) order by id) from public.operations o),
  'integrations',(select jsonb_agg(to_jsonb(d) order by id) from public.desktop_proposals d),
  'financials',(select jsonb_agg(to_jsonb(f) order by operation_id) from public.operation_financials f),
  'tracking',(select jsonb_agg(to_jsonb(t) order by operation_id) from public.operation_approval_tracking t),
  'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.audit_log a));
$$;
create temp table before_injected_failure as select pg_temp.integration_state() value;
select set_config('qa.desktop_financial_failure','enabled',true);
select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',pg_temp.payload('d6102800-0000-4000-8000-000000000090','2026-0090')||'{"bank":"BASA QA"}')$$,'P0001','Synthetic financial failure','Intermediate financial INSERT failure aborts the RPC');
select is(pg_temp.integration_state(),(select value from before_injected_failure),'Failed create leaves all entities and audit exactly unchanged');
select throws_ok($$select pg_temp.call_sync('b6102800-0000-4000-8000-000000000001',(select value||'{"bank":"BASA QA","updated_at":"2026-10-28T12:00:00Z","purpose":"Must roll back","total_value":"100001.01"}' from exact_example),4)$$,'P0001','Synthetic financial failure','Intermediate financial UPDATE failure aborts earlier desktop/operation writes');
select is(pg_temp.integration_state(),(select value from before_injected_failure),'Failed update preserves snapshots, versions, financials, tracking and audit bit-for-bit');
select set_config('qa.desktop_financial_failure','disabled',true);
drop trigger qa_desktop_financial_failure on public.operation_financials;
select is((select count(*) from public.desktop_proposals where sync_id='d6102800-0000-4000-8000-000000000090'),0::bigint,'Failed create never leaves a link behind');
select is((select count(*) from public.operations where organization_id='a6102800-0000-4000-8000-000000000001' and operation_number='2026-0090'),0::bigint,'Failed create never leaves an operation/financial target');

set local role authenticated;
select throws_ok($$select * from public.desktop_proposals$$,'42501',null,'Direct REST-style read denied');
select throws_ok($$update public.desktop_proposals set proponent_name='spoof'$$,'42501',null,'Direct update denied');
select throws_ok($$select public.sync_desktop_proposal('b6102800-0000-4000-8000-000000000003','{}')$$,'42501',null,'User cannot forge actor through public RPC');
reset role;
set constraints all immediate;
select ok(not exists(select 1 from public.desktop_proposals d left join public.operation_approval_tracking t on t.operation_id=d.operation_id where t.operation_id is null),'No orphan tracking');
select ok(not exists(select 1 from public.desktop_proposals d left join public.operation_financials f on (f.organization_id,f.operation_id)=(d.organization_id,d.operation_id) where f.operation_id is null),'No orphan financials');
select * from finish();
rollback;
