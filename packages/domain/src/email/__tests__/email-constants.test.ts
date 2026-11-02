import { describe, expect, it } from 'vitest';
import { ACCOUNT_OWNER_ADMIN_ROLES } from '../../crm/account/territory/territory-constants';
import {
  EMAIL_SETTINGS_ADMIN_ROLES,
  EMAIL_SETTINGS_DEFAULTS,
  IMAP_PORT,
  MAILBOX_PRESETS,
  SMTP_PORTS,
  isEmailSettingsAdminRole,
} from '../email-constants';

describe('email constants', () => {
  it('reuses the account owner admin role list (one role source)', () => {
    expect(EMAIL_SETTINGS_ADMIN_ROLES).toBe(ACCOUNT_OWNER_ADMIN_ROLES);
  });

  it('recognises admin roles and rejects others', () => {
    expect(isEmailSettingsAdminRole('ADMIN')).toBe(true);
    expect(isEmailSettingsAdminRole('MANAGER')).toBe(true);
    expect(isEmailSettingsAdminRole('USER')).toBe(false);
    expect(isEmailSettingsAdminRole(null)).toBe(false);
    expect(isEmailSettingsAdminRole(undefined)).toBe(false);
  });

  it('allows only TLS submission ports for SMTP and implicit TLS for IMAP', () => {
    expect(SMTP_PORTS).toEqual([465, 587, 2525]);
    expect(IMAP_PORT).toBe(993);
  });

  it('defaults keep fallback, tracking and notifications off and suppress hard bounces', () => {
    expect(EMAIL_SETTINGS_DEFAULTS).toEqual({
      allowTenantMailboxFallback: false,
      replyToAddress: null,
      trackOpens: false,
      trackClicks: false,
      hardBounceAction: 'SUPPRESS',
      softBounceThreshold: 3,
      notifySenderOnBounce: false,
    });
  });

  it('presets point at the providers TLS endpoints', () => {
    expect(MAILBOX_PRESETS.gmail).toEqual({
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpSecurity: 'SSL',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
    });
    expect(MAILBOX_PRESETS.outlook).toEqual({
      smtpHost: 'smtp.office365.com',
      smtpPort: 587,
      smtpSecurity: 'STARTTLS',
      imapHost: 'outlook.office365.com',
      imapPort: 993,
    });
  });
});
