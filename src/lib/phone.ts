/**
 * Normalises an Angolan mobile number typed by a visitor into E.164 digits
 * (244 + 9 digits starting with 9). Returns null when it is not a valid
 * Angolan mobile number. The backend re-validates and enforces uniqueness.
 */
export function normalizeAngolaWhatsapp(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00244")) digits = digits.slice(5);
  else if (digits.startsWith("244") && digits.length === 12) digits = digits.slice(3);
  if (!/^9\d{8}$/.test(digits)) return null;
  return `244${digits}`;
}
