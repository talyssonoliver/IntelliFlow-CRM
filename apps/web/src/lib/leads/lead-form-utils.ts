/**
 * Shared, pure lead-form helpers (IFC-230). Extracted from NewLeadForm.tsx so the
 * create wizard shell, the shared LeadForm, and the edit payload builder all reuse
 * one source of truth. No React, no I/O — unit-testable.
 */

/** A select option. */
export interface SelectOption {
  value: string;
  label: string;
}

// Lead source options
export const sourceOptions: SelectOption[] = [
  { value: '', label: 'Select a source...' },
  { value: 'website', label: 'Website / Organic' },
  { value: 'referral', label: 'Referral' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'conference', label: 'Conference / Event' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'other', label: 'Other' },
];

// Industry options
export const industryOptions: SelectOption[] = [
  { value: '', label: 'Select an industry...' },
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance & Banking' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'retail', label: 'Retail & E-commerce' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'education', label: 'Education' },
  { value: 'other', label: 'Other' },
];

// Company size options
export const companySizeOptions: SelectOption[] = [
  { value: '', label: 'Select company size...' },
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

// Revenue band options
export const revenueOptions: SelectOption[] = [
  { value: '', label: 'Select annual revenue...' },
  { value: '<1M', label: 'Less than $1M' },
  { value: '1M-10M', label: '$1M - $10M' },
  { value: '10M-50M', label: '$10M - $50M' },
  { value: '50M-100M', label: '$50M - $100M' },
  { value: '100M+', label: '$100M+' },
];

// Timeline options
export const timelineOptions: SelectOption[] = [
  { value: '', label: 'Select timeline...' },
  { value: 'immediate', label: 'Immediate (within 1 month)' },
  { value: 'short', label: 'Short-term (1-3 months)' },
  { value: 'medium', label: 'Medium-term (3-6 months)' },
  { value: 'long', label: 'Long-term (6+ months)' },
  { value: 'unknown', label: 'Unknown / Not discussed' },
];

/** Resolve a select value to its human label, falling back to the raw value. */
export function labelFor(options: SelectOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

// The createLeadSchema enum values for the BANT timeline + annualRevenue bands.
// `.find()` narrows the form's raw string to the literal union (or undefined) with
// no cast — only a value that is actually one of the enum members is sent (IFC-242).
export const TIMELINE_VALUES = ['immediate', 'short', 'medium', 'long', 'unknown'] as const;
export const REVENUE_BAND_VALUES = ['<1M', '1M-10M', '10M-50M', '50M-100M', '100M+'] as const;
export const toTimeline = (value: string) => TIMELINE_VALUES.find((v) => v === value.trim());
export const toRevenueBand = (value: string) => REVENUE_BAND_VALUES.find((v) => v === value.trim());

/** Map the UI source select value to the lead.create source enum (undefined when blank). */
export function mapSourceToEnum(
  source: string
): 'WEBSITE' | 'REFERRAL' | 'SOCIAL' | 'EMAIL' | 'COLD_CALL' | 'EVENT' | 'OTHER' | undefined {
  const sourceMap: Record<
    string,
    'WEBSITE' | 'REFERRAL' | 'SOCIAL' | 'EMAIL' | 'COLD_CALL' | 'EVENT' | 'OTHER'
  > = {
    website: 'WEBSITE',
    referral: 'REFERRAL',
    linkedin: 'SOCIAL',
    conference: 'EVENT',
    cold_outreach: 'COLD_CALL',
    other: 'OTHER',
  };
  return sourceMap[source];
}

// Mirrors the lead.addNote contract (`content: z.string().max(5000)`). The note is
// truncated to this budget client-side so an oversized free-text qualification note
// is persisted (truncated) rather than rejected by the API and lost.
export const NOTE_MAX_LENGTH = 5000;

/** The fields buildQualificationNote reads (structural subset of the form state). */
export interface QualificationNoteInput {
  source: string;
  sourceOther: string;
  companySize: string;
  industry: string;
  qualificationNotes: string;
}

/**
 * Build a human-readable note from the company-detail / free-text fields that have
 * no first-class `lead.create` column yet (the "Other" source detail, company size,
 * industry, free-text qualification notes). Returns '' when none are filled.
 *
 * BANT (budget/authority/need/timeline) + annualRevenue are first-class columns
 * (IFC-242), sent as structured fields — NOT serialized here (no double-persistence).
 */
export function buildQualificationNote(formData: QualificationNoteInput): string {
  const lines: string[] = [];
  if (formData.source === 'other' && formData.sourceOther.trim()) {
    lines.push(`Source detail: ${formData.sourceOther.trim()}`);
  }
  if (formData.companySize.trim()) {
    lines.push(`Company size: ${labelFor(companySizeOptions, formData.companySize)}`);
  }
  if (formData.industry.trim()) {
    lines.push(`Industry: ${labelFor(industryOptions, formData.industry)}`);
  }
  if (formData.qualificationNotes.trim()) {
    lines.push(`Notes: ${formData.qualificationNotes.trim()}`);
  }
  if (lines.length === 0) return '';
  const body = `Lead qualification details (captured on the New Lead form):\n${lines.join('\n')}`;
  // Cap at the API note budget so an oversized free-text note is persisted
  // (truncated) instead of being rejected by lead.addNote and silently lost.
  return body.length > NOTE_MAX_LENGTH ? `${body.slice(0, NOTE_MAX_LENGTH - 1)}…` : body;
}
