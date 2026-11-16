/**
 * Pure helpers for the lead page's Qualify and Convert dialogs: validation,
 * the lead.convertToDeal payload and the user-facing error text.
 */

export const QUALIFY_REASON_MIN = 10;
export const QUALIFY_REASON_MAX = 500;
export const DEAL_NAME_MAX = 200;

/** Only these statuses can be qualified (Lead.qualify in the domain). */
export function canQualifyLead(status: string): boolean {
  return status === 'NEW' || status === 'CONTACTED';
}

/** Returns an error message, or null when the reason is acceptable. */
export function validateQualifyReason(reason: string): string | null {
  const length = reason.trim().length;
  if (length < QUALIFY_REASON_MIN) {
    return `Reason must be at least ${QUALIFY_REASON_MIN} characters.`;
  }
  if (length > QUALIFY_REASON_MAX) {
    return `Reason must be at most ${QUALIFY_REASON_MAX} characters.`;
  }
  return null;
}

/**
 * Deal value is entered in whole pounds. The API takes a positive integer and
 * the deal stores it as a major-unit amount (GBP), so there is no pence conversion.
 */
export function parseDealValue(raw: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function validateDealValue(raw: string): string | null {
  if (!raw.trim()) return 'Enter the deal value in pounds.';
  return parseDealValue(raw) === null
    ? 'Deal value must be a whole number of pounds greater than zero.'
    : null;
}

export interface ConvertToDealFormValues {
  dealValue: string;
  dealName: string;
  accountName: string;
  /** yyyy-mm-dd from a date input, or empty */
  expectedCloseDate: string;
}

export interface ConvertToDealPayload {
  leadId: string;
  dealValue: number;
  createContact: true;
  dealName?: string;
  accountName?: string;
  expectedCloseDate?: Date;
}

/** Builds the lead.convertToDeal input, or null when the value is invalid. */
export function buildConvertToDealPayload(
  leadId: string,
  form: ConvertToDealFormValues
): ConvertToDealPayload | null {
  const dealValue = parseDealValue(form.dealValue);
  if (dealValue === null) return null;
  const dealName = form.dealName.trim();
  const accountName = form.accountName.trim();
  return {
    leadId,
    dealValue,
    createContact: true,
    ...(dealName ? { dealName } : {}),
    ...(accountName ? { accountName } : {}),
    ...(form.expectedCloseDate
      ? { expectedCloseDate: new Date(`${form.expectedCloseDate}T00:00:00.000Z`) }
      : {}),
  };
}

export const ACCOUNT_NAME_MAX = 200;

export interface ListConvertPayload {
  leadId: string;
  createAccount: boolean;
  accountName?: string;
}

/**
 * The lead list's quick Convert (lead.convert). The API creates an account only when it is
 * given a name, so the lead's company is sent as the account name; a lead without a company
 * converts to a contact with no account.
 */
export function buildListConvertPayload(
  lead: Readonly<{ id: string; company?: string | null }>
): ListConvertPayload {
  const accountName = (lead.company ?? '').trim().slice(0, ACCOUNT_NAME_MAX).trim();
  return accountName
    ? { leadId: lead.id, createAccount: true, accountName }
    : { leadId: lead.id, createAccount: false };
}

export function getConvertErrorDescription(msg: string): string {
  if (msg.includes('Only qualified')) return 'Only leads with QUALIFIED status can be converted.';
  if (msg.includes('already converted'))
    return 'This lead has already been converted to a contact.';
  if (msg.includes('not found')) return 'Lead not found. It may have been deleted.';
  return msg;
}
