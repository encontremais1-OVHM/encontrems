-- Make first-time WhatsApp registration additions automatic while preserving
-- the invariant that only a signed participant_added webhook can set joined.
create extension if not exists pg_net;

create or replace function public.require_verified_whatsapp_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id text;
  v_authorized boolean := false;
begin
  if new.status <> 'joined' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'joined' then
    return new;
  end if;

  v_event_id := nullif(pg_catalog.current_setting('app.whatsapp_confirmation_event_id', true), '');
  if v_event_id is not null then
    select exists (
      select 1
      from public.whatsapp_webhook_events e
      join public.whatsapp_groups g on g.external_group_id = e.external_group_id
      join public.members m on m.id = new.member_id
      where e.event_id = v_event_id
        and e.event_type = 'whatsapp.participant_added'
        and g.id = new.whatsapp_group_id
        and pg_catalog.regexp_replace(coalesce(m.phone_e164, m.phone), '[^0-9]', '', 'g') = e.participant_phone
    ) into v_authorized;
  end if;

  if not v_authorized then
    if tg_op = 'INSERT' then
      new.status := 'pending_invitation';
      new.joined_at := null;
      new.last_synced_at := null;
    else
      new.status := old.status;
      new.joined_at := old.joined_at;
      new.external_participant_id := old.external_participant_id;
      new.last_synced_at := old.last_synced_at;
      new.removed_at := old.removed_at;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.require_verified_whatsapp_join() from public, anon, authenticated;

drop trigger if exists trg_require_verified_whatsapp_join on public.group_memberships;
create trigger trg_require_verified_whatsapp_join
before insert or update on public.group_memberships
for each row execute function public.require_verified_whatsapp_join();

create or replace function public.dispatch_whatsapp_access_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://encontrems12.netlify.app/.netlify/functions/enforce-access',
    body := pg_catalog.jsonb_build_object(
      'source', 'database-trigger',
      'requested_at', pg_catalog.now()
    ),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function public.dispatch_whatsapp_access_worker() from public, anon, authenticated;
grant execute on function public.dispatch_whatsapp_access_worker() to service_role;

create or replace function public.enqueue_registration_community_add()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.whatsapp_groups%rowtype;
  v_key text;
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
        last_error = null,
        next_retry_at = null,
        executed_at = null,
        updated_at = pg_catalog.now()
    where public.access_operations.status in ('failed', 'cancelled', 'succeeded');

  perform public.dispatch_whatsapp_access_worker();
  return new;
end;
$$;
revoke all on function public.enqueue_registration_community_add() from public, anon, authenticated;

drop trigger if exists trg_enqueue_registration_community_add on public.group_memberships;
create trigger trg_enqueue_registration_community_add
after insert or update of status on public.group_memberships
for each row execute function public.enqueue_registration_community_add();

create or replace function public.keep_add_operation_pending_until_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_status text;
begin
  if new.operation_type <> 'add' or new.status <> 'succeeded' then
    return new;
  end if;

  select gm.status into v_membership_status
  from public.group_memberships gm
  where gm.member_id = new.member_id
    and gm.whatsapp_group_id = new.whatsapp_group_id
  limit 1;

  if v_membership_status is distinct from 'joined' then
    new.status := 'retry_pending';
    new.executed_at := null;
    new.next_retry_at := pg_catalog.now() + interval '15 seconds';
    new.last_error := 'Aguarda a confirmação real de entrada enviada pelo WhatsApp.';
  end if;

  return new;
end;
$$;
revoke all on function public.keep_add_operation_pending_until_joined() from public, anon, authenticated;

drop trigger if exists trg_keep_add_operation_pending_until_joined on public.access_operations;
create trigger trg_keep_add_operation_pending_until_joined
before insert or update of status on public.access_operations
for each row execute function public.keep_add_operation_pending_until_joined();

create or replace function public.confirm_whatsapp_participant(
  p_event_id text,
  p_external_group_id text,
  p_participant_phone text,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_group public.whatsapp_groups%rowtype;
  v_member public.members%rowtype;
  v_membership public.group_memberships%rowtype;
  v_subscription record;
  v_inserted integer;
  v_activated boolean := false;
  v_rows integer := 0;
  v_when timestamptz := coalesce(p_occurred_at, pg_catalog.now());
begin
  v_phone := pg_catalog.regexp_replace(coalesce(p_participant_phone, ''), '[^0-9]', '', 'g');
  if coalesce(p_event_id, '') = ''
     or coalesce(p_external_group_id, '') = ''
     or v_phone !~ '^[0-9]{8,15}$' then
    raise exception 'invalid_webhook_payload';
  end if;

  insert into public.whatsapp_webhook_events(event_id, event_type, external_group_id, participant_phone)
  values (p_event_id, 'whatsapp.participant_added', p_external_group_id, v_phone)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return pg_catalog.jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  -- This transaction-local marker is the only way the membership guard accepts
  -- a transition to joined. A normal REST PATCH cannot forge it.
  perform pg_catalog.set_config('app.whatsapp_confirmation_event_id', p_event_id, true);

  select * into v_group
  from public.whatsapp_groups
  where external_group_id = p_external_group_id and is_active = true
  limit 1;
  if not found then
    raise exception 'whatsapp_group_not_found';
  end if;

  select * into v_member
  from public.members
  where pg_catalog.regexp_replace(coalesce(phone_e164, phone), '[^0-9]', '', 'g') = v_phone
  limit 1;
  if not found then
    raise exception 'member_not_found';
  end if;

  select * into v_membership
  from public.group_memberships
  where member_id = v_member.id and whatsapp_group_id = v_group.id
  for update;
  if not found then
    raise exception 'membership_not_authorized';
  end if;

  update public.group_memberships
  set status = 'joined',
      external_participant_id = v_phone || '@s.whatsapp.net',
      joined_at = coalesce(joined_at, v_when),
      removed_at = null,
      last_synced_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_membership.id;

  update public.access_operations
  set status = 'succeeded',
      executed_at = coalesce(executed_at, pg_catalog.now()),
      last_error = null,
      next_retry_at = null,
      updated_at = pg_catalog.now()
  where member_id = v_member.id
    and whatsapp_group_id = v_group.id
    and operation_type = 'add'
    and status in ('queued', 'processing', 'retry_pending', 'failed', 'cancelled');

  if v_group.group_type = 'community' then
    select s.*, p.duration_days, p.grace_days into v_subscription
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.member_id = v_member.id
      and s.community_id = v_group.community_id
      and s.status not in ('cancelled', 'suspended')
    order by s.created_at desc
    limit 1
    for update of s;

    if found then
      if v_subscription.whatsapp_activated_at is null then
        update public.subscriptions
        set status = 'active',
            starts_at = v_when,
            activated_at = v_when,
            expires_at = v_when + pg_catalog.make_interval(days => v_subscription.duration_days),
            grace_ends_at = v_when + pg_catalog.make_interval(days => v_subscription.duration_days + coalesce(v_subscription.grace_days, 0)),
            whatsapp_activated_at = v_when,
            ended_at = null,
            updated_at = pg_catalog.now()
        where id = v_subscription.id;
        v_activated := true;
      else
        v_activated := v_subscription.whatsapp_activated_at = v_when;
      end if;
    end if;

    update public.members
    set status = 'active', updated_at = pg_catalog.now()
    where id = v_member.id;

    -- Subgroups are queued only after the main Community has been confirmed.
    insert into public.access_operations(
      member_id, whatsapp_group_id, operation_type, status, idempotency_key, attempts
    )
    select gm.member_id,
           gm.whatsapp_group_id,
           'add',
           'queued',
           'renewal-add:registration:' || gm.id::text,
           0
    from public.group_memberships gm
    join public.whatsapp_groups sg on sg.id = gm.whatsapp_group_id
    where gm.member_id = v_member.id
      and sg.community_id = v_group.community_id
      and sg.group_type = 'subgroup'
      and sg.is_active = true
      and gm.status in ('pending_invitation', 'invited')
    on conflict (idempotency_key) do update
      set status = 'queued',
          attempts = 0,
          external_operation_id = null,
          last_error = null,
          next_retry_at = null,
          executed_at = null,
          updated_at = pg_catalog.now()
      where public.access_operations.status in ('failed', 'cancelled', 'succeeded');

    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      perform public.dispatch_whatsapp_access_worker();
    end if;
  end if;

  update public.whatsapp_webhook_events
  set processed_at = pg_catalog.now(),
      result = pg_catalog.jsonb_build_object(
        'member_id', v_member.id,
        'group_id', v_group.id,
        'group_type', v_group.group_type,
        'subscription_activated', v_activated
      )
  where event_id = p_event_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'member_id', v_member.id,
    'group_id', v_group.id,
    'group_type', v_group.group_type,
    'subscription_activated', v_activated
  );
end;
$$;
revoke all on function public.confirm_whatsapp_participant(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_whatsapp_participant(text, text, text, timestamptz)
  to service_role;
