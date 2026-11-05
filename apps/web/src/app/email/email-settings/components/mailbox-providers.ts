/**
 * The email providers the mailbox form knows, checked against each provider's own
 * help pages on 2026-11-04 (`docsUrl`). Choosing one fills in its servers and shows
 * how to get the password it needs. `custom` is the route for everything else,
 * most often a business address on the customer's own domain.
 *
 * Zoho's regional servers are not listed: Zoho publishes only the zoho.com names and
 * sends everyone else to the Server Configurations Details page in their account.
 */
import { MAILBOX_SERVERS, ZOHO_PERSONAL_SERVER } from './mailbox-servers';
import type { MailboxServerDetails, SmtpSecurity } from './mailbox-servers';

export type MailboxProviderId =
  | 'custom'
  | 'google'
  | 'microsoft365'
  | 'microsoft-personal'
  | 'zoho'
  | 'resend'
  | 'yahoo'
  | 'icloud'
  | 'ionos'
  | 'namecheap'
  | 'hostinger';

export type { SmtpSecurity };

/** The one wording for sign-in Aurora does not offer yet. No dates: it changes in one place. */
export function oneClickNotYet(providerName: string): string {
  return `One-click ${providerName} sign-in isn't available yet.`;
}

/** Personal Microsoft mail takes only Microsoft's own sign-in, so it has no settings to fill in. */
export const MICROSOFT_PERSONAL = {
  id: 'microsoft-personal' as const,
  label: 'Outlook, Hotmail or Live',
  hint: 'A personal Microsoft address. Not available yet',
  docsUrl:
    'https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040',
};

export const MICROSOFT_PERSONAL_ADDRESS_MESSAGE = `Outlook, Hotmail and Live addresses need Microsoft sign-in, so a password will not work. ${oneClickNotYet('Microsoft')}`;

/** outlook.com, hotmail.co.uk, live.com, msn.com and so on. */
export function isPersonalMicrosoftAddress(address: string): boolean {
  return /@(outlook|hotmail|live|msn)\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/i.test(
    address.trim()
  );
}

interface MailboxGuide {
  id: Exclude<MailboxProviderId, 'custom' | 'microsoft-personal'>;
  label: string;
  /** A short line under the name, to help people recognise their provider. */
  hint: string;
  /** Short name for messages. */
  name: string;
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

export type MailboxProvider = MailboxGuide & MailboxServerDetails;

const GUIDES: readonly MailboxGuide[] = [
  {
    id: 'google',
    label: 'Gmail or Google Workspace',
    hint: 'Gmail, or your own domain run by Google',
    name: 'Google',
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
    label: 'Microsoft 365 (business)',
    hint: 'Work or school mail, or your own domain run by Microsoft',
    name: 'Microsoft 365',
    secretLabel: 'Password',
    steps: [
      'Ask your Microsoft 365 administrator to allow SMTP AUTH for your mailbox.',
      'Enter your address and your Microsoft 365 password below.',
      'Use Test Connection. If it is refused, the setting is still off.',
    ],
    warning:
      'This only sends mail: Microsoft no longer lets a password read incoming mail, so addresses that bounce will not be taken off your lists automatically. SMTP AUTH does not work with Security defaults. Microsoft turns SMTP AUTH basic authentication off by default at the end of December 2026. Administrators of existing organisations can still turn it back on.',
    secondLink: {
      label: 'Microsoft SMTP AUTH timeline',
      href: 'https://techcommunity.microsoft.com/blog/Exchange/updated-exchange-online-smtp-auth-basic-authentication-deprecation-timeline/4489835',
    },
    refusalHelp:
      'Microsoft refused the password. Your Microsoft 365 administrator must allow SMTP AUTH for this mailbox, and Security defaults must be off. Outlook, Hotmail and Live addresses cannot use a password at all.',
    docsUrl:
      'https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/how-to-set-up-a-multifunction-device-or-application-to-send-email-using-microsoft-365-or-office-365',
  },
  {
    id: 'zoho',
    label: 'Zoho Mail',
    hint: 'A paid Zoho plan. The free plan cannot connect',
    name: 'Zoho',
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
      'The server depends on where your Zoho account is held. If you sign in anywhere other than zoho.com, copy the outgoing server from Server Configurations Details in Zoho into Advanced below. A personal @zohomail.com address uses ' +
      ZOHO_PERSONAL_SERVER +
      '.',
    refusalHelp:
      "If you are on Zoho's free plan, this is why: it does not allow outside apps. Move to a paid Zoho plan, or use a sending service such as Resend. On a paid plan, check the password. Use an app password if two-factor sign-in is on, and check the server matches your Zoho region.",
    docsUrl: 'https://www.zoho.com/mail/help/zoho-smtp.html',
  },
  {
    id: 'resend',
    label: 'Resend (sending service)',
    hint: 'Sends mail for your domain with an API key',
    name: 'Resend',
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
    secretLabel: 'App password',
    steps: [
      'Log in to Private Email.',
      'Open Settings, then Launch Security Center, then App passwords.',
      'Add a new one and call it Aurora.',
      'Confirm when asked, using the details you log in with.',
      'Paste it below. It is only shown once.',
    ],
    createLink: { label: 'Open Private Email', href: 'https://privateemail.com/' },
    warning: 'Also turn on outside mail apps under Connect third-party apps in Private Email.',
    refusalHelp:
      'Private Email only accepts app passwords here, and outside mail apps must be turned on under Connect third-party apps.',
    docsUrl:
      'https://www.namecheap.com/support/knowledgebase/article.aspx/1179/2175/general-private-email-configuration-for-mail-clients-and-mobile-devices/',
  },
  {
    id: 'hostinger',
    label: 'Hostinger',
    hint: 'Email from Hostinger on your own domain',
    name: 'Hostinger',
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

export const MAILBOX_PROVIDERS: readonly MailboxProvider[] = GUIDES.map((guide) => ({
  ...guide,
  ...MAILBOX_SERVERS[guide.id],
}));

/** The provider whose server this is, or undefined for a custom server (also a regional one). */
export function providerByServer(host: string): MailboxProvider | undefined {
  return MAILBOX_PROVIDERS.find((p) => p.server.host === host);
}

export function providerById(id: MailboxProviderId | null): MailboxProvider | undefined {
  return MAILBOX_PROVIDERS.find((p) => p.id === id);
}
