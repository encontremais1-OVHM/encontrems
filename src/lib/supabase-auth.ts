import { config, isSupabaseConfigured } from "@/lib/config";

const SESSION_KEY = "encontre.supabase.session";

type SupabaseUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
};

type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user?: SupabaseUser;
};

function readSession(): SupabaseSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SupabaseSession) : null;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(session: SupabaseSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSupabaseSession() {
  if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
}

async function authRequest<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  if (!isSupabaseConfigured()) {
    throw new Error("A ligação ao Supabase ainda não está configurada.");
  }

  const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.supabaseAnonKey,
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "msg" in payload
        ? String(payload.msg)
        : payload && typeof payload === "object" && "message" in payload
          ? String(payload.message)
          : "Não foi possível validar a sessão no Supabase.";
    throw new Error(message);
  }
  return payload as T;
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseUser> {
  const session = await authRequest<SupabaseSession>("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!session.access_token || !session.refresh_token || !session.user) {
    throw new Error("O Supabase não devolveu uma sessão válida.");
  }
  saveSession(session);
  return session.user;
}

let refreshInFlight: Promise<SupabaseSession> | null = null;

async function refreshSession(): Promise<SupabaseSession> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const current = readSession();
    if (!current?.refresh_token) throw new Error("A sessão expirou. Inicie sessão novamente.");

    const next = await authRequest<SupabaseSession>("token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
    if (!next.access_token || !next.refresh_token) {
      clearSupabaseSession();
      throw new Error("A sessão expirou. Inicie sessão novamente.");
    }
    saveSession(next);
    return next;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** Return a valid access token, refreshing shortly before expiry when possible. */
export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  let session = readSession();
  if (!session?.access_token) return null;

  const expiresSoon = typeof session.expires_at === "number"
    && session.expires_at <= Math.floor(Date.now() / 1000) + 60;

  if (forceRefresh || expiresSoon) {
    try {
      session = await refreshSession();
    } catch {
      clearSupabaseSession();
      return null;
    }
  }

  return session.access_token;
}

export async function getAuthenticatedUser(): Promise<SupabaseUser | null> {
  let session = readSession();
  if (!session?.access_token) return null;

  try {
    return await authRequest<SupabaseUser>("user", { method: "GET" }, session.access_token);
  } catch {
    try {
      session = await refreshSession();
      return await authRequest<SupabaseUser>("user", { method: "GET" }, session.access_token);
    } catch {
      clearSupabaseSession();
      return null;
    }
  }
}

export function isEncontreSuperAdmin(user: SupabaseUser | null): boolean {
  return (
    user?.email?.toLowerCase() === "hgconnect1@gmail.com" &&
    user.app_metadata?.["role"] === "super_admin"
  );
}

export async function signOutSupabase() {
  const session = readSession();
  try {
    if (session?.access_token && isSupabaseConfigured()) {
      await authRequest("logout", { method: "POST" }, session.access_token);
    }
  } finally {
    clearSupabaseSession();
  }
}
