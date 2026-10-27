-- A stale optimistic-lock version is a domain conflict, not a PostgreSQL
-- serialization failure. PostgREST maps PT409 to HTTP 409 without retrying.
create or replace function public.update_pending_issue_management(
  p_pending_issue_id uuid,
  p_expected_version integer,
  p_assigned_to uuid,
  p_status text,
  p_resolution_due_date date,
  p_justification text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid := private.current_user_organization_id();
  updated_version integer;
begin
  if actor_organization_id is null or not private.has_permission('pending_issues.manage') then
    raise exception using errcode = '42501', message = 'Missing pending_issues.manage permission.';
  end if;
  if p_pending_issue_id is null or p_expected_version is null or p_expected_version < 1
    or p_status is null then
    raise exception using errcode = '22023', message = 'Issue ID, expected version and status are required.';
  end if;

  update public.pending_issue_management issue
  set assigned_to = p_assigned_to,
      status = p_status,
      resolution_due_date = p_resolution_due_date,
      justification = p_justification
  where issue.id = p_pending_issue_id
    and issue.organization_id = actor_organization_id
    and issue.version = p_expected_version
  returning issue.version into updated_version;

  if updated_version is null then
    if exists (
      select 1 from public.pending_issue_management issue
      where issue.id = p_pending_issue_id
        and issue.organization_id = actor_organization_id
    ) then
      raise exception using errcode = 'PT409', message = 'Pending issue version conflict.';
    end if;
    raise exception using errcode = 'P0002', message = 'Pending issue is unavailable.';
  end if;

  return updated_version;
end;
$$;

revoke all on function public.update_pending_issue_management(uuid, integer, uuid, text, date, text)
  from public, anon, authenticated;
grant execute on function public.update_pending_issue_management(uuid, integer, uuid, text, date, text)
  to authenticated;
