import type { BounceKind } from './email-constants';

/**
 * Classifies one per-recipient block of a delivery-status notification
 * (RFC 3464 `Action` + RFC 3463 `Status`). `failed` with a 5.x.x status is a
 * permanent (hard) bounce, with 4.x.x a transient (soft) one; `delayed` is a
 * warning, not a bounce. Anything else (delivered, relayed, expanded,
 * malformed) is not a bounce.
 */
export function classifyDsnStatus(action: string, status: string): BounceKind | null {
  const normalizedAction = action.trim().toLowerCase();
  if (normalizedAction === 'delayed') return 'DELAYED';
  if (normalizedAction !== 'failed') return null;

  const statusClass = /^([245])\.\d{1,3}\.\d{1,3}$/.exec(status.trim())?.[1];
  if (statusClass === '5') return 'HARD';
  if (statusClass === '4') return 'SOFT';
  return null;
}
