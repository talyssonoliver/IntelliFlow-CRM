/** Trim + lower-case. Suppression and recipient matching compare normalized addresses. */
export function normalizeEmail(address: string): string {
  return address.trim().toLowerCase();
}

/** True when a header value carries CR, LF or NUL — the bytes that let a value smuggle extra headers. */
export function hasHeaderInjection(value: string): boolean {
  return /[\r\n\0]/.test(value);
}
