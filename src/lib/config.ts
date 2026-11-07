/**
 * Public frontend configuration.
 *
 * Supabase URL and publishable/anon key are public client values protected by
 * Supabase Auth and RLS. Never put service_role or secret keys in VITE_ vars.
 */
const rawApiUrl = (import.meta.env["VITE_API_URL"] as string | undefined)?.trim() ?? "";
const rawSupabaseUrl =
  (import.meta.env["VITE_SUPABASE_URL"] as string | undefined)?.trim() ?? "";
const rawSupabaseAnonKey =
  (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined)?.trim() ?? "";

export const config = {
  apiUrl: rawApiUrl.replace(/\/+$/, ""),
  supabaseUrl: rawSupabaseUrl.replace(/\/+$/, ""),
  supabaseAnonKey: rawSupabaseAnonKey,
  timezone: "Africa/Luanda",
  locale: "pt-AO",
  currency: "AOA",
} as const;

export const isApiConfigured = () => config.apiUrl.length > 0;
export const isSupabaseConfigured = () =>
  config.supabaseUrl.length > 0 && config.supabaseAnonKey.length > 0;
