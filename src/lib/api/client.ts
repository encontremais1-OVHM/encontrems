import { config, isApiConfigured } from "../config";
import { getToken } from "../auth-storage";

export class ApiNotConfiguredError extends Error {
  constructor() {
    super("A ligação ao backend Laravel ainda não foi configurada (VITE_API_URL).");
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
  const url = new URL(`${config.apiUrl}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * Thin fetch wrapper for the Laravel API (Sanctum bearer tokens).
 * The browser never talks to the database directly.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isApiConfigured()) throw new ApiNotConfiguredError();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : null,
      signal: options.signal ?? null,
    });
  } catch {
    throw new ApiError(0, "Não foi possível contactar o servidor. Verifique a ligação.", null);
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : `Pedido falhou (${response.status}).`;
    throw new ApiError(response.status, message, parsed);
  }

  return parsed as T;
}

export function describeApiError(error: unknown): string {
  if (error instanceof ApiNotConfiguredError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sessão expirada ou inválida. Inicie sessão novamente.";
    if (error.status === 403) return "Não tem permissão para esta ação.";
    if (error.status === 429) return "Demasiados pedidos. Aguarde um momento e tente novamente.";
    return error.message;
  }
  return "Ocorreu um erro inesperado.";
}
