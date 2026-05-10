/**
 * IFC-212: QueueAIService — AIServicePort adapter over BullMQ.
 *
 * Implements `AIServicePort` from `@intelliflow/application` by enqueueing
 * scoring jobs to the existing `ai-scoring` queue (consumed by
 * `apps/ai-worker`). The result is awaited via `job.waitUntilFinished()` and
 * mapped to `LeadScoringResult` for the application caller.
 *
 * Composed under `GuardrailsAIService` in `apps/api/src/container.ts:327` so
 * the existing IFC-125 audit-log + bias-detection wrap-and-decorate pattern
 * continues to fire on every call.
 *
 * Spec: .specify/sprints/sprint-18/specifications/IFC-212-spec.md
 * Plan: .specify/sprints/sprint-18/planning/IFC-212-plan.md
 */

import { Result, type DomainError } from '@intelliflow/domain';
import {
  type AIServicePort,
  type AIServiceCallOptions,
  type LeadScoringInput,
  type LeadScoringResult,
  PersistenceError,
  ValidationError,
  LEAD_SCORE_THRESHOLDS,
} from '@intelliflow/application';
import { QUEUE_NAMES, getBullMQConnectionOptions } from '@intelliflow/platform/queues';
import type { ConnectionOptions } from '@intelliflow/platform/queues';
import { context as otelContext, propagation } from '@opentelemetry/api';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

// Type-only imports — the runtime values are dynamic-imported in ensureInit() to keep
// `bullmq` off the cold-start dep graph for non-queue AI providers (mock/ollama/litellm).
import type { Queue, QueueEvents, Job } from 'bullmq';

// ============================================================================
// IFC-212: Mirror of apps/ai-worker/src/jobs/scoring.job.ts ScoringJobResultSchema.
// Defined inline to avoid a cross-package runtime dependency from @intelliflow/api
// on @intelliflow/ai-worker. Drift between this mirror and the worker's schema is
// caught by apps/ai-worker/src/jobs/__tests__/scoring.job.contract.test.ts.
// ============================================================================
const ScoringJobResultMirror = z.object({
  leadId: z.string(),
  score: z.number(),
  confidence: z.number(),
  tier: z.string(),
  factors: z.array(z.unknown()),
  recommendations: z.array(z.string()),
  modelVersion: z.string(),
  processedAt: z.string(),
  processingTimeMs: z.number(),
});

// ============================================================================
// Public options
// ============================================================================
export interface QueueAIServiceOptions {
  /** Override BullMQ connection (default: `getBullMQConnectionOptions()`). */
  connection?: ConnectionOptions;
  /** waitUntilFinished timeout in ms. Default 60_000 (matches NF-002 SLA ceiling). */
  resultTimeoutMs?: number;
  /** TenantId injected into payloads when caller-side tenantId is omitted. Default 'default'. */
  defaultTenantId?: string;
  /** When true, eagerly initialize Queue + QueueEvents on construction. Default false. */
  eagerInit?: boolean;
  /** Override queue name (default: `QUEUE_NAMES.AI_SCORING` = 'ai-scoring'). */
  queueName?: string;
}

// ============================================================================
// QueueAIService
// ============================================================================
export class QueueAIService implements AIServicePort {
  private queue: Queue | null = null;
  private events: QueueEvents | null = null;
  private initPromise: Promise<void> | null = null; // mutex for lazy init
  private closed = false;
  private readonly opts: Required<QueueAIServiceOptions>;

  constructor(opts: QueueAIServiceOptions = {}) {
    this.opts = {
      connection: opts.connection ?? getBullMQConnectionOptions(),
      resultTimeoutMs: opts.resultTimeoutMs ?? 60_000,
      defaultTenantId: opts.defaultTenantId ?? 'default',
      eagerInit: opts.eagerInit ?? false,
      queueName: opts.queueName ?? QUEUE_NAMES.AI_SCORING,
    };
    if (this.opts.eagerInit) {
      // Fire-and-forget: first scoreLead call awaits the same initPromise.
      void this.ensureInit().catch(() => {
        // Swallow eager-init errors; subsequent calls observe via initPromise rejection
        // OR re-attempt by clearing initPromise and retrying.
      });
    }
  }

  /**
   * Lazy-init the BullMQ Queue + QueueEvents pair. Concurrent calls share a single
   * promise so we never double-initialize (NF-007).
   */
  private async ensureInit(): Promise<void> {
    if (this.queue && this.events) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        // Dynamic import keeps cold-start unchanged for non-queue providers (NF-008).
        const { Queue: QueueCtor, QueueEvents: QueueEventsCtor } = await import('bullmq');
        this.queue = new QueueCtor(this.opts.queueName, { connection: this.opts.connection });
        this.events = new QueueEventsCtor(this.opts.queueName, {
          connection: this.opts.connection,
        });
      })().catch((err) => {
        // Reset so the next caller can retry init.
        this.initPromise = null;
        throw err;
      });
    }
    await this.initPromise;
  }

  /**
   * Enqueue a lead scoring job to the `ai-scoring` BullMQ queue and await the worker
   * result via `waitUntilFinished`. On any failure path returns `Result.fail` —
   * never throws unhandled (AC-004).
   *
   * IFC-212 audit fix (HIGH-1): when `opts.tenantId` / `opts.leadId` are provided
   * (LeadService threads them through), the payload uses them. Falls back to
   * `defaultTenantId` + a synthesized UUID only when the caller is system-context
   * (no real lead) — e.g. ad-hoc warm-ups. Eliminates the `tenantId='default'`
   * regression that broke per-tenant feature flags + LeadAIInsight FK upserts.
   *
   * The second positional argument also accepts a string for backwards
   * compatibility with the original `tenantIdOverride` signature.
   */
  /** Normalize the overloaded opts-or-tenantId argument into a plain options object.
   * IFC-212: input.tenantId / input.leadId (threaded from LeadService) take precedence over
   * caller opts so the queue payload is always tagged with the real entity values. */
  private resolveScoreLeadOpts(
    input: LeadScoringInput,
    optsOrTenantId: AIServiceCallOptions | string | undefined
  ): { tenantId: string; leadId: string } {
    const opts: AIServiceCallOptions =
      typeof optsOrTenantId === 'string' ? { tenantId: optsOrTenantId } : (optsOrTenantId ?? {});
    return {
      tenantId: opts.tenantId ?? input.tenantId ?? this.opts.defaultTenantId,
      leadId: opts.leadId ?? input.leadId ?? randomUUID(),
    };
  }

  async scoreLead(
    input: LeadScoringInput,
    optsOrTenantId?: AIServiceCallOptions | string
  ): Promise<Result<LeadScoringResult, DomainError>> {
    if (this.closed) {
      return Result.fail(new PersistenceError('QueueAIService is closed'));
    }
    const { tenantId, leadId } = this.resolveScoreLeadOpts(input, optsOrTenantId);

    try {
      await this.ensureInit();
    } catch (err) {
      return Result.fail(
        new PersistenceError(
          `AI scoring queue connect failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
    if (!this.queue || !this.events) {
      return Result.fail(new PersistenceError('AI scoring queue not initialized'));
    }

    // OTel carrier injection — parents the worker span under the API request trace
    // (NF-005 observability).
    const carrier: Record<string, string> = {};
    propagation.inject(otelContext.active(), carrier);

    const payload = {
      // IFC-212 audit fix: leadId comes from opts.leadId when LeadService threads
      // it through (the production path), else synthesized for system-context calls.
      leadId,
      tenantId,
      lead: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        company: input.company,
        title: input.title,
        phone: input.phone,
        source: input.source,
      },
      correlationId: `lead-score-${input.email}-${Date.now()}`,
      _otelCarrier: carrier,
    };

    let job: Job;
    try {
      job = (await this.queue.add('score-lead', payload)) as Job;
    } catch (err) {
      return Result.fail(
        new PersistenceError(
          `AI scoring enqueue failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }

    let raw: unknown;
    try {
      raw = await job.waitUntilFinished(this.events, this.opts.resultTimeoutMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/timed out|timeout/i.test(msg)) {
        return Result.fail(new PersistenceError(`AI scoring queue timeout: ${msg}`));
      }
      return Result.fail(new PersistenceError(`AI scoring job failed: ${msg}`));
    }

    // Defensive schema validation — mirror catches structural drift before mapping.
    const parsed = ScoringJobResultMirror.safeParse(raw);
    if (!parsed.success) {
      return Result.fail(new PersistenceError('Invalid scoring result shape'));
    }
    const { score, confidence, modelVersion } = parsed.data;
    if (confidence < 0 || confidence > 1) {
      return Result.fail(new PersistenceError('Invalid scoring result: confidence out of range'));
    }

    return Result.ok({
      score,
      confidence,
      modelVersion,
      factors: undefined,
      reasoning: undefined,
    });
  }

  /**
   * Delegates to scoreLead and returns `score >= AUTO_QUALIFY` (75) (AC-005).
   * IFC-212 audit fix: forwards opts so the underlying queue payload is tagged with
   * the caller's real tenantId / leadId.
   */
  async qualifyLead(
    input: LeadScoringInput,
    opts?: AIServiceCallOptions
  ): Promise<Result<boolean, DomainError>> {
    const r = await this.scoreLead(input, opts);
    if (r.isFailure) return Result.fail(r.error);
    return Result.ok(r.value.score >= LEAD_SCORE_THRESHOLDS.AUTO_QUALIFY);
  }

  /**
   * Port-completeness only — no production caller of `aiService.generateEmail`. Email
   * generation should be wired through a dedicated email queue, NOT the ai-scoring
   * queue. Returns `Result.fail(ValidationError)` per spec AC-006.
   */
  async generateEmail(_leadId: string, _template: string): Promise<Result<string, DomainError>> {
    return Result.fail(
      new ValidationError(
        'generateEmail not supported by QueueAIService — requires dedicated email generation queue'
      )
    );
  }

  /**
   * Close producer-side Queue + QueueEvents. Idempotent (AC-007).
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const queue = this.queue;
    const events = this.events;
    this.queue = null;
    this.events = null;
    this.initPromise = null;
    await Promise.allSettled([queue?.close(), events?.close()]);
  }
}
