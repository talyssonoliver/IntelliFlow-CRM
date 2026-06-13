/**
 * Lead edit change-tracking (PG-062).
 *
 * Pure helpers that compute which edit-form fields changed (for dirty-detection)
 * and build a MINIMAL update patch containing only the changed fields. Extracted
 * from `app/leads/[id]/edit/page.tsx` so the dollars→cents + tags + empty→omit
 * semantics live in one tested place. No React, no I/O.
 */

export interface LeadEditFields {
  firstName: string;
  lastName: string;
  phone: string;
  title: string;
  company: string;
  location: string;
  website: string;
  /** Dollars as typed in the form (converted to cents on save). */
  estimatedValue: string;
  /** Comma-separated tags as typed in the form. */
  tags: string;
}

export type LeadEditField = keyof LeadEditFields;

export interface LeadChangeset {
  changedFields: LeadEditField[];
  isDirty: boolean;
}

const LEAD_EDIT_FIELDS: readonly LeadEditField[] = [
  'firstName',
  'lastName',
  'phone',
  'title',
  'company',
  'location',
  'website',
  'estimatedValue',
  'tags',
];

/** Empty/whitespace string → undefined; otherwise the trimmed value. */
function toOptional(value: string): string | undefined {
  return value.trim() ? value.trim() : undefined;
}

/** Which edit fields differ from the seeded snapshot (+ overall dirty flag). */
export function computeLeadChangeset(
  seeded: Readonly<LeadEditFields>,
  current: Readonly<LeadEditFields>
): LeadChangeset {
  const changedFields = LEAD_EDIT_FIELDS.filter((field) => seeded[field] !== current[field]);
  return { changedFields, isDirty: changedFields.length > 0 };
}

/**
 * Build a minimal update payload: `{ id }` plus ONLY the changed fields. The
 * per-field transform is applied inside the changed-fields loop, so an unchanged
 * estimatedValue is never multiplied to cents and an unchanged field is never
 * sent. A changed field whose transform yields nothing (empty) is omitted —
 * identical to the previous send-all-fields behaviour (clearing is a server no-op).
 */
/**
 * The serialised value for a single changed field, or `undefined` to omit it:
 * estimatedValue dollars→cents (only finite, `>= 0`); tags comma-split + trimmed;
 * every other field trimmed (empty → omitted).
 */
function transformField(field: LeadEditField, current: Readonly<LeadEditFields>): unknown {
  if (field === 'estimatedValue') {
    const raw = current.estimatedValue.trim();
    if (!raw) return undefined;
    const cents = Math.round(Number.parseFloat(raw) * 100);
    return !Number.isNaN(cents) && cents >= 0 ? cents : undefined;
  }
  if (field === 'tags') {
    // A changed tags field always sends its array — including [] — so clearing
    // every tag actually clears them (updateLeadSchema accepts an empty array).
    return current.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return toOptional(current[field]);
}

export function buildLeadUpdatePayload(
  leadId: string,
  current: Readonly<LeadEditFields>,
  changedFields: ReadonlyArray<LeadEditField>
): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: leadId };
  for (const field of changedFields) {
    const value = transformField(field, current);
    if (value !== undefined) {
      payload[field] = value;
    }
  }
  return payload;
}
