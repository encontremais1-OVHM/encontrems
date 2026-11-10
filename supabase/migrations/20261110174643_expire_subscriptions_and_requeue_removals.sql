create or replace function public.enqueue_expired_whatsapp_removals()
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_subscription record;
  v_membership record;
  v_queued integer := 0;
  v_rows integer;
begin
  for v_subscription in
    select s.id, s.member_id, s.community_id
    from public.subscriptions s
    where s.status in ('active', 'grace_period')
      and coalesce(s.grace_ends_at, s.expires_at) <= now()
      and s.id = (
        select s2.id from public.subscriptions s2
        where s2.member_id = s.member_id and s2.community_id = s.community_id
        order by s2.created_at desc limit 1
      )
  loop
    for v_membership in
      select gm.id, gm.member_id, gm.whatsapp_group_id
      from public.group_memberships gm
      join public.whatsapp_groups wg on wg.id = gm.whatsapp_group_id
      where gm.member_id = v_subscription.member_id
        and wg.community_id = v_subscription.community_id
        and gm.status in ('joined', 'removal_pending')
    loop
      insert into public.access_operations(
        member_id, whatsapp_group_id, operation_type, status, idempotency_key, attempts
      )
      values (
        v_membership.member_id, v_membership.whatsapp_group_id, 'remove', 'queued',
        'expiry-remove:' || v_subscription.id::text || ':' || v_membership.whatsapp_group_id::text, 0
      )
      on conflict (idempotency_key) do update
      set status = 'queued', attempts = 0,
          last_error = 'Operação de expiração reaberta automaticamente para nova tentativa.',
          next_retry_at = null, updated_at = now()
      where access_operations.status in ('failed', 'cancelled')
        and coalesce(access_operations.last_error, '') !~* '(bot_must_be_(community|group)_admin|forbidden|403)';
      get diagnostics v_rows = row_count;
      v_queued := v_queued + v_rows;
      update public.group_memberships set status = 'removal_pending', updated_at = now()
      where id = v_membership.id and status = 'joined';
    end loop;

    update public.subscriptions
    set status = 'expired', ended_at = coalesce(ended_at, now()), updated_at = now()
    where id = v_subscription.id and status not in ('expired', 'cancelled');
  end loop;
  return jsonb_build_object('queued_or_reopened', v_queued);
end;
$$;
revoke all on function public.enqueue_expired_whatsapp_removals() from public, anon, authenticated;

do $$
declare v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job
    where jobname = 'encontre-plus-expired-whatsapp-removals'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule('encontre-plus-expired-whatsapp-removals', '0 1 * * *',
    'select public.enqueue_expired_whatsapp_removals();');
end $$;
