/**
 * The contact id a document upload was opened for (`?contactId=` from a
 * contact's Documents tab), or null. Trimmed; an empty or overlong value is
 * ignored so it never fills the form with junk.
 */
const MAX_ID_LENGTH = 64;

export function contactIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('contactId')?.trim();
  if (!value || value.length > MAX_ID_LENGTH) return null;
  return value;
}
