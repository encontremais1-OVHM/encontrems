const RAW_API_URL = (process.env.BAILEYS_API_URL || process.env.WHATSAPP_BRIDGE_URL || "").trim();

function normalizeApiUrl(value) {
  if (!value) return "";
  // Railway domains are sometimes entered without a scheme in Netlify.
  // fetch() requires an absolute URL, so default bare hosts to HTTPS.
  const candidate = value.includes("://") ? value : "https://" + value;
  try {
    const parsed = new URL(candidate);
    if (!["https:", "http:"].includes(parsed.protocol)) return "";
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

const API_URL = normalizeApiUrl(RAW_API_URL);
const API_KEY = process.env.BAILEYS_API_KEY || process.env.WHATSAPP_BRIDGE_TOKEN || "";

function normalizePath(path) {
  const url = new URL(path, "https://internal.invalid");
  const pathname = url.pathname;
  const communityParticipants = pathname.match(/^\/communities\/([^/]+)\/participants(?:\/(add|remove))?$/);
  const groupParticipants = pathname.match(/^\/groups\/([^/]+)\/participants(?:\/(add|remove))?$/);
  const invite = pathname.match(/^\/(?:communities|groups)\/([^/]+)\/invite-link$/);
  const picture = pathname.match(/^\/groups\/([^/]+)\/profile-picture$/);

  if (pathname === "/status") return { path: "/session", method: "GET" };
  if (pathname === "/community") return { path: "/community", method: "GET" };
  if (pathname === "/community/diagnostics") return { path: "/community/diagnostics", method: "GET" };
  if (pathname === "/connect") return { path: "/session/connect", method: "POST" };
  if (pathname === "/qr") return { path: "/session/qr", method: "GET" };
  if (pathname === "/pairing-code") return { path: "/session/pairing-code", method: "POST" };
  if (pathname === "/disconnect") return { path: "/session/logout", method: "POST" };
  if (pathname === "/communities") return { path: "/communities", method: "GET" };
  if (communityParticipants || groupParticipants) {
    const match = communityParticipants || groupParticipants;
    const jid = decodeURIComponent(match[1]);
    const action = match[2];
    return { path: "/groups/" + encodeURIComponent(jid) + "/participants" + (action ? "/" + action : ""), method: action ? "POST" : "GET" };
  }
  if (invite) return { path: "/groups/" + encodeURIComponent(decodeURIComponent(invite[1])) + "/invite-link", method: "GET" };
  if (picture) return { path: "/groups/" + encodeURIComponent(decodeURIComponent(picture[1])) + "/profile-picture", method: "GET" };
  if (pathname === "/messages/send") return { path: "/messages/send", method: "POST" };
  throw new Error("Operação WhatsApp não suportada pelo novo serviço: " + pathname);
}

function normalizeResponse(path, payload) {
  const data = payload?.data ?? payload ?? {};
  if (path === "/status") {
    const state = data.connected === true || data.state === "open"
      ? "connected"
      : data.state === "qr" ? "connecting" : data.state;
    return {
      state: state || "disconnected",
      connected: data.connected === true,
      has_qr: data.qrAvailable === true,
      has_pairing_code: data.pairingCodeAvailable === true || Boolean(data.pairingCode),
      pairing_in_progress: data.pairingCodeAvailable === true,
      last_error: data.lastError || data.last_error || null,
      phone: data.phone || null,
    };
  }
  if (path === "/qr") return { qr_data_url: data.qrDataUrl, expires_in_seconds: data.expiresInSeconds || 60 };
  if (path === "/pairing-code") return { pairing_code: data.pairingCode };
  if (path === "/communities") return { communities: data.communities || [] };
  if (path === "/community/diagnostics") return data;
  if (/\/participants(?:\/(?:add|remove))?$/.test(path)) return { participants: data.participants || [], ...data };
  if (/\/invite-link$/.test(path)) return { invite_link: data.inviteLink || null };
  if (/\/profile-picture$/.test(path)) return { profile_picture_url: data.profilePictureUrl || null };
  return data;
}

export async function baileysRequest(path, options = {}) {
  if (!API_URL) throw new Error("BAILEYS_API_URL inválida. Configure o domínio Railway com ou sem https:// (ex.: encontre-bailyler-23-production.up.railway.app).");
  if (!API_KEY) throw new Error("BAILEYS_API_KEY tem de estar configurada nas variáveis de servidor da Netlify.");
  const mapped = normalizePath(path);
  const method = options.method || mapped.method;
  let body = options.body;
  if (path === "/pairing-code" && body) body = { phoneNumber: body.phone };
  if (/\/participants\/(?:add|remove)$/.test(path) && body) {
    const rawPhone = body.phone || body.phoneNumber || body.participant || "";
    const phoneNumber = String(rawPhone).replace(/[^0-9]/g, "");
    body = { phoneNumber };
  }
  if (path === "/messages/send" && body) {
    body = { phoneNumber: String(body.phone || body.phoneNumber || "").replace(/[^0-9]/g, ""), message: String(body.message || "") };
  }

  const response = await fetch(API_URL + "/v1" + mapped.path, {
    method,
    headers: { "x-api-key": API_KEY, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(path === "/status" ? 7000 : 20000),
  });
  const text = await response.text();
  const payload = text ? (() => { try { return JSON.parse(text); } catch { return { message: text }; } })() : {};
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || "O serviço WhatsApp respondeu com HTTP " + response.status);
    error.statusCode = response.status;
    throw error;
  }
  return normalizeResponse(path, payload);
}
