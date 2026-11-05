# Encontre + — Arquitetura técnica

Documento de referência da Fase 1. Resume a análise da especificação mestre e as decisões de arquitetura.

## 1. Arquitetura proposta

```text
 Navegador (membros / administradores)
        │  HTTPS + token Sanctum
        ▼
 Frontend React + TypeScript + Vite + Tailwind   ← construído na Lovable (raiz do repositório)
        │  REST JSON (VITE_API_URL)
        ▼
 Laravel API (Railway · serviço "web")
   ├── Laravel Worker (Railway · serviço "worker")      → filas: notificações, ordens de acesso
   ├── Laravel Scheduler (Railway · serviço "scheduler") → transições diárias de assinatura (Africa/Luanda)
   │
   ├── PostgreSQL do Supabase externo do proprietário   (ligação privada, só a partir do Laravel)
   ├── Supabase Storage (comprovativos)                 (só a partir do Laravel)
   └── WhatsApp Bridge (Railway · serviço próprio)      → Adaptador Bider (após documentação) / Mock
```

Princípios:

- O navegador nunca fala diretamente com a base de dados nem guarda segredos.
- Toda a lógica financeira e de estados de assinatura vive no Laravel.
- Sem Lovable Cloud nem base de dados gerida pela Lovable.
- Integrações externas (Bider, gateways de pagamento) atrás de interfaces substituíveis; nada é inventado antes da documentação oficial.

## 2. Estrutura de pastas

A Lovable exige o frontend na raiz do repositório. A separação de responsabilidades mantém-se:

```text
encontre-plus/
├── src/                  Frontend (React, TanStack Router, Tailwind)
│   ├── routes/           Páginas (público, /entrar, /admin/*)
│   ├── components/       UI, layout, componentes de aplicação
│   └── lib/api/          Cliente HTTP e contrato com o Laravel
├── backend/              Aplicação Laravel (Fase 2)
├── whatsapp-bridge/      Serviço de integração WhatsApp (Fase 5)
├── docs/                 Arquitetura, contrato de API, operação
├── .env.example          Variáveis públicas do frontend
└── README.md
```

## 3. Modelo relacional (PostgreSQL)

Valores monetários em `bigint` (Kz inteiros). Datas em `timestamptz`; cálculos em `Africa/Luanda`.

| Tabela | Campos principais | Notas |
|---|---|---|
| organizations | id, name, slug, logo_path, timezone, currency | Raiz multi-comunidade |
| communities | id, organization_id, name, slug, partner_name, is_primary, active | "Encontre +" + parceira Oswaldina |
| users | id, organization_id, name, email (único), password, role, active, last_login_at | Administradores: super_admin, gestor, suporte |
| personal_access_tokens | — | Laravel Sanctum |
| members | id, organization_id, full_name, whatsapp_e164, email, province, city, terms_accepted_at, marketing_consent, status, created_at | Único (organization_id, whatsapp_e164) |
| interests | id, name, slug, active | Empreendedorismo, Negócios, … |
| member_interest | member_id, interest_id | Pivot |
| plans | id, community_id, name, initial_price_kz, renewal_price_kz, duration_days, warning_day, grace_days, active | Regras configuráveis |
| subscriptions | id, member_id, plan_id, status, starts_at, due_at, grace_ends_at, expired_at, cancelled_at, previous_subscription_id | Estados: pending, active, grace_period, expired, suspended, cancelled |
| subscription_events | id, subscription_id, from_status, to_status, reason, actor_user_id, created_at | Histórico de transições |
| payments | id, member_id, subscription_id, type (initial/renewal), amount_kz, method (manual/gateway), status, reference (única), provider, provider_transaction_id (única), proof_path, reviewed_by, reviewed_at, notes, idempotency_key (única) | Prevenção de duplicados |
| payment_webhook_events | id, provider, event_id (único), signature_valid, payload jsonb, processed_at, error | Webhooks autenticados |
| whatsapp_groups | id, community_id, interest_id, name, is_main, external_id, invite_link, active, sync_status, last_synced_at | Grupos como dados |
| group_memberships | id, member_id, whatsapp_group_id, status, joined_at, removed_at | Único (member_id, whatsapp_group_id) |
| access_operations | id, member_id, whatsapp_group_id, type (add/remove/invite/verify), status (pending/processing/succeeded/failed/cancelled), adapter, is_simulated, attempts, last_error, idempotency_key, scheduled_at, executed_at | Fila de acessos; remoção só confirmada com sucesso |
| whatsapp_connections | id, provider, external_id, status, last_seen_at, last_error | Estado da ligação |
| notifications | id, member_id, type, channel (whatsapp/email), status, payload jsonb, sent_at, error | Respeita consentimento |
| notification_templates | id, type, channel, body, active | Textos editáveis |
| settings | id, organization_id, key, value jsonb, updated_by | Configurações |
| audit_logs | id, user_id, action, auditable_type, auditable_id, old_values jsonb, new_values jsonb, ip, user_agent, created_at | Imutável |

Índices: `subscriptions(status, due_at)`, `payments(status, created_at)`, `access_operations(status, scheduled_at)`, `members(created_at)`, pesquisa trigram em `members(full_name)`.

## 4. Módulos

Dashboard · Membros · Inscrições · Pagamentos · Assinaturas · Comunidades · Grupos WhatsApp · Controlo de acesso · Integração WhatsApp · Notificações · Relatórios · Utilizadores · Auditoria · Configurações.

## 5. Plano de implementação

| Fase | Âmbito | Estado |
|---|---|---|
| 1 | Estrutura frontend, identidade visual, layout, dashboard, navegação | Concluída (ver roadmap.md) |
| 2 | Laravel, ligação ao Supabase externo, autenticação Sanctum, migrations, models | Pendente |
| 3 | Inscrição pública, membros, pagamentos, assinaturas | Pendente |
| 4 | Comunidades, subgrupos, gestor de acessos | Pendente |
| 5 | WhatsApp Bridge, adaptador Bider, notificações, remoção automática | Pendente (aguarda documentação Bider) |
| 6 | Relatórios, auditoria, testes, documentação, Railway | Pendente |

## 6. Dependências externas

- Supabase (projeto do proprietário): PostgreSQL + Storage.
- Railway: 4 serviços (web, worker, scheduler, whatsapp-bridge).
- GitHub: repositório único.
- Bider: API WhatsApp (documentação pendente).
- Gateway de pagamento: a definir (modo manual até lá).
- Email transacional: fornecedor a definir (SMTP/Resend/Mailgun).

## 7. Pontos que necessitam de credenciais (nunca no frontend)

| Credencial | Onde fica |
|---|---|
| `DB_URL` / password PostgreSQL do Supabase | Railway → Laravel |
| Supabase Storage (chave de serviço) | Railway → Laravel |
| `APP_KEY` Laravel | Railway → Laravel |
| Credenciais Bider | Railway → WhatsApp Bridge |
| Segredo partilhado Laravel ↔ Bridge | Railway (ambos) |
| Gateway de pagamento + segredo de webhook | Railway → Laravel |
| SMTP / API de email | Railway → Laravel |
| `VITE_API_URL` (público) | Frontend |
