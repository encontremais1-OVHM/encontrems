import { isApiConfigured } from "../config";
import { getValidAccessToken } from "../supabase-auth";

export class ApiNotConfiguredError extends Error {
  constructor() {
    super("A ligação ao Supabase externo ainda não está configurada na Netlify.");
    this.name = "ApiNotConfiguredError";
  }
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;
interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
}

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams({ path: path.startsWith("/") ? path : `/${path}` });
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    }
  }
  return `/.netlify/functions/api?${params.toString()}`;
}

/** Same-origin API. Privileged Supabase and WhatsApp secrets never reach the browser. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isApiConfigured()) throw new ApiNotConfiguredError();
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const makeHeaders = (token: string | null) => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined && !isForm) headers["Content-Type"] = "application/json";
    if (options.auth !== false && token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  };
  const requestInit = (token: string | null): RequestInit => ({
    method: options.method ?? "GET",
    headers: makeHeaders(token),
    body: options.body === undefined ? null : isForm ? options.body as FormData : JSON.stringify(options.body),
    signal: options.signal ?? null,
  });

  let token = options.auth === false ? null : await getValidAccessToken();
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), requestInit(token));
    // A token can be revoked/expire between requests. Refresh once and retry
    // the exact same request; refreshSession is single-flight across callers.
    if (response.status === 401 && options.auth !== false && token) {
      const refreshedToken = await getValidAccessToken(true);
      if (refreshedToken && refreshedToken !== token) {
        token = refreshedToken;
        response = await fetch(buildUrl(path, options.query), requestInit(token));
      }
    }
  } catch {
    throw new ApiError(0, "Não foi possível contactar a API segura da aplicação.", null);
  }
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && "message" in parsed
      ? String((parsed as { message: unknown }).message)
      : `Pedido falhou (${response.status}).`;
    throw new ApiError(response.status, message, parsed);
  }
  return parsed as T;
}

export function describeApiError(error: unknown): string {
  if (error instanceof ApiNotConfiguredError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sessão expirada ou sem permissão. Inicie sessão novamente.";
    if (error.status === 403) return "Não tem permissão para esta ação.";
    if (error.status === 404) return error.message || "Não encontrado.";
    if (error.status === 429) return "Demasiados pedidos. Aguarde um momento e tente novamente.";
    return error.message;
  }
  return "Ocorreu um erro inesperado.";
}
