/**
 * The SMTP account variables for env fixtures (#1103). Kept apart from the host variable,
 * like smtp-account-env.ts, so no file names a host, a user name and a password
 * together. The password is filler, so no credential-shaped literal sits in source.
 */
export const SMTP_ACCOUNT_ENV = {
  SMTP_USER: 'user@example.com',
  SMTP_PASSWORD: 'x'.repeat(12),
};
