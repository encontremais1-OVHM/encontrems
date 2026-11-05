/**
 * Frontend runtime configuration.
 *
 * Only public values belong here. Secrets (Supabase service role, Bider
 * credentials, payment gateway keys) live exclusively in the Laravel backend.
 */
const rawApiUrl = (import.meta.env["VITE_API_URL"] as string | undefined)?.trim() ?? "";

export const config = {
  /** Base URL of the Laravel API, e.g. https://api.encontremais.ao/api */
  apiUrl: rawApiUrl.replace(/\/+$/, ""),
  timezone: "Africa/Luanda",
  locale: "pt-AO",
  currency: "AOA",
} as const;

export const isApiConfigured = () => config.apiUrl.length > 0;
