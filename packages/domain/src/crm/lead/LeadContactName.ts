/**
 * The name a contact created from a lead gets (MVP-003).
 *
 * Most leads that come from a company's website have no person name, only a company and an email.
 * Such a contact is named after its company, then after its email address: a person name is never
 * invented, so there is no "Unknown". When the lead has only half of a person name, the other
 * half stays empty. The convert dialog shows the same name through this function.
 */
export interface LeadNameSource {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  email?: string | null;
}

export interface ContactName {
  firstName: string;
  lastName: string;
  /** How the name reads: the two halves joined, without a stray space. */
  display: string;
}

const clean = (value?: string | null): string => (value ?? '').trim();

function named(firstName: string, lastName: string): ContactName {
  return { firstName, lastName, display: [firstName, lastName].filter(Boolean).join(' ') };
}

export function contactNameFromLead(lead: LeadNameSource): ContactName {
  const firstName = clean(lead.firstName);
  const lastName = clean(lead.lastName);
  if (firstName || lastName) return named(firstName, lastName);
  return named(clean(lead.company) || clean(lead.email) || 'Unnamed contact', '');
}
