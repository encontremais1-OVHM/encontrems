alter table public.communities
  add column if not exists archived_at timestamptz;

create index if not exists communities_archived_at_idx
  on public.communities (archived_at)
  where archived_at is not null;

create or replace function public.archive_whatsapp_community(p_community_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_community public.communities%rowtype;
  v_group_ids uuid[] := array[]::uuid[];
begin
  select * into v_community
  from public.communities
  where id = p_community_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Comunidade não encontrada.';
  end if;

  if v_community.archived_at is not null then
    return jsonb_build_object('archived', true, 'already_archived', true, 'groups_archived', 0);
  end if;

  if exists (
    select 1 from public.subscriptions
    where community_id = p_community_id and status in ('active', 'grace_period')
  ) then
    raise exception using errcode = 'P0001', message = 'Não é possível arquivar esta comunidade enquanto existirem subscrições ativas ou em período de tolerância.';
  end if;

  select coalesce(array_agg(id), array[]::uuid[])
  into v_group_ids
  from public.whatsapp_groups
  where community_id = p_community_id;

  if exists (
    select 1 from public.access_operations
    where whatsapp_group_id = any(v_group_ids) and status = 'processing'
  ) then
    raise exception using errcode = 'P0001', message = 'Existe uma operação WhatsApp em execução para esta comunidade. Aguarde a sua conclusão e tente novamente.';
  end if;

  update public.access_operations
  set status = 'cancelled', next_retry_at = null, updated_at = now()
  where whatsapp_group_id = any(v_group_ids)
    and status in ('queued', 'retry_pending');

  update public.whatsapp_groups
  set is_active = false, sync_status = 'removed', invite_link = null, updated_at = now()
  where community_id = p_community_id;

  update public.communities
  set status = 'inactive',
      archived_at = now(),
      whatsapp_community_id = null,
      image_url = null,
      updated_at = now()
  where id = p_community_id;

  return jsonb_build_object('archived', true, 'already_archived', false, 'groups_archived', cardinality(v_group_ids));
end;
$$;

create or replace function public.archive_whatsapp_group(p_group_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group public.whatsapp_groups%rowtype;
begin
  select * into v_group
  from public.whatsapp_groups
  where id = p_group_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Grupo não encontrado.';
  end if;

  if v_group.sync_status = 'removed' then
    return jsonb_build_object('removed', true, 'already_removed', true);
  end if;

  if exists (
    select 1 from public.communities
    where id = v_group.community_id and archived_at is not null
  ) then
    raise exception using errcode = 'P0001', message = 'A comunidade associada está arquivada. Restaure a comunidade antes de alterar este grupo.';
  end if;

  if exists (
    select 1 from public.subscriptions
    where community_id = v_group.community_id and status in ('active', 'grace_period')
  ) then
    raise exception using errcode = 'P0001', message = 'Não é possível remover este grupo enquanto a comunidade tiver subscrições ativas ou em período de tolerância.';
  end if;

  if exists (
    select 1 from public.access_operations
    where whatsapp_group_id = p_group_id and status = 'processing'
  ) then
    raise exception using errcode = 'P0001', message = 'Existe uma operação WhatsApp em execução para este grupo. Aguarde a sua conclusão e tente novamente.';
  end if;

  update public.access_operations
  set status = 'cancelled', next_retry_at = null, updated_at = now()
  where whatsapp_group_id = p_group_id and status in ('queued', 'retry_pending');

  update public.whatsapp_groups
  set is_active = false, sync_status = 'removed', invite_link = null, updated_at = now()
  where id = p_group_id;

  return jsonb_build_object('removed', true, 'already_removed', false);
end;
$$;

revoke all on function public.archive_whatsapp_community(uuid) from public, anon, authenticated;
revoke all on function public.archive_whatsapp_group(uuid) from public, anon, authenticated;
grant execute on function public.archive_whatsapp_community(uuid) to service_role;
grant execute on function public.archive_whatsapp_group(uuid) to service_role;
