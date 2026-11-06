# Contrato de API (frontend ↔ Laravel)

Base: `VITE_API_URL` (ex.: `https://api.encontremais.ao/api`). JSON. Autenticação: `Authorization: Bearer <token Sanctum>`.
Dinheiro em inteiros (`*_kz`). Datas ISO 8601. Erros: `{ "message": string, "errors"?: Record<string,string[]> }`.

Tipos TypeScript correspondentes: `src/lib/api/types.ts`.

## Implementado no frontend (Fase 1)

| Método | Caminho | Auth | Resposta |
|---|---|---|---|
| GET | `/health` | não | `{ status: "ok", time }` |
| POST | `/auth/login` | não | `{ token, user: { id, name, email, role } }` |
| POST | `/auth/logout` | sim | `204` |
| GET | `/admin/dashboard` | sim | `DashboardSummary` |
| GET | `/admin/members?search&status&from&to&page` | sim | `Paginated<Member>` |

### DashboardSummary

```json
{
  "totals": {
    "members": 0, "active": 0, "grace_period": 0, "expired": 0, "new_signups": 0,
    "payments_confirmed": 0, "payments_pending": 0,
    "revenue_total_kz": 0, "revenue_month_kz": 0,
    "due_soon": 0, "removals_pending": 0
  },
  "whatsapp": { "status": "not_configured", "adapter": null, "last_seen_at": null },
  "series": {
    "member_growth": [{ "period": "2026-11", "value": 0 }],
    "revenue_kz": [], "payments": [], "renewals": [], "expirations": []
  }
}
```

### Member

```json
{
  "id": 1, "full_name": "…", "whatsapp": "244923000000", "email": null,
  "province": "Luanda", "city": "Luanda", "registered_at": "2026-11-05T10:00:00+01:00",
  "subscription_status": "active", "due_at": "2026-12-05T23:59:59+01:00", "access_status": "active"
}
```

## Previsto nas fases seguintes

Ver o cartão "Contrato de API" em cada módulo do painel (`/admin/*`).

## Painel (Super Admin)

| Método | Caminho | Auth | Resposta |
|---|---|---|---|
| GET | `/auth/me` | sim | `{ user: { id, name, email, role } }` |

O painel (`/superadmin/*` no frontend) só é mostrado a `role = "super_admin"`. A proteção real é do Laravel: todos os endpoints `/admin/*` exigem token Sanctum de um Super Admin e respondem `401`/`403` caso contrário. O login de contas sem esse perfil é recusado no frontend.

## Público — catálogo, inscrição e estado (sem autenticação, com rate limit)

| Método | Caminho | Resposta |
|---|---|---|
| GET | `/public/communities` | `{ data: PublicCommunity[] }` — só comunidades e subgrupos activos |
| GET | `/public/plan` | `PublicPlan` — preços e prazos actuais das configurações |
| POST | `/public/registrations` | `RegistrationReceipt` (`201`) · `422` com `errors` por campo |
| GET | `/public/registrations/{reference}?whatsapp=244…` | `RegistrationStatusResponse` · `404` se referência e WhatsApp não coincidirem |
| POST | `/public/registrations/{reference}/payment-proof` | multipart `whatsapp`, `file` (JPG/PNG/WEBP/PDF ≤ 5 MB) → `RegistrationStatusResponse` |

### PublicCommunity

```json
{
  "id": 1, "slug": "negocios", "name": "Negócios", "description": "…", "purpose": "…",
  "image_url": "https://…/negocios.jpg",
  "subgroups": [{ "id": 10, "slug": "imobiliario", "name": "Imobiliário", "description": "…" }]
}
```

### RegistrationInput (POST /public/registrations)

```json
{
  "community_id": 1, "subgroup_id": 10, "full_name": "…", "whatsapp": "244923000000",
  "email": null, "province": "Luanda", "city": "Luanda", "interests": ["Negócios"]
}
```

O `subgroup_id` tem de pertencer à `community_id`. O WhatsApp é único por membro.

### RegistrationReceipt / RegistrationPayment

```json
{
  "reference": "ENC-2026-000123",
  "status": "pending_payment",
  "payment": {
    "reference": "PAY-…", "amount_kz": 1000, "status": "pending",
    "instructions": [{ "method": "bank_transfer", "label": "Transferência bancária", "details": ["IBAN …", "Beneficiário …"] }],
    "checkout_url": null, "proof_upload_enabled": true, "proof_submitted_at": null
  }
}
```

`status` da inscrição: `pending_payment | payment_under_review | approved | rejected | cancelled`.
O valor vem sempre das configurações do backend; o frontend nunca calcula nem confirma pagamentos.

### RegistrationStatusResponse

```json
{
  "reference": "ENC-2026-000123", "status": "approved", "full_name": "…",
  "created_at": "2026-11-05T10:00:00+01:00",
  "community": { "name": "Negócios", "slug": "negocios" },
  "subgroup": { "name": "Imobiliário", "slug": "imobiliario" },
  "payment": { "...": "RegistrationPayment" },
  "subscription": { "status": "active", "due_at": "2026-12-05T23:59:59+01:00" },
  "access": {
    "community": "active", "subgroup": "active",
    "community_invite_url": "https://chat.whatsapp.com/…", "subgroup_invite_url": "https://chat.whatsapp.com/…"
  },
  "rejection_reason": null
}
```

**Regra de segurança:** `community_invite_url` e `subgroup_invite_url` só são enviados depois de pagamento confirmado, assinatura activa e acesso autorizado pela ponte WhatsApp; caso contrário vão `null`. O frontend aplica a mesma verificação como segunda barreira (`src/lib/registration.ts`).
