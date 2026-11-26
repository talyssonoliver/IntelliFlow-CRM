/**
 * MVP-001: what the mailbox sync says in the logs (split out of outlook-inbox-sync.ts, to keep it
 * within its size limit). Counts and codes only: never an address, a subject or a body.
 * - One line per mailbox round: per folder, the mails read and what became of each (stored, or
 *   the reason it was skipped), so "nothing was logged" can be told apart from "nothing matched".
 * - For a failure that is not a mailbox transport error, its class name and database code, so a
 *   bug is not reported as a connection failure.
 */

import { MailboxTransportError } from '@intelliflow/adapters';

/** Per folder: mails read, and how many ended in each outcome (stored, own, unmatched, ...). */
export type FolderTally = Record<string, number>;

export function newTally(): FolderTally {
  return { read: 0 };
}

export function countOutcome(tally: FolderTally, outcome: string, by = 1): void {
  tally[outcome] = (tally[outcome] ?? 0) + by;
}

/** The class name of an unexpected error, and its database code when it has one (no message). */
export function errorCause(error: unknown): { cause: string; dbCode?: string } {
  const cause = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? { cause, dbCode: code } : { cause };
}

/** A mailbox skipped because this process has no OAuth client for its kind: what to set, by name. */
export function logNoClient(
  mailboxId: string,
  kind: string,
  envNames: string[],
  log: Pick<Console, 'warn'> = console
): void {
  log.warn('[email] inbox sync skipped: no OAuth client for this mailbox kind here', {
    mailboxId,
    kind,
    set: envNames,
  });
}

/**
 * Consecutive failed rounds after which a mail-server connect failure is an error. Rounds back
 * off 10, 20 and 40 minutes (outlook-inbox-sync.ts), so three failures in a row is about an hour
 * of no mail: a person should look. One or two are a provider or network blip (a single
 * CONNECT_FAILED at 06:28 on 25/11/2026 raised a high-severity Grafana alert and then recovered).
 */
export const REPEATED_CONNECT_FAILURES = 3;

/**
 * A failed mailbox round: the transport code, or for anything else (a bug, the database) its
 * cause. `consecutiveFailures` counts this round. A transient connect failure is logged as a
 * warning until it repeats; every other failure is an error at once.
 */
export function logFailure(
  mailboxId: string,
  error: unknown,
  consecutiveFailures: number = REPEATED_CONNECT_FAILURES,
  log: Pick<Console, 'error' | 'warn'> = console
): void {
  const transport = error instanceof MailboxTransportError;
  const transient =
    transport && error.code === 'CONNECT_FAILED' && consecutiveFailures < REPEATED_CONNECT_FAILURES;
  (transient ? log.warn : log.error).call(log, '[email] inbox sync failed', {
    mailboxId,
    code: transport ? error.code : 'CONNECT_FAILED',
    ...(transport ? {} : errorCause(error)),
    ...(transient ? { consecutiveFailures, retry: 'with backoff' } : {}),
  });
}

/** The line logged after a mailbox round. */
export function logRound(
  mailboxId: string,
  kind: string,
  tallies: Record<string, FolderTally>,
  complete: boolean,
  log: Pick<Console, 'info'> = console
): void {
  log.info('[email] inbox sync done', { mailboxId, kind, ...tallies, complete });
}
