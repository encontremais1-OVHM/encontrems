/**
 * Shapes returned by the Laravel API. Kept in sync with docs/API_CONTRACT.md.
 * Money is always an integer number of Kwanza (`*_kz`). Dates are ISO 8601.
 */

export type Role = "super_admin" | "gestor" | "suporte";

export type SubscriptionStatus =
  | "pending"
  | "active"
  | "grace_period"
  | "expired"
  | "suspended"
  | "cancelled";

export type PaymentStatus = "pending" | "confirmed" | "rejected";

export type AccessStatus = "none" | "pending" | "active" | "removal_pending" | "removed" | "failed";

export type WhatsAppConnectionStatus = "not_configured" | "connected" | "disconnected" | "error";

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Member {
  id: number;
  full_name: string;
  whatsapp: string;
  email: string | null;
  province: string;
  city: string;
  registered_at: string;
  subscription_status: SubscriptionStatus | null;
  due_at: string | null;
  access_status: AccessStatus;
}

export interface Paginated<T> {
  data: T[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
}

export interface SeriesPoint {
  /** Period label as returned by the API (e.g. "2026-11" or "2026-11-05"). */
  period: string;
  value: number;
}

export interface DashboardSummary {
  totals: {
    members: number;
    active: number;
    grace_period: number;
    expired: number;
    new_signups: number;
    payments_confirmed: number;
    payments_pending: number;
    revenue_total_kz: number;
    revenue_month_kz: number;
    due_soon: number;
    removals_pending: number;
  };
  whatsapp: {
    status: WhatsAppConnectionStatus;
    adapter: "mock" | "bider" | null;
    last_seen_at: string | null;
  };
  series: {
    member_growth: SeriesPoint[];
    revenue_kz: SeriesPoint[];
    payments: SeriesPoint[];
    renewals: SeriesPoint[];
    expirations: SeriesPoint[];
  };
}

export interface LoginResponse {
  token: string;
  user: AdminUser;
}
