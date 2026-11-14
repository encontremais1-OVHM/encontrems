# Encontre + — Roadmap

## Fase 1 — Frontend, identidade, layout, dashboard, navegação
- [x] Design system com cores da marca e logótipo oficial
- [x] Página pública, página de início de sessão
- [x] Painel com sidebar, topbar e 14 módulos navegáveis
- [x] Dashboard ligado à API (estados vazios/erro, sem dados fictícios)
- [x] Tabela de membros com pesquisa e filtros ligada à API
- [x] Documentação de arquitetura e contrato de API

## Fase 2 — Laravel + Supabase externo (bloqueado: aguarda aprovação do plano e credenciais do Supabase)
- [ ] Estrutura Laravel em backend/, Sanctum, perfis
- [ ] Migrations (plano para aprovação antes de executar)
- [x] Painel movido para /superadmin com verificação de sessão Super Admin no frontend
- [ ] Endpoint GET /auth/me e protecção Super Admin no Laravel

## Actualização da página principal
- [x] Cabeçalho novo sem "Área administrativa" nem parcerias
- [x] Hero com três colunas animadas de grupos
- [x] Catálogo público de comunidades (/comunidades) ligado à API
- [x] Inscrição em passos (/inscricao) e consulta de estado (/inscricao/estado) ligadas à API
- [ ] Endpoints /public/* no Laravel (aguarda Fase 2)

## Fase 3 — Inscrição, membros, pagamentos, assinaturas
## Fase 4 — Comunidades, subgrupos, controlo de acesso
## Fase 5 — WhatsApp (Railway Baileys)
- [x] Entrada automática na Comunidade pelo grupo de avisos + convite quando a privacidade bloqueia (PR #5 no repositório do serviço WhatsApp)
- [ ] Deploy do PR #5 no Railway (aguarda aprovação do proprietário)
- [ ] Reenviar as 3 inscrições falhadas de 12/11 depois do deploy (aguarda aprovação)
## Fase 6 — Relatórios, auditoria, testes, Railway
