-- Server-only completion of Auth Admin MFA deletion. Session revocation and
-- audit commit together; existing tenant/permission policies are preserved.
create or replace function public.complete_user_mfa_reset(
  p_actor_user_id uuid, p_target_user_id uuid, p_removed_factor_count integer, p_outcome text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_organization_id uuid;
  audit_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501', message='Server-only action.';
  end if;
  if p_actor_user_id is null or p_target_user_id is null or p_actor_user_id=p_target_user_id
    or p_removed_factor_count is null or p_removed_factor_count<0 or p_removed_factor_count>100
    or p_outcome is null or p_outcome not in ('complete','partial') then
    raise exception using errcode='22023', message='Invalid MFA recovery completion.';
  end if;
  select p.organization_id into actor_organization_id from public.profiles p
  join public.organizations o on o.id=p.organization_id
  join public.roles r on r.role_key=p.role_key
  join public.role_permissions rp on rp.role_key=p.role_key and rp.permission_key='users.manage'
  where p.id=p_actor_user_id and p.status='active' and o.status='active'
    and o.deleted_at is null and r.status='active';
  if actor_organization_id is null or not exists (
    select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_target_user_id and p.organization_id=actor_organization_id
  ) then
    raise exception using errcode='42501', message='MFA recovery unavailable.';
  end if;
  -- Also covers unverified-only, zero-factor and partially failed resets.
  delete from auth.sessions where user_id=p_target_user_id;
  insert into public.audit_log(organization_id,actor_user_id,entity_type,entity_id,action,changes,context)
  values(actor_organization_id,p_actor_user_id,'profiles',p_target_user_id,'USER_MFA_RESET',
    jsonb_build_object('removed_factor_count',jsonb_build_object('new',p_removed_factor_count)),
    jsonb_build_object('source','user_administration','outcome',p_outcome)) returning id into audit_id;
  return audit_id;
end;
$$;
revoke all on function public.complete_user_mfa_reset(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.complete_user_mfa_reset(uuid,uuid,integer,text) to service_role;

-- Signed access JWTs can outlive revoked refresh sessions. Every AAL2 request
-- must still have a live AAL2 Auth session; existing RLS stays restrictive.
create or replace function private.current_user_has_aal2()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and coalesce(auth.jwt()->>'aal','')='aal2'
    and exists(select 1 from auth.sessions s where s.user_id=auth.uid()
      and s.id::text=auth.jwt()->>'session_id' and s.aal='aal2'
      and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function private.current_user_has_aal2() from public,anon;
grant execute on function private.current_user_has_aal2() to authenticated;
