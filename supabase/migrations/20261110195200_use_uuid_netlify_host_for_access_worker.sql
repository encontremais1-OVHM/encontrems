-- Use the Netlify site UUID host for internal worker dispatch.
-- The human-friendly alias returns 403 for direct scheduled-function invocation.
create or replace function public.dispatch_whatsapp_access_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://aa89896a-0c13-4821-bf41-7dffdad8a77b.netlify.app/.netlify/functions/enforce-access',
    body := pg_catalog.jsonb_build_object(
      'source', 'database-trigger',
      'requested_at', pg_catalog.now()
    ),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 25000
  );
end;
$$;
revoke all on function public.dispatch_whatsapp_access_worker() from public, anon, authenticated;
grant execute on function public.dispatch_whatsapp_access_worker() to service_role;
