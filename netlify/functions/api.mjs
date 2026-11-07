const SUPABASE_URL = (Netlify.env.get("VITE_SUPABASE_URL") || Netlify.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = Netlify.env.get("VITE_SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BRIDGE_URL = (Netlify.env.get("WHATSAPP_BRIDGE_URL") || "").replace(/\/+$/, "");
const BRIDGE_TOKEN = Netlify.env.get("WHATSAPP_BRIDGE_TOKEN") || "";
const OWNER_EMAIL = "hgconnect1@gmail.com";

const json = (statusCode, payload) => Response.json(payload, {
  status: statusCode,
  headers: { "cache-control": "no-store" },
});
