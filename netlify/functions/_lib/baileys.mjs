const API_URL = (process.env.BAILEYS_API_URL || process.env.WHATSAPP_BRIDGE_URL || "").replace(/\\/+$/, "");
const API_KEY = process.env.BAILEYS_API_KEY || process.env.WHATSAPP_BRIDGE_TOKEN || "";

function normalizePath(path) {
  const url = new URL(path, "https://internal.invalid");
  const pathname = url.pathname;
  const communityParticipants = pathname.match(/^\\/communities\\/([^/]+)\\/participants(?:\\/(add|remove))?$/);
  const groupParticipants = pathname.match(/^\\/groups\\/([^/]+)\\/participants(?:\\/(add|remove))?$/);
  const invite = pathname.match(/^\\/(?:communities|groups)\\/([^/]+)\\/invite-link$/);
  const picture = pathname.match(/^\\/groups\\/([^/]+)\\/profile-picture$/);

  if (pathname === "/status") return { path: "/session", method: "GET" };
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
      pairing_in_progress: ["connecting", "qr"].includes(data.state),
      last_error: null,
      phone: data.phone || null,
    };
  }
  if (path === "/qr") return { qr_data_url: data.qrDataUrl, expires_in_seconds: data.expiresInSeconds || 60 };
  if (path === "/pairing-code") return { pairing_code: data.pairingCode };
  if (path === "/communities") return { communities: data.communities || [] };
  if (/\\/participants(?:\\/(?:add|remove))?$/.test(path)) return { participants: data.participants || [], ...data };
  if (/\\/invite-link$/.test(path)) return { invite_link: data.inviteLink || null };
  if (/\\/profile-picture$/.test(path)) return { profile_picture_url: data.profilePictureUrl || null };
  return data;
}

export async function baileysRequest(path, options = {}) {
  if (!API_URL || !API_KEY) throw new Error("BAILEYS_API_URL e BAILEYS_API_KEY têm de estar configurados nas variáveis de servidor da Netlify.");
  const mapped = normalizePath(path);
  const method = options.method || mapped.method;
  let body = options.body;
  if (path === "/pairing-code" && body) body = { phoneNumber: body.phone };
  if (/\\/participants\\/(?:add|remove)$/.test(path) && body) {
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
