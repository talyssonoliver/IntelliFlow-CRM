/**
 * The fields contact.update hands to ContactService.updateContactInfo (moved out of
 * contact.router.ts, which may only shrink).
 *
 * MVP-003 (#28): a field the user cleared is applied, never dropped. A cleared text field arrives
 * as "" and is saved empty; a cleared phone arrives as null and removes the number. A field left
 * out (undefined) is unchanged.
 */

export type UpdateContactData = Record<string, unknown> & {
  /** null removes the number (cleared in the edit form). */
  phone?: string | { toValue?: () => string } | null;
  firstName?: string;
  lastName?: string;
  title?: string;
  department?: string;
  status?: string;
  streetAddress?: string;
  city?: string;
  zipCode?: string;
  company?: string;
  linkedInUrl?: string;
  /** null removes the contact's type (PG-205). */
  contactType?: string | null;
  tags?: string[];
  contactNotes?: string;
};

export const CONTACT_INFO_FIELDS = [
  'firstName',
  'lastName',
  'title',
  'department',
  'status',
  'streetAddress',
  'city',
  'zipCode',
  'company',
  'linkedInUrl',
  'contactType',
  'tags',
  'contactNotes',
] as const;

/**
 * Build the info-update payload from a contact update input, extracting
 * all scalar fields and resolving the phone Value Object.
 */
export function buildContactInfoUpdates(data: UpdateContactData): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const field of CONTACT_INFO_FIELDS) {
    if (data[field] !== undefined) updates[field] = data[field];
  }
  if (data.phone === null) {
    updates.phone = null; // cleared: the number is removed
  } else if (data.phone !== undefined) {
    updates.phone = typeof data.phone === 'string' ? data.phone : data.phone.toValue?.();
  }
  return updates;
}
