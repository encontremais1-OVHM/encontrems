import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "./client";
import type {
  DashboardSummary,
  LoginResponse,
  MeResponse,
  Member,
  Paginated,
  PublicCommunity,
  PublicPlan,
  RegistrationInput,
  RegistrationReceipt,
  RegistrationStatusResponse,
  SubscriptionStatus,
} from "./types";
import { isApiConfigured } from "../config";

/** Public health check — GET /health */
export const healthQuery = () =>
  queryOptions({
    queryKey: ["health"],
    queryFn: ({ signal }) =>
      apiRequest<{ status: "ok"; time: string }>("/health", { signal, auth: false }),
    enabled: isApiConfigured(),
    retry: false,
    refetchInterval: 60_000,
  });

/** GET /admin/dashboard */
export const dashboardQuery = () =>
  queryOptions({
    queryKey: ["admin", "dashboard"],
    queryFn: ({ signal }) => apiRequest<DashboardSummary>("/admin/dashboard", { signal }),
    enabled: isApiConfigured(),
    retry: false,
  });

export interface MemberFilters {
  search?: string | undefined;
  status?: SubscriptionStatus | "all" | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page?: number | undefined;
}

/** GET /admin/members */
export const membersQuery = (filters: MemberFilters) =>
  queryOptions({
    queryKey: ["admin", "members", filters],
    queryFn: ({ signal }) =>
      apiRequest<Paginated<Member>>("/admin/members", {
        signal,
        query: {
          search: filters.search,
          status: filters.status === "all" ? undefined : filters.status,
          from: filters.from,
          to: filters.to,
          page: filters.page,
        },
      }),
    enabled: isApiConfigured(),
    retry: false,
  });

/** POST /auth/login */
export function login(email: string, password: string) {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
}

/** POST /auth/logout */
export function logout() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

/** GET /auth/me — current panel user; the backend answers 401 without a valid token. */
export const meQuery = () =>
  queryOptions({
    queryKey: ["auth", "me"],
    queryFn: ({ signal }) => apiRequest<MeResponse>("/auth/me", { signal }),
    enabled: isApiConfigured(),
    retry: false,
    staleTime: 60_000,
  });

/* ----------------------------- Public ----------------------------- */

/** GET /public/communities — active communities and subgroups from Supabase. */
export const publicCommunitiesQuery = () =>
  queryOptions({
    queryKey: ["public", "communities"],
    queryFn: ({ signal }) =>
      apiRequest<{ data: PublicCommunity[] }>("/public/communities", { signal, auth: false }),
    enabled: isApiConfigured(),
    retry: 1,
    staleTime: 5 * 60_000,
  });

/** GET /public/plan — current prices and periods from the active Supabase plan. */
export const publicPlanQuery = () =>
  queryOptions({
    queryKey: ["public", "plan"],
    queryFn: ({ signal }) => apiRequest<PublicPlan>("/public/plan", { signal, auth: false }),
    enabled: isApiConfigured(),
    retry: false,
    staleTime: 10 * 60_000,
  });

/** POST /public/registrations */
export function createRegistration(input: RegistrationInput) {
  return apiRequest<RegistrationReceipt>("/public/registrations", {
    method: "POST",
    body: input,
    auth: false,
  });
}

/** GET /public/registrations/{reference}?whatsapp= — both must match. */
export const registrationStatusQuery = (reference: string, whatsapp: string) =>
  queryOptions({
    queryKey: ["public", "registration", reference, whatsapp],
    queryFn: ({ signal }) =>
      apiRequest<RegistrationStatusResponse>(
        `/public/registrations/${encodeURIComponent(reference)}`,
        { signal, auth: false, query: { whatsapp } },
      ),
    enabled: isApiConfigured() && reference.length > 0 && whatsapp.length > 0,
    retry: false,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

/** POST /public/registrations/{reference}/payment-proof (multipart: whatsapp, file) */
export function uploadPaymentProof(reference: string, whatsapp: string, file: File) {
  const form = new FormData();
  form.set("whatsapp", whatsapp);
  form.set("file", file);
  return apiRequest<RegistrationStatusResponse>(
    `/public/registrations/${encodeURIComponent(reference)}/payment-proof`,
    { method: "POST", body: form, auth: false },
  );
}
