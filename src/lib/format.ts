import { config } from "./config";

/**
 * Formats an integer amount of Kwanza. Amounts always travel as integers
 * (whole Kz) from the backend — never floats.
 */
export function formatKz(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  const whole = Math.trunc(amount);
  const grouped = Math.abs(whole)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${whole < 0 ? "-" : ""}${grouped} Kz`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Math.trunc(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Formats an ISO date string in the Africa/Luanda timezone. */
export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(config.locale, {
    timeZone: config.timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

/** Formats a WhatsApp number stored as E.164 digits (e.g. 244923000000). */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("244") && digits.length === 12) {
    return `+244 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}
