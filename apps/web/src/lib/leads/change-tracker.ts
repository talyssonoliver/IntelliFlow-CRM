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
 * sent. Changed tags always send their array (including `[]`) so clearing
 * actually clears. Fields are assigned explicitly (not via a dynamic key) to
 * stay fully type-safe.
 *
 * IFC-412 (owner ruling 2026-10-12): firstName, lastName, phone, company,
 * location, website and estimatedValue are "required-looking" fields the
 * owner wants clearable from the edit form even though they read as essential
 * business data. A changed field in that set which is cleared to empty now
 * sends an explicit `null` (updateLeadSchema accepts it — see
 * packages/validators/src/lead.ts) so the server actually unsets it, not the
 * omit-on-clear no-op below. Every other text field (title, budget,
 * authority, need) is NOT in #412's scope and keeps the pre-existing
 * omitted-on-clear behaviour: the server treats an absent key as "leave
 * unchanged", so a clear there is simply not sent.
 */
/**
 * Edit-form text fields that may be explicitly cleared to `null` (IFC-412).
 * Kept as its own array (not a `Set` filter over `TEXT_FIELDS`) so TypeScript
 * narrows `field` to exactly this union inside its loop below — that is what
 * makes `payload[field] = value ?? null` type-check only for the keys
 * `updateLeadSchema` actually accepts `null` for.
 */
const NULLABLE_ON_CLEAR_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'company',
  'location',
  'website',
] as const satisfies readonly (keyof LeadUpdatePayload & LeadEditField)[];

/**
 * Edit-form text fields NOT in #412's scope: a changed field cleared to empty
 * is simply omitted (server no-op) — unchanged, pre-existing behaviour.
 */
const OMIT_ON_CLEAR_FIELDS = [
  'title',
  'budget',
  'authority',
  'need',
] as const satisfies readonly (keyof LeadUpdatePayload & LeadEditField)[];

/**
 * IFC-412: apply the nullable-on-clear fields — a changed field cleared to
 * empty sends an explicit `null` (the server actually unsets it) instead of
 * being omitted. Extracted so `buildLeadUpdatePayload` stays within the
 * cognitive-complexity budget (sonarjs/cognitive-complexity).
 */
function applyNullableOnClearFields(
  payload: LeadUpdatePayload,
  current: Readonly<LeadEditFields>,
  changed: ReadonlySet<LeadEditField>
): void {
  for (const field of NULLABLE_ON_CLEAR_FIELDS) {
    if (!changed.has(field)) continue;
    payload[field] = toOptional(current[field]) ?? null;
  }
}

/** Fields outside #412's scope: a changed-and-cleared field is omitted (server no-op). */
function applyOmitOnClearFields(
  payload: LeadUpdatePayload,
  current: Readonly<LeadEditFields>,
  changed: ReadonlySet<LeadEditField>
): void {
  for (const field of OMIT_ON_CLEAR_FIELDS) {
    if (!changed.has(field)) continue;
    const value = toOptional(current[field]);
    if (value !== undefined) payload[field] = value;
  }
}

/**
 * IFC-412: an explicit clear sends `null` so the server actually unsets the
 * estimate, instead of silently leaving the previous value in place. Invalid
 * input (negative/non-numeric) is omitted, not a clear — the user typed
 * something that failed validation, which must not be misread as "clear it".
 */
function applyEstimatedValueChange(
  payload: LeadUpdatePayload,
  current: Readonly<LeadEditFields>
): void {
  const raw = current.estimatedValue.trim();
  if (!raw) {
    payload.estimatedValue = null;
    return;
  }
  // Number() (not parseFloat) so a partially-numeric string is rejected, not
  // silently truncated, before converting dollars -> cents.
  const dollars = Number(raw);
  if (Number.isFinite(dollars) && dollars >= 0) {
    payload.estimatedValue = Math.round(dollars * 100);
  }
}

/**
 * BANT enum bands (IFC-230): narrow to the schema enum; a cleared or non-enum
 * value is omitted (updateLeadSchema has no way to null an optional enum, and
 * an invalid legacy value must not be sent). Not in #412's scope.
 */
function applyBantEnumFields(
  payload: LeadUpdatePayload,
  current: Readonly<LeadEditFields>,
  changed: ReadonlySet<LeadEditField>
): void {
  if (changed.has('timeline')) {
    const tv = toTimeline(current.timeline);
    if (tv) payload.timeline = tv;
  }
  if (changed.has('annualRevenue')) {
    const rb = toRevenueBand(current.annualRevenue);
    if (rb) payload.annualRevenue = rb;
  }
}

export function buildLeadUpdatePayload(
  leadId: string,
  current: Readonly<LeadEditFields>,
  changedFields: ReadonlyArray<LeadEditField>
): LeadUpdatePayload {
  const changed = new Set<LeadEditField>(changedFields);
  const payload: LeadUpdatePayload = { id: leadId };

  applyNullableOnClearFields(payload, current, changed);
  applyOmitOnClearFields(payload, current, changed);

  if (changed.has('estimatedValue')) {
    applyEstimatedValueChange(payload, current);
  }

  if (changed.has('tags')) {
    // A changed tags field always sends its array — including [] — so clearing
    // every tag actually clears them.
    payload.tags = current.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  applyBantEnumFields(payload, current, changed);

  return payload;
}
