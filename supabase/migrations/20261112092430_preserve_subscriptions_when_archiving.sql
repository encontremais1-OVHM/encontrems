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

  select coalesce(array_agg(id), array[]::uuid[])
  into v_group_ids
  from public.whatsapp_groups
  where community_id = p_community_id;

  if exists (
    select 1 from public.access_operations
    where whatsapp_group_id = any(v_group_ids)
      and status in ('queued', 'retry_pending', 'processing')
  ) then
    raise exception using errcode = 'P0001', message = 'Existem operações de acesso pendentes ou em execução nesta comunidade. Aguarde a conclusão antes de a remover.';
  end if;

  -- Archive the platform catalogue only. Keep subscriptions, plans, group
  -- memberships and access history intact so current members retain their
  -- existing WhatsApp access and expiry workers can still remove them later.
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

  return jsonb_build_object(
    'archived', true,
    'already_archived', false,
    'groups_archived', cardinality(v_group_ids),
    'subscriptions_preserved', true
  );
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
    select 1 from public.access_operations
    where whatsapp_group_id = p_group_id
      and status in ('queued', 'retry_pending', 'processing')
  ) then
    raise exception using errcode = 'P0001', message = 'Existem operações de acesso pendentes ou em execução para este grupo. Aguarde a conclusão antes de o remover.';
  end if;

  -- Keep current members, subscriptions and history; do not alter WhatsApp.
  update public.whatsapp_groups
  set is_active = false, sync_status = 'removed', invite_link = null, updated_at = now()
  where id = p_group_id;

  return jsonb_build_object('removed', true, 'already_removed', false, 'memberships_preserved', true);
end;
$$;

revoke all on function public.archive_whatsapp_community(uuid) from public, anon, authenticated;
revoke all on function public.archive_whatsapp_group(uuid) from public, anon, authenticated;
grant execute on function public.archive_whatsapp_community(uuid) to service_role;
grant execute on function public.archive_whatsapp_group(uuid) to service_role;
