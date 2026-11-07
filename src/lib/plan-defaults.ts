/**
 * Default commercial rules from the owner's specification.
 * Display-only fallback: the external Supabase `plans` table is the source of
 * truth and all financial calculations happen in the backend.
 */
export const DEFAULT_PLAN = {
  initialPriceKz: 0, // Free entry; renewal starts after the first 30 days.
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
