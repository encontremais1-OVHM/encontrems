-- Respect WhatsApp rate limits and avoid retry storms for automatic member adds.
create or replace function public.process_pending_whatsapp_adds(p_operation_id uuid default null::uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_op record;
  v_secret text;
  v_body jsonb;
  v_signature text;
  v_request_id bigint;
  v_prev_status integer;
  v_prev_content text;
  v_prev_error text;
  v_last_error text;
  v_retry_delay interval;
  v_dispatched integer := 0;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'whatsapp_webhook_secret'
  order by created_at desc
  limit 1;

  if coalesce(length(v_secret), 0) < 32 then
    raise exception 'whatsapp_webhook_secret_unavailable';
  end if;

  for v_op in
    select
      ao.id,
      ao.member_id,
      ao.whatsapp_group_id,
      ao.attempts,
      ao.dispatch_request_id,
      wg.external_group_id,
      wg.group_type,
      wg.community_id,
      pg_catalog.regexp_replace(coalesce(m.phone_e164, m.phone), '[^0-9]', '', 'g') as phone
    from public.access_operations ao
    join public.group_memberships gm
      on gm.member_id = ao.member_id
     and gm.whatsapp_group_id = ao.whatsapp_group_id
    join public.whatsapp_groups wg on wg.id = ao.whatsapp_group_id
    join public.members m on m.id = ao.member_id
    where ao.operation_type = 'add'
      and ao.idempotency_key like 'renewal-add:%'
      and ao.status in ('queued', 'retry_pending', 'processing')
      and (ao.next_retry_at is null or ao.next_retry_at <= pg_catalog.now())
      and gm.status in ('pending_invitation', 'invited')
      and wg.is_active = true
      and wg.group_type in ('community', 'subgroup')
      and (
        wg.group_type = 'community'
        or exists (
          select 1
          from public.group_memberships cm
          join public.whatsapp_groups cg on cg.id = cm.whatsapp_group_id
          where cm.member_id = ao.member_id
            and cg.community_id = wg.community_id
            and cg.group_type = 'community'
            and cm.status = 'joined'
        )
      )
      and exists (
        select 1
        from public.subscriptions s
        where s.member_id = ao.member_id
          and s.community_id = wg.community_id
          and s.status in ('pending', 'active', 'grace_period')
          and (s.status = 'pending' or s.grace_ends_at is null or s.grace_ends_at >= pg_catalog.now())
      )
      and (p_operation_id is null or ao.id = p_operation_id)
    order by ao.created_at asc
    limit 1
    for update of ao skip locked
  loop
    if coalesce(v_op.attempts, 0) >= 12 then
      update public.access_operations
      set status = 'failed',
          next_retry_at = null,
          last_error = 'A adição automática falhou após 12 tentativas espaçadas. Verifique a ligação WhatsApp e as permissões de administrador.',
          updated_at = pg_catalog.now()
      where id = v_op.id;

      update public.group_memberships
      set status = 'failed', updated_at = pg_catalog.now()
      where member_id = v_op.member_id
        and whatsapp_group_id = v_op.whatsapp_group_id
        and status in ('pending_invitation', 'invited');
    else
      v_last_error := 'A aguardar confirmação real de entrada enviada pelo WhatsApp.';
      v_retry_delay := pg_catalog.make_interval(
        secs => least(3600, 30 * pg_catalog.power(2::numeric, least(coalesce(v_op.attempts, 0), 7))::integer)
      );

      if v_op.dispatch_request_id is not null then
        select status_code, content, error_msg
          into v_prev_status, v_prev_content, v_prev_error
        from net._http_response
        where id = v_op.dispatch_request_id;

        if found then
          if v_prev_status is not null and v_prev_status >= 400 then
            v_last_error := 'Baileys HTTP ' || v_prev_status::text || ': ' ||
              left(coalesce(v_prev_content, v_prev_error, 'sem detalhe'), 240);

            if coalesce(v_prev_content, '') ilike '%rate-overlimit%'
               or coalesce(v_prev_error, '') ilike '%rate-overlimit%' then
              v_retry_delay := interval '6 hours';
              v_last_error := v_last_error || ' Nova tentativa adiada por 6 horas para respeitar o limite do WhatsApp.';
            elsif v_prev_status in (408, 425, 429) then
              v_retry_delay := interval '15 minutes';
            elsif v_prev_status >= 500 then
              v_retry_delay := pg_catalog.make_interval(
                secs => least(3600, 30 * pg_catalog.power(2::numeric, least(coalesce(v_op.attempts, 0), 7))::integer)
              );
            else
              v_retry_delay := interval '30 minutes';
            end if;
          else
            v_last_error := 'O pedido foi enviado, mas ainda não chegou o evento de confirmação do WhatsApp.';
          end if;
        end if;
      end if;

      update public.access_operations
      set status = 'processing',
          attempts = coalesce(attempts, 0) + 1,
          next_retry_at = pg_catalog.now() + v_retry_delay,
          last_error = v_last_error,
          updated_at = pg_catalog.now()
      where id = v_op.id;

      begin
        v_body := pg_catalog.jsonb_build_object(
          'event_id', 'access-op-' || v_op.id::text,
          'operation_id', v_op.id,
          'group_id', v_op.external_group_id,
          'group_type', v_op.group_type,
          'phone', v_op.phone
        );
        v_signature := pg_catalog.encode(
          extensions.hmac(v_body::text, v_secret, 'sha256'),
          'hex'
        );

        v_request_id := net.http_post(
          url := 'https://encontre-bailyler-ovhm-production.up.railway.app/internal/whatsapp/participants/add',
          body := v_body,
          headers := pg_catalog.jsonb_build_object(
            'Content-Type', 'application/json',
            'x-encontre-signature', v_signature
          ),
          timeout_milliseconds := 25000
        );

        update public.access_operations
        set dispatch_request_id = v_request_id,
            updated_at = pg_catalog.now()
        where id = v_op.id;

        v_dispatched := v_dispatched + 1;
      exception when others then
        update public.access_operations
        set status = 'retry_pending',
            next_retry_at = pg_catalog.now() + v_retry_delay,
            last_error = left(sqlerrm, 300),
            updated_at = pg_catalog.now()
        where id = v_op.id;
      end;
    end if;
  end loop;

  return v_dispatched;
end;
$function$;

revoke all on function public.process_pending_whatsapp_adds(uuid) from public, anon, authenticated;
grant execute on function public.process_pending_whatsapp_adds(uuid) to service_role;
