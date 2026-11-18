import { describe, expect, it } from 'vitest';
import {
  settingsValues,
  toEmailSettingsDto,
  toMailboxDto,
  toSignatureDto,
  toSuppressionDto,
  replySyncState,
} from '../email-dto';
import {
  NO_SMTP_ACCOUNT,
  NO_SMTP_ENDPOINT,
  smtpAccountFields,
  smtpAccountSummary,
  smtpEndpointFields,
} from '@intelliflow/validators';

const secret = 'x'.repeat(30);
const updatedAt = new Date(Date.UTC(2026, 9, 20));

const smtpRow = {
  id: 'mb1',
  tenantId: 't1',
  scope: 'USER',
  userId: 'u1',
  kind: 'SMTP',
  status: 'ACTIVE',
  lastErrorCode: null,
  fromAddress: 'me@mail.example.invalid',
  fromName: 'Me',
  ...smtpEndpointFields('smtp.mail.example.invalid', 587, 'STARTTLS'),
  ...smtpAccountFields('me@mail.example.invalid', secret),
  imapHost: 'imap.mail.example.invalid',
  imapPort: 993,
  imapUsername: 'me@mail.example.invalid',
  imapPassword: secret,
  accountAddress: null,
  refreshToken: null,
  tokenVersion: 0,
  updatedAt,
};

describe('toMailboxDto', () => {
  it('exposes connection details and secret booleans only (never a secret)', () => {
    const dto = toMailboxDto(smtpRow, { includeConnection: true });
    expect(dto).toEqual({
      id: 'mb1',
      scope: 'USER',
      kind: 'SMTP',
      status: 'ACTIVE',
      lastErrorCode: null,
      fromAddress: 'me@mail.example.invalid',
      fromName: 'Me',
      ...smtpEndpointFields('smtp.mail.example.invalid', 587, 'STARTTLS'),
      ...smtpAccountSummary('me@mail.example.invalid', true),
      imapHost: 'imap.mail.example.invalid',
      imapPort: 993,
      imapUsername: 'me@mail.example.invalid',
      hasImapPassword: true,
      bounceReadingEnabled: true,
      accountAddress: null,
      inboxSyncedAt: null,
      replySync: null,
      updatedAt: updatedAt.toISOString(),
    });
    expect(JSON.stringify(dto)).not.toContain(secret);
  });

  it('carries when the Outlook inbox sync last finished (#1177)', () => {
    const syncedAt = new Date('2026-11-15T10:30:00.000Z');

    expect(toMailboxDto({ ...smtpRow, syncedAt }, { includeConnection: false }).inboxSyncedAt).toBe(
      '2026-11-15T10:30:00.000Z'
    );
  });

  it('hides host and username when connection details are not for this viewer', () => {
    const dto = toMailboxDto(smtpRow, { includeConnection: false });
    expect(dto).toMatchObject({ ...NO_SMTP_ENDPOINT, ...smtpAccountSummary(null, true) });
    expect(dto.imapHost).toBeNull();
    expect(dto.imapUsername).toBeNull();
    expect(dto.fromAddress).toBe('me@mail.example.invalid');
  });

  it('never marks a Gmail mailbox bounce-readable: it holds gmail.send only (owner decision 14/11)', () => {
    const gmail = toMailboxDto(
      {
        ...smtpRow,
        kind: 'GMAIL',
        ...NO_SMTP_ENDPOINT,
        ...NO_SMTP_ACCOUNT,
        imapHost: null,
        imapPassword: null,
        accountAddress: 'me@gmail.example',
        refreshToken: secret,
      },
      { includeConnection: true }
    );
    expect(gmail.bounceReadingEnabled).toBe(false);
  });

  it('marks a Microsoft mailbox bounce-readable when it has a refresh token, never exposing it', () => {
    const dto = toMailboxDto(
      {
        ...smtpRow,
        kind: 'MICROSOFT',
        ...NO_SMTP_ENDPOINT,
        ...NO_SMTP_ACCOUNT,
        imapHost: null,
        imapPassword: null,
        accountAddress: 'me@outlook.example',
        refreshToken: secret,
      },
      { includeConnection: true }
    );
    expect(dto.bounceReadingEnabled).toBe(true);
    expect(dto.hasSmtpPassword).toBe(false);
    expect(JSON.stringify(dto)).not.toContain(secret);
  });

  it('reports bounce reading off for an SMTP mailbox without IMAP', () => {
    expect(
      toMailboxDto(
        { ...smtpRow, imapHost: null, imapPort: null, imapUsername: null, imapPassword: null },
        { includeConnection: true }
      ).bounceReadingEnabled
    ).toBe(false);
  });

  it('ignores any unexpected property on the row (allow-list mapping)', () => {
    const dto = toMailboxDto({ ...smtpRow, codeVerifier: secret } as never, {
      includeConnection: true,
    });
    expect(Object.keys(dto)).not.toContain('codeVerifier');
  });
});

describe('settings', () => {
  it('uses the documented defaults when no row exists', () => {
    expect(settingsValues(null)).toEqual({
      allowTenantMailboxFallback: false,
      replyToAddress: null,
      trackOpens: false,
      trackClicks: false,
      hardBounceAction: 'SUPPRESS',
      softBounceThreshold: 3,
      notifySenderOnBounce: false,
    });
  });

  it('builds the settings DTO with viewer flags', () => {
    expect(
      toEmailSettingsDto(null, {
        canEdit: false,
        companyMailboxAvailable: true,
        companyMailboxAddress: null,
      })
    ).toMatchObject({ canEdit: false, companyMailboxAvailable: true, companyMailboxAddress: null });
    expect(
      toEmailSettingsDto(
        {
          allowTenantMailboxFallback: true,
          replyToAddress: 'r@example.invalid',
          trackOpens: true,
          trackClicks: false,
          hardBounceAction: 'NONE',
          softBounceThreshold: 5,
          notifySenderOnBounce: true,
        },
        { canEdit: true, companyMailboxAvailable: false, companyMailboxAddress: null }
      )
    ).toMatchObject({
      allowTenantMailboxFallback: true,
      hardBounceAction: 'NONE',
      softBounceThreshold: 5,
    });
  });
});

describe('signature and suppression DTOs', () => {
  it('maps a signature', () => {
    expect(
      toSignatureDto({
        id: 's1',
        scope: 'ORG',
        name: 'Team',
        html: '<p>x</p>',
        isDefault: true,
        updatedAt,
      })
    ).toEqual({
      id: 's1',
      scope: 'ORG',
      name: 'Team',
      html: '<p>x</p>',
      isDefault: true,
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('maps a suppression', () => {
    expect(
      toSuppressionDto({
        id: 'x1',
        email: 'gone@example.invalid',
        reason: 'HARD_BOUNCE',
        source: 'DSN',
        createdAt: updatedAt,
      })
    ).toEqual({
      id: 'x1',
      email: 'gone@example.invalid',
      reason: 'HARD_BOUNCE',
      source: 'DSN',
      createdAt: updatedAt.toISOString(),
    });
  });
});

describe('replySyncState (MVP-001)', () => {
  it('is ON when the kind has a reader and the read permission was granted', () => {
    expect(replySyncState({ kind: 'MICROSOFT', grantedScopes: ['Mail.Send', 'Mail.Read'] })).toBe(
      'ON'
    );
    expect(
      replySyncState({
        kind: 'ZOHO',
        grantedScopes: ['ZohoMail.messages.READ', 'ZohoMail.folders.READ'],
      })
    ).toBe('ON');
  });

  it('asks for a reconnect when the connection predates the read permission', () => {
    expect(
      replySyncState({
        kind: 'ZOHO',
        grantedScopes: ['ZohoMail.messages.CREATE', 'ZohoMail.accounts.READ'],
      })
    ).toBe('NEEDS_RECONNECT');
    expect(replySyncState({ kind: 'MICROSOFT', grantedScopes: [] })).toBe('NEEDS_RECONNECT');
  });

  it('is null for kinds that do not sync', () => {
    expect(replySyncState({ kind: 'SMTP', grantedScopes: [] })).toBeNull();
  });

  it('a Gmail mailbox is ON with read-only, else waits for its Workspace admin (MVP-011)', () => {
    const send = 'https://www.googleapis.com/auth/gmail.send';
    const read = 'https://www.googleapis.com/auth/gmail.readonly';
    expect(replySyncState({ kind: 'GMAIL', grantedScopes: [send, read] })).toBe('ON');
    // Google granted sending only: reconnecting alone does not help, the admin must trust Aurora.
    expect(replySyncState({ kind: 'GMAIL', grantedScopes: [send] })).toBe('NEEDS_ADMIN_TRUST');
    expect(replySyncState({ kind: 'GMAIL', grantedScopes: [] })).toBe('NEEDS_ADMIN_TRUST');
  });
});
