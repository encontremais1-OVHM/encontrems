import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "./client";
import type { DashboardSummary, LoginResponse, Member, Paginated, SubscriptionStatus } from "./types";
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
