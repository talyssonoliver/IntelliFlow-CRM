/**
 * Unit tests for notification-email-worker.ts (#230 fold)
 *
 * Verifies that bootNotificationEmailWorker registers a BullMQ Worker for
 * intelliflow-notifications-email without requiring a live Redis connection,
 * and that the job processor matches the REAL payload shape produced by
 * apps/api/src/modules/ticket/ticket.router.ts's notifyAssignee()
 * ({ type, recipientUserId, tenantId, subject, body, entityType, entityId } —
 * NOT the old notifications-worker NotificationJobSchema, which required a
 * `recipient.email` field the real producer never sends).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { Result } from '@intelliflow/domain';

// ---------------------------------------------------------------------------
// BullMQ mock — tracks constructor calls and close() invocations
// ---------------------------------------------------------------------------

const bullmqCalls: {
  Queue: unknown[][];
  Worker: unknown[][];
  workerOn: Array<[string, unknown]>;
  closed: { worker: number; queue: number };
} = {
  Queue: [],
  Worker: [],
  workerOn: [],
  closed: { worker: 0, queue: 0 },
};

vi.mock('bullmq', () => {
  class MockQueue {
    constructor(...args: unknown[]) {
      bullmqCalls.Queue.push(args);
    }
    async close() {
      bullmqCalls.closed.queue++;
    }
  }
  class MockWorker {
    constructor(...args: unknown[]) {
      bullmqCalls.Worker.push(args);
    }
    on(event: string, handler: unknown) {
      bullmqCalls.workerOn.push([event, handler]);
    }
    async close() {
      bullmqCalls.closed.worker++;
    }
  }
  return { Queue: MockQueue, Worker: MockWorker };
});

import {
  bootNotificationEmailWorker,
  createPrismaUserEmailLookup,
  processNotificationEmailJob,
  EMAIL_NOTIFICATIONS_QUEUE,
  type NotificationServiceLike,
  type UserEmailLookup,
} from '../notification-email-worker.js';

describe('bootNotificationEmailWorker', () => {
  const redisConn = { host: 'localhost', port: 6379 };
  const logger = pino({ level: 'silent' });
  const users: UserEmailLookup = { findUserEmail: vi.fn().mockResolvedValue(null) };
  const notificationService: NotificationServiceLike = {
    sendEmail: vi.fn().mockResolvedValue(Result.ok({ id: 'n1', channel: 'email', status: 'sent' })),
  };

  beforeEach(() => {
    bullmqCalls.Queue.length = 0;
    bullmqCalls.Worker.length = 0;
    bullmqCalls.workerOn.length = 0;
    bullmqCalls.closed.worker = 0;
    bullmqCalls.closed.queue = 0;
  });

  it('registers a Worker for intelliflow-notifications-email', async () => {
    await bootNotificationEmailWorker(redisConn, { users, notificationService }, logger);

    const worker = bullmqCalls.Worker.find((args) => args[0] === EMAIL_NOTIFICATIONS_QUEUE);
    expect(worker, `expected Worker for ${EMAIL_NOTIFICATIONS_QUEUE}`).toBeDefined();
  });

  it('passes the redis connection to the Worker constructor', async () => {
    const conn = { host: '10.0.0.1', port: 6380, username: 'redis-conn-fixture' };
    await bootNotificationEmailWorker(conn, { users, notificationService }, logger);

    const opts = bullmqCalls.Worker[0]?.[2] as { connection: typeof conn };
    expect(opts?.connection).toMatchObject(conn);
  });

  it('registers a "failed" event listener on the worker', async () => {
    await bootNotificationEmailWorker(redisConn, { users, notificationService }, logger);

    const failedHandlers = bullmqCalls.workerOn.filter(([ev]) => ev === 'failed');
    expect(failedHandlers.length).toBeGreaterThanOrEqual(1);
  });

  it('returns a handle whose stop() closes the worker and queue', async () => {
    const handle = await bootNotificationEmailWorker(
      redisConn,
      { users, notificationService },
      logger
    );

    await handle.stop();

    expect(bullmqCalls.closed.worker).toBe(1);
    expect(bullmqCalls.closed.queue).toBe(1);
  });
});

describe('queue name constant', () => {
  it('EMAIL_NOTIFICATIONS_QUEUE matches the producer value in ticket.router.ts', () => {
    expect(EMAIL_NOTIFICATIONS_QUEUE).toBe('intelliflow-notifications-email');
  });
});

// ---------------------------------------------------------------------------
// Processor execution — drives processNotificationEmailJob directly against
// injected fakes (mirrors the dependency-injection style of
// ingestion-workers.ts; no real Prisma or email provider involved).
// ---------------------------------------------------------------------------

function job(data: Record<string, unknown>, id = 'job-1') {
  return { id, data } as unknown as import('bullmq').Job<any>;
}

const silentLogger = pino({ level: 'silent' });

describe('processNotificationEmailJob', () => {
  it('resolves recipientUserId to an email via the injected lookup, then sends', async () => {
    const findUserEmail = vi.fn().mockResolvedValue('alice@example.com');
    const sendEmail = vi
      .fn()
      .mockResolvedValue(
        Result.ok({ id: 'n1', channel: 'email', status: 'sent', providerMessageId: 'msg-1' })
      );

    const result = await processNotificationEmailJob(
      job({
        type: 'ticket_assigned',
        recipientUserId: 'user-1',
        tenantId: 'tenant-1',
        subject: 'Ticket assigned: Printer broken',
        body: 'Ticket "Printer broken" has been assigned to you.',
        entityType: 'ticket',
        entityId: 'ticket-9',
      }),
      {
        users: { findUserEmail },
        notificationService: { sendEmail },
        logger: silentLogger,
      }
    );

    expect(findUserEmail).toHaveBeenCalledWith('user-1', 'tenant-1');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = sendEmail.mock.calls[0][0] as {
      to: string[];
      subject: string;
      textBody: string;
      htmlBody: string;
    };
    expect(call.to).toEqual(['alice@example.com']);
    expect(call.subject).toBe('Ticket assigned: Printer broken');
    expect(call.textBody).toBe('Ticket "Printer broken" has been assigned to you.');
    expect(call.htmlBody).toContain('INTELLIFLOW'); // brand-wrapped, not a bare string
    expect(result).toEqual({ delivered: true, messageId: 'msg-1' });
  });

  it('uses recipientEmail directly when present, without calling the user lookup', async () => {
    const findUserEmail = vi.fn();
    const sendEmail = vi
      .fn()
      .mockResolvedValue(Result.ok({ id: 'n2', channel: 'email', status: 'sent' }));

    await processNotificationEmailJob(
      job({
        type: 'custom',
        recipientEmail: 'direct@example.com',
        tenantId: 'tenant-1',
        subject: 'Hi',
        body: 'Body',
      }),
      { users: { findUserEmail }, notificationService: { sendEmail }, logger: silentLogger }
    );

    expect(findUserEmail).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail.mock.calls[0][0] as { to: string[] }).to).toEqual(['direct@example.com']);
  });

  it('skips delivery and does not call sendEmail when no email can be resolved', async () => {
    const findUserEmail = vi.fn().mockResolvedValue(null);
    const sendEmail = vi.fn();

    const result = await processNotificationEmailJob(
      job({
        type: 'ticket_assigned',
        recipientUserId: 'user-ghost',
        tenantId: 'tenant-1',
        subject: 'Ticket assigned',
        body: 'body',
      }),
      { users: { findUserEmail }, notificationService: { sendEmail }, logger: silentLogger }
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: false, reason: 'no-recipient-email' });
  });

  it('skips delivery when the job carries neither recipientUserId nor recipientEmail', async () => {
    const findUserEmail = vi.fn();
    const sendEmail = vi.fn();

    const result = await processNotificationEmailJob(
      job({ type: 'custom', tenantId: 'tenant-1', subject: 'Hi', body: 'Body' }),
      { users: { findUserEmail }, notificationService: { sendEmail }, logger: silentLogger }
    );

    expect(findUserEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: false, reason: 'no-recipient-email' });
  });

  it('throws when the email provider fails, so BullMQ retries via the queue backoff policy', async () => {
    // codex-review finding failed-email-completes-job: a resolved
    // { delivered: false } reads as a successful job to BullMQ, so the
    // producer's attempts/backoff never applies and the failure is silently
    // dropped instead of retried (or DLQ'd after exhausting retries).
    const findUserEmail = vi.fn().mockResolvedValue('bob@example.com');
    const sendEmail = vi.fn().mockResolvedValue(Result.fail(new Error('provider down')));

    await expect(
      processNotificationEmailJob(
        job({
          type: 'ticket_assigned',
          recipientUserId: 'user-2',
          tenantId: 'tenant-1',
          subject: 'Ticket assigned',
          body: 'body',
        }),
        { users: { findUserEmail }, notificationService: { sendEmail }, logger: silentLogger }
      )
    ).rejects.toThrow('provider down');
  });

  it('throws on a malformed job (missing required fields) so BullMQ retries/fails it', async () => {
    const findUserEmail = vi.fn();
    const sendEmail = vi.fn();

    await expect(
      processNotificationEmailJob(job({ type: 'custom' }), {
        users: { findUserEmail },
        notificationService: { sendEmail },
        logger: silentLogger,
      })
    ).rejects.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// createPrismaUserEmailLookup — thin Prisma adapter for the real boot path
// ---------------------------------------------------------------------------

describe('createPrismaUserEmailLookup', () => {
  it('returns the user email when the user has a current membership of the tenant', async () => {
    const findFirst = vi.fn().mockResolvedValue({ email: 'carol@example.com' });
    const lookup = createPrismaUserEmailLookup({ user: { findFirst } });

    const email = await lookup.findUserEmail('user-3', 'tenant-1');

    expect(email).toBe('carol@example.com');
    expect(findFirst).toHaveBeenCalledTimes(1);
    const args = findFirst.mock.calls[0][0] as {
      where: { id: string; OR: Array<Record<string, unknown>> };
      select: unknown;
    };
    expect(args.where.id).toBe('user-3');
    expect(args.where.OR[0]).toEqual({
      memberships: {
        some: {
          tenantId: 'tenant-1',
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        },
      },
    });
    // implicit home membership: users.tenantId matches and no row exists for the tenant
    expect(args.where.OR[1]).toEqual({
      tenantId: 'tenant-1',
      memberships: { none: { tenantId: 'tenant-1' } },
    });
    expect(args.select).toEqual({ email: true });
  });

  it('returns null when the user does not exist or has no current membership', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const lookup = createPrismaUserEmailLookup({ user: { findFirst } });

    expect(await lookup.findUserEmail('ghost', 'tenant-1')).toBeNull();
  });

  it('never looks a user up by id alone (regression: unscoped-recipient-lookup)', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const lookup = createPrismaUserEmailLookup({ user: { findFirst } });

    await lookup.findUserEmail('user-3', 'tenant-other');

    const where = (findFirst.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(Object.keys(where)).toContain('OR');
    expect(JSON.stringify(where)).toContain('tenant-other');
  });
});

describe('processNotificationEmailJob tenant scoping', () => {
  it('skips delivery and logs when the recipient has no current membership of the job tenant', async () => {
    const findUserEmail = vi.fn(async (_u: string, tenantId: string) =>
      tenantId === 'tenant-1' ? 'dave@example.com' : null
    );
    const sendEmail = vi.fn();
    const warn = vi.fn();
    const logger = { child: () => ({ warn, info: vi.fn() }) } as unknown as pino.Logger;

    const result = await processNotificationEmailJob(
      job({
        type: 'ticket_assigned',
        recipientUserId: 'user-4',
        tenantId: 'tenant-revoked',
        subject: 'Ticket assigned',
        body: 'body',
      }),
      { users: { findUserEmail }, notificationService: { sendEmail }, logger }
    );

    expect(findUserEmail).toHaveBeenCalledWith('user-4', 'tenant-revoked');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(result).toEqual({ delivered: false, reason: 'no-recipient-email' });
  });
});
