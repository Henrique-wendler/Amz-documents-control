-- Explicit, reviewed legacy claims; automatic central allocation remains unchanged.
begin;
alter table public.proposal_number_reservations drop constraint proposal_number_reservations_origin_check;
alter table public.proposal_number_reservations add constraint proposal_number_reservations_origin_check
 check(origin in ('central','legacy_backfill','legacy_claim'));
create function public.claim_legacy_proposal_number(p_actor_id uuid,p_sync_id uuid,p_proposal_number text,p_created_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_org uuid; v_year integer; v_sequence integer; v_row public.proposal_number_reservations;
 v_known public.desktop_proposals; v_known_found boolean;
begin
 v_org:=private.proposal_number_actor(p_actor_id);
 if p_sync_id is null or p_sync_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 or p_proposal_number is null or p_proposal_number !~ '^[0-9]{4}-[0-9]{4}$'
 or left(p_proposal_number,4)='0000' or right(p_proposal_number,4)='0000'
 or p_created_at is null or not isfinite(p_created_at) then
  raise exception using errcode='DS400',message='invalid_payload'; end if;
 v_year:=left(p_proposal_number,4)::integer; v_sequence:=right(p_proposal_number,4)::integer;
 -- Same lock order as central allocation and normal synchronization: UUID, then organization/year.
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||p_sync_id::text,24));
 select * into v_row from public.proposal_number_reservations where organization_id=v_org and sync_id=p_sync_id;
 if found then
  if v_row.proposal_number<>p_proposal_number or v_row.source_created_at is distinct from p_created_at then
   raise exception using errcode='LC409',message='legacy_proposal_number_conflict'; end if;
 else
  -- Match historical identity only by tenant + UUID. A matching number never attaches another operation.
  select * into v_known from public.desktop_proposals where organization_id=v_org and sync_id=p_sync_id;
  v_known_found:=found;
  if v_known_found and (v_known.desktop_proposal_number<>p_proposal_number or v_known.source_created_at is distinct from p_created_at) then
   raise exception using errcode='LC409',message='legacy_proposal_number_conflict'; end if;
  if not v_known_found and extract(year from p_created_at at time zone 'America/Araguaina')::integer<>v_year then
   raise exception using errcode='LC422',message='legacy_proposal_year_mismatch'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_year::text,26));
  if exists(select 1 from public.proposal_number_reservations where organization_id=v_org and proposal_number=p_proposal_number)
   or exists(select 1 from public.desktop_proposals where organization_id=v_org and desktop_proposal_number=p_proposal_number and sync_id<>p_sync_id)
   or exists(select 1 from public.operations where organization_id=v_org and operation_number=p_proposal_number
    and (not v_known_found or id<>v_known.operation_id)) then
   raise exception using errcode='LC409',message='legacy_proposal_number_conflict'; end if;
  insert into public.proposal_number_sequences(organization_id,proposal_year,last_value) values(v_org,v_year,v_sequence)
   on conflict(organization_id,proposal_year) do update set last_value=greatest(public.proposal_number_sequences.last_value,excluded.last_value),updated_at=now();
  insert into public.proposal_number_reservations(organization_id,sync_id,proposal_year,sequence_value,proposal_number,source_created_at,origin)
   values(v_org,p_sync_id,v_year,v_sequence,p_proposal_number,p_created_at,case when v_known_found then 'legacy_backfill' else 'legacy_claim' end)
   returning * into v_row;
  insert into public.audit_log(organization_id,actor_user_id,entity_type,entity_id,action,changes,context)
   values(v_org,p_actor_id,'proposal_number_reservations',v_row.id,'PROPOSAL_LEGACY_NUMBER_CLAIMED',
    jsonb_build_object('sync_id',p_sync_id,'proposal_number',v_row.proposal_number,'source_created_at',p_created_at,'reserved_at',v_row.reserved_at),
    jsonb_build_object('source','legacy_migration'));
 end if;
 return jsonb_build_object('ok',true,'sync_id',v_row.sync_id,'organization_id',v_org,'proposal_number',v_row.proposal_number,
  'created_at',v_row.source_created_at,'reserved_at',v_row.reserved_at,'origin',v_row.origin);
exception when unique_violation then
 raise exception using errcode='LC409',message='legacy_proposal_number_conflict';
end $$;
revoke all on function public.claim_legacy_proposal_number(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_legacy_proposal_number(uuid,uuid,text,timestamptz) to service_role;
-- Preserve the 026 guard; extend creation immutability to explicitly claimed identities too.
create or replace function public.sync_desktop_proposal(p_actor_id uuid,p_payload jsonb,p_source_revision bigint default null,p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_payload jsonb; v_res public.proposal_number_reservations;
begin
 v_org:=private.proposal_number_actor(p_actor_id); v_payload:=private.desktop_sync_payload(p_payload);
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||(v_payload->>'sync_id'),24));
 select * into v_res from public.proposal_number_reservations where organization_id=v_org and sync_id=(v_payload->>'sync_id')::uuid;
 if found then
  if v_res.proposal_number<>v_payload->>'proposal_number' or (v_res.origin in ('central','legacy_claim') and
    v_res.source_created_at is distinct from (v_payload->>'created_at')::timestamptz) then
   raise exception using errcode='PN409',message='proposal_number_reservation_mismatch'; end if;
 elsif not exists(select 1 from public.desktop_proposals where organization_id=v_org
  and sync_id=(v_payload->>'sync_id')::uuid and desktop_proposal_number=v_payload->>'proposal_number') then
  raise exception using errcode='PN404',message='proposal_number_not_reserved';
 end if;
 return private.sync_desktop_proposal_v1(p_actor_id,p_payload,p_source_revision,p_expected_version);
end $$;
commit;
