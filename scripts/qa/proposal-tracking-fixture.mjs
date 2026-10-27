export const QA_PROJECT = "iglciwizbxtkfwlboihe";
export const QA_ORGANIZATION = "a6102600-0000-4000-8000-000000000001";
export const QA_ORGANIZATION_NAME = "QA Acompanhamento 2026-10-26 A";
export const operationId = (n) => `a6102630-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bankId = (n) => `a6102610-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function canonicalScenario(referenceDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) ||
      !Number.isFinite(Date.parse(referenceDate)) ||
      new Date(referenceDate).toISOString().slice(0, 10) !== referenceDate)
    throw new Error("An explicit valid --reference-date YYYY-MM-DD is required.");
  const offsets = [-6, -1, -10, 0, 1, -3, -3, -3, null];
  const purposes = ["QA pending seis dias", "QA deadline ontem", "QA pending dez dias", "QA deadline hoje", "QA deadline amanhã", "QA approved vencida", "QA rejected", "QA cancelled", "QA sem prazo"];
  return offsets.map((offset, index) => {
    const n = index + 1;
    const date = new Date(`${referenceDate}T12:00:00Z`);
    if (offset !== null) date.setUTCDate(date.getUTCDate() + offset);
    return {
      operation_id: operationId(n), operation_number: `QA-TRACK-${String(n).padStart(3, "0")}`,
      institution_id: bankId(n % 2 === 0 ? 2 : 1), purpose: purposes[index],
      approval_deadline: offset === null ? null : date.toISOString().slice(0, 10),
      approval_status: ({6: "approved", 7: "rejected", 8: "cancelled"})[n] ?? "pending",
      amount: ["500000.00", "350000.00", "900000.00"][index] ?? "0.00",
      technician_name: `QA Propostas ${[1, 3].includes(n) ? "manager" : "operator"}`,
      responsible_name: `QA Propostas ${[1, 2].includes(n) ? "operator" : "manager"}`,
    };
  });
}

// Administrative preparation only. The caller must execute this body inside a transaction.
// It never changes schema, permissions, Auth users, MFA factors or audit history.
export function buildFixtureSql(referenceDate) {
  const rows = canonicalScenario(referenceDate);
  return `
select pg_advisory_xact_lock(hashtext('proposal-tracking-canonical-qa'));
drop table if exists pg_temp.qa_tracking_desired;
drop table if exists pg_temp.qa_tracking_removed;
create temp table qa_tracking_desired on commit drop as
select * from jsonb_to_recordset($scenario$${JSON.stringify(rows)}$scenario$::jsonb)
as r(operation_id uuid,operation_number text,institution_id uuid,purpose text,approval_deadline date,approval_status text,amount numeric,technician_name text,responsible_name text);
create temp table qa_tracking_removed(operation_id uuid primary key) on commit drop;
do $guard$
begin
 if not exists(select 1 from public.organizations where id='${QA_ORGANIZATION}' and legal_name='${QA_ORGANIZATION_NAME}' and deleted_at is null and status='active') then
  raise exception 'The exclusive synthetic QA organization was not confirmed.';
 end if;
 if (select count(*) from public.profiles where organization_id='${QA_ORGANIZATION}' and status='active' and full_name='QA Propostas manager' and role_key='manager')<>1 or
 (select count(*) from public.profiles where organization_id='${QA_ORGANIZATION}' and status='active' and full_name='QA Propostas operator' and role_key='operator')<>1 then
  raise exception 'Expected synthetic manager/operator profiles were not confirmed.';
 end if;
 if (select count(*) from public.financial_institutions where organization_id='${QA_ORGANIZATION}' and id in ('${bankId(1)}','${bankId(2)}'))<>2 then
  raise exception 'Expected QA banks were not confirmed.';
 end if;
 if exists(select 1 from public.operations o where o.organization_id='${QA_ORGANIZATION}' and not exists(
  select 1 from generate_series(1,31) n where o.id=('a6102630-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid and o.operation_number='QA-TRACK-'||lpad(n::text,3,'0'))) then
  raise exception 'Unknown QA operation detected; review it before preparing the fixture.';
 end if;
 if exists(select 1 from public.operations o left join public.operation_financials f on (f.organization_id,f.operation_id)=(o.organization_id,o.id)
  where o.organization_id='${QA_ORGANIZATION}' and o.id in
   (select ('a6102630-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(10,31) n)
  and (o.purpose is distinct from 'QA paginação prazo hoje' or f.amount is distinct from 0::numeric)) then
  raise exception 'A pagination row no longer matches the disposable zero-value fixture.';
 end if;
end;
$guard$;
insert into qa_tracking_removed select id from public.operations
where organization_id='${QA_ORGANIZATION}' and id in
 (select ('a6102630-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(10,31) n);
-- Existing restrictive FKs abort the whole transaction if any other module references these rows.
delete from public.operation_approval_tracking where organization_id='${QA_ORGANIZATION}' and operation_id in(select operation_id from qa_tracking_removed);
delete from public.operation_financials where organization_id='${QA_ORGANIZATION}' and operation_id in(select operation_id from qa_tracking_removed);
delete from public.operations where organization_id='${QA_ORGANIZATION}' and id in(select operation_id from qa_tracking_removed);
insert into public.operations as o(id,organization_id,operation_number,institution_id,purpose)
select operation_id,'${QA_ORGANIZATION}',operation_number,institution_id,purpose from qa_tracking_desired
on conflict(id) do update set institution_id=excluded.institution_id,purpose=excluded.purpose
where o.organization_id=excluded.organization_id and (o.institution_id,o.purpose) is distinct from (excluded.institution_id,excluded.purpose);
insert into public.operation_financials as f(operation_id,organization_id,amount)
select operation_id,'${QA_ORGANIZATION}',amount from qa_tracking_desired
on conflict(operation_id) do update set amount=excluded.amount
where f.organization_id=excluded.organization_id and f.amount is distinct from excluded.amount;
insert into public.operation_approval_tracking as t(operation_id,organization_id,approval_deadline,approval_status,technician_profile_id,responsible_profile_id,delay_reason,delay_notes)
select d.operation_id,'${QA_ORGANIZATION}',d.approval_deadline,d.approval_status,p.id,r.id,'','Somente dados sintéticos para homologação'
from qa_tracking_desired d
join public.profiles p on p.organization_id='${QA_ORGANIZATION}' and p.full_name=d.technician_name
join public.profiles r on r.organization_id='${QA_ORGANIZATION}' and r.full_name=d.responsible_name
on conflict(operation_id) do update set approval_deadline=excluded.approval_deadline,approval_status=excluded.approval_status,
technician_profile_id=excluded.technician_profile_id,responsible_profile_id=excluded.responsible_profile_id,delay_reason=excluded.delay_reason,delay_notes=excluded.delay_notes
where t.organization_id=excluded.organization_id and
(t.approval_deadline,t.approval_status,t.technician_profile_id,t.responsible_profile_id,t.delay_reason,t.delay_notes) is distinct from
(excluded.approval_deadline,excluded.approval_status,excluded.technician_profile_id,excluded.responsible_profile_id,excluded.delay_reason,excluded.delay_notes);
do $verify$
begin
 if (select count(*) from public.operations where organization_id='${QA_ORGANIZATION}')<>9 or
 (select count(*) from public.operation_approval_tracking where organization_id='${QA_ORGANIZATION}')<>9 then
  raise exception 'The canonical QA fixture must contain exactly nine operations and tracking rows.';
 end if;
end;
$verify$;
select '${referenceDate}' as fixture_reference_date,'${QA_ORGANIZATION}' as organization_id,
(select count(*) from qa_tracking_removed) as removed_pagination_rows,
(select count(*) from public.operations where organization_id='${QA_ORGANIZATION}') as operations_count,
(select count(*) from public.operation_approval_tracking where organization_id='${QA_ORGANIZATION}') as tracking_count,
(select md5(jsonb_agg(jsonb_build_object('operation',to_jsonb(o),'tracking',to_jsonb(t),'financials',to_jsonb(f)) order by o.id)::text)
 from public.operations o join public.operation_approval_tracking t on (t.organization_id,t.operation_id)=(o.organization_id,o.id)
 join public.operation_financials f on (f.organization_id,f.operation_id)=(o.organization_id,o.id)
 where o.organization_id='${QA_ORGANIZATION}') as fixture_fingerprint;
`;
}
