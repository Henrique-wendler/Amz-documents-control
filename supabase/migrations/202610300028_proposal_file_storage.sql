-- Private, immutable proposal exports; transport is direct signed Storage upload.
begin;
insert into public.permissions(permission_key,description) values('proposal_files.read','Consultar e baixar arquivos finais das propostas');
insert into public.role_permissions(role_key,permission_key) select role_key,'proposal_files.read' from public.roles where role_key in ('admin','manager');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('proposal-files','proposal-files',false,26214400,array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
-- No direct browser/desktop object access, including future broad permissive policies.
create policy proposal_files_no_direct_access on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'proposal-files') with check(bucket_id<>'proposal-files');
alter table public.desktop_proposals add constraint desktop_proposals_file_identity unique(organization_id,id,sync_id,operation_id);
create table public.proposal_file_uploads (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 desktop_proposal_id uuid not null, operation_id uuid not null, sync_id uuid not null,
 file_kind text not null check(file_kind in ('pdf','xlsx')),
 original_filename text not null check(length(original_filename) between 1 and 255),
 storage_bucket text not null default 'proposal-files' check(storage_bucket='proposal-files'),
 storage_path text not null, sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 size_bytes bigint not null check(size_bytes between 1 and 26214400), mime_type text not null,
 status text not null default 'authorized' check(status in ('authorized','completed','failed')),
 prepared_by uuid references auth.users(id) on delete set null, last_error text,
 expires_at timestamptz not null default now()+interval '2 hours',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,desktop_proposal_id,file_kind,sha256), unique(organization_id,id),
 foreign key(organization_id,desktop_proposal_id,sync_id,operation_id) references public.desktop_proposals(organization_id,id,sync_id,operation_id) on delete restrict,
 check(storage_path=organization_id::text||'/'||sync_id::text||'/'||file_kind||'/'||sha256||'.'||file_kind),
 check((file_kind='pdf' and mime_type='application/pdf') or (file_kind='xlsx' and mime_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
);
create table public.proposal_files (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 desktop_proposal_id uuid not null, operation_id uuid not null, sync_id uuid not null,
 upload_id uuid not null unique, file_kind text not null check(file_kind in ('pdf','xlsx')),
 original_filename text not null, storage_bucket text not null default 'proposal-files' check(storage_bucket='proposal-files'),
 storage_path text not null, sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 size_bytes bigint not null check(size_bytes between 1 and 26214400), mime_type text not null,
 version integer not null check(version>0), is_current boolean not null default true,
 uploaded_by uuid references auth.users(id) on delete set null,
 source text not null default 'desktop_export' check(source='desktop_export'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,desktop_proposal_id,sync_id,operation_id) references public.desktop_proposals(organization_id,id,sync_id,operation_id) on delete restrict,
 foreign key(organization_id,upload_id) references public.proposal_file_uploads(organization_id,id) on delete restrict,
 unique(organization_id,desktop_proposal_id,file_kind,sha256), unique(organization_id,desktop_proposal_id,file_kind,version),
 check(storage_path=organization_id::text||'/'||sync_id::text||'/'||file_kind||'/'||sha256||'.'||file_kind),
 check((file_kind='pdf' and mime_type='application/pdf') or (file_kind='xlsx' and mime_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
);
create unique index proposal_files_one_current on public.proposal_files(organization_id,desktop_proposal_id,file_kind) where is_current;
create index proposal_files_operation on public.proposal_files(organization_id,operation_id,is_current);
alter table public.proposal_file_uploads enable row level security;
alter table public.proposal_file_uploads force row level security;
alter table public.proposal_files enable row level security;
alter table public.proposal_files force row level security;
revoke all on public.proposal_file_uploads,public.proposal_files from public,anon,authenticated,service_role;
grant select on public.proposal_files to authenticated;
create policy proposal_files_read on public.proposal_files for select to authenticated
 using(private.same_organization(organization_id) and private.has_permission('proposal_files.read'));
create policy proposal_files_live_aal2 on public.proposal_files as restrictive for all to authenticated
 using(private.current_user_has_aal2()) with check(private.current_user_has_aal2());
create function private.proposal_file_actor(p_actor uuid,p_permission text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_org uuid;
begin
 if auth.role() is distinct from 'service_role' or p_permission not in ('desktop_proposals.sync','proposal_files.read') then
  raise exception using errcode='DS403',message='permission_denied'; end if;
 select p.organization_id into v_org from public.profiles p
 join public.organizations o on o.id=p.organization_id and o.status='active' and o.deleted_at is null
 join public.roles r on r.role_key=p.role_key and r.status='active'
 join public.role_permissions rp on rp.role_key=r.role_key and rp.permission_key=p_permission
 where p.id=p_actor and p.status='active';
 if v_org is null then raise exception using errcode='DS403',message='permission_denied'; end if;
 return v_org;
end $$;
create function private.proposal_file_summary(p public.proposal_files) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('id',p.id,'sync_id',p.sync_id,'organization_id',p.organization_id,'operation_id',p.operation_id,'file_kind',p.file_kind,
 'original_filename',p.original_filename,'sha256',p.sha256,'size_bytes',p.size_bytes,'mime_type',p.mime_type,'version',p.version,'is_current',p.is_current,'created_at',p.created_at)
$$;
create function private.guard_proposal_file() returns trigger language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-array['is_current','updated_at']) is distinct from (to_jsonb(old)-array['is_current','updated_at']) then
  raise exception using errcode='PF409',message='file_identity_conflict'; end if; return new;
end $$;
create trigger proposal_files_immutable before update on public.proposal_files for each row execute function private.guard_proposal_file();
create function public.prepare_proposal_file_upload(p_actor_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_proposal public.desktop_proposals; v_upload public.proposal_file_uploads;
 v_sync uuid; v_kind text; v_hash text; v_size bigint; v_mime text; v_name text; v_file public.proposal_files;
begin
 v_org:=private.proposal_file_actor(p_actor_id,'desktop_proposals.sync');
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='DS400',message='invalid_payload'; end if;
 if (select count(*) from jsonb_object_keys(p_payload))<>6 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
 ('sync_id','file_kind','sha256','size_bytes','mime_type','original_filename')) then raise exception using errcode='DS400',message='invalid_payload'; end if;
 if exists(select 1 from jsonb_each(p_payload) e where e.key<>'size_bytes' and jsonb_typeof(e.value)<>'string')
 or (p_payload->>'sync_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 or (p_payload->>'file_kind') not in ('pdf','xlsx') or (p_payload->>'sha256') !~ '^[0-9a-f]{64}$'
 or jsonb_typeof(p_payload->'size_bytes')<>'number' or (p_payload->>'size_bytes') !~ '^[1-9][0-9]{0,9}$' then
  raise exception using errcode='DS400',message='invalid_payload'; end if;
 v_sync:=(p_payload->>'sync_id')::uuid;v_kind:=p_payload->>'file_kind';v_hash:=p_payload->>'sha256';
 v_size:=(p_payload->>'size_bytes')::bigint;v_mime:=p_payload->>'mime_type';v_name:=p_payload->>'original_filename';
 if v_size>26214400 then raise exception using errcode='PF413',message='file_too_large'; end if;
 if length(v_name) not between 1 and 255 or v_name<>btrim(v_name) or v_name ~ '[[:cntrl:]]'
 or position('/' in v_name)>0 or position(chr(92) in v_name)>0 or lower(right(v_name,length(v_kind)+1))<>'.'||v_kind
 or v_mime<>(case when v_kind='pdf' then 'application/pdf' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' end) then
  raise exception using errcode='DS400',message='invalid_payload'; end if;
 select d.* into v_proposal from public.desktop_proposals d join public.operations o on o.id=d.operation_id
 where d.organization_id=v_org and d.sync_id=v_sync and o.deleted_at is null;
 if not found then raise exception using errcode='PF404',message='proposal_not_synced'; end if;
 if v_proposal.desktop_proposal_number !~ '^[0-9]{4}-[0-9]{4}$' or not exists(select 1 from public.proposal_number_reservations r
 where r.organization_id=v_org and r.sync_id=v_sync and r.proposal_number=v_proposal.desktop_proposal_number) then
  raise exception using errcode='PF409',message='proposal_number_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_sync::text||':'||v_kind,28));
 select * into v_upload from public.proposal_file_uploads where organization_id=v_org and desktop_proposal_id=v_proposal.id and file_kind=v_kind and sha256=v_hash for update;
 if found then
  if v_upload.size_bytes<>v_size or v_upload.mime_type<>v_mime then raise exception using errcode='PF409',message='file_identity_conflict'; end if;
  if v_upload.status<>'completed' then update public.proposal_file_uploads set status='authorized',last_error=null,expires_at=now()+interval '2 hours',updated_at=now() where id=v_upload.id returning * into v_upload; end if;
 else
  insert into public.proposal_file_uploads(organization_id,desktop_proposal_id,operation_id,sync_id,file_kind,original_filename,sha256,size_bytes,mime_type,storage_path,prepared_by)
  values(v_org,v_proposal.id,v_proposal.operation_id,v_sync,v_kind,v_name,v_hash,v_size,v_mime,v_org::text||'/'||v_sync::text||'/'||v_kind||'/'||v_hash||'.'||v_kind,p_actor_id) returning * into v_upload;
 end if;
 select * into v_file from public.proposal_files where upload_id=v_upload.id;
 return jsonb_build_object('upload',to_jsonb(v_upload),'file',case when v_file.id is null then null else private.proposal_file_summary(v_file) end);
end $$;
create function public.get_proposal_file_upload(p_actor_id uuid,p_upload_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_org uuid;u public.proposal_file_uploads;f public.proposal_files;
begin
 v_org:=private.proposal_file_actor(p_actor_id,'desktop_proposals.sync');
 select * into u from public.proposal_file_uploads where organization_id=v_org and id=p_upload_id;
 if not found then raise exception using errcode='PF404',message='upload_not_found'; end if;
 select * into f from public.proposal_files where upload_id=u.id;
 return jsonb_build_object('upload',to_jsonb(u),'file',case when f.id is null then null else private.proposal_file_summary(f) end);
end $$;
create function public.fail_proposal_file_upload(p_actor_id uuid,p_upload_id uuid,p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare v_org uuid;
begin
 v_org:=private.proposal_file_actor(p_actor_id,'desktop_proposals.sync');
 if p_code not in ('hash_mismatch','file_size_mismatch','invalid_file','mime_mismatch') then raise exception using errcode='DS400',message='invalid_payload'; end if;
 update public.proposal_file_uploads set status='failed',last_error=p_code,updated_at=now() where organization_id=v_org and id=p_upload_id and status<>'completed';
end $$;
create function public.complete_proposal_file_upload(p_actor_id uuid,p_upload_id uuid,p_sha256 text,p_size_bytes bigint,p_mime_type text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_org uuid;u public.proposal_file_uploads;f public.proposal_files;v_version integer;
begin
 v_org:=private.proposal_file_actor(p_actor_id,'desktop_proposals.sync');
 select * into u from public.proposal_file_uploads where organization_id=v_org and id=p_upload_id;
 if not found then raise exception using errcode='PF404',message='upload_not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||u.sync_id::text||':'||u.file_kind,28));
 select * into u from public.proposal_file_uploads where id=p_upload_id for update;
 select * into f from public.proposal_files where upload_id=u.id;
 if found then return private.proposal_file_summary(f); end if;
 if u.status<>'authorized' or u.expires_at<now() then raise exception using errcode='PF409',message='upload_expired'; end if;
 if p_sha256 is distinct from u.sha256 or p_size_bytes is distinct from u.size_bytes or p_mime_type is distinct from u.mime_type then
  raise exception using errcode='PF409',message='file_identity_conflict'; end if;
 if not exists(select 1 from storage.objects where bucket_id='proposal-files' and name=u.storage_path) then
  raise exception using errcode='PF404',message='upload_not_found'; end if;
 select coalesce(max(version),0)+1 into v_version from public.proposal_files where organization_id=v_org and desktop_proposal_id=u.desktop_proposal_id and file_kind=u.file_kind;
 update public.proposal_files set is_current=false,updated_at=now() where organization_id=v_org and desktop_proposal_id=u.desktop_proposal_id and file_kind=u.file_kind and is_current;
 insert into public.proposal_files(organization_id,desktop_proposal_id,operation_id,sync_id,upload_id,file_kind,original_filename,storage_path,sha256,size_bytes,mime_type,version,uploaded_by)
 values(v_org,u.desktop_proposal_id,u.operation_id,u.sync_id,u.id,u.file_kind,u.original_filename,u.storage_path,u.sha256,u.size_bytes,u.mime_type,v_version,p_actor_id) returning * into f;
 update public.proposal_file_uploads set status='completed',last_error=null,updated_at=now() where id=u.id;
 insert into public.audit_log(organization_id,actor_user_id,entity_type,entity_id,action,changes,context)
 select v_org,p_actor_id,'proposal_files',f.id,action,
 jsonb_build_object('sync_id',f.sync_id,'proposal_file_id',f.id,'file_kind',f.file_kind,'sha256',f.sha256,'size_bytes',f.size_bytes,'version',f.version),jsonb_build_object('source','desktop_export')
 from unnest(array['PROPOSAL_FILE_UPLOADED','PROPOSAL_FILE_VERSION_CREATED']) action;
 return private.proposal_file_summary(f);
end $$;
create function public.get_proposal_file_download(p_actor_id uuid,p_file_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_org uuid;f public.proposal_files;
begin
 v_org:=private.proposal_file_actor(p_actor_id,'proposal_files.read');
 select * into f from public.proposal_files where organization_id=v_org and id=p_file_id;
 if not found then raise exception using errcode='PF404',message='file_not_found'; end if;
 return to_jsonb(f);
end $$;
create function public.audit_proposal_file_download(p_actor_id uuid,p_file_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_org uuid;f public.proposal_files;
begin
 v_org:=private.proposal_file_actor(p_actor_id,'proposal_files.read');
 select * into f from public.proposal_files where organization_id=v_org and id=p_file_id;
 if not found then raise exception using errcode='PF404',message='file_not_found'; end if;
 insert into public.audit_log(organization_id,actor_user_id,entity_type,entity_id,action,changes,context)
 values(v_org,p_actor_id,'proposal_files',f.id,'PROPOSAL_FILE_DOWNLOAD_AUTHORIZED',
 jsonb_build_object('sync_id',f.sync_id,'proposal_file_id',f.id,'file_kind',f.file_kind,'sha256',f.sha256,'size_bytes',f.size_bytes),jsonb_build_object('source','web_download'));
end $$;
revoke all on function private.proposal_file_actor(uuid,text),private.proposal_file_summary(public.proposal_files),private.guard_proposal_file() from public,anon,authenticated,service_role;
revoke all on function public.prepare_proposal_file_upload(uuid,jsonb),public.get_proposal_file_upload(uuid,uuid),public.fail_proposal_file_upload(uuid,uuid,text),
 public.complete_proposal_file_upload(uuid,uuid,text,bigint,text),public.get_proposal_file_download(uuid,uuid),public.audit_proposal_file_download(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_proposal_file_upload(uuid,jsonb),public.get_proposal_file_upload(uuid,uuid),public.fail_proposal_file_upload(uuid,uuid,text),
 public.complete_proposal_file_upload(uuid,uuid,text,bigint,text),public.get_proposal_file_download(uuid,uuid),public.audit_proposal_file_download(uuid,uuid) to service_role;
commit;
