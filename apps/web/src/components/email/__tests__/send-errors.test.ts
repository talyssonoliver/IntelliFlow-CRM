import { describe, expect, it } from 'vitest';
import {
  getEmailSendError,
  mailboxErrorMessage,
  partialSendNotice,
  skippedRecipientsNotice,
} from '../send-errors';

const trpcError = (emailSendError: unknown) => ({
  message: 'x',
  data: { code: 'PRECONDITION_FAILED', emailSendError },
});

describe('getEmailSendError', () => {
  it('maps NO_MAILBOX to a connect-your-mailbox message with a link to Email Settings', () => {
    const view = getEmailSendError(
      trpcError({ code: 'NO_MAILBOX', mailboxErrorCode: null, skipped: [] })
    );
    expect(view).toEqual({
      code: 'NO_MAILBOX',
      title: 'Connect your mailbox to send',
      message:
        'Email is sent from your own mailbox. Connect it in Email Settings, then send again.',
      action: { label: 'Open Email Settings', href: '/email/email-settings' },
    });
  });

  it('asks for a reconnect when the mailbox is broken', () => {
    const view = getEmailSendError(
      trpcError({ code: 'MAILBOX_ERROR', mailboxErrorCode: 'AUTH_FAILED', skipped: [] })
    );
    expect(view.code).toBe('MAILBOX_ERROR');
    expect(view.action?.href).toBe('/email/email-settings');
    expect(view.message).toMatch(/reconnect/i);
  });

  it('explains that nothing was sent when every recipient is suppressed', () => {
    const view = getEmailSendError(
      trpcError({ code: 'ALL_SUPPRESSED', mailboxErrorCode: null, skipped: ['a@example.invalid'] })
    );
    expect(view.code).toBe('ALL_SUPPRESSED');
    expect(view.message).toContain('a@example.invalid');
    expect(view.message).toMatch(/nothing was sent/i);
  });

  it.each([
    ['AUTH_FAILED', /sign-in|password/i],
    ['TIMEOUT', /did not respond/i],
    ['RATE_LIMITED', /hourly/i],
    ['ATTACHMENT_UNAVAILABLE', /attachment/i],
    ['REJECTED', /refused/i],
  ])('gives a specific reason for a %s send failure', (mailboxErrorCode, pattern) => {
    const view = getEmailSendError(
      trpcError({ code: 'SEND_FAILED', mailboxErrorCode, skipped: [] })
    );
    expect(view.code).toBe('SEND_FAILED');
    expect(view.title).toBe('Email not sent');
    expect(view.message).toMatch(pattern);
  });

  it('falls back to a generic message for unknown or uncoded errors', () => {
    for (const error of [
      new Error('boom'),
      null,
      undefined,
      trpcError({ code: 'SOMETHING_ELSE' }),
      trpcError('NO_MAILBOX'),
    ]) {
      expect(getEmailSendError(error)).toEqual({
        code: null,
        title: 'Email not sent',
        message: 'Something went wrong while sending. Please try again.',
        action: null,
      });
    }
  });

  it('never echoes the server message, which may carry provider text', () => {
    const view = getEmailSendError({ message: 'raw provider text', data: {} });
    expect(JSON.stringify(view)).not.toContain('raw provider text');
  });
});

describe('skippedRecipientsNotice', () => {
  it('is null when nobody was skipped', () => {
    expect(skippedRecipientsNotice([])).toBeNull();
    expect(skippedRecipientsNotice(undefined)).toBeNull();
  });

  it('names the skipped recipients (singular and plural)', () => {
    expect(skippedRecipientsNotice(['a@example.invalid'])).toBe(
      'Sent. 1 recipient was skipped because they are on the suppression list: a@example.invalid.'
    );
    expect(skippedRecipientsNotice(['a@example.invalid', 'b@example.invalid'])).toBe(
      'Sent. 2 recipients were skipped because they are on the suppression list: a@example.invalid, b@example.invalid.'
    );
  });
});

describe('mailboxErrorMessage', () => {
  it('explains every mailbox error code in plain words', () => {
    expect(mailboxErrorMessage('AUTH_FAILED')).toMatch(/refused the sign-in/);
    expect(mailboxErrorMessage('TLS_FAILED')).toMatch(/secure connection/);
    expect(mailboxErrorMessage('CONNECT_FAILED')).toMatch(/could not be reached/);
  });
});

describe('partialSendNotice', () => {
  it('is null when everyone was sent the email', () => {
    expect(partialSendNotice({ skipped: [], rejected: [] })).toBeNull();
    expect(partialSendNotice(undefined)).toBeNull();
  });

  it('names refused recipients, and joins them with skipped ones', () => {
    expect(partialSendNotice({ rejected: ['b@example.invalid'] })).toBe(
      'Your mail server refused 1 recipient, so they did not get it: b@example.invalid.'
    );
    expect(
      partialSendNotice({
        skipped: ['s@example.invalid'],
        rejected: ['b@example.invalid', 'c@example.invalid'],
      })
    ).toBe(
      'Sent. 1 recipient was skipped because they are on the suppression list: s@example.invalid. ' +
        'Your mail server refused 2 recipients, so they did not get it: b@example.invalid, c@example.invalid.'
    );
  });
});
