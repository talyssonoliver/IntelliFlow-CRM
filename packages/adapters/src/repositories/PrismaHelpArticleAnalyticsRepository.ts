/**
 * Prisma implementation of HelpArticleAnalyticsRepository (IFC-304 PR A).
 *
 * Privacy-preserving daily aggregates. No user/session identity is stored.
 *
 * Atomic + idempotent write model: the counter increment and the idempotency
 * guard insert run in a single interactive transaction, with the guard insert
 * LAST. On a retry the guard insert raises a unique violation (P2002) which
 * rolls the whole transaction back, so the increment is never applied twice.
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
 * Is this P2002 the idempotency guard firing, or a different unique violation?
 *
 * Only the dedup table's unique index carries `idempotencyKey`
 * (`help_article_analytics_dedup_tenantId_idempotencyKey_key`); the daily
 * aggregates are keyed on tenant/article/day and tenant/term/day. Treating ANY
 * P2002 as "already counted" is unsafe: the increment is a Prisma `upsert`,
 * which is not atomic against a concurrent insert, so two racing upserts on the
 * same aggregate key can raise P2002 from the create branch. That would report
 * a successful dedup while the increment was actually lost — silently
 * undercounting, with no error and no log, which is precisely the failure this
 * class exists to prevent.
 *
 * The shape of `err.meta` differs by driver, so gather every place the offending
 * constraint can surface. Under Prisma 7's pg driver adapter there is NO
 * `meta.target` at all — it reports:
 *
 *   meta.modelName = 'HelpArticleAnalyticsDedup'
 *   meta.driverAdapterError.cause.constraint.fields = ['"tenantId"', '"idempotencyKey"']
 *   ...cause.originalMessage = 'duplicate key value violates unique constraint
 *                               "help_article_analytics_dedup_tenantId_idempotencyKey_key"'
 *
 * while other drivers populate `meta.target` as a field array or a raw index
 * name. Matching only `meta.target` silently rethrew every genuine replay on the
 * real database.
 */
function isDedupGuardConflict(err: Prisma.PrismaClientKnownRequestError): boolean {
  const meta = (err.meta ?? {}) as Record<string, any>;

  // Most reliable signal when present: the failing write's own model.
  if (meta.modelName === 'HelpArticleAnalyticsDedup') return true;

  const cause = meta.driverAdapterError?.cause;
  const candidates: unknown[] = [
    ...(Array.isArray(meta.target) ? meta.target : [meta.target]),
    ...(Array.isArray(cause?.constraint?.fields) ? cause.constraint.fields : []),
    cause?.constraint?.name,
    cause?.constraint,
    cause?.originalMessage,
  ];

  return candidates.some((c) => typeof c === 'string' && /idempotency_?key/i.test(c));
}

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
   * Run one increment in a transaction, appending the idempotency guard last so
   * a duplicate key rolls the whole transaction back (no double count).
   */
  private async recordWithDedup(
    tenantId: string,
    namespacedKey: string | undefined,
    increment: (tx: Tx) => Promise<unknown>
  ): Promise<RecordAnalyticsResult> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await increment(tx);
        if (namespacedKey) {
          await tx.helpArticleAnalyticsDedup.create({
            data: {
              tenantId,
              idempotencyKey: namespacedKey,
              expiresAt: dedupExpiry(new Date()),
            },
          });
        }
      });
      return { recorded: true, deduped: false };
    } catch (err) {
      if (
        namespacedKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        isDedupGuardConflict(err)
      ) {
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
