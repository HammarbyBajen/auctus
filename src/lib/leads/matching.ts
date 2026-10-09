/** Lower-cased, trimmed email used to recognise the same person across forms. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const value = (email ?? "").trim().toLowerCase();
  return value === "" ? null : value;
}

/**
 * Phone number reduced to a comparable form. Swedish numbers written with
 * +46 or 0046 become the national form (0701234567), so "070-123 45 67" and
 * "+46 70 123 45 67" match. Other international numbers keep their +prefix.
 * Returns null when there are too few digits to be a real number.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  let value = (phone ?? "").trim();
  if (value === "") return null;
  const international = value.startsWith("+") || value.startsWith("00");
  value = value.replace(/\D/g, "");
  if (value.startsWith("00")) value = value.slice(2);
  if (value.length < 6) return null;
  if (!international) return value;
  if (value.startsWith("46")) {
    const national = value.slice(2).replace(/^0/, "");
    return `0${national}`;
  }
  return `+${value}`;
}
