alter table public.whatsapp_groups
  drop constraint if exists whatsapp_groups_sync_status_check;

alter table public.whatsapp_groups
  add constraint whatsapp_groups_sync_status_check
  check (sync_status = any (array['pending'::text, 'synced'::text, 'error'::text, 'disabled'::text, 'removed'::text]));
