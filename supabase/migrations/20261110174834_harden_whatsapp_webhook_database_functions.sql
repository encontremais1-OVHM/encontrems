alter function public.confirm_whatsapp_participant(text, text, text, timestamptz) set search_path = '';
alter function public.finalize_subscription_expiry(uuid) set search_path = '';
alter function public.enqueue_expired_whatsapp_removals() set search_path = '';
