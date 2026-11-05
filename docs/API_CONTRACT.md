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
