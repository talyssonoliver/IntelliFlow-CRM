import { describe, expect, it } from 'vitest';
import { emailSendError, emailSendErrorFromCause } from '../email-send-error';

describe('emailSendError', () => {
  it.each([
    ['NO_MAILBOX', 'PRECONDITION_FAILED'],
    ['MAILBOX_ERROR', 'PRECONDITION_FAILED'],
    ['ALL_SUPPRESSED', 'PRECONDITION_FAILED'],
    ['SEND_FAILED', 'BAD_GATEWAY'],
  ] as const)('maps %s to %s with a prefixed message and a readable cause', (code, trpcCode) => {
    const error = emailSendError(code, {
      mailboxErrorCode: 'TIMEOUT',
      skipped: ['a@example.invalid'],
    });
    expect(error.code).toBe(trpcCode);
    expect(error.message.startsWith(`${code}: `)).toBe(true);
    expect(emailSendErrorFromCause(error.cause)).toEqual({
      code,
      mailboxErrorCode: 'TIMEOUT',
      skipped: ['a@example.invalid'],
    });
  });

  it('defaults the mailbox code and skipped list', () => {
    expect(emailSendErrorFromCause(emailSendError('NO_MAILBOX').cause)).toEqual({
      code: 'NO_MAILBOX',
      mailboxErrorCode: null,
      skipped: [],
    });
  });

  it('returns null for causes that are not send refusals', () => {
    expect(emailSendErrorFromCause(undefined)).toBeNull();
    expect(emailSendErrorFromCause(null)).toBeNull();
    expect(emailSendErrorFromCause(new Error('x'))).toBeNull();
    expect(emailSendErrorFromCause({ emailSendError: 'OTHER' })).toBeNull();
    expect(emailSendErrorFromCause({ emailSendError: 'NO_MAILBOX', skipped: 'x' })).toEqual({
      code: 'NO_MAILBOX',
      mailboxErrorCode: null,
      skipped: [],
    });
  });
});
