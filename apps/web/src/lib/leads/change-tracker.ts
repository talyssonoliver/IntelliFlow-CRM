/**
 * Lead edit change-tracking (PG-062).
 *
 * Pure helpers that compute which edit-form fields changed (for dirty-detection)
 * and build a MINIMAL update patch containing only the changed fields. Extracted
 * from `app/leads/[id]/edit/page.tsx` so the dollars→cents + tags + empty→omit
 * semantics live in one tested place. No React, no I/O.
 */

import type { z } from 'zod';
import { updateLeadSchema } from '@intelliflow/validators';
import { toTimeline, toRevenueBand } from './lead-form-utils';

/**
 * The tRPC `lead.update` INPUT type (pre-transform): phone and dates stay as raw
 * strings, matching what the mutation expects over the wire. F9 (IFC-242): typing
 * the patch with this lets the edit page call the mutation with NO cast.
 */
export type LeadUpdatePayload = z.input<typeof updateLeadSchema>;

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
  // BANT qualification fields (IFC-230 — editable in the unified form).
  // budget/authority/need are free text; timeline/annualRevenue are enum select values.
  budget: string;
  authority: string;
  need: string;
  timeline: string;
  annualRevenue: string;
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
  'budget',
  'authority',
  'need',
  'timeline',
  'annualRevenue',
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
 * Build a minimal update payload: `{ id }` plus ONLY the changed fields, typed as
 * the tRPC `lead.update` input so the caller needs no cast. An unchanged
 * estimatedValue is never multiplied to cents and an unchanged field is never
 * sent. A changed text field cleared to empty is omitted (server no-op); changed
 * tags always send their array (including `[]`) so clearing actually clears.
 * Fields are assigned explicitly (not via a dynamic key) to stay fully type-safe.
 */
/** Edit-form text fields that map 1:1 to a trimmed optional string on the patch. */
const TEXT_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'title',
  'company',
  'location',
  'website',
  'budget',
  'authority',
  'need',
] as const satisfies readonly (keyof LeadUpdatePayload & LeadEditField)[];

export function buildLeadUpdatePayload(
  leadId: string,
  current: Readonly<LeadEditFields>,
  changedFields: ReadonlyArray<LeadEditField>
): LeadUpdatePayload {
  const changed = new Set<LeadEditField>(changedFields);
  const payload: LeadUpdatePayload = { id: leadId };

  for (const field of TEXT_FIELDS) {
    if (!changed.has(field)) continue;
    const value = toOptional(current[field]);
    if (value !== undefined) payload[field] = value;
  }

  if (changed.has('estimatedValue')) {
    const raw = current.estimatedValue.trim();
    // Number() (not parseFloat) so a partially-numeric string is rejected, not
    // silently truncated, before converting dollars -> cents.
    const dollars = raw ? Number(raw) : NaN;
    if (Number.isFinite(dollars) && dollars >= 0) {
      payload.estimatedValue = Math.round(dollars * 100);
    }
  }

  if (changed.has('tags')) {
    // A changed tags field always sends its array — including [] — so clearing
    // every tag actually clears them.
    payload.tags = current.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // BANT enum bands (IFC-230): narrow to the schema enum; a cleared or non-enum
  // value is omitted (updateLeadSchema has no way to null an optional enum, and an
  // invalid legacy value must not be sent).
  if (changed.has('timeline')) {
    const tv = toTimeline(current.timeline);
    if (tv) payload.timeline = tv;
  }
  if (changed.has('annualRevenue')) {
    const rb = toRevenueBand(current.annualRevenue);
    if (rb) payload.annualRevenue = rb;
  }

  return payload;
}
