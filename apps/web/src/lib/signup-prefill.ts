/**
 * Hands the email a visitor typed on the landing page to the sign-up form,
 * through sessionStorage, so it never travels in a URL (where server, CDN and
 * analytics logs would keep it).
 */
const KEY = 'aurora:signup-email';

/** Keeps the email for the sign-up page to pick up. */
export function rememberSignupEmail(email: string): void {
  try {
    globalThis.sessionStorage?.setItem(KEY, email.trim());
  } catch {
    // Storage blocked (private mode, policy): sign-up simply starts empty.
  }
}

/** Returns the remembered email once, and forgets it. */
export function takeSignupEmail(): string {
  try {
    const email = globalThis.sessionStorage?.getItem(KEY) ?? '';
    globalThis.sessionStorage?.removeItem(KEY);
    return email;
  } catch {
    return '';
  }
}
