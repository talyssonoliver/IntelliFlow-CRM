/**
 * IFC-257: pure helpers for Contact 360 action-button wiring.
 *
 * Extracted from the route page (`apps/web/src/app/contacts/[id]/page.tsx`) so the
 * logic is unit-tested and counted by the merged coverage report — route
 * `page.tsx` files are excluded from that report, so wiring logic kept inline
 * there shows up as uncovered new code in the diff-coverage gate.
 */

/**
 * Compose a single human-readable location string from a contact's address parts
 * (`streetAddress`, `city`, `zipCode` — all optional/nullable in the API). Empty
 * and whitespace-only parts are dropped; the result is `''` when no part is set.
 */
export function buildContactLocation(parts: {
  streetAddress?: string | null;
  city?: string | null;
  zipCode?: string | null;
}): string {
  return [parts.streetAddress, parts.city, parts.zipCode]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

/**
 * Build a Google Maps search URL for a contact's location, or `null` when the
 * location is empty/whitespace. The "View Map" control renders disabled (never a
 * deceptive no-op) when no location is available.
 */
export function buildContactMapsHref(location: string | null | undefined): string | null {
  const trimmed = (location ?? '').trim();
  if (!trimmed) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}
