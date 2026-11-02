/** One segment of a stored attachment key: the characters uploads produce, nothing else. */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Whether `path` is a stored email-attachment key (`<tenantId>/<name>`) and,
 * when `tenantId` is given, one of that tenant's.
 *
 * Storage builds a URL from the key and that URL is normalised afterwards, so
 * anything that could become a path step there is refused outright: percent
 * escapes (`%2e%2e`), backslashes, `?`, `#`, spaces, and `.` / `..` / empty
 * segments. Keys made by the upload path only ever use `[A-Za-z0-9._-]`.
 */
export function isAttachmentPathInTenant(path: string, tenantId?: string): boolean {
  const segments = path.split('/');
  if (segments.length < 2) return false;
  if (tenantId !== undefined && segments[0] !== tenantId) return false;
  return segments.every((s) => SAFE_SEGMENT.test(s) && s !== '.' && s !== '..');
}
