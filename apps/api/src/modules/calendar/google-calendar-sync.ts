/**
 * Google Calendar sync (MVP-013). Like the inbox sync, each due mailbox (a user's own Google mailbox
 * with the calendar permission, due every four minutes so a change lands within five) is claimed one
 * at a time with a lease, read (google-calendar-pull.ts) then written to (google-calendar-push.ts), and released with the outcome.
 * A failure backs the mailbox off and never changes its mail status. Google answering that the
 * calendar permission is gone marks it NEEDS_RECONNECT, and the sync stops until the user reconnects.
 * The shared background tick runs it (background-jobs.ts), unless GOOGLE_CALENDAR_SYNC=off.
 */
import { GoogleCalendarAdapter, MailboxTransportError } from '@intelliflow/adapters';
import {
  CalendarAuthenticationError,
  CalendarRateLimitError,
  type OAuthTokens,
} from '@intelliflow/application';
import {
  forgetAccessToken,
  getOAuthAccess,
  hasOAuthClient,
  oauthClientEnvNames,
  type MailboxTransports,
  type TransportMailbox,
} from '../email/mailbox-transport';
import { hasGoogleCalendar } from '../email/mail-sync-scopes';
import { errorCause, logNoClient } from '../email/mail-sync-report';
import {
  newReport,
  type CalendarGateway,
  type CalendarSyncReport,
  type SyncContext,
} from './google-calendar-links';
import { pullChanges, type PullResult } from './google-calendar-pull';
import { pushChanges, type PushResult } from './google-calendar-push';

/**
 * A mailbox is due this long after its last round began. The shared tick runs every minute, so a round
 * starts between this and a minute later: four minutes keeps a change on either side within the five
 * the owner was promised (five would let it take up to six).
 */
export const CALENDAR_SYNC_INTERVAL_MS = 4 * 60_000;
const LEASE_MS = 5 * 60_000;
const MAILBOXES_PER_TICK = 10;
/** A tick stops claiming mailboxes after this, so one tick always ends well inside a lease. */
const TICK_BUDGET_MS = 2 * 60_000;
/** Time one mailbox's round may take: well inside the lease. */
const MAILBOX_BUDGET_MS = 3 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
/** The scopes that let events be read and written (the connect asks for the first). */
const CALENDAR_SCOPE_URIS = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar',
];

export interface CalendarSyncDeps {
  prisma: any;
  transports: MailboxTransports;
  now: () => Date;
  /** The Google client for a round; defaults to the Google Calendar adapter. */
  gatewayFor?: (mailbox: { id: string }) => CalendarGateway;
}

/** The mailbox row as the encrypted client returns it (the token helper reads its credentials). */
interface SyncMailbox extends TransportMailbox {
  userId: string | null;
  accountAddress: string | null;
  /** A Gmail mailbox: Google's immutable account id, when it was captured at connect. */
  oauthAccountId?: string | null;
  scope: string;
  status: string;
  grantedScopes: string[];
  calendarSyncToken: string | null;
  calendarStatus: string;
  calendarFailureCount: number;
}

interface Claim {
  id: string;
  leaseUntil: Date;
}

async function claimNext(deps: CalendarSyncDeps, now: Date): Promise<Claim | null> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const rows: Array<{ id: string; calendarLockedUntil: Date }> = await deps.prisma.$queryRaw`
    UPDATE email_mailboxes SET "calendarLockedUntil" = ${leaseUntil}
    WHERE id IN (
      SELECT id FROM email_mailboxes
      WHERE status = 'ACTIVE' AND kind = 'GMAIL' AND scope = 'USER'
        AND "calendarStatus" = 'ACTIVE'
        AND "grantedScopes" && ${CALENDAR_SCOPE_URIS}::text[]
        AND ("calendarNextSyncAt" IS NULL OR "calendarNextSyncAt" <= ${now})
        AND ("calendarLockedUntil" IS NULL OR "calendarLockedUntil" < ${now})
      ORDER BY "calendarNextSyncAt" ASC NULLS FIRST
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "calendarLockedUntil"`;
  const row = rows[0];
  return row ? { id: row.id, leaseUntil: row.calendarLockedUntil } : null;
}

/**
 * Writes the round's outcome only while this worker still holds the lease AND the credentials it read
 * are still the mailbox's: after a reconnect (tokenVersion moved on) nothing of the old round is
 * written back, and the lease simply runs out.
 */
async function release(
  deps: CalendarSyncDeps,
  claim: Claim,
  tokenVersion: number,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await deps.prisma.emailMailbox.update({
      where: { id: claim.id, calendarLockedUntil: claim.leaseUntil, tokenVersion },
      data: { calendarLockedUntil: null, ...data },
    });
  } catch (error) {
    if ((error as { code?: unknown })?.code !== 'P2025') throw error; // another worker holds it now
  }
}

function defaultGateway(): CalendarGateway {
  // The adapter's OAuth methods are not used: the access token comes from the mailbox's own grant.
  return new GoogleCalendarAdapter({
    oauthConfig: { clientId: '', clientSecret: '', redirectUri: '', scopes: [] },
    calendarId: 'primary',
  });
}

function tokensFor(access: string, scopes: string[], now: Date): OAuthTokens {
  return {
    accessToken: access,
    refreshToken: '',
    expiresAt: new Date(now.getTime() + 5 * 60_000),
    scope: scopes,
    tokenType: 'Bearer',
  };
}

/**
 * Which Google account a round runs for: Google's immutable id, never the address (an address can be
 * renamed, and the same account must keep its links). A mailbox without the id does not sync.
 */
export function accountKey(mailbox: { oauthAccountId?: string | null }): string {
  return `sub:${mailbox.oauthAccountId}`;
}

function roundContext(
  deps: CalendarSyncDeps,
  mailbox: SyncMailbox,
  accessToken: string,
  now: Date,
  report: CalendarSyncReport,
  deadline: number
): SyncContext {
  return {
    prisma: deps.prisma,
    gateway: deps.gatewayFor ? deps.gatewayFor({ id: mailbox.id }) : defaultGateway(),
    tokens: tokensFor(accessToken, mailbox.grantedScopes, now),
    // The caller has checked that the mailbox is a user's own (it has a userId).
    mailbox: {
      id: mailbox.id,
      tenantId: mailbox.tenantId,
      userId: mailbox.userId as string,
      account: accountKey(mailbox),
    },
    now,
    hasTime: () => deps.now().getTime() < deadline,
    report,
    failed: new Map(),
  };
}

async function syncMailbox(
  deps: CalendarSyncDeps,
  claim: Claim,
  now: Date,
  report: CalendarSyncReport
): Promise<void> {
  const mailbox: SyncMailbox | null = await deps.prisma.emailMailbox.findFirst({
    where: { id: claim.id },
  });
  if (!mailbox) return;
  const nextRound = new Date(now.getTime() + CALENDAR_SYNC_INTERVAL_MS);
  // The row can change between the claim and this read: check again what the claim looked for.
  if (
    !mailbox.userId ||
    mailbox.kind !== 'GMAIL' ||
    mailbox.scope !== 'USER' ||
    mailbox.status !== 'ACTIVE' ||
    mailbox.calendarStatus !== 'ACTIVE' ||
    !hasGoogleCalendar(mailbox.grantedScopes)
  ) {
    await release(deps, claim, mailbox.tokenVersion, { calendarNextSyncAt: nextRound });
    return;
  }
  // Connected without Google's account id (its lookup failed, or it was connected before the id was kept):
  // the calendar stays off and the reconnect card is shown, until a connect captures the id. The mail
  // keeps working.
  if (!mailbox.oauthAccountId) {
    report.reconnects += 1;
    await release(deps, claim, mailbox.tokenVersion, { calendarStatus: 'NEEDS_RECONNECT' });
    return;
  }
  // No Google client in this process (its env lacks it): a setup gap, not a mailbox failure.
  if (!hasOAuthClient(deps.transports, 'GMAIL')) {
    await release(deps, claim, mailbox.tokenVersion, { calendarNextSyncAt: nextRound });
    logNoClient(claim.id, mailbox.kind, oauthClientEnvNames(mailbox.kind));
    return;
  }

  // What the pull finished stays, even when the push then fails.
  const progress: Record<string, unknown> = {};
  let version = mailbox.tokenVersion;
  try {
    let access = await getOAuthAccess(deps.prisma, mailbox, deps.transports, now);
    version = access.tokenVersion;
    const deadline = deps.now().getTime() + MAILBOX_BUDGET_MS;
    // Google's changes first, then Aurora's: what the pull finished stays even if the push fails.
    // Where a retry in this run resumes: the latest saved state, not the one the run began with.
    let saved = mailbox.calendarSyncToken;
    const round = async (accessToken: string) => {
      const ctx = roundContext(deps, mailbox, accessToken, now, report, deadline);
      ctx.rememberState = (state) => {
        saved = state;
      };
      const pulled = await pullChanges(ctx, saved);
      saved = pulled.syncToken;
      progress.calendarSyncToken = pulled.syncToken;
      return { pulled, pushed: await pushChanges(ctx, { patch: pulled.complete }) };
    };
    let done: { pulled: PullResult; pushed: PushResult };
    try {
      done = await round(access.accessToken);
    } catch (error) {
      if (!(error instanceof CalendarAuthenticationError)) throw error;
      // The access token may just have run out during the round: drop it and go again with a fresh
      // one, once (both directions are idempotent). Refused again, the permission is gone.
      forgetAccessToken(mailbox.id);
      access = await getOAuthAccess(deps.prisma, mailbox, deps.transports, now);
      version = access.tokenVersion;
      done = await round(access.accessToken);
    }
    const { pulled, pushed } = done;
    report.mailboxesSynced += 1;
    await release(deps, claim, version, {
      calendarSyncToken: pulled.syncToken,
      calendarSyncedAt: now,
      calendarFailureCount: 0,
      // More to do: due again on the next tick (after Google's wait, if it asked for one); caught up:
      // wait the interval.
      calendarNextSyncAt:
        pulled.complete && pushed.complete
          ? nextRound
          : new Date(deps.now().getTime() + (pulled.retryAfterMs ?? 0)),
    });
  } catch (error) {
    // Google says the permission is not there (never granted or withdrawn): stop until reconnected.
    if (error instanceof CalendarAuthenticationError) {
      report.reconnects += 1;
      await release(deps, claim, version, { ...progress, calendarStatus: 'NEEDS_RECONNECT' });
      return;
    }
    report.failures += 1;
    const failures = mailbox.calendarFailureCount + 1;
    // Google's own wait, when it gave one, is a minimum on top of the (capped) backoff.
    const asked = error instanceof CalendarRateLimitError ? error.retryAfterSeconds * 1000 : 0;
    const backoff = Math.min(CALENDAR_SYNC_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
    await release(deps, claim, version, {
      ...progress,
      calendarFailureCount: failures,
      calendarNextSyncAt: new Date(deps.now().getTime() + Math.max(backoff, asked)),
    });
    logFailure(claim.id, error);
  }
}

/** Class name and codes only: never an event title, an address or a token. */
function logFailure(mailboxId: string, error: unknown, log: Pick<Console, 'warn'> = console): void {
  const code = error instanceof MailboxTransportError ? error.code : undefined;
  log.warn('[calendar-sync] round failed', { mailboxId, ...errorCause(error), code });
}

/** One tick: sync the due mailboxes, one claim at a time, within the tick budget. */
export async function runCalendarSync(deps: CalendarSyncDeps): Promise<CalendarSyncReport> {
  const report = newReport();
  const startedAt = deps.now().getTime();
  for (let i = 0; i < MAILBOXES_PER_TICK; i++) {
    const claimedAt = deps.now();
    if (claimedAt.getTime() - startedAt >= TICK_BUDGET_MS) break;
    const claim = await claimNext(deps, claimedAt);
    if (!claim) break;
    await syncMailbox(deps, claim, claimedAt, report);
  }
  return report;
}

/** GOOGLE_CALENDAR_SYNC=off turns the calendar sync off in this process (the inbox sync keeps running). */
export function calendarSyncEnabled(env: NodeJS.ProcessEnv): boolean {
  return (env.GOOGLE_CALENDAR_SYNC ?? '').trim().toLowerCase() !== 'off';
}

/** Production wiring: the shared encrypted Prisma client and the container's transports. */
export async function createCalendarSyncDeps(): Promise<CalendarSyncDeps> {
  const [{ prisma }, { container }] = await Promise.all([
    import('@intelliflow/db'),
    import('../../container.js'),
  ]);
  const adapters = container.adapters as unknown as { mailboxTransports: MailboxTransports };
  return { prisma, transports: adapters.mailboxTransports, now: () => new Date() };
}

/**
 * The calendar sync's part of the shared tick. It never throws, so it can follow the inbox sync in a
 * `finally`: a failure here is logged and the next tick tries again. Mailboxes are due every four
 * minutes whatever the tick's interval, so a faster tick does not sync more often.
 */
export async function runCalendarSyncTick(
  env: NodeJS.ProcessEnv,
  log: Pick<Console, 'warn' | 'info'> = console
): Promise<void> {
  if (!calendarSyncEnabled(env)) return;
  try {
    const report = await runCalendarSync(await createCalendarSyncDeps());
    if (report.mailboxesSynced + report.failures + report.reconnects > 0) {
      log.info('[calendar-sync] tick', report);
    }
  } catch (error) {
    log.warn('[calendar-sync] tick failed', errorCause(error));
  }
}
