/**
 * Lead attribution (ADR-070)
 *
 * Partner-forwarded leads keep their marketing attribution instead of arriving as an
 * anonymous `source: 'WEBSITE'`. This pure helper maps the inbound `attribution` object
 * to the Lead columns so a router can spread the result into a create/update.
 */

export const LEAD_ATTRIBUTION_FIELDS = [
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'utmTerm',
  'clickId',
  'referrer',
  'landingPath',
] as const;

export type LeadAttributionField = (typeof LEAD_ATTRIBUTION_FIELDS)[number];

/** The optional `attribution` object a partner sends with a lead. */
export type LeadAttributionInput = Partial<Record<LeadAttributionField, string | null | undefined>>;

/** The Lead columns the attribution maps onto (only the fields that carry a value). */
export type LeadAttributionFields = Partial<Record<LeadAttributionField, string>>;

/** Column length caps (String? columns have none in the DB; these bound what is stored). */
const MAX_LENGTH: Record<LeadAttributionField, number> = {
  utmSource: 200,
  utmMedium: 200,
  utmCampaign: 200,
  utmContent: 200,
  utmTerm: 200,
  clickId: 500,
  referrer: 2000,
  landingPath: 2000,
};

/**
 * Map an `attribution` object to Lead attribution fields.
 *
 * - Values are trimmed and cut at the field's length cap.
 * - Empty, whitespace-only, null and non-string values are dropped (never stored as '').
 * - Unknown keys are ignored, so the result is safe to spread into a Prisma create/update.
 */
export function mapAttributionToLeadFields(
  attribution: LeadAttributionInput | null | undefined
): LeadAttributionFields {
  const fields: LeadAttributionFields = {};
  if (!attribution) return fields;

  for (const key of LEAD_ATTRIBUTION_FIELDS) {
    const raw = attribution[key];
    if (typeof raw !== 'string') continue;
    const value = raw.trim().slice(0, MAX_LENGTH[key]);
    if (value) fields[key] = value;
  }
  return fields;
}
