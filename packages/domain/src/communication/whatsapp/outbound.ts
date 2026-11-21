import { isE164 } from './e164';
import {
  WHATSAPP_MAX_TEXT_LENGTH,
  WHATSAPP_SEND_ERROR_CODES,
  type WhatsAppSendErrorCode,
} from './types';

/** Checks every transport applies before touching the network; null means valid. */
export function validateOutboundText(to: string, body: string): WhatsAppSendErrorCode | null {
  if (typeof to !== 'string' || !isE164(to)) return 'INVALID_RECIPIENT';
  if (typeof body !== 'string' || body.trim().length === 0) return 'INVALID_MESSAGE';
  // Count characters (code points), not UTF-16 units, so emoji do not count twice.
  if ([...body].length > WHATSAPP_MAX_TEXT_LENGTH) return 'INVALID_MESSAGE';
  return null;
}

/**
 * A retry can help for these; the others need a person or a different request.
 * TIMEOUT is deliberately not retryable: the message may already be delivered, and
 * neither Meta nor WAHA de-duplicates, so a blind retry can send it twice.
 */
export function isRetryableSendError(code: WhatsAppSendErrorCode): boolean {
  return code === 'RATE_LIMITED' || code === 'PROVIDER_ERROR';
}

export function isWhatsAppSendErrorCode(value: string): value is WhatsAppSendErrorCode {
  return (WHATSAPP_SEND_ERROR_CODES as readonly string[]).includes(value);
}
