import type { WhatsAppMessageStatus } from './types';

const RANK: Record<Exclude<WhatsAppMessageStatus, 'FAILED'>, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

/**
 * Delivery status only moves forward (design doc section 6). Providers deliver
 * webhooks out of order and twice; a late "sent" must not undo "read".
 * FAILED replaces QUEUED or SENT, but not a message the phone already received,
 * and nothing replaces FAILED (deliberate: a provider that reports failed and then
 * delivered on a retry keeps FAILED, and the use case can resend).
 */
export function canAdvanceStatus(
  current: WhatsAppMessageStatus,
  next: WhatsAppMessageStatus
): boolean {
  if (current === 'FAILED') return false;
  if (next === 'FAILED') return current === 'QUEUED' || current === 'SENT';
  return RANK[next] > RANK[current];
}

/** The status to store after an update arrives: `next` when it moves forward, else `current`. */
export function advanceStatus(
  current: WhatsAppMessageStatus,
  next: WhatsAppMessageStatus
): WhatsAppMessageStatus {
  return canAdvanceStatus(current, next) ? next : current;
}
