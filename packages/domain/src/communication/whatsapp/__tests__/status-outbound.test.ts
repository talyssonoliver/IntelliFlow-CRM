import { describe, expect, it } from 'vitest';
import {
  WHATSAPP_MAX_TEXT_LENGTH,
  WHATSAPP_MESSAGE_STATUSES,
  WHATSAPP_SEND_ERROR_CODES,
  advanceStatus,
  canAdvanceStatus,
  isRetryableSendError,
  isWhatsAppSendErrorCode,
  validateOutboundText,
} from '../index';

const TO = '+44' + '7700900123';

describe('delivery status only moves forward', () => {
  it('advances along the lifecycle', () => {
    expect(canAdvanceStatus('QUEUED', 'SENT')).toBe(true);
    expect(canAdvanceStatus('SENT', 'DELIVERED')).toBe(true);
    expect(canAdvanceStatus('SENT', 'READ')).toBe(true);
    expect(canAdvanceStatus('DELIVERED', 'READ')).toBe(true);
  });

  it('ignores a repeated or older status', () => {
    expect(canAdvanceStatus('READ', 'DELIVERED')).toBe(false);
    expect(canAdvanceStatus('DELIVERED', 'SENT')).toBe(false);
    expect(canAdvanceStatus('SENT', 'SENT')).toBe(false);
    expect(advanceStatus('READ', 'SENT')).toBe('READ');
  });

  it('lets FAILED replace only a message the phone has not received', () => {
    expect(canAdvanceStatus('QUEUED', 'FAILED')).toBe(true);
    expect(canAdvanceStatus('SENT', 'FAILED')).toBe(true);
    expect(canAdvanceStatus('DELIVERED', 'FAILED')).toBe(false);
    expect(canAdvanceStatus('READ', 'FAILED')).toBe(false);
  });

  it('never leaves FAILED', () => {
    for (const next of WHATSAPP_MESSAGE_STATUSES) {
      expect(canAdvanceStatus('FAILED', next)).toBe(false);
    }
    expect(advanceStatus('SENT', 'FAILED')).toBe('FAILED');
  });
});

describe('validateOutboundText', () => {
  it('accepts a number and a body', () => {
    expect(validateOutboundText(TO, 'hello')).toBeNull();
    expect(validateOutboundText(TO, 'x'.repeat(WHATSAPP_MAX_TEXT_LENGTH))).toBeNull();
  });
  it('rejects a recipient that is not E.164', () => {
    expect(validateOutboundText('07700 900123', 'hello')).toBe('INVALID_RECIPIENT');
    expect(validateOutboundText('', 'hello')).toBe('INVALID_RECIPIENT');
  });
  it('counts characters, not UTF-16 units', () => {
    expect(validateOutboundText(TO, '\u{1F600}'.repeat(WHATSAPP_MAX_TEXT_LENGTH))).toBeNull();
    expect(validateOutboundText(TO, '\u{1F600}'.repeat(WHATSAPP_MAX_TEXT_LENGTH + 1))).toBe(
      'INVALID_MESSAGE'
    );
  });
  it('does not throw on non-string input', () => {
    expect(validateOutboundText(undefined as unknown as string, 'x')).toBe('INVALID_RECIPIENT');
    expect(validateOutboundText(TO, undefined as unknown as string)).toBe('INVALID_MESSAGE');
  });
  it('rejects an empty or oversized body', () => {
    expect(validateOutboundText(TO, '   ')).toBe('INVALID_MESSAGE');
    expect(validateOutboundText(TO, 'x'.repeat(WHATSAPP_MAX_TEXT_LENGTH + 1))).toBe(
      'INVALID_MESSAGE'
    );
  });
});

describe('send error codes', () => {
  it('marks only safe-to-retry failures retryable (not TIMEOUT: it may have been delivered)', () => {
    const retryable = WHATSAPP_SEND_ERROR_CODES.filter(isRetryableSendError);
    expect(retryable).toEqual(['RATE_LIMITED', 'PROVIDER_ERROR']);
  });
  it('recognises its own codes', () => {
    expect(isWhatsAppSendErrorCode('TIMEOUT')).toBe(true);
    expect(isWhatsAppSendErrorCode('nope')).toBe(false);
  });
});
