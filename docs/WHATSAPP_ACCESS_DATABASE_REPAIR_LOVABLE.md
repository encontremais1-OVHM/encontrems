# Reparação obrigatória do fluxo de acesso WhatsApp (Lovable)

> Documento de execução para o Lovable. Não aplicar alterações SQL manualmente fora do Lovable. Project Supabase: `dyaiqrhbagxavsjdzaje`.

## Diagnóstico confirmado em produção

- O único dispatcher correcto é a fila Supabase/Railway: cron `encontre-plus-whatsapp-access-worker` executa `run_whatsapp_access_worker()` a cada 10 segundos.
- A trigger `enqueue_registration_community_add()` cria a operação `renewal-add:registration:<membership_id>` e chama `process_pending_whatsapp_adds()`. Esta função envia a operação para o endpoint Railway privado, assinado por HMAC.
- A função de fila só processa `renewal-add:%`. O antigo worker Netlify também tentava processar as mesmas operações; foi removido na branch de auditoria para evitar pedidos duplicados.
- Railway está LIVE e o último deploy está SUCCESS. O endpoint usa Baileys `communityParticipantsUpdate` para Comunidades e `groupParticipantsUpdate` para subgrupos; o último erro observado na operação real foi `rate-overlimit`, com backoff de seis horas. Não há evento `whatsapp.participant_added` processado para a operação em teste.
- A Edge Function `whatsapp-confirmation` já valida HMAC e chama `confirm_whatsapp_participant()`. Não criar outro webhook.
- O plano activo é 30 dias gratuitos + 5 dias de tolerância; renovação de 1.000 Kz.

## Alterar `public.confirm_whatsapp_participant(...)`

Preservar assinatura actual, SECURITY DEFINER, `SET search_path = ''`, deduplicação por `event_id` e privilégio EXECUTE apenas para `service_role`.

1. Validar payload e inserir o evento idempotentemente.
2. Localizar grupo activo e membro pelo número normalizado; bloquear a membership com `FOR UPDATE`.
3. Carregar e bloquear a subscrição mais recente desse membro/comunidade com `FOR UPDATE`.
4. **Antes de marcar qualquer membership como joined**, exigir subscrição elegível:
   - primeira entrada: `status = 'pending'`, inscrição/pagamento já aprovados pelo fluxo de negócio;
   - membro já activado: `status IN ('active','grace_period')` e `coalesce(grace_ends_at, expires_at) >= now()`;
   - rejeitar `cancelled`, `suspended`, `expired`, subscrição ausente ou prazo de tolerância ultrapassado.
5. Para um subgrupo, exigir adicionalmente que a membership da Comunidade principal esteja `joined` e que o subgrupo pertença à mesma comunidade.
6. Exigir uma operação de adição correspondente em estado `queued`, `processing` ou `retry_pending`; não reabrir nem converter operações `failed`/`cancelled` por causa de um evento atrasado.
7. Só depois das verificações actualizar a membership para `joined` e marcar a operação correspondente `succeeded`.
8. Na primeira confirmação da Comunidade, e apenas se `whatsapp_activated_at IS NULL` e a subscrição estiver `pending`, iniciar o relógio: `starts_at = occurred_at`, `expires_at = occurred_at + duration_days`, `grace_ends_at = occurred_at + duration_days + grace_days`, definir `whatsapp_activated_at` e mudar para `active`.
9. Nunca reiniciar datas de uma subscrição já activada. Não activar subscrição expirada ou cancelada.
10. Só depois da confirmação real da Comunidade enfileirar os subgrupos seleccionados, com chave idempotente por membership. A transacção deve ser atómica.

## Corrigir `public.enqueue_expired_whatsapp_removals()`

A regra actual tem um bug: quando não existe pagamento de renovação, enfileira a remoção em `expires_at` e reescreve `grace_ends_at = expires_at`, eliminando os cinco dias de tolerância.

Substituir a condição por uma regra única e consistente:
- a subscrição só é elegível para expiração quando `coalesce(grace_ends_at, expires_at) <= now()`, independentemente de já existir pagamento de renovação;
- nunca encurtar nem sobrescrever `grace_ends_at`;
- considerar apenas a subscrição mais recente por membro/comunidade;
- enfileirar, idempotentemente, remoção para cada membership `joined` da Comunidade e dos subgrupos dessa comunidade;
- marcar membership `removal_pending` e preservar auditoria;
- não enfileirar membros antes do fim da tolerância.

## Worker de remoção

Foi adicionada nesta branch uma defesa temporária em `netlify/functions/manual-removals.mjs`: antes de remover uma operação `expiry-remove`, consulta a subscrição mais recente e o `grace_days` do plano. Calcula o prazo efectivo como o maior entre `grace_ends_at` e `expires_at + grace_days`; se ainda estiver dentro da tolerância, mantém a operação em `retry_pending` para a data correcta e repõe a membership como `joined`. Isto protege contra a função SQL actual que encurta `grace_ends_at`. Esta defesa é adicional, não substitui a correcção transaccional no banco.

O worker deve ainda revalidar a subscrição imediatamente antes da chamada Baileys; se houve renovação ou a subscrição voltou a ficar elegível, cancelar/adiar a remoção. Exigir que a conta conectada seja administradora. Depois da chamada, consultar a lista real do WhatsApp e só marcar `removed`/operação `succeeded` quando a ausência estiver confirmada. Se WhatsApp devolver 429/rate-overlimit, respeitar backoff e não repetir em loop.

## Agendamento

Manter um único dispatcher de adições a cada 10 segundos. Mudar a função que enfileira expirações de diária para execução frequente (por exemplo, a cada 5 minutos); a função de remoção deve ser idempotente e segura para reexecução. Não criar um segundo worker Netlify.

## Testes de aceitação obrigatórios

1. Inscrição aprovada cria exactamente uma operação de entrada na Comunidade; duplicar a inscrição/evento não cria operações duplicadas.
2. Railway envia o pedido e WhatsApp devolve confirmação real; só então a membership passa a `joined`.
3. Os 30 dias começam no timestamp da primeira entrada confirmada, não na data do formulário.
4. Subgrupos seleccionados só são enfileirados após a Comunidade estar `joined`; subgrupos não seleccionados nunca são enfileirados.
5. Evento webhook repetido é idempotente.
6. Evento atrasado depois de cancelamento/expiração não reabre membership nem subscrição.
7. Aos 30 dias, sem renovação, o acesso continua durante os 5 dias de tolerância.
8. Antes de terminar a tolerância não existe operação de remoção; depois do prazo, todos os grupos autorizados são removidos e a ausência é confirmada no WhatsApp.
9. Pagamento de renovação durante a tolerância impede a remoção e mantém o acesso por mais 30 dias.
10. Sem privilégios de administrador ou com erro 429, não marcar sucesso; guardar erro e agendar retry seguro.
11. Verificar RLS, privilégios EXECUTE e executar Supabase Security Advisors após a alteração.

## Critério de conclusão

Não declarar o fluxo funcional apenas porque a operação foi enviada ou porque o webhook respondeu HTTP 202. Exigir evidência real de participante na Comunidade, evento processado, membership `joined`, datas de activação correctas, subgrupos confirmados e remoção verificada após o fim dos 35 dias.
