# Encontre +

Plataforma de gestão da comunidade privada Encontre + (WhatsApp) — Angola.
**Comunidade, oportunidades e conexões.**

## Estrutura

```text
src/               Frontend React + TypeScript + Vite + Tailwind
backend/           API Laravel (Fase 2)
whatsapp-bridge/   Integração WhatsApp / Bider (Fase 5)
docs/              Arquitetura (ARQUITETURA.md) e contrato de API (API_CONTRACT.md)
roadmap.md         Estado das fases
```

## Frontend — desenvolvimento local

Requer Node.js 20+ (ou Bun).

```sh
npm install
cp .env.example .env.local   # defina VITE_API_URL com o URL da API Laravel
npm run dev
```

Sem `VITE_API_URL`, o painel abre em modo de pré-visualização e mostra estados vazios — nunca dados fictícios.

```sh
npm run build   # build de produção
npm test        # testes
```

## Segurança

O frontend só contém valores públicos. Credenciais do Supabase, Bider, gateways de pagamento e email ficam exclusivamente nas variáveis de ambiente do Railway (Laravel / Bridge).

## Infraestrutura

- Código: GitHub
- Base de dados e ficheiros: Supabase externo do proprietário (acesso apenas via Laravel)
- Execução: Railway (web, worker, scheduler, whatsapp-bridge)
