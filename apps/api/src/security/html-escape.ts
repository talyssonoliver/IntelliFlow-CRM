/**
 * PG-203 — escaping for user-supplied text placed in HTML emails (runner R4).
 *
 * apps/api had no HTML escaper (the ones in apps/ai-worker and apps/web/src/lib
 * are not importable here). Booking emails interpolate booker-supplied values,
 * so every interpolation goes through `escapeHtml`, and subjects go through
 * `stripLineBreaks` so a value can never inject a header.
 */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Replaces every control character (incl. CR/LF and tab) with a space, collapses runs and trims. */
export function stripLineBreaks(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  return out.split(' ').filter(Boolean).join(' ');
}
