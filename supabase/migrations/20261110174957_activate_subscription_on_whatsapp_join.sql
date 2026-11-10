create or replace function public.activate_subscription_on_whatsapp_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_type text;
  v_community_id uuid;
  v_subscription record;
  v_when timestamptz := coalesce(new.joined_at, now());
begin
  if new.status <> 'joined' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'joined' then return new; end if;

  select group_type, community_id
    into v_group_type, v_community_id
  from public.whatsapp_groups
  where id = new.whatsapp_group_id;

  if v_group_type = 'community' then
    select s.id, s.whatsapp_activated_at, p.duration_days, p.grace_days
      into v_subscription
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.member_id = new.member_id
      and s.community_id = v_community_id
      and s.status not in ('cancelled', 'suspended')
    order by s.created_at desc
    limit 1
    for update of s;

    if found and v_subscription.whatsapp_activated_at is null then
      update public.subscriptions
      set status = 'active',
          starts_at = v_when,
          activated_at = v_when,
          expires_at = v_when + make_interval(days => v_subscription.duration_days),
          grace_ends_at = v_when + make_interval(days => v_subscription.duration_days + coalesce(v_subscription.grace_days, 0)),
          whatsapp_activated_at = v_when,
          ended_at = null,
          updated_at = now()
      where id = v_subscription.id;
    end if;

    update public.members
    set status = 'active', updated_at = now()
    where id = new.member_id;
  end if;

  return new;
end;
$$;

revoke all on function public.activate_subscription_on_whatsapp_join() from public, anon, authenticated;
grant execute on function public.activate_subscription_on_whatsapp_join() to service_role;

drop trigger if exists trg_activate_subscription_on_whatsapp_join on public.group_memberships;
create trigger trg_activate_subscription_on_whatsapp_join
after insert or update of status on public.group_memberships
for each row
execute function public.activate_subscription_on_whatsapp_join();
