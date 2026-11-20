/**
 * The background state a mailbox starts again with when its credentials change.
 * Moved out of email-mailbox.router.ts (size rule: that file only shrinks).
 */

/**
 * A mailbox made ACTIVE again (new credentials or a passing test) starts bounce
 * reading afresh: an old failure streak would otherwise turn the next single
 * scan failure back into ERROR.
 */
export function freshScanState(): { failureCount: number; nextScanAt: Date } {
  return { failureCount: 0, nextScanAt: new Date() };
}

/**
 * New credentials may be another account (#1177): Graph's delta cursors belong to the account
 * they were made for, so the Outlook sync starts that mailbox from scratch, due now. The sync
 * lease is left alone: a round still running ends on its own and, its credentials being stale,
 * writes nothing back (its release requires the tokenVersion it read), so two syncs of one
 * mailbox never run at once.
 * MVP-011: a (re)connected account has not been looked back in either, so the history look-back
 * (mail-sync-lookback.ts) starts over for it: the last 90 days of mail with every lead and contact.
 */
export function freshSyncState() {
  return {
    syncCursor: null,
    syncSentCursor: null,
    syncedAt: null,
    nextSyncAt: null,
    syncFailureCount: 0,
    lookbackWatermark: null,
    lookbackUntil: null,
    lookbackCursor: null,
    lookbackSentCursor: null,
  };
}
