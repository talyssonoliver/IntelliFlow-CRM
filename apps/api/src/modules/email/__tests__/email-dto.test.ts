import { describe, expect, it } from 'vitest';
import {
  settingsValues,
  toEmailSettingsDto,
  toMailboxDto,
  toSignatureDto,
  toSuppressionDto,
} from '../email-dto';

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
  smtpHost: 'smtp.mail.example.invalid',
  smtpPort: 587,
  smtpSecurity: 'STARTTLS',
  smtpUsername: 'me@mail.example.invalid',
  smtpPassword: secret,
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
      smtpHost: 'smtp.mail.example.invalid',
      smtpPort: 587,
      smtpSecurity: 'STARTTLS',
      smtpUsername: 'me@mail.example.invalid',
      hasSmtpPassword: true,
      imapHost: 'imap.mail.example.invalid',
      imapPort: 993,
      imapUsername: 'me@mail.example.invalid',
      hasImapPassword: true,
      bounceReadingEnabled: true,
      accountAddress: null,
      updatedAt: updatedAt.toISOString(),
    });
    expect(JSON.stringify(dto)).not.toContain(secret);
  });

  it('hides host and username when connection details are not for this viewer', () => {
    const dto = toMailboxDto(smtpRow, { includeConnection: false });
    expect(dto.smtpHost).toBeNull();
    expect(dto.smtpUsername).toBeNull();
    expect(dto.imapHost).toBeNull();
    expect(dto.imapUsername).toBeNull();
    expect(dto.fromAddress).toBe('me@mail.example.invalid');
  });

  it('marks an OAuth mailbox bounce-readable when it has a refresh token, never exposing it', () => {
    const dto = toMailboxDto(
      {
        ...smtpRow,
        kind: 'GMAIL',
        smtpHost: null,
        smtpPassword: null,
        imapHost: null,
        imapPassword: null,
        accountAddress: 'me@gmail.example',
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
