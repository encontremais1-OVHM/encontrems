/**
 * Public browser configuration. The Supabase publishable key is safe to expose;
 * all privileged database access is handled by Netlify Functions.
 */
const rawSupabaseUrl = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined)?.trim() ?? "";
const rawSupabaseAnonKey = (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined)?.trim() ?? "";

export const config = {
  supabaseUrl: rawSupabaseUrl.replace(/\/+$/, ""),
  supabaseAnonKey: rawSupabaseAnonKey,
  timezone: "Africa/Luanda",
  locale: "pt-AO",
  currency: "AOA",
} as const;

export const isSupabaseConfigured = () => config.supabaseUrl.length > 0 && config.supabaseAnonKey.length > 0;
/** The application API is served by same-origin Netlify Functions. */
export const isApiConfigured = isSupabaseConfigured;
