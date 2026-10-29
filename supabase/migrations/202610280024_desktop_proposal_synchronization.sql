-- Desktop metadata integration. No browser table access; only the authenticated Edge boundary may call the RPC.
insert into public.permissions(permission_key,description)
values('desktop_proposals.sync','Sincronizar metadados de propostas do desktop')
on conflict(permission_key) do update set description=excluded.description;
insert into public.role_permissions(role_key,permission_key)
select role_key,'desktop_proposals.sync' from public.roles where role_key in ('admin','manager')
on conflict do nothing;
-- Operator has no general financial write permission: grant this narrow permission explicitly when approved.

create table public.desktop_proposals (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 sync_id uuid not null check(sync_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 operation_id uuid not null unique,
 desktop_proposal_number text not null check(length(desktop_proposal_number) between 1 and 100),
 proponent_name text not null check(length(proponent_name)<=200),
 source_created_at timestamptz check(source_created_at is null or isfinite(source_created_at)),
 source_updated_at timestamptz check(source_updated_at is null or isfinite(source_updated_at)),
 created_by_technician_name text check(length(created_by_technician_name)<=200),
 responsible_name text not null check(length(responsible_name)<=200),
 technician_name text not null check(length(technician_name)<=200),
 fno_value numeric(15,2) not null check(fno_value>=0),
 of_value numeric(15,2) not null check(of_value>=0),
 payload_version integer not null default 1 check(payload_version=1),
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 source_revision bigint check(source_revision>0),
 last_synced_at timestamptz not null default now(),
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 version bigint not null default 1 check(version>0),
 unique(organization_id,sync_id), unique(organization_id,id),
 foreign key(organization_id,operation_id) references public.operations(organization_id,id) on delete restrict,
 -- The existing tracking table is unchanged. A new integration must have its tracking at commit time.
 foreign key(operation_id) references public.operation_approval_tracking(operation_id) deferrable initially deferred,
 check(source_updated_at is null or source_created_at is null or source_updated_at>=source_created_at)
);
alter table public.desktop_proposals enable row level security;
alter table public.desktop_proposals force row level security;
revoke all on public.desktop_proposals from public,anon,authenticated,service_role;
-- No permissive policies: even an accidental future grant cannot expose financial snapshots.
create policy desktop_proposals_require_aal2 on public.desktop_proposals as restrictive for all to authenticated
using(private.current_user_has_aal2()) with check(private.current_user_has_aal2());

create function private.guard_desktop_proposal() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
  or new.sync_id is distinct from old.sync_id or new.operation_id is distinct from old.operation_id
  or new.desktop_proposal_number is distinct from old.desktop_proposal_number
  or new.source_created_at is distinct from old.source_created_at
  or new.created_by_technician_name is distinct from old.created_by_technician_name) then
  raise exception using errcode='DS409',message='domain_conflict';
 end if;
 return new;
end; $$;
revoke all on function private.guard_desktop_proposal() from public,anon,authenticated,service_role;
create trigger desktop_proposals_guard before update on public.desktop_proposals for each row execute function private.guard_desktop_proposal();
create trigger desktop_proposals_metadata before insert or update on public.desktop_proposals for each row execute function private.set_row_metadata();

create function private.audit_desktop_proposal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(organization_id,actor_user_id,entity_type,entity_id,action,changes,context)
 values(new.organization_id,auth.uid(),'desktop_proposals',new.id,tg_op,
  jsonb_build_object('metadata',jsonb_build_object('changed',true,'redacted',true)),
  jsonb_build_object('source','desktop_sync','sync_id',new.sync_id,'operation_id',new.operation_id,
                    'result',case when tg_op='INSERT' then 'created' else 'updated' end,'remote_version',new.version));
 return new;
end; $$;
revoke all on function private.audit_desktop_proposal() from public,anon,authenticated,service_role;
create trigger desktop_proposals_audit after insert or update on public.desktop_proposals for each row execute function private.audit_desktop_proposal();

-- The pre-existing financial audit includes amount. Preserve its web behavior, but redact the new sync path.
-- No trigger/FK is disabled, and no global session_replication_role bypass is used.
create function private.audit_operation_financial_sync() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 v_old jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 v_new jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 v_row jsonb:=case when tg_op='DELETE' then v_old else v_new end;
 v_context jsonb:=jsonb_build_object('source','database_trigger'); v_changes jsonb; v_sync uuid;
begin
 if current_setting('app.desktop_sync_operation',true)=v_row->>'operation_id' then
  select sync_id into v_sync from public.desktop_proposals
  where operation_id=(v_row->>'operation_id')::uuid and organization_id=(v_row->>'organization_id')::uuid;
 end if;
 if v_sync is not null then
  v_changes:=jsonb_build_object('amount',jsonb_build_object('changed',true,'redacted',true));
  v_context:=jsonb_build_object('source','desktop_sync','sync_id',v_sync,'operation_id',v_row->>'operation_id');
 else
  v_old:=private.redact_audit_payload('operation_financials',v_old);
  v_new:=private.redact_audit_payload('operation_financials',v_new);
  v_changes:=case tg_op when 'INSERT' then jsonb_build_object('new',v_new)
   when 'DELETE' then jsonb_build_object('old',v_old) else private.audit_changed_fields(v_old,v_new) end;
 end if;
 insert into public.audit_log(organization_id,actor_user_id,entity_type,entity_id,action,changes,request_id,context)
 values((v_row->>'organization_id')::uuid,auth.uid(),'operation_financials',(v_row->>'operation_id')::uuid,
  tg_op,v_changes,nullif(current_setting('app.request_id',true),''),v_context);
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
revoke all on function private.audit_operation_financial_sync() from public,anon,authenticated,service_role;
drop trigger operation_financials_audit_log on public.operation_financials;
create trigger operation_financials_audit_log after insert or update or delete on public.operation_financials
for each row execute function private.audit_operation_financial_sync();

create function private.desktop_sync_payload(p_payload jsonb) returns jsonb
language plpgsql set search_path='' set timezone='UTC' as $$
declare
 v_fields text[]:=array['sync_id','proposal_number','proponent_name','created_at','updated_at','created_by_technician_name',
  'responsible_name','technician_name','bank','purpose','total_value','fno_value','of_value'];
 v_key text; v_limit integer; v_result jsonb:=p_payload; v_number numeric; v_created timestamptz; v_updated timestamptz;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or not p_payload ?& v_fields
  or (select count(*) from jsonb_object_keys(p_payload))<>array_length(v_fields,1) then
  raise exception using errcode='DS400',message='invalid_payload'; end if;
 if jsonb_typeof(p_payload->'sync_id')<>'string'
  or (p_payload->>'sync_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  raise exception using errcode='DS400',message='invalid_payload'; end if;
 v_result:=jsonb_set(v_result,'{sync_id}',to_jsonb((p_payload->>'sync_id')::uuid::text));
 foreach v_key in array array['proposal_number','proponent_name','created_by_technician_name','responsible_name','technician_name','bank','purpose'] loop
  if v_key='created_by_technician_name' and p_payload->v_key='null'::jsonb then continue; end if;
  v_limit:=case v_key when 'proposal_number' then 100 when 'purpose' then 500 else 200 end;
  if jsonb_typeof(p_payload->v_key)<>'string' or length(p_payload->>v_key)>v_limit
   or (p_payload->>v_key) ~ '[[:cntrl:]]'
   or (v_key in ('proposal_number','bank') and btrim(p_payload->>v_key)='') then
   raise exception using errcode='DS400',message='invalid_payload'; end if;
  v_result:=jsonb_set(v_result,array[v_key],to_jsonb(btrim(p_payload->>v_key)));
 end loop;
 foreach v_key in array array['created_at','updated_at'] loop
  if p_payload->v_key='null'::jsonb then continue; end if;
  if jsonb_typeof(p_payload->v_key)<>'string' or length(p_payload->>v_key)>40
   or (p_payload->>v_key)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
   raise exception using errcode='DS400',message='invalid_payload'; end if;
  v_result:=jsonb_set(v_result,array[v_key],to_jsonb((p_payload->>v_key)::timestamptz));
 end loop;
 v_created:=(v_result->>'created_at')::timestamptz; v_updated:=(v_result->>'updated_at')::timestamptz;
 if (v_created is not null and not isfinite(v_created)) or (v_updated is not null and not isfinite(v_updated))
  or v_updated<v_created then raise exception using errcode='DS400',message='invalid_payload'; end if;
 foreach v_key in array array['total_value','fno_value','of_value'] loop
  if jsonb_typeof(p_payload->v_key)<>'string' or length(p_payload->>v_key)>40
   or (p_payload->>v_key)!~'^(0|[1-9][0-9]{0,12})(\.[0-9]{1,20})?$' then
   raise exception using errcode='DS400',message='invalid_payload'; end if;
  v_number:=(p_payload->>v_key)::numeric;
  if v_number>9999999999999.99 or v_number<>round(v_number,2) then
   raise exception using errcode='DS400',message='invalid_payload'; end if;
  v_result:=jsonb_set(v_result,array[v_key],to_jsonb(v_number::numeric(15,2)::text));
 end loop;
 return v_result;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
 raise exception using errcode='DS400',message='invalid_payload';
end; $$;
revoke all on function private.desktop_sync_payload(jsonb) from public,anon,authenticated,service_role;

create function private.desktop_sync_response(p_row public.desktop_proposals,p_result text) returns jsonb
language sql set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('success',p_result<>'stale','ok',p_result<>'stale','sync_id',p_row.sync_id,
  'organization_id',p_row.organization_id,'operation_id',p_row.operation_id,'remote_version',p_row.version::text,
  'server_version',p_row.version::text,'remote_updated_at',p_row.updated_at,'result',p_result);
$$;
revoke all on function private.desktop_sync_response(public.desktop_proposals,text) from public,anon,authenticated,service_role;

create function public.sync_desktop_proposal(p_actor_id uuid,p_payload jsonb,p_source_revision bigint default null,
 p_expected_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
 v_org uuid; v_payload jsonb; v_sync uuid; v_hash text; v_bank uuid; v_banks uuid[]; v_operation uuid;
 v_existing public.desktop_proposals; v_result public.desktop_proposals; v_time timestamptz; v_created timestamptz;
 v_previous_claims text:=current_setting('request.jwt.claims',true);
 v_previous_operation text:=current_setting('app.desktop_sync_operation',true);
begin
 -- This routine is intentionally unavailable to user JWTs, including admins. The Edge verifies their real token/AAL2.
 if auth.role() is distinct from 'service_role' or p_actor_id is null then
  raise exception using errcode='DS403',message='permission_denied'; end if;
 select p.organization_id into v_org from public.profiles p
 join public.organizations o on o.id=p.organization_id and o.status='active' and o.deleted_at is null
 join public.roles r on r.role_key=p.role_key and r.status='active'
 join public.role_permissions rp on rp.role_key=p.role_key and rp.permission_key='desktop_proposals.sync'
 where p.id=p_actor_id and p.status='active';
 if v_org is null then raise exception using errcode='DS403',message='permission_denied'; end if;
 v_payload:=private.desktop_sync_payload(p_payload);
 if p_source_revision is not null and p_source_revision<=0 or p_expected_version is not null and p_expected_version<=0 then
  raise exception using errcode='DS400',message='invalid_payload'; end if;
 v_sync:=(v_payload->>'sync_id')::uuid; v_time:=(v_payload->>'updated_at')::timestamptz;
 v_created:=(v_payload->>'created_at')::timestamptz;
 v_hash:=encode(extensions.digest(v_payload::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_sync::text,24));
 select * into v_existing from public.desktop_proposals where organization_id=v_org and sync_id=v_sync for update;
 if found then
  if v_existing.payload_hash=v_hash then return private.desktop_sync_response(v_existing,'unchanged'); end if;
  if (v_time is null and v_existing.source_updated_at is not null) or v_time<v_existing.source_updated_at then
   return private.desktop_sync_response(v_existing,'stale'); end if;
  if v_time is not distinct from v_existing.source_updated_at
   or (p_source_revision is not null and p_source_revision<=v_existing.source_revision)
   or (p_expected_version is not null and p_expected_version<>v_existing.version)
   or v_existing.desktop_proposal_number<>v_payload->>'proposal_number'
   or v_existing.source_created_at is distinct from v_created
   or v_existing.created_by_technician_name is distinct from v_payload->>'created_by_technician_name' then
   raise exception using errcode='DS409',message='domain_conflict'; end if;
  v_operation:=v_existing.operation_id;
  perform 1 from public.operations where organization_id=v_org and id=v_operation and deleted_at is null for update;
  if not found then raise exception using errcode='DS409',message='domain_conflict'; end if;
 else
  if p_expected_version is not null then raise exception using errcode='DS409',message='domain_conflict'; end if;
  if exists(select 1 from public.operations where organization_id=v_org and operation_number=v_payload->>'proposal_number') then
   raise exception using errcode='DS409',message='domain_conflict'; end if;
  v_operation:=gen_random_uuid();
 end if;
 -- Normalize only existing tenant catalog names/aliases. Never create or guess an institution.
 select array_agg(i.id) into v_banks from public.financial_institutions i
 where i.organization_id=v_org and i.status='active' and i.deleted_at is null
 and (lower(regexp_replace(btrim(i.name),'[[:space:]]+',' ','g'))=lower(regexp_replace(btrim(v_payload->>'bank'),'[[:space:]]+',' ','g'))
   or lower(regexp_replace(btrim(i.short_name),'[[:space:]]+',' ','g'))=lower(regexp_replace(btrim(v_payload->>'bank'),'[[:space:]]+',' ','g')));
 if coalesce(array_length(v_banks,1),0)=0 then raise exception using errcode='DS404',message='institution_not_found'; end if;
 if array_length(v_banks,1)<>1 then raise exception using errcode='DS409',message='domain_conflict'; end if;
 v_bank:=v_banks[1];
 perform 1 from public.financial_institutions where id=v_bank and organization_id=v_org and status='active' and deleted_at is null for share;
 if not found then raise exception using errcode='DS404',message='institution_not_found'; end if;
 -- Trusted actor context comes exclusively from the Edge's verified getUser token, never from the payload.
 -- It lets existing metadata/audit triggers retain the actual actor, instead of recording a service account.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated','aal','aal2')::text,true);
 perform set_config('app.desktop_sync_operation',v_operation::text,true);
 if v_existing.id is null then
  insert into public.operations(id,organization_id,operation_number,institution_id,purpose)
  values(v_operation,v_org,v_payload->>'proposal_number',v_bank,v_payload->>'purpose');
  insert into public.desktop_proposals(organization_id,sync_id,operation_id,desktop_proposal_number,proponent_name,
   source_created_at,source_updated_at,created_by_technician_name,responsible_name,technician_name,fno_value,of_value,payload_hash,source_revision)
  values(v_org,v_sync,v_operation,v_payload->>'proposal_number',v_payload->>'proponent_name',v_created,v_time,
   v_payload->>'created_by_technician_name',v_payload->>'responsible_name',v_payload->>'technician_name',
   (v_payload->>'fno_value')::numeric,(v_payload->>'of_value')::numeric,v_hash,p_source_revision) returning * into v_result;
  insert into public.operation_financials(operation_id,organization_id,amount,updated_by)
  values(v_operation,v_org,(v_payload->>'total_value')::numeric,p_actor_id);
  insert into public.operation_approval_tracking(operation_id,organization_id,desktop_proposal_id,
   responsible_name_snapshot,technician_name_snapshot)
  values(v_operation,v_org,v_result.id,v_result.responsible_name,v_result.technician_name);
 else
  update public.operations set institution_id=v_bank,purpose=v_payload->>'purpose'
  where organization_id=v_org and id=v_operation and (institution_id is distinct from v_bank or purpose is distinct from v_payload->>'purpose');
  update public.desktop_proposals set proponent_name=v_payload->>'proponent_name',source_updated_at=v_time,
   responsible_name=v_payload->>'responsible_name',technician_name=v_payload->>'technician_name',
   fno_value=(v_payload->>'fno_value')::numeric,of_value=(v_payload->>'of_value')::numeric,
   payload_hash=v_hash,source_revision=coalesce(p_source_revision,source_revision),last_synced_at=now()
  where id=v_existing.id returning * into v_result;
  insert into public.operation_financials(operation_id,organization_id,amount,updated_by)
  values(v_operation,v_org,(v_payload->>'total_value')::numeric,p_actor_id)
  on conflict(operation_id) do update set amount=excluded.amount
  where public.operation_financials.organization_id=v_org and public.operation_financials.amount is distinct from excluded.amount;
  -- Existing management data, assignments and follow-up timestamps are wholly web-owned.
 end if;
 perform set_config('request.jwt.claims',coalesce(v_previous_claims,'{}'),true);
 perform set_config('app.desktop_sync_operation',coalesce(v_previous_operation,''),true);
 return private.desktop_sync_response(v_result,case when v_existing.id is null then 'created' else 'updated' end);
exception when unique_violation or foreign_key_violation then
 raise exception using errcode='DS409',message='domain_conflict';
end; $$;
revoke all on function public.sync_desktop_proposal(uuid,jsonb,bigint,bigint) from public,anon,authenticated;
grant execute on function public.sync_desktop_proposal(uuid,jsonb,bigint,bigint) to service_role;
comment on table public.desktop_proposals is 'Server-only desktop identity/snapshots. Financial total remains operation_financials.amount.';
