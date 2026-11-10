-- Fail permanent WhatsApp add errors immediately instead of leaving members
-- in an endless pending state. Transient 408/425/429 and 5xx responses retry.
create or replace function public.reconcile_whatsapp_access_errors()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_op record;
  v_message text;
  v_count integer := 0;
begin
  for v_op in
    select
      ao.id,
      ao.member_id,
      ao.whatsapp_group_id,
      r.status_code,
      r.content
    from public.access_operations ao
    join net._http_response r on r.id = ao.dispatch_request_id
    where ao.operation_type = 'add'
      and ao.status = 'processing'
      and r.status_code between 400 and 499
      and r.status_code not in (408, 425, 429)
    for update of ao skip locked
  loop
    v_message := case
      when v_op.status_code = 422 and coalesce(v_op.content, '') like '%phone_not_registered_on_whatsapp%'
        then 'O WhatsApp não reconheceu o número indicado como uma conta WhatsApp. Confirme o número completo, incluindo o indicativo +244.'
      when v_op.status_code = 403
        then 'A conta administradora não tem permissão para adicionar membros à Comunidade ou ao subgrupo.'
      when v_op.status_code = 404
        then 'A Comunidade ou o subgrupo configurado não foi encontrado no WhatsApp.'
      else
        'O WhatsApp recusou a operação de adição (HTTP ' || v_op.status_code::text || '). Verifique os dados e as permissões.'
    end;

    update public.access_operations
    set status = 'failed',
        next_retry_at = null,
        last_error = v_message,
        updated_at = pg_catalog.now()
    where id = v_op.id;

    update public.group_memberships
    set status = 'failed',
        joined_at = null,
        updated_at = pg_catalog.now()
    where member_id = v_op.member_id
      and whatsapp_group_id = v_op.whatsapp_group_id
      and status in ('pending_invitation', 'invited');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;
revoke all on function public.reconcile_whatsapp_access_errors() from public, anon, authenticated;
grant execute on function public.reconcile_whatsapp_access_errors() to service_role;

create or replace function public.run_whatsapp_access_worker()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_dispatched integer := 0;
begin
  perform public.reconcile_whatsapp_access_errors();
  v_dispatched := public.process_pending_whatsapp_adds(null);
  return v_dispatched;
end;
$function$;
revoke all on function public.run_whatsapp_access_worker() from public, anon, authenticated;
grant execute on function public.run_whatsapp_access_worker() to service_role;

create or replace function public.dispatch_whatsapp_access_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.run_whatsapp_access_worker();
exception when others then
  raise warning 'WhatsApp access dispatch failed: %', sqlerrm;
end;
$function$;
revoke all on function public.dispatch_whatsapp_access_worker() from public, anon, authenticated;
grant execute on function public.dispatch_whatsapp_access_worker() to service_role;

select cron.schedule(
  'encontre-plus-whatsapp-access-worker',
  '10 seconds',
  'select public.run_whatsapp_access_worker();'
);
