# backend/ — Laravel API (Fase 2)

Esta pasta receberá a aplicação Laravel (PHP), executada no Railway e ligada ao PostgreSQL do Supabase externo do proprietário.

Previsto:

- Laravel + Sanctum (autenticação por token), Policies por perfil (super_admin, gestor, suporte).
- Migrations para o modelo descrito em `docs/ARQUITETURA.md`.
- Queue (worker) e Scheduler (transições diárias de assinatura em Africa/Luanda).
- Rate limiting, validação de pedidos, auditoria.
- Dockerfile e health check (`GET /api/health`) para o Railway.

Nenhuma migration será executada na base de dados externa sem plano aprovado pelo proprietário.
