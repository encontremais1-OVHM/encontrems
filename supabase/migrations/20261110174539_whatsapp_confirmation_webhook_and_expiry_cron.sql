-- WhatsApp confirmation webhook and durable subscription expiry queue.
-- The WhatsApp service confirms participant additions; PostgreSQL only schedules
-- removals. Actual WhatsApp removals remain in the Baileys-backed worker.

create extension if not exists pg_cron with schema pg_catalog;

alter table public.subscriptions
  add column if not exists whatsapp_activated_at timestamptz;

create table if not exists public.whatsapp_webhook_events (
  event_id text primary key,
  event_type text not null,
  external_group_id text not null,
  participant_phone text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result jsonb not null default '{}'::jsonb
);

alter table public.whatsapp_webhook_events enable row level security;
revoke all on public.whatsapp_webhook_events from anon, authenticated;
grant all on public.whatsapp_webhook_events to service_role;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'whatsapp_webhook_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'whatsapp_webhook_secret',
      'HMAC secret for Encontre Mais WhatsApp participant confirmation webhook');
  end if;
end $$;

create or replace function public.get_whatsapp_webhook_secret()
returns text language sql security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'whatsapp_webhook_secret' order by created_at desc limit 1;
$$;
revoke all on function public.get_whatsapp_webhook_secret() from public, anon, authenticated;
grant execute on function public.get_whatsapp_webhook_secret() to service_role;

create or replace function public.confirm_whatsapp_participant(
  p_event_id text, p_external_group_id text, p_participant_phone text,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_group public.whatsapp_groups%rowtype;
  v_member public.members%rowtype;
  v_membership public.group_memberships%rowtype;
  v_subscription record;
  v_inserted integer;
  v_activated boolean := false;
  v_when timestamptz := coalesce(p_occurred_at, now());
begin
  v_phone := regexp_replace(coalesce(p_participant_phone, ''), '[^0-9]', '', 'g');
  if coalesce(p_event_id, '') = '' or coalesce(p_external_group_id, '') = ''
     or v_phone !~ '^[0-9]{8,15}$' then
    raise exception 'invalid_webhook_payload';
  end if;

  insert into public.whatsapp_webhook_events(event_id, event_type, external_group_id, participant_phone)
  values (p_event_id, 'whatsapp.participant_added', p_external_group_id, v_phone)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  select * into v_group from public.whatsapp_groups
  where external_group_id = p_external_group_id and is_active = true limit 1;
  if not found then raise exception 'whatsapp_group_not_found'; end if;

  select * into v_member from public.members
  where regexp_replace(coalesce(phone_e164, phone), '[^0-9]', '', 'g') = v_phone limit 1;
  if not found then raise exception 'member_not_found'; end if;

  select * into v_membership from public.group_memberships
  where member_id = v_member.id and whatsapp_group_id = v_group.id for update;
  if not found then raise exception 'membership_not_authorized'; end if;

  update public.group_memberships
  set status = 'joined',
      external_participant_id = v_phone || '@s.whatsapp.net',
      joined_at = coalesce(joined_at, v_when),
      removed_at = null, last_synced_at = now(), updated_at = now()
  where id = v_membership.id;

  update public.access_operations
  set status = 'succeeded', executed_at = coalesce(executed_at, now()),
      last_error = null, next_retry_at = null, updated_at = now()
  where member_id = v_member.id and whatsapp_group_id = v_group.id
    and operation_type = 'add' and status in ('queued', 'processing', 'retry_pending');

  if v_group.group_type = 'community' then
    select s.*, p.duration_days, p.grace_days into v_subscription
    from public.subscriptions s join public.plans p on p.id = s.plan_id
    where s.member_id = v_member.id and s.community_id = v_group.community_id
      and s.status not in ('cancelled', 'suspended')
    order by s.created_at desc limit 1 for update of s;

    if found and v_subscription.whatsapp_activated_at is null then
      update public.subscriptions
      set status = 'active',
          starts_at = v_when,
          activated_at = v_when,
          expires_at = v_when + make_interval(days => v_subscription.duration_days),
          grace_ends_at = v_when + make_interval(days => v_subscription.duration_days + coalesce(v_subscription.grace_days, 0)),
          whatsapp_activated_at = v_when,
          ended_at = null, updated_at = now()
      where id = v_subscription.id;
      v_activated := true;
    end if;
    update public.members set status = 'active', updated_at = now() where id = v_member.id;
  end if;

  update public.whatsapp_webhook_events
  set processed_at = now(),
      result = jsonb_build_object('member_id', v_member.id, 'group_id', v_group.id,
        'group_type', v_group.group_type, 'subscription_activated', v_activated)
  where event_id = p_event_id;

  return jsonb_build_object('ok', true, 'duplicate', false, 'member_id', v_member.id,
    'group_id', v_group.id, 'group_type', v_group.group_type, 'subscription_activated', v_activated);
end;
$$;
revoke all on function public.confirm_whatsapp_participant(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_whatsapp_participant(text, text, text, timestamptz)
  to service_role;

create or replace function public.finalize_subscription_expiry(p_subscription_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_subscription public.subscriptions%rowtype;
begin
  select * into v_subscription from public.subscriptions where id = p_subscription_id for update;
  if not found then return false; end if;
  if coalesce(v_subscription.grace_ends_at, v_subscription.expires_at) > now() then return false; end if;
  if exists (
    select 1 from public.group_memberships gm
    join public.whatsapp_groups wg on wg.id = gm.whatsapp_group_id
    where gm.member_id = v_subscription.member_id and wg.community_id = v_subscription.community_id
      and gm.status in ('joined', 'removal_pending')
  ) then return false; end if;
  update public.subscriptions set status = 'expired',
    ended_at = coalesce(ended_at, now()), updated_at = now()
  where id = p_subscription_id and status not in ('expired', 'cancelled');
  return true;
end;
$$;
revoke all on function public.finalize_subscription_expiry(uuid) from public, anon, authenticated;
grant execute on function public.finalize_subscription_expiry(uuid) to service_role;
