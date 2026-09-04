/**
 * Prisma implementation of HelpArticleAnalyticsRepository (IFC-304 PR A).
 *
 * Privacy-preserving daily aggregates. No user/session identity is stored.
 *
 * Atomic + idempotent write model: the counter increment and the idempotency
 * guard insert run in a single interactive transaction, with the guard insert
 * FIRST. On a retry the guard insert raises a unique violation (P2002) before
 * the increment ever runs, aborting the transaction with no partial writes —
 * see recordWithDedup() for why the guard runs first rather than last.
 * When no idempotency key is supplied, counting is at-least-once by design
 * (the privacy tradeoff of retaining no session identity).
 */

import { Prisma, type PrismaClient } from '@intelliflow/db';
import { analyticsRetentionCutoff, dedupExpiry, toUtcDay } from '@intelliflow/domain';
import type {
  AnalyticsPurgeResult,
  HelpArticleAnalyticsRepository,
  RecordAnalyticsResult,
  RecordArticleViewInput,
  RecordSearchNoResultInput,
} from '@intelliflow/application';

/** Minimal transaction-client shape used by the increment callbacks. */
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Sentinel thrown internally (never escapes recordWithDedup) to unwind
 * $transaction's callback when the idempotency guard's OWN insert hits a
 * unique-constraint replay. See recordWithDedup() for why this exists
 * instead of inspecting the P2002's error metadata.
 */
const DEDUP_REPLAY = Symbol('help-article-analytics:dedup-replay');

export class PrismaHelpArticleAnalyticsRepository implements HelpArticleAnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordArticleView(input: RecordArticleViewInput): Promise<RecordAnalyticsResult> {
    const day = toUtcDay(input.occurredAt ?? new Date());
    return this.recordWithDedup(
      input.tenantId,
      input.idempotencyKey ? `view:${input.idempotencyKey}` : undefined,
      (tx) =>
        tx.helpArticleViewDaily.upsert({
          where: {
            tenantId_articleId_day: {
              tenantId: input.tenantId,
              articleId: input.articleId,
              day,
            },
          },
          create: {
            tenantId: input.tenantId,
            articleId: input.articleId,
            day,
            viewCount: 1,
          },
          update: { viewCount: { increment: 1 } },
        })
    );
  }

  async recordSearchNoResult(input: RecordSearchNoResultInput): Promise<RecordAnalyticsResult> {
    if (!input.normalizedTerm) {
      return { recorded: false, deduped: false };
    }
    const day = toUtcDay(input.occurredAt ?? new Date());
    return this.recordWithDedup(
      input.tenantId,
      input.idempotencyKey ? `search:${input.idempotencyKey}` : undefined,
      (tx) =>
        tx.helpArticleSearchNoResultDaily.upsert({
          where: {
            tenantId_normalizedTerm_day: {
              tenantId: input.tenantId,
              normalizedTerm: input.normalizedTerm,
              day,
            },
          },
          create: {
            tenantId: input.tenantId,
            normalizedTerm: input.normalizedTerm,
            day,
            searchCount: 1,
          },
          update: { searchCount: { increment: 1 } },
        })
    );
  }

  async getArticleViewTotal(tenantId: string, articleId: string): Promise<number> {
    const agg = await this.prisma.helpArticleViewDaily.aggregate({
      where: { tenantId, articleId },
      _sum: { viewCount: true },
    });
    return agg._sum.viewCount ?? 0;
  }

  async getSearchNoResultTotal(tenantId: string, normalizedTerm: string): Promise<number> {
    const agg = await this.prisma.helpArticleSearchNoResultDaily.aggregate({
      where: { tenantId, normalizedTerm },
      _sum: { searchCount: true },
    });
    return agg._sum.searchCount ?? 0;
  }

  async purgeExpired(now: Date = new Date(), batchSize = 100): Promise<AnalyticsPurgeResult> {
    const cutoff = analyticsRetentionCutoff(now);

    const dedupPurged = await this.batchDelete(batchSize, async (take) => {
      const rows = await this.prisma.helpArticleAnalyticsDedup.findMany({
        where: { expiresAt: { lt: now } },
        select: { id: true },
        take,
      });
      if (rows.length === 0) return 0;
      const { count } = await this.prisma.helpArticleAnalyticsDedup.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      return rows.length < take ? -count : count;
    });

    const viewDailyPurged = await this.batchDelete(batchSize, async (take) => {
      const rows = await this.prisma.helpArticleViewDaily.findMany({
        where: { day: { lt: cutoff } },
        select: { id: true },
        take,
      });
      if (rows.length === 0) return 0;
      const { count } = await this.prisma.helpArticleViewDaily.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      return rows.length < take ? -count : count;
    });

    const searchNoResultPurged = await this.batchDelete(batchSize, async (take) => {
      const rows = await this.prisma.helpArticleSearchNoResultDaily.findMany({
        where: { day: { lt: cutoff } },
        select: { id: true },
        take,
      });
      if (rows.length === 0) return 0;
      const { count } = await this.prisma.helpArticleSearchNoResultDaily.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      return rows.length < take ? -count : count;
    });

    return {
      viewDailyPurged,
      searchNoResultPurged,
      dedupPurged,
      totalPurged: viewDailyPurged + searchNoResultPurged + dedupPurged,
    };
  }

  /**
   * Run one increment in a transaction, with the idempotency guard insert
   * FIRST: a duplicate key aborts the transaction (no partial writes, no
   * double count) before `increment` ever runs.
   *
   * codex-review (IFC-304 PR A, two passes) on the earlier "guard last"
   * design: it decided "this P2002 is a replay, skip it" by inspecting
   * `err.code`/`err.meta`, which cannot reliably tell the guard's own
   * conflict apart from an unrelated P2002 elsewhere in the transaction. A
   * fix attempt tried discriminating on `err.meta?.target` — which does not
   * even exist in this project's actual runtime shape (Prisma 7.8.0 +
   * `@prisma/adapter-pg`); reproduced against the real test DB, a P2002
   * there carries `err.meta.modelName` + a nested `driverAdapterError`, not
   * `target`. Chasing the driver's error shape is exactly the kind of
   * inference that keeps breaking. This makes the property structural
   * instead: only a P2002 thrown by THIS specific statement (the guard's
   * own insert) is ever treated as a replay — identified by WHERE it was
   * thrown (guard-first, its own try/catch), never by inspecting what the
   * error claims. A P2002 from `increment` is never caught here and
   * propagates naturally, because nothing in this function wraps it.
   */
  private async recordWithDedup(
    tenantId: string,
    namespacedKey: string | undefined,
    increment: (tx: Tx) => Promise<unknown>
  ): Promise<RecordAnalyticsResult> {
    try {
      await this.prisma.$transaction(async (tx) => {
        if (namespacedKey) {
          try {
            await tx.helpArticleAnalyticsDedup.create({
              data: {
                tenantId,
                idempotencyKey: namespacedKey,
                expiresAt: dedupExpiry(new Date()),
              },
            });
          } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              throw DEDUP_REPLAY;
            }
            throw err;
          }
        }
        await increment(tx);
      });
      return { recorded: true, deduped: false };
    } catch (err) {
      if (err === DEDUP_REPLAY) {
        return { recorded: false, deduped: true };
      }
      throw err;
    }
  }

  /**
   * Batch-delete driver. `step(take)` returns the number deleted this batch, or
   * a negative value to signal "this was the final (partial) batch, stop after".
   */
  private async batchDelete(
    batchSize: number,
    step: (take: number) => Promise<number>
  ): Promise<number> {
    let total = 0;
    for (;;) {
      const result = await step(batchSize);
      if (result === 0) break;
      if (result < 0) {
        total += -result;
        break;
      }
      total += result;
    }
    return total;
  }
}
