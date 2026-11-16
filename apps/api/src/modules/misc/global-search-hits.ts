/**
 * How a lead reads in the header search (MVP-008): the lead's name first, its email second.
 * The name is the person's name, else the company (most leads from the COA sync are a company
 * with no person yet), and only when both are missing the email itself.
 */
export interface LeadSearchRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}

export interface LeadSearchHitText {
  title: string;
  subtitle: string | null;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function leadSearchText(row: LeadSearchRow): LeadSearchHitText {
  const person = [clean(row.firstName), clean(row.lastName)].filter(Boolean).join(' ');
  const company = clean(row.company);
  const email = clean(row.email);
  const title = person || company || email;
  // Second line: the email, with the company in front when the title is the person's name.
  const parts = [person && company ? company : '', title === email ? '' : email].filter(Boolean);
  return { title, subtitle: parts.length > 0 ? parts.join(' · ') : null };
}
