/**
 * Post-login `next` path guard.
 *
 * Only same-origin relative paths are allowed ('/dashboard', '/leads?tab=new'). Anything that
 * could leave the origin ('//evil.com', '/\evil.com', 'https://evil.com', 'javascript:') falls
 * back to the default, so a crafted sign-in link can never bounce a user to another site.
 */
export const DEFAULT_NEXT_PATH = '/dashboard';

function hasControlChar(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function safeNextPath(raw: string | null | undefined, fallback = DEFAULT_NEXT_PATH): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback;
  }
  if (hasControlChar(raw)) return fallback;
  try {
    const base = 'https://safe-next.invalid'; // sentinel origin only; never fetched
    const resolved = new URL(raw, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
