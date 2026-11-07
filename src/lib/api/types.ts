/**
 * Shapes returned by the secure Netlify API backed by external Supabase.
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
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Member {
  id: string;
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

export interface MeResponse {
  user: AdminUser;
}

/* ------------------------------------------------------------------ */
/* Public catalogue, registration and status (no authentication).      */
/* ------------------------------------------------------------------ */

export interface PublicSubgroup {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface PublicCommunity {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** What the community is for — shown as "Finalidade". */
  purpose: string | null;
  /** Absolute URL of the cover image managed in the panel, or null. */
  image_url: string | null;
  subgroups: PublicSubgroup[];
}

export interface PublicPlan {
  initial_price_kz: number;
  renewal_price_kz: number;
  duration_days: number;
  warning_day: number;
  grace_days: number;
}

export interface RegistrationInput {
  community_id: string;
  subgroup_id: string;
  full_name: string;
  /** E.164 digits, e.g. 244923000000 */
  whatsapp: string;
  email: string | null;
  province: string;
  city: string;
  interests: string[];
}

export type RegistrationStatus =
  | "pending_payment"
  | "payment_under_review"
  | "approved"
  | "rejected"
  | "cancelled";

export interface PaymentInstruction {
  /** Machine key of the method, e.g. "bank_transfer", "multicaixa_express". */
  method: string;
  label: string;
  /** Lines to display as-is (IBAN, entity, beneficiary…). */
  details: string[];
}

export interface RegistrationPayment {
  reference: string;
  amount_kz: number;
  status: PaymentStatus;
  instructions: PaymentInstruction[];
  /** Hosted checkout of an automatic gateway, when one is configured. */
  checkout_url: string | null;
  /** True when the backend accepts a proof of payment for manual validation. */
  proof_upload_enabled: boolean;
  proof_submitted_at: string | null;
}

export interface RegistrationReceipt {
  reference: string;
  status: RegistrationStatus;
  payment: RegistrationPayment;
}

export interface RegistrationAccess {
  community: AccessStatus;
  subgroup: AccessStatus;
  /** Only sent by the backend once access is authorised. */
  community_invite_url: string | null;
  subgroup_invite_url: string | null;
}

export interface RegistrationStatusResponse {
  reference: string;
  status: RegistrationStatus;
  full_name: string;
  created_at: string;
  community: { name: string; slug: string };
  subgroup: { name: string; slug: string };
  payment: RegistrationPayment | null;
  subscription: { status: SubscriptionStatus; due_at: string | null } | null;
  access: RegistrationAccess | null;
  rejection_reason: string | null;
}
