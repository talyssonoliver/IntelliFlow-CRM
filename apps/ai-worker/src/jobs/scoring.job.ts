/**
 * Lead Scoring Job Handler
 *
 * BullMQ job handler for processing lead scoring requests.
 *
 * @module ai-worker/jobs/scoring
 * @task IFC-168
 */

import { UnrecoverableError, type Job } from 'bullmq';
import { z } from 'zod';
import { recordIdSchema } from '@intelliflow/validators/record-id';
import pino from 'pino';
import { LeadScoringChain } from '../chains/scoring.chain';
import { classifyError } from '../monitoring/otel-ai-metrics';
import type { LeadInput, ScoringResult } from '../chains/scoring.chain';
import { logAIAgentAction } from '../utils/audit-log';
import { getLLMBreaker, resolveFallbackProvider } from '../lib/llm-factory';
import { isPurposeCeilingReached } from '../lib/purpose-ceiling';
import { isMonthlyBudgetExceeded } from '../lib/monthly-budget';
import { requiresHumanReview } from '@intelliflow/domain';
import type { CircuitBreaker } from '../utils/circuit-breaker';
import { runWithLogContext, getCurrentLogContext } from '@intelliflow/observability';
import { isAiFeatureEnabled } from '../lib/feature-flags';
import {
  dispatchCandidateIds,
  restrictedEmails,
  scorableLeads,
  scoringBlockedBy,
  writeIfStillEligible,
  type ScoringBlock,
} from '../lib/data-request-guard';
import { getBullMQConnectionOptions } from '@intelliflow/platform/queues/connection';

const logger = pino({
  name: 'scoring-job',
  level: process.env.LOG_LEVEL || 'info',
  mixin: () => getCurrentLogContext() ?? {},
});

// ============================================================================
// Types
// ============================================================================

/** Queue name for scoring jobs */
export const SCORING_QUEUE = 'ai-scoring';

/** Lead tier based on score */
export type LeadTier = 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';

/** Schema for scoring job data */
export const ScoringJobDataSchema = z.object({
  leadId: recordIdSchema,
  tenantId: recordIdSchema,
  lead: z.object({
    email: z.email(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    title: z.string().optional(),
    phone: z.string().optional(),
    source: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  correlationId: z.string().optional(),
  priority: z.number().min(1).max(10).default(5),
  /** W3C traceparent carrier injected by enqueue-side for distributed trace propagation */
  _otelCarrier: z.record(z.string(), z.string()).optional(),
  /**
   * #1218: 'service' when LeadService asked for the score (through QueueAIService). It then
   * writes the lead itself, in its own transaction with the status rules, so the job must not.
   * Absent for the automatic paths (lead creation, scheduled dispatcher): the job writes it.
   */
  leadScoreWriter: z.enum(['service']).optional(),
});

export type ScoringJobData = z.infer<typeof ScoringJobDataSchema>;

/** Schema for scoring job result */
export const ScoringJobResultSchema = z.object({
  leadId: recordIdSchema,
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  tier: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
  factors: z.array(
    z.object({
      name: z.string(),
      impact: z.number(),
      reasoning: z.string(),
    })
  ),
  recommendations: z.array(z.string()),
  modelVersion: z.string(),
  /** Confidence under the LEAD_SCORING review threshold: the score must not change status. */
  requiresReview: z.boolean().optional(),
  processedAt: z.iso.datetime(),
  processingTimeMs: z.number(),
});

export type ScoringJobResult = z.infer<typeof ScoringJobResultSchema>;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute lead tier from score
 */
function computeTier(score: number): LeadTier {
  if (score >= 80) return 'HOT';
  if (score >= 60) return 'WARM';
  if (score >= 30) return 'COLD';
  return 'UNQUALIFIED';
}

/** Map lead tier to churn risk level. */
function churnRiskFromTier(tier: LeadTier): 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' {
  if (tier === 'HOT') return 'MINIMAL';
  if (tier === 'WARM') return 'LOW';
  if (tier === 'COLD') return 'MEDIUM';
  return 'HIGH';
}

/** Map score to sentiment label. */
function sentimentFromScore(score: number): 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' {
  if (score >= 65) return 'POSITIVE';
  if (score >= 35) return 'NEUTRAL';
  return 'NEGATIVE';
}

/** Map score to ICP match label. */
function icpMatchFromScore(score: number): string {
  if (score >= 80) return 'Strong Match';
  if (score >= 60) return 'Good Match';
  return 'Partial Match';
}

/**
 * Generate recommendations based on tier and score
 */
function generateRecommendations(tier: LeadTier, score: number): string[] {
  switch (tier) {
    case 'HOT':
      return [
        'Schedule immediate follow-up call',
        'Assign to senior sales rep',
        'Prepare custom proposal',
      ];
    case 'WARM':
      return [
        'Send personalized email sequence',
        'Schedule discovery call within 48 hours',
        'Add to nurture campaign',
      ];
    case 'COLD':
      return [
        'Add to long-term nurture campaign',
        'Monitor engagement metrics',
        'Re-evaluate in 30 days',
      ];
    case 'UNQUALIFIED':
      return [
        'Archive for potential future outreach',
        'Request additional information if available',
        score > 0 ? 'Add to educational content list' : 'No action recommended',
      ];
  }
}

// ============================================================================
// Constants
// ============================================================================

/** LLM inference timeout for scoring (120 s — matches insight job pattern). */
const LLM_TIMEOUT_MS = 120_000;

/**
 * Nil UUID used as the placeholder `leadId` on the scheduled cron sentinel job
 * (see ai-worker.ts registerScheduledJobs). It does NOT correspond to a real
 * Lead row, so it must never reach a `leadAIInsight` upsert — doing so violates
 * the `lead_ai_insights_leadId_fkey` foreign key. The sentinel is routed to the
 * dispatcher and the persist step skips it defensively.
 */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// ============================================================================
// Fallback Scoring
// ============================================================================

/**
 * Wrap LLM scoring in a Promise.race timeout + circuit-breaker catch, with one try on the
 * secondary provider. Throws ScoringFailedError when no provider produced a usable score.
 * Returns `{ result, usedFallback }` (usedFallback stays false: a heuristic is never used).
 */
async function generateScoringWithFallback(
  job: Job<ScoringJobData>,
  chain: LeadScoringChain,
  input: LeadInput,
  timeoutMs: number,
  breaker: CircuitBreaker
): Promise<{ result: ScoringResult; usedFallback: boolean }> {
  // The fallback provider's failure, if it was tried: it decides the class as well (codex).
  let fallbackOutcome: unknown;
  try {
    const scored = await Promise.race([
      scoreThroughBreaker(breaker, () => chain.scoreLead(input, { leadId: job.data.leadId })),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`LLM scoring timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    return { result: scored, usedFallback: false };
  } catch (error) {
    // #324: before dropping to the heuristic, try the SECONDARY provider once
    // (e.g. AI_FALLBACK_PROVIDER=litellm when OpenRouter's free tier rate-limits
    // or is unavailable). A real LLM result beats the heuristic; one shot, no
    // breaker, so a hard outage still falls through to the heuristic quickly.
    const fallbackProvider = resolveFallbackProvider();
    if (fallbackProvider) {
      try {
        const fallbackChain = new LeadScoringChain({
          tenantId: job.data.tenantId,
          provider: fallbackProvider,
          // IFC-117: another provider's scores would read as a distribution shift.
          recordDrift: false,
        });
        const scored = await Promise.race([
          fallbackChain.scoreLead(input, { leadId: job.data.leadId }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`fallback LLM scoring timed out after ${timeoutMs}ms`)),
              timeoutMs
            )
          ),
        ]);
        logger.warn(
          {
            jobId: job.id,
            fallbackProvider,
            // Error classes only: a provider error can echo prompt or lead text (NF-002).
            primaryErrorClass: classifyError(error),
          },
          'Primary LLM scoring failed — recovered via fallback provider'
        );
        return { result: scored, usedFallback: false };
      } catch (fallbackError) {
        fallbackOutcome = fallbackError;
        logger.warn(
          {
            jobId: job.id,
            fallbackProvider,
            errorClass: classifyError(fallbackError),
          },
          'Fallback provider also failed'
        );
      }
    }

    // #1218 (owner ruling): when no provider produced a usable score, the scoring FAILED. A
    // made-up heuristic number is no longer saved as if a model had scored the lead.
    const errorClass = scoringErrorClass(error, fallbackOutcome);
    // A provider that did not answer (429, timeout, outage) may answer on a retry, even when
    // the other one was inconclusive: such a failure keeps its retries.
    const providerFault =
      !isInconclusive(error) || (fallbackOutcome !== undefined && !isInconclusive(fallbackOutcome));
    logger.warn(
      { jobId: job.id, errorClass, providerFault },
      'Lead scoring failed on every provider — reporting FAILED, no score saved'
    );
    throw new ScoringFailedError(errorClass, providerFault);
  }
}

/**
 * The class a failed job reports. An inconclusive answer (confidence 0 or no factors) is told
 * apart from a provider failure, so the API can answer "no usable score" rather than a server
 * error once the failure crosses the queue (codex, #1218).
 */
export const SCORING_INCONCLUSIVE_CLASS = 'inconclusive';

/**
 * Matched by name (ScoringInconclusiveError in chains/scoring.chain), so it holds across module
 * copies and test doubles.
 */
function isInconclusive(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'ScoringInconclusiveError';
}

/** Claude declined this lead's content (stop_reason refusal): the provider itself is fine. */
function isContentRefusal(error: unknown): boolean {
  const e = error as { name?: unknown; stopReason?: unknown } | null;
  return e?.name === 'AnthropicIncompleteResponseError' && e.stopReason === 'refusal';
}

/** Inconclusive when any provider that answered gave no usable score; else the primary's class. */
function scoringErrorClass(primary: unknown, fallback?: unknown): string {
  if (isInconclusive(primary) || isInconclusive(fallback)) return SCORING_INCONCLUSIVE_CLASS;
  return classifyError(primary);
}

/**
 * Run a scoring call through the provider's circuit breaker. Some failures say nothing about the
 * provider, so they are not counted as breaker failures: an inconclusive answer or a content
 * refusal (the provider is up and answered about this lead), a tenant's monthly budget refusal
 * and the worker-wide monthly AI budget refusal (no provider was called). The breaker is shared by every tenant, so counting them
 * would block scoring for everyone. All are still rethrown for this lead (codex, #1218).
 */
async function scoreThroughBreaker(
  breaker: CircuitBreaker,
  score: () => Promise<ScoringResult>
): Promise<ScoringResult> {
  const outcome = await breaker.execute(async () => {
    try {
      return { scored: await score() };
    } catch (error) {
      if (
        isInconclusive(error) ||
        isContentRefusal(error) ||
        isPurposeCeilingReached(error) ||
        isMonthlyBudgetExceeded(error)
      )
        return { notCounted: error };
      throw error;
    }
  });
  if ('notCounted' in outcome) throw outcome.notCounted;
  return outcome.scored;
}

/** No provider produced a usable score. The job fails, so nothing is persisted as a score. */
export class ScoringFailedError extends Error {
  readonly errorClass: string;
  /** A provider failed without answering, so a retry may still produce a score. */
  readonly providerFault: boolean;
  constructor(errorClass: string, providerFault = errorClass !== SCORING_INCONCLUSIVE_CLASS) {
    // The API maps "Lead scoring failed (inconclusive)" (also with the suffix) to "no usable
    // score". Only the exact message, with no provider fault, is a terminal outcome.
    const suffix =
      errorClass === SCORING_INCONCLUSIVE_CLASS && providerFault ? ' after a provider error' : '';
    super(`Lead scoring failed (${errorClass})${suffix}`);
    this.name = 'ScoringFailedError';
    this.errorClass = errorClass;
    this.providerFault = providerFault;
  }
}

const TERMINAL_INCONCLUSIVE_MESSAGE = `Lead scoring failed (${SCORING_INCONCLUSIVE_CLASS})`;

/**
 * True for a queue failure reason that is an expected outcome, not a fault: a scoring every
 * provider answered without a usable score. The worker logs it as a warning and never
 * dead-letters it. A failure that also had a provider fault is not one.
 */
export function isExpectedJobFailure(failedReason: string | undefined): boolean {
  return (failedReason ?? '').trim() === TERMINAL_INCONCLUSIVE_MESSAGE;
}

/**
 * True when the scoring ended because the model answered without a usable score and no
 * provider failed: a retry would give the same answer.
 */
export function isInconclusiveScoring(error: unknown): boolean {
  return (
    error instanceof ScoringFailedError &&
    error.errorClass === SCORING_INCONCLUSIVE_CLASS &&
    !error.providerFault
  );
}

/**
 * The error the queue worker throws for a failed scoring job. An inconclusive answer is an
 * expected outcome, not a fault: the same lead gives the same answer on a retry, so it fails
 * once, without retries or the dead-letter queue (BullMQ skips both for UnrecoverableError).
 * The message stays "Lead scoring failed (inconclusive)", which the API maps to "no usable
 * score". Every other failure is returned as it is, and keeps its retries.
 */
export function toScoringJobFailure(error: unknown): unknown {
  if (!isInconclusiveScoring(error)) return error;
  // `expected` keeps the shared worker's failure logs at warning level (worker-shared
  // isExpectedJobOutcome).
  return Object.assign(new UnrecoverableError((error as Error).message), { expected: true });
}

/**
 * Mark a never-scored lead FAILED after an automatic scoring was inconclusive, so it reads as
 * a failed scoring instead of an untouched one. Only a lead still at NONE is changed: a failed
 * re-score never hides an earlier score. Runs under the same lead lock and data-request
 * re-check as the score write, and never throws: the job's outcome is already decided.
 */
async function markAutomaticScoringFailed(
  leadId: string,
  tenantId: string,
  email: string
): Promise<void> {
  try {
    const { prisma } = await loadDb();
    await writeIfStillEligible(
      prisma as never,
      { leadId, tenantId, email },
      async (tx) =>
        (
          tx as unknown as {
            $executeRaw: (s: TemplateStringsArray, ...v: unknown[]) => Promise<number>;
          }
        ).$executeRaw`
        UPDATE leads SET "scoringStatus" = 'FAILED'::"LeadScoringStatus"
        WHERE id = ${leadId} AND "tenantId" = ${tenantId}
          AND "scoringStatus" = 'NONE'::"LeadScoringStatus"`
    );
  } catch (err) {
    logger.warn(
      { leadId, tenantId, errorClass: classifyError(err) },
      'Could not mark the lead as failed scoring'
    );
  }
}

/** Convenience accessor for the scoring circuit breaker (purpose='scoring', tier='free'). */
function getScoringBreaker(): CircuitBreaker {
  return getLLMBreaker('scoring', 'free');
}

// ============================================================================
// Job Handler
// ============================================================================

/**
 * The DB module, imported once and shared. Concurrent jobs each awaiting their own dynamic
 * import could otherwise resolve it more than once (vitest did, handing one job the real
 * client instead of the mock).
 */
let dbModule: Promise<typeof import('@intelliflow/db')> | undefined;
function loadDb(): Promise<typeof import('@intelliflow/db')> {
  dbModule ??= import('@intelliflow/db');
  return dbModule;
}

/** The lead columns the dispatcher reads to queue a per-lead job. */
interface DispatchLead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  source: string | null;
}

const DISPATCH_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  company: true,
  title: true,
  phone: true,
  source: true,
} as const;
/** Leads queued per tenant per run. */
export const DISPATCH_BATCH = 100;

/**
 * Up to DISPATCH_BATCH scorable leads of one tenant. PG-203 (owner Q18): restricted and
 * erased people are excluded IN the query, on the normalised address and before the limit
 * (dispatchCandidateIds), so they never fill the batch and starve everyone else (codex).
 */
async function nextDispatchBatch(
  prisma: any,
  tenantId: string,
  staleThreshold: Date
): Promise<DispatchLead[]> {
  const restricted = await restrictedEmails(prisma, tenantId);
  const ids = await dispatchCandidateIds(prisma, {
    tenantId,
    restricted,
    staleBefore: staleThreshold,
    limit: DISPATCH_BATCH,
  });
  if (ids.length === 0) return [];
  const rows: DispatchLead[] = await prisma.lead.findMany({
    where: { tenantId, id: { in: ids } },
    select: DISPATCH_SELECT,
    orderBy: { id: 'asc' },
  });
  // Belt and braces: the same rule in code.
  return scorableLeads(prisma, tenantId, rows, restricted);
}

/**
 * Handle the scheduled cron sentinel — enumerate unscored/stale leads and enqueue per-lead jobs.
 */
async function handleScheduledDispatch(
  job: Job<ScoringJobData>,
  startTime: number
): Promise<ScoringJobResult> {
  const { leadId } = job.data;
  logger.info(
    { jobId: job.id },
    'Scheduled scoring dispatcher — enumerating unscored leads per tenant'
  );
  let enqueued = 0;

  try {
    const { prisma } = await loadDb();
    const { Queue } = await import('bullmq');

    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Step 1: find distinct tenants that have any unscored / stale leads
    const tenantsWithUnscoredLeads = await (prisma as any).lead.groupBy({
      by: ['tenantId'],
      where: {
        // PG-203: an erased lead (erased-<id>@erased.invalid) is never scored again.
        NOT: { email: { endsWith: '@erased.invalid' } },
        OR: [
          { aiInsights: { none: {} } },
          { aiInsights: { some: { updatedAt: { lt: staleThreshold } } } },
        ],
      },
      _count: { id: true },
    });

    if (tenantsWithUnscoredLeads.length === 0) {
      logger.info(
        { jobId: job.id },
        'No tenants with unscored leads — skipping scheduled dispatch'
      );
      return {
        leadId,
        score: 0,
        confidence: 0,
        tier: 'UNQUALIFIED',
        factors: [],
        recommendations: [],
        modelVersion: 'scheduler-dispatcher',
        processedAt: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
      };
    }

    const queue = new Queue(SCORING_QUEUE, {
      connection: getBullMQConnectionOptions(),
    });

    // Step 2: for each tenant, run a scoped query and enqueue per-lead jobs
    for (const tenantRow of tenantsWithUnscoredLeads) {
      const tenantId: string = tenantRow.tenantId;
      let tenantEnqueued = 0;
      for (const l of await nextDispatchBatch(prisma as any, tenantId, staleThreshold)) {
        await queue.add(
          'score-lead',
          {
            leadId: l.id,
            tenantId,
            lead: {
              email: l.email,
              firstName: l.firstName ?? undefined,
              lastName: l.lastName ?? undefined,
              company: l.company ?? undefined,
              title: l.title ?? undefined,
              phone: l.phone ?? undefined,
              source: l.source ?? 'unknown',
            },
          },
          DEFAULT_SCORING_JOB_OPTIONS
        );
        tenantEnqueued++;
        enqueued++;
      }

      // Step 4: log per-tenant batch counts
      logger.info(
        { jobId: job.id, tenantId, batchSize: tenantEnqueued },
        'Enqueued scoring batch for tenant'
      );
    }

    await queue.close();

    logger.info(
      { jobId: job.id, tenantsProcessed: tenantsWithUnscoredLeads.length, leadsEnqueued: enqueued },
      'Scheduled scoring dispatcher completed'
    );
  } catch (error) {
    logger.error(
      // The class only: a Prisma or queue error can quote row values (NF-002).
      { jobId: job.id, errorClass: classifyError(error) },
      'Scheduled scoring dispatcher failed'
    );
  }

  return {
    leadId,
    score: 0,
    confidence: 0,
    tier: 'UNQUALIFIED',
    factors: [],
    recommendations: [],
    modelVersion: 'scheduler-dispatcher',
    processedAt: new Date().toISOString(),
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * #1218: an automatic scoring records the score on the lead too, so the lead does not read as
 * "not scored". It runs inside the locked, eligibility-checked transaction of the insight write.
 * Score fields only: the status is never changed here (auto-qualify stays in LeadService).
 * updatedAt moves, so a slower manual scoring's failure mark (guarded on the updatedAt it read)
 * cannot hide this newer score (codex).
 */
async function writeAutomaticLeadScore(
  tx: unknown,
  leadId: string,
  tenantId: string,
  result: ScoringResult
): Promise<void> {
  const scoringStatus = requiresHumanReview(result.confidence, 'LEAD_SCORING')
    ? 'NEEDS_REVIEW'
    : 'SCORED';
  const now = new Date();
  await (tx as { $executeRaw: (s: TemplateStringsArray, ...v: unknown[]) => Promise<number> })
    .$executeRaw`
    UPDATE leads SET score = ${Math.round(result.score)},
      "scoringStatus" = ${scoringStatus}::"LeadScoringStatus", "scoredAt" = ${now},
      "updatedAt" = ${now}
    WHERE id = ${leadId} AND "tenantId" = ${tenantId}`;
}

/**
 * Persist scoring result to LeadAIInsight table, and for an automatic scoring
 * (`writeLeadScore`) the lead's own score fields.
 */
async function persistScoringResult(
  leadId: string,
  tenantId: string,
  email: string,
  result: ScoringResult,
  tier: LeadTier,
  recommendations: string[],
  writeLeadScore: boolean
): Promise<ScoringBlock | 'UNVERIFIED' | null> {
  // Defensive guard: never upsert against a placeholder / unresolved leadId.
  // The scheduled cron sentinel uses NIL_UUID, and no real Lead row exists for
  // it — an upsert here violates lead_ai_insights_leadId_fkey. Skip and log
  // instead of letting the FK constraint blow up the job.
  if (!leadId || leadId === NIL_UUID) {
    logger.warn(
      { leadId, tenantId },
      'Skipping LeadAIInsight persist — leadId is unresolved/placeholder (no Lead row)'
    );
    return null;
  }

  try {
    const { prisma: rawPrisma } = await loadDb();
    const prisma = rawPrisma as unknown as import('@intelliflow/db').PrismaClient;
    const churnRisk = churnRiskFromTier(tier);

    // PG-203: the person may have been erased or restricted while the AI call ran. The write
    // happens only under the lead row lock, after re-checking (codex: no insight resurrection).
    const outcome = await writeIfStillEligible(
      prisma as never,
      { leadId, tenantId, email },
      async (tx) => {
        if (writeLeadScore) await writeAutomaticLeadScore(tx, leadId, tenantId, result);
        return (tx as unknown as typeof prisma).leadAIInsight.upsert({
          where: { leadId_tenantId: { leadId, tenantId } },
          create: {
            leadId,
            tenantId,
            engagementScore: Math.min(100, result.score),
            conversionProbability: Math.min(100, Math.round(result.score * 0.8)),
            estimatedValue: 0,
            churnRisk,
            nextBestAction: recommendations[0] || 'Review lead',
            sentiment: sentimentFromScore(result.score),
            sentimentTrend: 'stable',
            recommendations,
            lastEngagementDays: 0,
            icpMatch: icpMatchFromScore(result.score),
          },
          update: {
            engagementScore: Math.min(100, result.score),
            conversionProbability: Math.min(100, Math.round(result.score * 0.8)),
            churnRisk,
            nextBestAction: recommendations[0] || 'Review lead',
            recommendations,
          },
        });
      }
    );
    if (!outcome.written) {
      logger.info(
        { leadId, tenantId, reason: outcome.reason },
        'Scoring result discarded — data request'
      );
      return outcome.reason;
    }

    logger.info({ leadId, score: result.score, tier }, 'Persisted scoring result to LeadAIInsight');

    // H4: emit AI_AGENT audit entry — non-fatal (warn and continue on failure)
    await logAIAgentAction({
      tenantId,
      agentName: 'scoring-job',
      resourceType: 'LeadAIInsight',
      resourceId: leadId,
      action: 'UPSERT',
    }).catch((err: unknown) => {
      logger.warn({ leadId, err }, 'audit-log: logAIAgentAction failed (non-fatal)');
    });
  } catch (error) {
    logger.error(
      // The class only: a Prisma error can quote row values (NF-002).
      { leadId, errorClass: classifyError(error) },
      'Failed to persist scoring result'
    );
    // The locked re-check did not complete, so the person's eligibility is unknown: the score
    // is not returned either (fails closed, codex).
    return 'UNVERIFIED';
  }
  return null;
}

/**
 * Process a lead scoring job
 *
 * @param job - BullMQ job containing lead data
 * @returns Scoring result with score, confidence, and recommendations
 */
export async function processScoringJob(job: Job<ScoringJobData>): Promise<ScoringJobResult> {
  const validatedData = ScoringJobDataSchema.parse(job.data);

  return runWithLogContext(
    {
      correlationId: validatedData.correlationId ?? job.id ?? undefined,
      tenantId: validatedData.tenantId,
    },
    async () => {
      const startTime = Date.now();
      const { leadId, lead } = validatedData;

      // Scheduled cron sentinel → fan out per-lead jobs instead of "scoring" a
      // placeholder. The sentinel is identified by either the explicit
      // '__scheduled__' tenant or the NIL_UUID placeholder leadId (the cron job
      // registered in ai-worker.ts uses the system tenant + NIL_UUID lead). This
      // prevents both a wasted LLM call and the downstream FK violation that
      // occurred when the NIL_UUID lead fell through to persistScoringResult.
      if (validatedData.tenantId === '__scheduled__' || leadId === NIL_UUID) {
        return handleScheduledDispatch(job, startTime);
      }

      // Feature-flag gate — checked after tenantId validation, before LLM work
      if (!isAiFeatureEnabled('ai.scoring.enabled', validatedData.tenantId)) {
        logger.info(
          { jobId: job.id, tenantId: validatedData.tenantId },
          'AI scoring job skipped — feature flag disabled'
        );
        return { skipped: true, reason: 'feature-flag-disabled' } as unknown as ScoringJobResult;
      }

      // PG-203 (owner Q18, sign-off 8): re-read the lead before any AI call. A job may have
      // been queued before the person was restricted or erased, or before an email change.
      const { prisma: guardPrisma } = await loadDb();
      const blocked = await scoringBlockedBy(guardPrisma as never, {
        leadId,
        tenantId: validatedData.tenantId,
        email: lead.email,
      });
      if (blocked) {
        logger.info(
          { jobId: job.id, leadId, tenantId: validatedData.tenantId, reason: blocked },
          'AI scoring job skipped — data request'
        );
        return { skipped: true, reason: blocked } as unknown as ScoringJobResult;
      }

      const chainInput: LeadInput = {
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        title: lead.title,
        phone: lead.phone,
        source: lead.source,
        metadata: lead.metadata,
      };

      await job.updateProgress(10);

      await job.extendLock(job.token!, 300_000); // 5 minutes — prevent stall detection during LLM call
      const breaker = getScoringBreaker();
      // Construct per-job chain with tenantId so versioned configs are resolved per-tenant
      const chainInstance = new LeadScoringChain({ tenantId: validatedData.tenantId });
      let scoring: Awaited<ReturnType<typeof generateScoringWithFallback>>;
      try {
        scoring = await generateScoringWithFallback(
          job,
          chainInstance,
          chainInput,
          LLM_TIMEOUT_MS,
          breaker
        );
      } catch (error) {
        // An automatic scoring writes the lead itself; LeadService marks its own (service) jobs.
        if (isInconclusiveScoring(error) && validatedData.leadScoreWriter !== 'service') {
          await markAutomaticScoringFailed(leadId, validatedData.tenantId, lead.email);
        }
        throw error;
      }
      const { result, usedFallback } = scoring;

      await job.updateProgress(90);

      const tier = computeTier(result.score);
      const recommendations = generateRecommendations(tier, result.score);

      const tenantId = validatedData.tenantId;
      const discarded = await persistScoringResult(
        leadId,
        tenantId,
        lead.email,
        result,
        tier,
        recommendations,
        validatedData.leadScoreWriter !== 'service'
      );
      // Erased or restricted while the model ran: the score is not returned either, since
      // BullMQ keeps completed job results in Redis (codex).
      if (discarded) {
        return { skipped: true, reason: discarded } as unknown as ScoringJobResult;
      }

      const processingTimeMs = Date.now() - startTime;
      const jobResult: ScoringJobResult = {
        leadId,
        score: result.score,
        confidence: result.confidence,
        tier,
        factors: result.factors,
        recommendations,
        modelVersion: usedFallback ? 'fallback' : result.modelVersion,
        requiresReview: result.requiresReview === true,
        processedAt: new Date().toISOString(),
        processingTimeMs,
      };

      await job.updateProgress(100);

      return jobResult;
    }
  );
}

// ============================================================================
// Job Options
// ============================================================================

/** Default job options for scoring jobs */
export const DEFAULT_SCORING_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // 7 days
  },
};
