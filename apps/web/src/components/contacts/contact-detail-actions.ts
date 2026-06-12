/**
 * IFC-257: pure helpers for Contact 360 action-button wiring.
 *
 * Extracted from the route page (`apps/web/src/app/contacts/[id]/page.tsx`) so the
 * logic is unit-tested and counted by the merged coverage report — route
 * `page.tsx` files are excluded from that report, so wiring logic kept inline
 * there shows up as uncovered new code in the diff-coverage gate.
 */

/**
 * Build the href for the "Add Deal" action. The create-deal page
 * (`apps/web/src/app/deals/(list)/new/page.tsx`) reads `contactId` from the query
 * string to pre-associate the new deal with this contact.
 */
export function buildDealNewHref(contactId: string): string {
  return `/deals/new?contactId=${encodeURIComponent(contactId)}`;
}

/**
 * Build a Google Maps search URL for a contact's location, or `null` when the
 * location is empty/whitespace. The contact view-model currently hardcodes an
 * empty location (IFC-259 owns wiring it from the API), so the "View Map" control
 * renders disabled until a real location is available — never a deceptive no-op.
 */
export function buildContactMapsHref(location: string | null | undefined): string | null {
  const trimmed = (location ?? '').trim();
  if (!trimmed) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}
