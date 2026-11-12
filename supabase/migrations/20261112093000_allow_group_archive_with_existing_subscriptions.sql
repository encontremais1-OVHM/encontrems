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
    where whatsapp_group_id = p_group_id and status = 'processing'
  ) then
    raise exception using errcode = 'P0001', message = 'Existe uma operação WhatsApp em execução para este grupo. Aguarde a sua conclusão e tente novamente.';
  end if;

  -- Archive only the platform catalog entry. Existing subscriptions,
  -- memberships and audit history remain intact; no WhatsApp participant
  -- is removed. Expiry workers can still process historical memberships.
  update public.access_operations
  set status = 'cancelled', next_retry_at = null, updated_at = now()
  where whatsapp_group_id = p_group_id and status in ('queued', 'retry_pending');

  update public.whatsapp_groups
  set is_active = false, sync_status = 'removed', invite_link = null, updated_at = now()
  where id = p_group_id;

  return jsonb_build_object('removed', true, 'already_removed', false);
end;
$$;

revoke all on function public.archive_whatsapp_group(uuid) from public, anon, authenticated;
grant execute on function public.archive_whatsapp_group(uuid) to service_role;
