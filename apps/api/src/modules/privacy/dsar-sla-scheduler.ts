/**
 * DSAR deadline alerts (PG-203, plan D8; spec "SLA job" and security should-fixes 6 and 7).
 *
 * Its own module and its own interval: it does not share the approval sweep's timer. Started
 * from `startApiServer` only (never `createApiServer`, which tests use), stopped on SIGTERM,
 * and disabled under test, on serverless runtimes and when `DSAR_SLA_INTERVAL_MS=0`.
 *
 * A tick alerts up to 50 requests, each in its own short transaction on the unscoped client, so
 * a slow provider can never roll back the markers of alerts already sent (codex):
 * - `pg_try_advisory_xact_lock` keeps it to one replica; the others skip the tick.
 * - One VERIFIED request inside 7 days of its effective deadline (`extendedUntil ?? slaDeadline`),
 *   or past it, is claimed `FOR UPDATE SKIP LOCKED`, alerted and marked, and the transaction
 *   commits before the next one is claimed.
 * - The firm's admins get one email per request; with no admin, the firm's owner (its earliest
 *   active user, the account that set it up); with neither, an error log with the tenant id.
 * - `slaAlertedAt` is set only after the provider accepts the email. A request that could not be
 *   alerted (refused send, nobody to alert) is put aside in this process for 6 hours, so the next
 *   ticks claim past it and a backlog of undeliverable requests never starves the rest; another
 *   replica or a restart may try it sooner, which is harmless.
 * - An overdue request is alerted again every 3 days, and a deadline moved by an extension gets a
 *   fresh alert in its new window.
 *
 * The email carries the type, deadline, request reference and page link: no personal data.
 */
import type { DsarRequestType } from '@intelliflow/domain';
import { buildAdminSlaEmail, deliverDsarEmail, type EmailSender } from './dsar-email';

export const DEFAULT_DSAR_SLA_INTERVAL_MS = 3_600_000;
/** Distinct from the approval sweep's key (1_980_001). */
export const DSAR_SLA_LOCK_KEY = 2_030_001;
/** The most alerts one tick sends. */
export const DSAR_SLA_BATCH = 50;
export const DSAR_SLA_WARN_DAYS = 7;
export const DSAR_SLA_REPEAT_DAYS = 3;
/** How long a request that could not be alerted is put aside before it is tried again. */
export const DSAR_SLA_RETRY_MS = 6 * 3_600_000;
const DAY_MS = 86_400_000;
const PAGE_PATH = '/settings/privacy-requests';

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
/** Request id → time (ms) before which this process does not try it again. */
const deferredRequests = new Map<string, number>();

/** The interval to use, or 0 when the alerts must not run in this process. */
export function dsarSlaIntervalFromEnv(env: NodeJS.ProcessEnv): number {
  if (env.NODE_ENV === 'test' || env.VITEST) return 0;
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return 0;
  const raw = env.DSAR_SLA_INTERVAL_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_DSAR_SLA_INTERVAL_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_DSAR_SLA_INTERVAL_MS;
  return Math.floor(value);
}

export interface StartDsarSlaSchedulerOptions {
  intervalMs: number;
  run: () => Promise<unknown>;
  log?: Pick<Console, 'warn' | 'info'>;
}

/** Start the interval; returns false when disabled or already started. */
export function startDsarSlaScheduler({
  intervalMs,
  run,
  log = console,
}: StartDsarSlaSchedulerOptions): boolean {
  if (intervalMs <= 0 || timer !== null) return false;
  timer = setInterval(() => {
    // Skip a tick while the previous one is still running.
    if (running) return;
    running = true;
    run()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`[dsar-sla] tick failed: ${message}`);
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  log.info(`[dsar-sla] started (every ${String(intervalMs)} ms)`);
  return true;
}

/** Stops the alerts (SIGTERM, tests). */
export function stopDsarSlaScheduler(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  running = false;
  deferredRequests.clear();
}

// ── The sweep ────────────────────────────────────────────────────────────────

export interface DueDsarRequest {
  id: string;
  tenantId: string;
  type: DsarRequestType;
  /** The effective deadline: `extendedUntil ?? slaDeadline`. */
  deadline: Date;
}

/** What one transaction may do while it holds the sweep lock. */
export interface DsarSlaTx {
  /** Due requests, oldest deadline first, leaving out `excludeIds`. */
  claimDue(now: Date, limit: number, excludeIds: string[]): Promise<DueDsarRequest[]>;
  /** Admin addresses, else the owner's, else none. */
  recipients(tenantId: string): Promise<string[]>;
  markAlerted(id: string, at: Date): Promise<void>;
}

export interface DsarSlaStore {
  /** Runs `fn` in a transaction holding the sweep lock; null when another replica holds it. */
  withSweepLock<T>(fn: (tx: DsarSlaTx) => Promise<T>): Promise<T | null>;
}

export interface DsarSlaDeps {
  store: DsarSlaStore;
  sender: EmailSender | undefined;
  appUrl: () => string;
  now: () => Date;
  log: Pick<Console, 'info' | 'warn' | 'error'>;
  /** Requests put aside after a failed alert (defaults to this process's own). */
  deferred?: Map<string, number>;
}

export type DsarSlaReport =
  | { skipped: 'LOCKED' | 'NO_SENDER' }
  | { claimed: number; alerted: number; failed: number; noRecipient: number };

export async function runDsarSlaSweep(deps: DsarSlaDeps): Promise<DsarSlaReport> {
  const { sender, log } = deps;
  if (!sender) {
    // Claiming without a way to send would only hold row locks for nothing.
    log.warn('[dsar-sla] No email sender configured');
    return { skipped: 'NO_SENDER' };
  }
  const now = deps.now();
  let base = deps.appUrl();
  while (base.endsWith('/')) base = base.slice(0, -1);
  const pageUrl = `${base}${PAGE_PATH}`;
  const deferred = deps.deferred ?? deferredRequests;
  for (const [id, retryAt] of deferred) {
    if (retryAt <= now.getTime()) deferred.delete(id);
  }
  const putAside = (id: string) => deferred.set(id, now.getTime() + DSAR_SLA_RETRY_MS);

  const counts = { claimed: 0, alerted: 0, failed: 0, noRecipient: 0 };
  const recipientsByTenant = new Map<string, string[]>();
  for (let i = 0; i < DSAR_SLA_BATCH; i += 1) {
    const outcome = await deps.store.withSweepLock(async (tx) => {
      const [request] = await tx.claimDue(now, 1, [...deferred.keys()]);
      if (!request) return 'EMPTY' as const;
      counts.claimed += 1;
      let to = recipientsByTenant.get(request.tenantId);
      if (to === undefined) {
        to = await tx.recipients(request.tenantId);
        recipientsByTenant.set(request.tenantId, to);
        if (to.length === 0) {
          log.error('[dsar-sla] No admin or owner to alert', { tenantId: request.tenantId });
        }
      }
      if (to.length === 0) {
        counts.noRecipient += 1;
        putAside(request.id);
        return 'DONE' as const;
      }
      const email = buildAdminSlaEmail(
        {
          requestId: request.id,
          type: request.type,
          deadline: request.deadline,
          overdue: request.deadline.getTime() <= now.getTime(),
          pageUrl,
        },
        to
      );
      if (await deliverDsarEmail(sender, email, 'ADMIN_SLA', log)) {
        await tx.markAlerted(request.id, now);
        counts.alerted += 1;
      } else {
        counts.failed += 1;
        putAside(request.id);
      }
      return 'DONE' as const;
    });
    if (outcome === null) {
      if (i === 0) return { skipped: 'LOCKED' };
      break; // another replica took over mid-tick
    }
    if (outcome === 'EMPTY') break;
  }
  return counts;
}

// ── The Prisma store ─────────────────────────────────────────────────────────

interface UserWhere {
  tenantId: string;
  role?: 'ADMIN';
  NOT: { memberships: { some: { tenantId: string; revokedAt: { not: null } } } };
}

export interface DsarSlaPrismaTx {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  user: {
    findMany(args: { where: UserWhere; select: { email: true } }): Promise<{ email: string }[]>;
    findFirst(args: {
      where: UserWhere;
      orderBy: Array<{ createdAt: 'asc' } | { id: 'asc' }>;
      select: { email: true };
    }): Promise<{ email: string } | null>;
  };
}

export interface DsarSlaPrisma {
  $transaction<T>(
    fn: (tx: DsarSlaPrismaTx) => Promise<T>,
    options: { maxWait: number; timeout: number }
  ): Promise<T>;
}

/** Same scope as PrismaDsarRepository.adminEmails: the firm's own, unrevoked users. */
function activeUsersOf(tenantId: string, role?: 'ADMIN'): UserWhere {
  return {
    tenantId,
    ...(role ? { role } : {}),
    NOT: { memberships: { some: { tenantId, revokedAt: { not: null } } } },
  };
}

function prismaSlaTx(tx: DsarSlaPrismaTx): DsarSlaTx {
  return {
    async claimDue(now, limit, excludeIds) {
      const warnUntil = new Date(now.getTime() + DSAR_SLA_WARN_DAYS * DAY_MS);
      const repeatBefore = new Date(now.getTime() - DSAR_SLA_REPEAT_DAYS * DAY_MS);
      return tx.$queryRaw<DueDsarRequest[]>`
        SELECT id, "tenantId", type::text AS type,
               COALESCE("extendedUntil", "slaDeadline") AS deadline
          FROM dsar_requests
         WHERE status = 'VERIFIED'
           AND COALESCE("extendedUntil", "slaDeadline") <= ${warnUntil}
           AND ("slaAlertedAt" IS NULL
                OR "slaAlertedAt" < COALESCE("extendedUntil", "slaDeadline")
                                    - make_interval(days => ${DSAR_SLA_WARN_DAYS}::int)
                OR (COALESCE("extendedUntil", "slaDeadline") <= ${now}
                    AND "slaAlertedAt" <= ${repeatBefore}))
           AND NOT (id = ANY(${excludeIds}))
         ORDER BY COALESCE("extendedUntil", "slaDeadline"), id
         LIMIT ${limit}
           FOR UPDATE SKIP LOCKED`;
    },
    async recipients(tenantId) {
      const admins = await tx.user.findMany({
        where: activeUsersOf(tenantId, 'ADMIN'),
        select: { email: true },
      });
      if (admins.length > 0) return admins.map((a) => a.email);
      const owner = await tx.user.findFirst({
        where: activeUsersOf(tenantId),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { email: true },
      });
      return owner ? [owner.email] : [];
    },
    async markAlerted(id, at) {
      await tx.$executeRaw`UPDATE dsar_requests SET "slaAlertedAt" = ${at} WHERE id = ${id}`;
    },
  };
}

export function createPrismaDsarSlaStore(prisma: DsarSlaPrisma): DsarSlaStore {
  return {
    withSweepLock<T>(fn: (tx: DsarSlaTx) => Promise<T>): Promise<T | null> {
      return prisma.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`
            SELECT pg_try_advisory_xact_lock(${DSAR_SLA_LOCK_KEY}) AS locked`;
          if (!lock?.locked) return null;
          return fn(prismaSlaTx(tx));
        },
        // One send (the transport allows 10 s) runs inside the transaction holding its row lock.
        { maxWait: 10_000, timeout: 60_000 }
      );
    },
  };
}

/** Production wiring: the shared unscoped client, the container's email sender, APP_URL. */
export async function createDsarSlaDeps(): Promise<DsarSlaDeps> {
  const [{ prisma }, { container }, { requiredProdEnv }] = await Promise.all([
    import('@intelliflow/db'),
    import('../../container.js'),
    import('@intelliflow/validators/required-url'),
  ]);
  return {
    store: createPrismaDsarSlaStore(prisma as unknown as DsarSlaPrisma),
    sender: container.adapters.notificationService,
    appUrl: () => requiredProdEnv('APP_URL', process.env.APP_URL, 'http://localhost:3000'),
    now: () => new Date(),
    log: console,
  };
}
