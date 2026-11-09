/**
 * The one email-address format check for the web app: signup (registration-form), password
 * reset (reset-email) and billing receipts (receipt-emailer).
 *
 * The signup and reset forms used /^[^\s@]+@[^\s@.]+\.[^\s@.]+$/, which allows exactly one dot
 * after the @, so name@company.co.uk or name@mail.example.com could neither sign up nor reset a
 * password. This accepts any number of domain labels.
 *
 * Rule: no whitespace; exactly one @ with something before it; a domain of at least two labels
 * separated by dots, none of them empty. Written without a regex, so it cannot backtrack.
 * It checks the shape only; whether the mailbox exists is the email provider's business.
 */
export function isValidEmailAddress(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || value === '' || /\s/.test(value)) return false;

  const at = value.indexOf('@');
  if (at < 1 || value.includes('@', at + 1)) return false;

  const labels = value.slice(at + 1).split('.');
  return labels.length >= 2 && labels.every((label) => label.length > 0);
}
