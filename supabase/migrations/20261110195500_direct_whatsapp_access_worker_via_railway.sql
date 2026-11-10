-- Replace the legacy five-minute Netlify queue runner with a direct,
-- signed Railway add request and a 10-second Supabase retry loop.
alter table public.access_operations
  add column if not exists dispatch_request_id bigint;

-- Do not start a trial until the member is actually confirmed in the main Community.
create or replace function public.keep_subscription_pending_until_whatsapp_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status in ('cancelled', 'suspended', 'expired') then
    return new;
  end if;

  if new.whatsapp_activated_at is null and not exists (
    select 1
    from public.group_memberships gm
    join public.whatsapp_groups wg on wg.id = gm.whatsapp_group_id
    where gm.member_id = new.member_id
      and wg.community_id = new.community_id
      and wg.group_type = 'community'
      and gm.status = 'joined'
  ) then
    new.status := 'pending';
    new.starts_at := null;
    new.expires_at := null;
    new.grace_ends_at := null;
    new.activated_at := null;
  end if;

  return new;
end;
$function$;
revoke all on function public.keep_subscription_pending_until_whatsapp_join() from public, anon, authenticated;

drop trigger if exists trg_keep_subscription_pending_until_whatsapp_join on public.subscriptions;
create trigger trg_keep_subscription_pending_until_whatsapp_join
before insert or update on public.subscriptions
for each row execute function public.keep_subscription_pending_until_whatsapp_join();

-- Repair existing trials that were started before a real WhatsApp Community join.
update public.subscriptions s
set status = 'pending',
    starts_at = null,
    expires_at = null,
    grace_ends_at = null,
    activated_at = null,
    updated_at = pg_catalog.now()
where s.status in ('active', 'grace_period')
  and s.whatsapp_activated_at is null
  and not exists (
    select 1
    from public.group_memberships gm
    join public.whatsapp_groups wg on wg.id = gm.whatsapp_group_id
    where gm.member_id = s.member_id
      and wg.community_id = s.community_id
      and wg.group_type = 'community'
      and gm.status = 'joined'
  );

create or replace function public.dispatch_whatsapp_access_for_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status in ('pending', 'active', 'grace_period') then
    perform public.dispatch_whatsapp_access_worker();
  end if;
  return new;
end;
$function$;
revoke all on function public.dispatch_whatsapp_access_for_subscription() from public, anon, authenticated;

drop trigger if exists trg_dispatch_whatsapp_access_for_subscription on public.subscriptions;
create trigger trg_dispatch_whatsapp_access_for_subscription
after insert or update of status on public.subscriptions
for each row execute function public.dispatch_whatsapp_access_for_subscription();


create or replace function public.process_pending_whatsapp_adds(p_operation_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
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
          last_error = 'A adição automática falhou após 12 tentativas. Verifique a ligação WhatsApp e as permissões de administrador.',
          updated_at = pg_catalog.now()
      where id = v_op.id;

      update public.group_memberships
      set status = 'failed', updated_at = pg_catalog.now()
      where member_id = v_op.member_id
        and whatsapp_group_id = v_op.whatsapp_group_id
        and status in ('pending_invitation', 'invited');
    else
      v_last_error := 'A aguardar confirmação real de entrada enviada pelo WhatsApp.';
      if v_op.dispatch_request_id is not null then
        select status_code, content, error_msg
          into v_prev_status, v_prev_content, v_prev_error
        from net._http_response
        where id = v_op.dispatch_request_id;

        if found then
          if v_prev_status is not null and v_prev_status >= 400 then
            v_last_error := 'Baileys HTTP ' || v_prev_status::text || ': ' ||
              left(coalesce(v_prev_content, v_prev_error, 'sem detalhe'), 240);
          else
            v_last_error := 'O pedido foi enviado, mas ainda não chegou o evento de confirmação do WhatsApp.';
          end if;
        end if;
      end if;

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

      update public.access_operations
      set status = 'processing',
          attempts = coalesce(attempts, 0) + 1,
          next_retry_at = pg_catalog.now() + interval '30 seconds',
          last_error = v_last_error,
          updated_at = pg_catalog.now()
      where id = v_op.id;

      begin
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
            attempts = coalesce(attempts, 0) + 1,
            next_retry_at = pg_catalog.now() + interval '30 seconds',
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

create or replace function public.dispatch_whatsapp_access_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.process_pending_whatsapp_adds(null);
exception when others then
  raise warning 'WhatsApp access dispatch failed: %', sqlerrm;
end;
$function$;
revoke all on function public.dispatch_whatsapp_access_worker() from public, anon, authenticated;
grant execute on function public.dispatch_whatsapp_access_worker() to service_role;

create or replace function public.enqueue_registration_community_add()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_group public.whatsapp_groups%rowtype;
  v_key text;
  v_operation_id uuid;
begin
  if new.status <> 'pending_invitation' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'pending_invitation' then
    return new;
  end if;

  select * into v_group
  from public.whatsapp_groups
  where id = new.whatsapp_group_id and is_active = true;

  if not found or v_group.group_type <> 'community' then
    return new;
  end if;

  v_key := 'renewal-add:registration:' || new.id::text;
  insert into public.access_operations(
    member_id, whatsapp_group_id, operation_type, status, idempotency_key, attempts
  ) values (
    new.member_id, new.whatsapp_group_id, 'add', 'queued', v_key, 0
  )
  on conflict (idempotency_key) do update
    set status = 'queued',
        attempts = 0,
        external_operation_id = null,
        dispatch_request_id = null,
        last_error = null,
        next_retry_at = null,
        executed_at = null,
        updated_at = pg_catalog.now()
    where public.access_operations.status in ('failed', 'cancelled', 'succeeded')
  returning id into v_operation_id;

  if v_operation_id is null then
    select id into v_operation_id
    from public.access_operations
    where idempotency_key = v_key;
  end if;

  if v_operation_id is not null then
    perform public.process_pending_whatsapp_adds(v_operation_id);
  end if;

  return new;
end;
$function$;
revoke all on function public.enqueue_registration_community_add() from public, anon, authenticated;

select cron.schedule(
  'encontre-plus-whatsapp-access-worker',
  '10 seconds',
  'select public.process_pending_whatsapp_adds();'
);
