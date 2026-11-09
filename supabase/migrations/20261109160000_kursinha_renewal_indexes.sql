create index if not exists payments_kursinha_member_status_idx
  on public.payments (member_id, provider, payment_type, status, created_at desc);

create index if not exists notifications_renewal_lookup_idx
  on public.notifications (member_id, notification_type, channel, created_at desc);
