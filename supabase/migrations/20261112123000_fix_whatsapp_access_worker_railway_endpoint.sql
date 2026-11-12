-- Keep the access worker's dispatch target aligned with the currently deployed
-- Railway WhatsApp API. The function body is read from PostgreSQL so this
-- migration changes only the endpoint and preserves its locking, retries,
-- signatures, idempotency and reconciliation behavior.
do $migration$
declare
  v_definition text;
  v_old_url constant text := 'https://encontre-bailyler-ovhm-production.up.railway.app/internal/whatsapp/participants/add';
  v_new_url constant text := 'https://encontre-bailyler-23-production.up.railway.app/internal/whatsapp/participants/add';
begin
  select pg_get_functiondef('public.process_pending_whatsapp_adds(uuid)'::regprocedure)
    into v_definition;

  if position(v_new_url in v_definition) > 0 then
    return;
  end if;

  if position(v_old_url in v_definition) = 0 then
    raise exception 'Expected WhatsApp access worker endpoint was not found; refusing to rewrite an unknown function definition.';
  end if;

  v_definition := replace(v_definition, v_old_url, v_new_url);
  execute v_definition;
end
$migration$;

do $verification$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.process_pending_whatsapp_adds(uuid)'::regprocedure)
    into v_definition;

  if position('https://encontre-bailyler-23-production.up.railway.app/internal/whatsapp/participants/add' in v_definition) = 0
     or position('https://encontre-bailyler-ovhm-production.up.railway.app/internal/whatsapp/participants/add' in v_definition) > 0 then
    raise exception 'WhatsApp access worker endpoint verification failed.';
  end if;
end
$verification$;
