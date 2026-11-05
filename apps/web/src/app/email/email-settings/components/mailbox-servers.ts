/**
 * Where each provider's mail servers are. What the customer must do for each provider is in
 * mailbox-providers.ts, along with where these values come from.
 */

export type SmtpSecurity = 'SSL' | 'STARTTLS';

export interface MailboxServerDetails {
  server: { host: string; port: '465' | '587'; security: SmtpSecurity };
  /** Null for a sending service: it has no mailbox to read, so bounce reading is not offered. */
  imapHost: string | null;
  /** iCloud signs in to IMAP with the part before the @; everyone else with the whole address. */
  imapSignIn: 'address' | 'local-part';
}

export const ZOHO_PERSONAL_SERVER = 'smtp.zoho.com';

export const MAILBOX_SERVERS: Readonly<Record<string, MailboxServerDetails>> = {
  google: {
    server: { host: 'smtp.gmail.com', port: '587', security: 'STARTTLS' },
    imapHost: 'imap.gmail.com',
    imapSignIn: 'address',
  },
  microsoft365: {
    server: { host: 'smtp.office365.com', port: '587', security: 'STARTTLS' },
    imapHost: null,
    imapSignIn: 'address',
  },
  zoho: {
    server: { host: 'smtppro.zoho.com', port: '465', security: 'SSL' },
    imapHost: 'imappro.zoho.com',
    imapSignIn: 'address',
  },
  resend: {
    server: { host: 'smtp.resend.com', port: '465', security: 'SSL' },
    imapHost: null,
    imapSignIn: 'address',
  },
  ionos: {
    server: { host: 'smtp.ionos.co.uk', port: '465', security: 'SSL' },
    imapHost: 'imap.ionos.co.uk',
    imapSignIn: 'address',
  },
  namecheap: {
    server: { host: 'mail.privateemail.com', port: '465', security: 'SSL' },
    imapHost: 'mail.privateemail.com',
    imapSignIn: 'address',
  },
  hostinger: {
    server: { host: 'smtp.hostinger.com', port: '465', security: 'SSL' },
    imapHost: 'imap.hostinger.com',
    imapSignIn: 'address',
  },
  yahoo: {
    server: { host: 'smtp.mail.yahoo.com', port: '465', security: 'SSL' },
    imapHost: 'imap.mail.yahoo.com',
    imapSignIn: 'address',
  },
  icloud: {
    server: { host: 'smtp.mail.me.com', port: '587', security: 'STARTTLS' },
    imapHost: 'imap.mail.me.com',
    imapSignIn: 'local-part',
  },
};
