/**
 * The email providers the mailbox form knows, checked against each provider's own
 * help pages on 2026-11-04 (`docsUrl`). Choosing one fills in its servers and shows
 * how to get the password it needs. `custom` is the route for everything else,
 * most often a business address on the customer's own domain.
 *
 * Zoho's regional servers are not listed: Zoho publishes only the zoho.com names and
 * sends everyone else to the Server Configurations Details page in their account.
 */

export type MailboxProviderId =
  | 'custom'
  | 'google'
  | 'microsoft365'
  | 'zoho'
  | 'resend'
  | 'yahoo'
  | 'icloud'
  | 'ionos'
  | 'namecheap'
  | 'hostinger';

export type SmtpSecurity = 'SSL' | 'STARTTLS';

export interface MailboxProvider {
  id: Exclude<MailboxProviderId, 'custom'>;
  label: string;
  /** A short line under the name, to help people recognise their provider. */
  hint: string;
  /** Short name for messages. */
  name: string;
  server: { host: string; port: '465' | '587'; security: SmtpSecurity };
  /** Null for a sending service: it has no mailbox to read, so bounce reading is not offered. */
  imapHost: string | null;
  /** iCloud signs in to IMAP with the part before the @; everyone else with the whole address. */
  imapSignIn: 'address' | 'local-part';
  /** A fixed sign-in name, for a service where it is not the email address. */
  signInName?: string;
  /** What the provider calls the secret to use here. */
  secretLabel: 'App password' | 'Password' | 'API key';
  steps: readonly string[];
  /** Where the user creates the password, when there is such a page. */
  createLink?: { label: string; href: string };
  /** One more page the provider's steps send the user to. */
  secondLink?: { label: string; href: string };
  /** Anything likely to stop this working, shown as a warning. */
  warning?: string;
  /** The likely cause when this provider refuses the sign-in, with the way forward. */
  refusalHelp?: string;
  docsUrl: string;
}

export const MAILBOX_PROVIDERS: readonly MailboxProvider[] = [
  {
    id: 'google',
    label: 'Gmail or Google Workspace',
    hint: 'Gmail, or your own domain run by Google',
    name: 'Google',
    server: { host: 'smtp.gmail.com', port: '587', security: 'STARTTLS' },
    imapHost: 'imap.gmail.com',
    imapSignIn: 'address',
    secretLabel: 'App password',
    steps: [
      'Turn on 2-Step Verification for your Google account.',
      'Open App passwords in your Google account.',
      'Create one named Aurora and copy the 16-character password.',
      'Paste it below. Your normal Google password does not work here.',
    ],
    createLink: {
      label: 'Create a Google app password',
      href: 'https://myaccount.google.com/apppasswords',
    },
    warning:
      "If App passwords isn't offered on a work or school account, your administrator may have turned it off.",
    refusalHelp:
      'Google needs an app password here, not your normal password. Check 2-Step Verification is on and create one.',
    docsUrl: 'https://support.google.com/mail/answer/185833',
  },
  {
    id: 'microsoft365',
    label: 'Microsoft 365 or Outlook',
    hint: 'Work or school mail, or your own domain run by Microsoft',
    name: 'Microsoft 365',
    server: { host: 'smtp.office365.com', port: '587', security: 'STARTTLS' },
    imapHost: 'outlook.office365.com',
    imapSignIn: 'address',
    secretLabel: 'Password',
    steps: [
      'Ask your Microsoft 365 administrator to allow SMTP AUTH for your mailbox.',
      'Enter your address and your Microsoft 365 password below.',
      'Use Test Connection. If it is refused, the setting is still off.',
    ],
    warning:
      'Microsoft is turning this off by default for existing organisations at the end of December 2026, and it does not work with Security defaults. Personal Outlook.com addresses need one-click sign-in, which is not available yet.',
    refusalHelp:
      'Most often SMTP AUTH is off for this mailbox, or Security defaults is on. Your Microsoft 365 administrator can change both. A personal Outlook.com address cannot connect until one-click sign-in is available.',
    docsUrl:
      'https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/how-to-set-up-a-multifunction-device-or-application-to-send-email-using-microsoft-365-or-office-365',
  },
  {
    id: 'zoho',
    label: 'Zoho Mail',
    hint: 'A paid Zoho plan. The free plan cannot connect',
    name: 'Zoho',
    server: { host: 'smtppro.zoho.com', port: '465', security: 'SSL' },
    imapHost: 'imappro.zoho.com',
    imapSignIn: 'address',
    secretLabel: 'Password',
    steps: [
      'Check you are on a paid Zoho plan. Zoho keeps its free plan to its own website and app, so it cannot connect here.',
      'Enter your full address and your Zoho password below.',
      'If two-factor sign-in is on, use an app password instead: Zoho Accounts, Security, App passwords, Generate New Password. Enter it without spaces.',
    ],
    createLink: {
      label: 'Create a Zoho app password',
      href: 'https://accounts.zoho.com/home#security/app_password',
    },
    secondLink: {
      label: 'Find your Zoho server',
      href: 'https://mail.zoho.com/zm/#settings/mailaccounts/',
    },
    warning:
      'The server depends on where your Zoho account is held. If you sign in anywhere other than zoho.com, copy the outgoing server from Server Configurations Details in Zoho into Advanced below. A personal @zohomail.com address uses smtp.zoho.com.',
    refusalHelp:
      "If you are on Zoho's free plan, this is why: it does not allow outside apps. Move to a paid Zoho plan, or use a sending service such as Resend. On a paid plan, check the password, use an app password if two-factor sign-in is on, and check the server matches your Zoho region.",
    docsUrl: 'https://www.zoho.com/mail/help/zoho-smtp.html',
  },
  {
    id: 'resend',
    label: 'Resend (sending service)',
    hint: 'Sends mail for your domain with an API key',
    name: 'Resend',
    server: { host: 'smtp.resend.com', port: '465', security: 'SSL' },
    imapHost: null,
    imapSignIn: 'address',
    signInName: 'resend',
    secretLabel: 'API key',
    steps: [
      'Verify your domain in Resend.',
      'Create an API key in Resend and copy it.',
      'Enter an address on your verified domain and paste the key below.',
    ],
    createLink: {
      label: 'How to create a Resend API key',
      href: 'https://resend.com/docs/create-an-api-key',
    },
    warning:
      'Resend only sends mail, so there is no mailbox for Aurora to read. Your email still sends, but addresses that bounce will not be taken off your lists automatically.',
    refusalHelp: 'Check the API key is copied in full and has not been deleted in Resend.',
    docsUrl: 'https://resend.com/docs/send-with-smtp',
  },
  {
    id: 'ionos',
    label: 'IONOS (UK)',
    hint: 'Email from IONOS on your own domain',
    name: 'IONOS',
    server: { host: 'smtp.ionos.co.uk', port: '465', security: 'SSL' },
    imapHost: 'imap.ionos.co.uk',
    imapSignIn: 'address',
    secretLabel: 'Password',
    steps: ['Enter your full email address and the password for that mailbox below.'],
    docsUrl:
      'https://www.ionos.co.uk/help/email/troubleshooting-mail-basic-mail-business/troubleshooting-email-program-setup/',
  },
  {
    id: 'namecheap',
    label: 'Namecheap Private Email',
    hint: 'Email from Namecheap on your own domain',
    name: 'Private Email',
    server: { host: 'mail.privateemail.com', port: '465', security: 'SSL' },
    imapHost: 'mail.privateemail.com',
    imapSignIn: 'address',
    secretLabel: 'App password',
    steps: [
      'Log in to Private Email.',
      'Open Settings, then Launch Security Center, then App passwords.',
      'Choose Create new password, name it Aurora and confirm with your regular password.',
      'Paste it below. It is only shown once.',
    ],
    createLink: { label: 'Open Private Email', href: 'https://privateemail.com/' },
    warning: 'Also turn on outside mail apps under Connect third-party apps in Private Email.',
    refusalHelp:
      'Private Email needs an app password here, and outside mail apps must be turned on under Connect third-party apps.',
    docsUrl:
      'https://www.namecheap.com/support/knowledgebase/article.aspx/1179/2175/general-private-email-configuration-for-mail-clients-and-mobile-devices/',
  },
  {
    id: 'hostinger',
    label: 'Hostinger',
    hint: 'Email from Hostinger on your own domain',
    name: 'Hostinger',
    server: { host: 'smtp.hostinger.com', port: '465', security: 'SSL' },
    imapHost: 'imap.hostinger.com',
    imapSignIn: 'address',
    secretLabel: 'Password',
    steps: ['Enter your full email address and the password for that mailbox below.'],
    docsUrl:
      'https://www.hostinger.com/support/4305847-set-up-hostinger-email-on-your-applications-and-devices/',
  },
  {
    id: 'yahoo',
    label: 'Yahoo Mail',
    hint: 'A personal Yahoo address',
    name: 'Yahoo',
    server: { host: 'smtp.mail.yahoo.com', port: '465', security: 'SSL' },
    imapHost: 'imap.mail.yahoo.com',
    imapSignIn: 'address',
    secretLabel: 'App password',
    steps: [
      'Sign in to the Yahoo Account Security page.',
      'Under External connections, choose Create app password.',
      'Name it Aurora and choose Generate password.',
      'Paste it below.',
    ],
    createLink: {
      label: 'Open Yahoo Account Security',
      href: 'https://login.yahoo.com/account/security',
    },
    refusalHelp: 'Yahoo needs an app password here, not your normal password.',
    docsUrl: 'https://help.yahoo.com/kb/SLN15241.html',
  },
  {
    id: 'icloud',
    label: 'iCloud Mail',
    hint: 'An @icloud.com address',
    name: 'iCloud',
    server: { host: 'smtp.mail.me.com', port: '587', security: 'STARTTLS' },
    imapHost: 'imap.mail.me.com',
    imapSignIn: 'local-part',
    secretLabel: 'App password',
    steps: [
      'Turn on two-factor authentication for your Apple Account.',
      'Sign in at account.apple.com and open Sign-In and Security.',
      'Choose App-Specific Passwords, then generate one named Aurora.',
      'Paste it below. Changing your Apple Account password cancels it.',
    ],
    createLink: { label: 'Open your Apple Account', href: 'https://account.apple.com/' },
    refusalHelp:
      'iCloud needs an app-specific password here. Changing your Apple Account password cancels old ones, so create a new one.',
    docsUrl: 'https://support.apple.com/en-us/102654',
  },
];

/** The provider whose server this is, or undefined for a custom server (also a regional one). */
export function providerByServer(host: string): MailboxProvider | undefined {
  return MAILBOX_PROVIDERS.find((p) => p.server.host === host);
}

export function providerById(id: MailboxProviderId | null): MailboxProvider | undefined {
  return MAILBOX_PROVIDERS.find((p) => p.id === id);
}
