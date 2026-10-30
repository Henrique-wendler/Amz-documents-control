-- Central authority for new official numbers. Historical identities are never rewritten.
-- Bootstrap and install guards under write locks: no operation can slip between seeding and trigger creation.
begin;
lock table public.operations,public.desktop_proposals in share row exclusive mode;
create table public.proposal_number_sequences (
 organization_id uuid not null references public.organizations(id) on delete restrict,
 proposal_year integer not null check (proposal_year between 1 and 9999),
 last_value integer not null check (last_value between 0 and 9999),
 updated_at timestamptz not null default now(), primary key(organization_id,proposal_year)
);
create table public.proposal_number_reservations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 sync_id uuid not null check (sync_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 proposal_year integer not null check(proposal_year between 1 and 9999),
 sequence_value integer not null check(sequence_value between 1 and 9999),
 proposal_number text not null,
 source_created_at timestamptz,
 origin text not null check(origin in ('central','legacy_backfill')),
 reserved_at timestamptz not null default now(),
 unique(organization_id,sync_id), unique(organization_id,proposal_number),
 unique(organization_id,proposal_year,sequence_value),
 check(proposal_number=lpad(proposal_year::text,4,'0')||'-'||lpad(sequence_value::text,4,'0'))
);
alter table public.proposal_number_sequences enable row level security;
alter table public.proposal_number_sequences force row level security;
alter table public.proposal_number_reservations enable row level security;
alter table public.proposal_number_reservations force row level security;
revoke all on public.proposal_number_sequences,public.proposal_number_reservations from public,anon,authenticated,service_role;
-- Canonical already-synchronized proposals are grandfathered without touching their timestamps.
insert into public.proposal_number_reservations(organization_id,sync_id,proposal_year,sequence_value,proposal_number,source_created_at,origin)
 select organization_id,sync_id,left(desktop_proposal_number,4)::integer,right(desktop_proposal_number,4)::integer,
 desktop_proposal_number,source_created_at,'legacy_backfill' from public.desktop_proposals
 where desktop_proposal_number ~ '^[0-9]{4}-[0-9]{4}$'
 and left(desktop_proposal_number,4)<>'0000' and right(desktop_proposal_number,4)<>'0000';
-- Include occupied operation numbers too. Strict format only; holes are never recycled.
insert into public.proposal_number_sequences(organization_id,proposal_year,last_value)
 select organization_id,left(number,4)::integer,max(right(number,4)::integer) from (
 select organization_id,operation_number number from public.operations
 union all select organization_id,desktop_proposal_number from public.desktop_proposals
 ) n where number ~ '^[0-9]{4}-[0-9]{4}$' and left(number,4)<>'0000' and right(number,4)<>'0000'
 group by organization_id,left(number,4)::integer;
create function private.proposal_number_actor(p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_org uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='DS403',message='permission_denied'; end if;
 select p.organization_id into v_org from public.profiles p
 join public.organizations o on o.id=p.organization_id and o.status='active' and o.deleted_at is null
 join public.roles r on r.role_key=p.role_key and r.status='active'
 join public.role_permissions rp on rp.role_key=r.role_key and rp.permission_key='desktop_proposals.sync'
 where p.id=p_actor and p.status='active';
 if v_org is null then raise exception using errcode='DS403',message='permission_denied'; end if;
 return v_org;
end $$;
create function private.immutable_number_reservation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='PN409',message='proposal_number_reservation_mismatch'; end $$;
create trigger proposal_number_immutable before update or delete on public.proposal_number_reservations
 for each row execute function private.immutable_number_reservation();
create function public.reserve_proposal_number(p_actor_id uuid,p_sync_id uuid,p_created_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_org uuid; v_year integer; v_next integer; v_row public.proposal_number_reservations;
begin
 v_org:=private.proposal_number_actor(p_actor_id);
 if p_sync_id is null or p_sync_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 or p_created_at is null or not isfinite(p_created_at) then raise exception using errcode='DS400',message='invalid_payload'; end if;
 v_year:=extract(year from p_created_at at time zone 'America/Araguaina')::integer;
 if v_year not between 1 and 9999 then raise exception using errcode='DS400',message='invalid_payload'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||p_sync_id::text,24));
 select * into v_row from public.proposal_number_reservations where organization_id=v_org and sync_id=p_sync_id;
 if found then
  if v_row.origin='central' and v_row.source_created_at is distinct from p_created_at then
   raise exception using errcode='PN409',message='proposal_number_reservation_mismatch'; end if;
 else
  -- A nonstandard historical identity must be reconciled, never silently renumbered.
  if exists(select 1 from public.desktop_proposals where organization_id=v_org and sync_id=p_sync_id) then
   raise exception using errcode='PN409',message='proposal_number_reservation_mismatch'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_year::text,26));
  insert into public.proposal_number_sequences(organization_id,proposal_year,last_value) values(v_org,v_year,0) on conflict do nothing;
  select last_value+1 into v_next from public.proposal_number_sequences where organization_id=v_org and proposal_year=v_year for update;
  if v_next>9999 then raise exception using errcode='PN999',message='sequence_exhausted'; end if;
  update public.proposal_number_sequences set last_value=v_next,updated_at=now() where organization_id=v_org and proposal_year=v_year;
  insert into public.proposal_number_reservations(organization_id,sync_id,proposal_year,sequence_value,proposal_number,source_created_at,origin)
   values(v_org,p_sync_id,v_year,v_next,lpad(v_year::text,4,'0')||'-'||lpad(v_next::text,4,'0'),p_created_at,'central') returning * into v_row;
  insert into public.audit_log(organization_id,actor_user_id,entity_type,entity_id,action,changes,context)
   values(v_org,p_actor_id,'proposal_number_reservations',v_row.id,'PROPOSAL_NUMBER_RESERVED',
    jsonb_build_object('sync_id',p_sync_id,'proposal_number',v_row.proposal_number,'reserved_at',v_row.reserved_at),
    jsonb_build_object('source','desktop_sync'));
 end if;
 return jsonb_build_object('ok',true,'sync_id',v_row.sync_id,'organization_id',v_org,'proposal_number',v_row.proposal_number,
 'created_at',v_row.source_created_at,'reserved_at',v_row.reserved_at);
end $$;
-- Preserve the existing 13-field synchronization implementation behind a narrow reservation guard.
alter function public.sync_desktop_proposal(uuid,jsonb,bigint,bigint) set schema private;
alter function private.sync_desktop_proposal(uuid,jsonb,bigint,bigint) rename to sync_desktop_proposal_v1;
revoke all on function private.sync_desktop_proposal_v1(uuid,jsonb,bigint,bigint) from public,anon,authenticated,service_role;
create function public.sync_desktop_proposal(p_actor_id uuid,p_payload jsonb,p_source_revision bigint default null,p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_payload jsonb; v_res public.proposal_number_reservations;
begin
 v_org:=private.proposal_number_actor(p_actor_id); v_payload:=private.desktop_sync_payload(p_payload);
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||(v_payload->>'sync_id'),24));
 select * into v_res from public.proposal_number_reservations where organization_id=v_org and sync_id=(v_payload->>'sync_id')::uuid;
 if found then
  if v_res.proposal_number<>v_payload->>'proposal_number' or (v_res.origin='central' and
    v_res.source_created_at is distinct from (v_payload->>'created_at')::timestamptz) then
   raise exception using errcode='PN409',message='proposal_number_reservation_mismatch'; end if;
 elsif not exists(select 1 from public.desktop_proposals where organization_id=v_org
  and sync_id=(v_payload->>'sync_id')::uuid and desktop_proposal_number=v_payload->>'proposal_number') then
  raise exception using errcode='PN404',message='proposal_number_not_reserved';
 end if;
 return private.sync_desktop_proposal_v1(p_actor_id,p_payload,p_source_revision,p_expected_version);
end $$;
-- Manual operations may not steal reservations; their valid numbers also advance the permanent floor.
create function private.guard_operation_number_reservation() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_year integer; v_seq integer;
begin
 if TG_OP='UPDATE' and (new.operation_number is distinct from old.operation_number or new.organization_id is distinct from old.organization_id)
 and exists(select 1 from public.desktop_proposals where operation_id=old.id) then
  raise exception using errcode='PN409',message='proposal_number_reservation_mismatch'; end if;
 if TG_OP='UPDATE' and new.operation_number=old.operation_number and new.organization_id=old.organization_id then return new; end if;
 if new.operation_number !~ '^[0-9]{4}-[0-9]{4}$' or left(new.operation_number,4)='0000' or right(new.operation_number,4)='0000' then return new; end if;
 v_year:=left(new.operation_number,4)::integer; v_seq:=right(new.operation_number,4)::integer;
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||':'||v_year::text,26));
 if exists(select 1 from public.proposal_number_reservations where organization_id=new.organization_id and proposal_number=new.operation_number)
 and current_setting('app.desktop_sync_operation',true) is distinct from new.id::text then
  raise exception using errcode='PN409',message='proposal_number_reservation_mismatch'; end if;
 insert into public.proposal_number_sequences(organization_id,proposal_year,last_value) values(new.organization_id,v_year,v_seq)
 on conflict(organization_id,proposal_year) do update set last_value=greatest(public.proposal_number_sequences.last_value,excluded.last_value),updated_at=now();
 return new;
end $$;
create trigger operations_reserved_number before insert or update of operation_number,organization_id on public.operations
 for each row execute function private.guard_operation_number_reservation();
revoke all on function private.proposal_number_actor(uuid),private.immutable_number_reservation(),private.guard_operation_number_reservation() from public,anon,authenticated,service_role;
revoke all on function public.reserve_proposal_number(uuid,uuid,timestamptz),public.sync_desktop_proposal(uuid,jsonb,bigint,bigint) from public,anon,authenticated;
grant execute on function public.reserve_proposal_number(uuid,uuid,timestamptz),public.sync_desktop_proposal(uuid,jsonb,bigint,bigint) to service_role;
-- Only a boolean about the caller's own live session; no Auth/session data is exposed.
create function public.desktop_proposal_session_active() returns boolean
language sql stable security definer set search_path='' as $$ select private.current_user_has_aal2() $$;
revoke all on function public.desktop_proposal_session_active() from public,anon,service_role;
grant execute on function public.desktop_proposal_session_active() to authenticated;
commit;
