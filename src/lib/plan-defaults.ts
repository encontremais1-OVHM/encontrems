/**
 * Default commercial rules from the owner's specification.
 * Display-only fallback: the Laravel `settings`/`plans` tables are the source of
 * truth and all financial calculations happen in the backend.
 */
export const DEFAULT_PLAN = {
  initialPriceKz: 1000,
  renewalPriceKz: 1000,
  durationDays: 30,
  warningDay: 27,
  graceDays: 5,
} as const;

export const SIGNUP_INTERESTS = [
  "Empreendedorismo",
  "Negócios",
  "Tecnologia",
  "Beleza",
  "Compras e vendas",
  "Oportunidades",
  "Educação",
  "Outros",
] as const;
