-- Proposal approval tracking: operational status remains in operations.
insert into public.permissions(permission_key, description) values
 ('proposal_tracking.read','Consultar acompanhamento de aprovação'),
 ('proposal_tracking.manage','Gerenciar acompanhamento de aprovação'),
 ('proposal_reports.read','Consultar relatório gerencial de propostas'),
 ('proposal_reports.financial','Consultar valores no relatório gerencial de propostas')
on conflict (permission_key) do update set description=excluded.description;
insert into public.role_permissions(role_key,permission_key)
select role_key,permission_key from public.roles cross join public.permissions
where role_key in ('admin','manager') and permission_key in
 ('proposal_tracking.read','proposal_tracking.manage','proposal_reports.read','proposal_reports.financial')
on conflict do nothing;

alter table public.profiles add constraint profiles_organization_identity_unique unique(organization_id,id);
create table public.operation_approval_tracking (
 operation_id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 approval_deadline date check(approval_deadline is null or isfinite(approval_deadline)),
 approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected','cancelled')),
 approved_at timestamptz,
 rejected_at timestamptz,
 cancelled_at timestamptz,
 responsible_profile_id uuid,
 responsible_name_snapshot text not null default '' check(length(responsible_name_snapshot)<=200),
 technician_profile_id uuid,
 technician_name_snapshot text not null default '' check(length(technician_name_snapshot)<=200),
 delay_reason text not null default '' check(length(delay_reason)<=500),
 delay_notes text not null default '' check(length(delay_notes)<=4000),
 last_follow_up_at timestamptz,
 desktop_proposal_id uuid,
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,
 version integer not null default 1 check(version>=1),
 constraint approval_tracking_status_timestamps_check check(
  (approval_status='pending' and approved_at is null and rejected_at is null and cancelled_at is null)
  or (approval_status='approved' and approved_at is not null and rejected_at is null and cancelled_at is null)
  or (approval_status='rejected' and approved_at is null and rejected_at is not null and cancelled_at is null)
  or (approval_status='cancelled' and approved_at is null and rejected_at is null and cancelled_at is not null)
 ),
 constraint approval_tracking_operation_fk foreign key(organization_id,operation_id)
  references public.operations(organization_id,id) on delete restrict,
 constraint approval_tracking_responsible_fk foreign key(organization_id,responsible_profile_id)
  references public.profiles(organization_id,id) on delete restrict,
 constraint approval_tracking_technician_fk foreign key(organization_id,technician_profile_id)
  references public.profiles(organization_id,id) on delete restrict
);
create index approval_tracking_deadline_idx on public.operation_approval_tracking(organization_id,approval_deadline) where approval_status='pending';
create index approval_tracking_technician_idx on public.operation_approval_tracking(organization_id,technician_profile_id);
create index approval_tracking_responsible_idx on public.operation_approval_tracking(organization_id,responsible_profile_id);
alter table public.operation_approval_tracking enable row level security;
revoke all on public.operation_approval_tracking from public,anon,authenticated;
grant select on public.operation_approval_tracking to authenticated;
create function private.proposal_tracking_operation_visible(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and (private.has_permission('proposal_tracking.read') or private.has_permission('proposal_tracking.manage') or private.has_permission('proposal_reports.read'))
 and exists(select 1 from public.operations where id=p_id and private.same_organization(organization_id) and deleted_at is null);
$$;
revoke all on function private.proposal_tracking_operation_visible(uuid) from public,anon;
grant execute on function private.proposal_tracking_operation_visible(uuid) to authenticated;
create policy approval_tracking_select on public.operation_approval_tracking for select to authenticated
using(private.same_organization(organization_id) and
 (private.has_permission('proposal_tracking.read') or private.has_permission('proposal_tracking.manage') or private.has_permission('proposal_reports.read'))
 and private.proposal_tracking_operation_visible(operation_id));
-- Writes are RPC-only, so metadata and optimistic locking cannot be bypassed through REST.

create function private.proposal_tracking_require(p_permission text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_organization uuid:=private.current_user_organization_id();
begin
 if auth.uid() is null or v_organization is null or not private.has_permission(p_permission) then
  raise exception using errcode='42501',message='Sem permissão para acompanhamento de propostas.';
 end if;
 return v_organization;
end; $$;
revoke all on function private.proposal_tracking_require(text) from public,anon,authenticated;

create function private.proposal_overdue_days(p_status text,p_deadline date,p_today date) returns integer
language sql immutable set search_path='' as $$
 select case when p_status='pending' and p_deadline<p_today then p_today-p_deadline else 0 end;
$$;
revoke all on function private.proposal_overdue_days(text,date,date) from public,anon,authenticated;

create function private.guard_proposal_tracking() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.operation_id is distinct from old.operation_id or new.organization_id is distinct from old.organization_id then
   raise exception using errcode='23514',message='O vínculo da operação não pode ser alterado.';
  end if;
  if new.technician_profile_id=old.technician_profile_id then new.technician_name_snapshot:=old.technician_name_snapshot; end if;
  if new.responsible_profile_id=old.responsible_profile_id then new.responsible_name_snapshot:=old.responsible_name_snapshot; end if;
 else
  new.approved_at:=null; new.rejected_at:=null; new.cancelled_at:=null;
  new.created_by:=auth.uid(); new.updated_by:=auth.uid(); new.created_at:=now(); new.updated_at:=now();
 end if;
 if new.technician_profile_id is not null and (tg_op='INSERT' or new.technician_profile_id is distinct from old.technician_profile_id) then
  select full_name into new.technician_name_snapshot from public.profiles where organization_id=new.organization_id and id=new.technician_profile_id;
  if not found then raise exception using errcode='23503',message='Técnico indisponível na organização atual.'; end if;
 end if;
 if new.responsible_profile_id is not null and (tg_op='INSERT' or new.responsible_profile_id is distinct from old.responsible_profile_id) then
  select full_name into new.responsible_name_snapshot from public.profiles where organization_id=new.organization_id and id=new.responsible_profile_id;
  if not found then raise exception using errcode='23503',message='Responsável indisponível na organização atual.'; end if;
 end if;
 -- Terminal timestamps describe the current state; prior decisions remain in audit_log.
 new.approved_at:=null; new.rejected_at:=null; new.cancelled_at:=null;
 if new.approval_status='approved' then
  new.approved_at:=case when tg_op='UPDATE' and old.approval_status='approved' then old.approved_at else now() end;
 elsif new.approval_status='rejected' then
  new.rejected_at:=case when tg_op='UPDATE' and old.approval_status='rejected' then old.rejected_at else now() end;
 elsif new.approval_status='cancelled' then
  new.cancelled_at:=case when tg_op='UPDATE' and old.approval_status='cancelled' then old.cancelled_at else now() end;
 end if;
 return new;
end; $$;
revoke all on function private.guard_proposal_tracking() from public,anon,authenticated;
create trigger approval_tracking_guard before insert or update on public.operation_approval_tracking for each row execute function private.guard_proposal_tracking();
create trigger approval_tracking_metadata before insert or update on public.operation_approval_tracking for each row execute function private.set_row_metadata();

create function private.audit_proposal_tracking() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_old jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 v_new jsonb:=to_jsonb(new); v_changes jsonb; v_key text;
begin
 v_changes:=private.audit_changed_fields(
  v_old-array['created_at','created_by','updated_at','updated_by','version','delay_reason','delay_notes','responsible_name_snapshot','technician_name_snapshot'],
  v_new-array['created_at','created_by','updated_at','updated_by','version','delay_reason','delay_notes','responsible_name_snapshot','technician_name_snapshot']);
 foreach v_key in array array['delay_reason','delay_notes','responsible_name_snapshot','technician_name_snapshot'] loop
  if v_old->v_key is distinct from v_new->v_key then
   v_changes:=v_changes||jsonb_build_object(v_key,jsonb_build_object('changed',true,'redacted',true));
  end if;
 end loop;
 insert into public.audit_log(organization_id,actor_user_id,entity_type,entity_id,action,changes,context)
 values(new.organization_id,auth.uid(),'operation_approval_tracking',new.operation_id,tg_op,v_changes,jsonb_build_object('source','database_trigger'));
 return new;
end; $$;
revoke all on function private.audit_proposal_tracking() from public,anon,authenticated;
create trigger approval_tracking_audit after insert or update on public.operation_approval_tracking for each row execute function private.audit_proposal_tracking();

create function public.save_proposal_tracking(p_operation_id uuid,p_expected_version integer,p_values jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.proposal_tracking_require('proposal_tracking.manage');
 v_old public.operation_approval_tracking; v_row public.operation_approval_tracking; v_result integer;
begin
 if p_values is null or jsonb_typeof(p_values)<>'object' or exists(select 1 from jsonb_object_keys(p_values) k where k not in
 ('approval_deadline','approval_status','responsible_profile_id','responsible_name_snapshot','technician_profile_id','technician_name_snapshot','delay_reason','delay_notes')) then
  raise exception using errcode='22023',message='Campos de acompanhamento inválidos.';
 end if;
 if p_values?'approval_deadline' and p_values->'approval_deadline'<>'null'::jsonb and
  (jsonb_typeof(p_values->'approval_deadline')<>'string' or (p_values->>'approval_deadline')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
  raise exception using errcode='22023',message='Informe a data limite no formato AAAA-MM-DD.';
 end if;
 perform 1 from public.operations where id=p_operation_id and organization_id=v_org and deleted_at is null for share;
 if not found then raise exception using errcode='42501',message='Operação indisponível para a organização atual.'; end if;
 select * into v_old from public.operation_approval_tracking where operation_id=p_operation_id and organization_id=v_org for update;
 if (found and p_expected_version is distinct from v_old.version) or (not found and p_expected_version is not null) then
  raise exception using errcode='40001',message='O acompanhamento foi alterado. Atualize os dados antes de salvar.';
 end if;
 -- Missing keys preserve existing values; explicit JSON null clears an optional field.
 v_row:=jsonb_populate_record(v_old,p_values);
 if v_old.operation_id is null then
  insert into public.operation_approval_tracking(operation_id,organization_id,approval_deadline,approval_status,responsible_profile_id,responsible_name_snapshot,
   technician_profile_id,technician_name_snapshot,delay_reason,delay_notes,last_follow_up_at)
  values(p_operation_id,v_org,v_row.approval_deadline,coalesce(v_row.approval_status,'pending'),v_row.responsible_profile_id,coalesce(v_row.responsible_name_snapshot,''),
   v_row.technician_profile_id,coalesce(v_row.technician_name_snapshot,''),coalesce(v_row.delay_reason,''),coalesce(v_row.delay_notes,''),now()) returning version into v_result;
 else
  update public.operation_approval_tracking set approval_deadline=v_row.approval_deadline,approval_status=v_row.approval_status,
   responsible_profile_id=v_row.responsible_profile_id,responsible_name_snapshot=coalesce(v_row.responsible_name_snapshot,''),
   technician_profile_id=v_row.technician_profile_id,technician_name_snapshot=coalesce(v_row.technician_name_snapshot,''),
   delay_reason=coalesce(v_row.delay_reason,''),delay_notes=coalesce(v_row.delay_notes,''),last_follow_up_at=now()
  where operation_id=p_operation_id and organization_id=v_org returning version into v_result;
 end if;
 return v_result;
exception when unique_violation then
 raise exception using errcode='40001',message='O acompanhamento já foi criado. Atualize os dados.';
end; $$;
revoke all on function public.save_proposal_tracking(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_proposal_tracking(uuid,integer,jsonb) to authenticated;

create function private.proposal_tracking_rows(p_filters jsonb,p_today date,p_financial boolean)
returns table(operation_id uuid,operation_number text,purpose text,bank_id uuid,bank_name text,
 approval_deadline date,approval_status text,approved_at timestamptz,rejected_at timestamptz,cancelled_at timestamptz,
 responsible_profile_id uuid,responsible_name_snapshot text,responsible_key text,
 technician_profile_id uuid,technician_name_snapshot text,technician_key text,
 delay_reason text,delay_notes text,last_follow_up_at timestamptz,updated_at timestamptz,version integer,overdue_days integer,amount numeric)
language sql stable set search_path='' as $$
 select t.operation_id,o.operation_number,o.purpose,i.id,i.name,t.approval_deadline,t.approval_status,t.approved_at,t.rejected_at,t.cancelled_at,
 t.responsible_profile_id,t.responsible_name_snapshot,coalesce(t.responsible_profile_id::text,'name:'||t.responsible_name_snapshot),
 t.technician_profile_id,t.technician_name_snapshot,coalesce(t.technician_profile_id::text,'name:'||t.technician_name_snapshot),
 t.delay_reason,t.delay_notes,t.last_follow_up_at,t.updated_at,t.version,
 private.proposal_overdue_days(t.approval_status,t.approval_deadline,p_today),f.amount
 from public.operation_approval_tracking t
 join public.operations o on (o.organization_id,o.id)=(t.organization_id,t.operation_id) and o.deleted_at is null
 join public.financial_institutions i on (i.organization_id,i.id)=(o.organization_id,o.institution_id)
 left join public.operation_financials f on (f.organization_id,f.operation_id)=(t.organization_id,t.operation_id) and p_financial
 where private.same_organization(t.organization_id)
 and (coalesce(p_filters->>'status','')='' or t.approval_status=p_filters->>'status')
 and (coalesce(p_filters->>'bank_id','')='' or o.institution_id::text=p_filters->>'bank_id')
 and (coalesce(p_filters->>'technician','')='' or coalesce(t.technician_profile_id::text,'name:'||t.technician_name_snapshot)=p_filters->>'technician')
 and (coalesce(p_filters->>'responsible','')='' or coalesce(t.responsible_profile_id::text,'name:'||t.responsible_name_snapshot)=p_filters->>'responsible')
 and (coalesce(p_filters->>'start_date','')='' or t.approval_deadline>=(p_filters->>'start_date')::date)
 and (coalesce(p_filters->>'end_date','')='' or t.approval_deadline<=(p_filters->>'end_date')::date)
 and (coalesce(p_filters->>'query','')='' or position(lower(p_filters->>'query') in lower(o.operation_number))>0)
 and (not coalesce((p_filters->>'only_overdue')::boolean,false) or private.proposal_overdue_days(t.approval_status,t.approval_deadline,p_today)>0)
 and (not coalesce((p_filters->>'without_deadline')::boolean,false) or (t.approval_status='pending' and t.approval_deadline is null));
$$;
revoke all on function private.proposal_tracking_rows(jsonb,date,boolean) from public,anon,authenticated;

create function public.proposal_tracking_report(p_filters jsonb default '{}'::jsonb,p_page integer default 1,p_page_size integer default 25) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_org uuid:=private.proposal_tracking_require('proposal_reports.read');
 v_today date:=(statement_timestamp() at time zone 'America/Araguaina')::date;
 v_financial boolean:=private.has_permission('proposal_reports.financial'); v_result jsonb; v_key text;
begin
 if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not between 1 and 100 then
  raise exception using errcode='22023',message='Paginação inválida.'; end if;
 if p_filters is null or jsonb_typeof(p_filters)<>'object' then raise exception using errcode='22023',message='Filtros inválidos.'; end if;
 for v_key in select jsonb_object_keys(p_filters) loop
  if v_key not in ('status','bank_id','technician','responsible','start_date','end_date','query','only_overdue','without_deadline')
   or (v_key in ('only_overdue','without_deadline') and jsonb_typeof(p_filters->v_key)<>'boolean')
   or (v_key not in ('only_overdue','without_deadline') and (jsonb_typeof(p_filters->v_key)<>'string' or length(p_filters->>v_key)>200)) then
   raise exception using errcode='22023',message='Filtros inválidos.';
  end if;
 end loop;
 if coalesce(p_filters->>'status','') not in ('','pending','approved','rejected','cancelled') then raise exception using errcode='22023',message='Situação inválida.'; end if;
 if coalesce(p_filters->>'start_date','')<>'' and coalesce(p_filters->>'end_date','')<>'' and (p_filters->>'start_date')::date>(p_filters->>'end_date')::date then
  raise exception using errcode='22023',message='A data inicial deve ser anterior à data final.'; end if;
 with filtered as materialized (select * from private.proposal_tracking_rows(p_filters,v_today,v_financial)),
 overdue as (select * from filtered where overdue_days>0),
 technician_groups as (select technician_key as group_key,(array_agg(technician_name_snapshot order by updated_at desc,operation_id))[1] as name,
 count(*) as overdue_count,avg(overdue_days) as average_days,max(overdue_days) as maximum_days,sum(amount) as overdue_amount_total from overdue group by technician_key),
 responsible_groups as (select responsible_key as group_key,(array_agg(responsible_name_snapshot order by updated_at desc,operation_id))[1] as name,
 count(*) as overdue_count,avg(overdue_days) as average_days,max(overdue_days) as maximum_days,sum(amount) as overdue_amount_total from overdue group by responsible_key),
 paged as (select * from filtered order by overdue_days desc,approval_deadline nulls last,operation_number,operation_id limit p_page_size offset ((p_page-1)*p_page_size))
 select jsonb_build_object('today',v_today,'timezone','America/Araguaina','financial_access',v_financial,'page',p_page,'page_size',p_page_size,'total_rows',(select count(*) from filtered),
 'kpis',(select jsonb_build_object('overdue_count',count(*),'average_days',coalesce(avg(overdue_days),0),'maximum_days',coalesce(max(overdue_days),0),
  'without_deadline_count',(select count(*) from filtered where approval_status='pending' and approval_deadline is null))
  ||case when v_financial then jsonb_build_object('overdue_amount_total',coalesce(sum(amount),0)::text) else '{}'::jsonb end from overdue),
 'technicians',coalesce((select jsonb_agg((to_jsonb(g)-'overdue_amount_total')||case when v_financial then jsonb_build_object('overdue_amount_total',coalesce(g.overdue_amount_total,0)::text) else '{}'::jsonb end order by g.overdue_count desc,g.group_key) from technician_groups g),'[]'::jsonb),
 'responsibles',coalesce((select jsonb_agg((to_jsonb(g)-'overdue_amount_total')||case when v_financial then jsonb_build_object('overdue_amount_total',coalesce(g.overdue_amount_total,0)::text) else '{}'::jsonb end order by g.overdue_count desc,g.group_key) from responsible_groups g),'[]'::jsonb),
 'rows',coalesce((select jsonb_agg((to_jsonb(p)-'amount')||case when v_financial then jsonb_build_object('amount',p.amount::text) else '{}'::jsonb end order by p.overdue_days desc,p.approval_deadline nulls last,p.operation_number,p.operation_id) from paged p),'[]'::jsonb)) into v_result;
 return v_result;
end; $$;
revoke all on function public.proposal_tracking_report(jsonb,integer,integer) from public,anon;
grant execute on function public.proposal_tracking_report(jsonb,integer,integer) to authenticated;

create function public.proposal_tracking_options() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_org uuid:=private.proposal_tracking_require('proposal_reports.read'); v_result jsonb;
begin
 with rows as materialized (select * from private.proposal_tracking_rows('{}'::jsonb,(statement_timestamp() at time zone 'America/Araguaina')::date,false))
 select jsonb_build_object(
 'banks',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from (select distinct bank_id id,bank_name name from rows) b),'[]'::jsonb),
 'technicians',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from (select technician_key id,max(technician_name_snapshot) name from rows group by technician_key) t),'[]'::jsonb),
 'responsibles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from (select responsible_key id,max(responsible_name_snapshot) name from rows group by responsible_key) r),'[]'::jsonb),
 'profiles',case when private.has_permission('proposal_tracking.manage') then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name) order by full_name) from public.profiles where organization_id=v_org and status='active'),'[]'::jsonb) else '[]'::jsonb end) into v_result;
 return v_result;
end; $$;
revoke all on function public.proposal_tracking_options() from public,anon;
grant execute on function public.proposal_tracking_options() to authenticated;

create function public.proposal_tracking_operation_search(p_query text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_org uuid:=private.proposal_tracking_require('proposal_tracking.manage'); v_result jsonb;
begin
 if p_query is null or length(p_query)>100 then raise exception using errcode='22023',message='Busca inválida.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.operation_number) order by o.operation_number),'[]'::jsonb) into v_result from
 (select id,operation_number from public.operations o where o.organization_id=v_org and o.deleted_at is null
 and not exists(select 1 from public.operation_approval_tracking t where t.operation_id=o.id)
 and (p_query='' or position(lower(p_query) in lower(operation_number))>0) order by operation_number limit 20) o;
 return v_result;
end; $$;
revoke all on function public.proposal_tracking_operation_search(text) from public,anon;
grant execute on function public.proposal_tracking_operation_search(text) to authenticated;
