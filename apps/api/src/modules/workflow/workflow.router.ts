/**
 * Workflow Automation Router
 *
 * Provides type-safe tRPC endpoints for workflow engine management.
 *
 * Tasks:
 *  - IFC-028: Workflow Engine (list/getById stubs)
 *  - PG-193:  Workflow Step Progress Panel — adds getExecution,
 *             getExecutionsByEntity and migrates all procedures to
 *             `tenantProcedure` for tenant isolation.
 *  - PG-193 audit fix: mergeSteps no longer synthesises a "running" status
 *    from `currentStep`. Step status comes from explicit stepResults entries
 *    first; unresulted steps fall back to the execution-level status only.
 *    See `apps/api/src/modules/workflow/__tests__/workflow.router.test.ts`.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';

// ---------------------------------------------------------------------------
// Zod schemas for JSON columns
// ---------------------------------------------------------------------------

const workflowStepDefSchema = z.object({
  id: z.number().int().positive(),
  type: z.string(),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

const workflowStepResultSchema = z.object({
  step: z.number().int().positive(),
  status: z.enum(['completed', 'failed', 'pending', 'running', 'skipped']),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

type WorkflowStepDef = z.infer<typeof workflowStepDefSchema>;
type WorkflowStepResult = z.infer<typeof workflowStepResultSchema>;

type WorkflowStepStatus = WorkflowStepResult['status'];

export interface WorkflowMergedStep {
  stepNumber: number;
  stepId: number;
  name: string;
  type: string;
  status: WorkflowStepStatus;
  result?: Record<string, unknown> | null;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Step label mapping (mirrors apps/web/src/lib/ai-monitoring/workflow-types.ts)
// ---------------------------------------------------------------------------

const STEP_TYPE_LABELS: Record<string, string> = {
  score: 'Lead Scoring',
  condition: 'Condition Check',
  assign: 'Assignment',
  notify: 'Send Notification',
  approval: 'Approval Gate',
  classify: 'Classification',
  route: 'Routing',
  sla: 'SLA Assignment',
};

export function stepTypeToName(type: string): string {
  const known = STEP_TYPE_LABELS[type];
  if (known) return known;
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// JSON parsers with safe fallback
// ---------------------------------------------------------------------------

/**
 * Parse the JSON step definition array stored on WorkflowDefinition.steps.
 * Valid entries are kept, invalid entries are silently dropped. A single
 * malformed row must NOT discard the rest of the workflow definition.
 */
export function parseStepDefinitions(raw: unknown): WorkflowStepDef[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = workflowStepDefSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Parse the JSON step result array stored on WorkflowExecution.stepResults.
 * Valid entries are kept, invalid entries are silently dropped. A single
 * malformed row must NOT discard the rest of the execution's progress state.
 */
export function parseStepResults(raw: unknown): WorkflowStepResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = workflowStepResultSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export type WorkflowExecutionStatus =
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

/**
 * Merge workflow step definitions with execution results into a single
 * display-ready array.
 *
 * Status resolution (PG-193 audit fix):
 * 1. If a stepResult entry exists for the step, use its explicit `status`
 *    field verbatim — the engine is the canonical source of truth.
 * 2. Otherwise, derive a fallback from the execution-level `status`:
 *      - COMPLETED → 'completed' (missing result ≈ engine forgot to record;
 *        the execution as a whole is done, so treat it as done)
 *      - CANCELLED → 'skipped'
 *      - RUNNING / PAUSED / FAILED → 'pending'
 *
 * Historical note: the first implementation used `currentStep + 1` to
 * synthesize a "running" status for the next-unresulted step. That logic
 * disagreed with the seed fixture (`packages/db/prisma/seed.ts:8090-8128`),
 * which marks step 2 as the active (pending) step while step 3 has no result
 * — so the synthesiser incorrectly rendered step 3 as running. Until the real
 * workflow engine (IFC-028 / IFC-296) lands with a documented `currentStep`
 * contract, we do not fabricate per-step running state at all.
 */
export function mergeSteps(
  defs: WorkflowStepDef[],
  results: WorkflowStepResult[],
  status: WorkflowExecutionStatus,
): WorkflowMergedStep[] {
  const resultByStep = new Map<number, WorkflowStepResult>();
  for (const r of results) resultByStep.set(r.step, r);

  return defs.map<WorkflowMergedStep>((def, idx) => {
    const stepNumber = idx + 1;
    const result = resultByStep.get(def.id) ?? resultByStep.get(stepNumber);
    const explicitStatus = result?.status;

    let computedStatus: WorkflowStepStatus;
    if (explicitStatus) {
      computedStatus = explicitStatus;
    } else if (status === 'COMPLETED') {
      computedStatus = 'completed';
    } else if (status === 'CANCELLED') {
      computedStatus = 'skipped';
    } else {
      // RUNNING / PAUSED / FAILED with no explicit result → pending.
      computedStatus = 'pending';
    }

    return {
      stepNumber,
      stepId: def.id,
      name: stepTypeToName(def.type),
      type: def.type,
      status: computedStatus,
      result: result?.result ?? null,
      error: result?.error,
      startedAt: result?.startedAt,
      completedAt: result?.completedAt,
    };
  });
}

// ---------------------------------------------------------------------------
// Shared shape builder
// ---------------------------------------------------------------------------

/**
 * Minimal structural shape `toExecutionDetail` consumes. Kept as a local
 * `type` (NOT an interface) so it acts as a structural constraint the
 * Prisma-inferred return value satisfies without needing a manual cast.
 */
type ExecutionWithWorkflow = {
  id: string;
  workflowId: string;
  status: WorkflowExecutionStatus;
  currentStep: number;
  stepResults: unknown;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  entityType: string | null;
  entityId: string | null;
  workflow: {
    name: string;
    category: string;
    steps: unknown;
  } | null;
};

function toExecutionDetail(execution: ExecutionWithWorkflow) {
  const defs = parseStepDefinitions(execution.workflow?.steps);
  const results = parseStepResults(execution.stepResults);
  const steps = mergeSteps(defs, results, execution.status);
  const totalSteps = steps.length;
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const percentage = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return {
    id: execution.id,
    workflowId: execution.workflowId,
    workflowName: execution.workflow?.name ?? 'Unknown Workflow',
    workflowCategory: execution.workflow?.category ?? 'custom',
    status: execution.status,
    currentStep: execution.currentStep,
    totalSteps,
    completedCount,
    percentage,
    steps,
    startedAt: execution.startedAt.toISOString(),
    completedAt: execution.completedAt ? execution.completedAt.toISOString() : null,
    error: execution.error,
    entityType: execution.entityType,
    entityId: execution.entityId,
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const workflowRouter = createTRPCRouter({
  /** List workflow definitions (stub — tenant-scoped). */
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async () => {
      return {
        items: [] as Array<{
          id: string;
          name: string;
          status: string;
          createdAt: string;
        }>,
        nextCursor: null as string | null,
      };
    }),

  /** Get a single workflow definition by ID (stub — tenant-scoped). */
  getById: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async () => {
      return null;
    }),

  /**
   * PG-193 — Fetch a single WorkflowExecution by ID, joined with its
   * WorkflowDefinition. Returns a merged step array ready for
   * WorkflowProgressPanel consumption.
   */
  getExecution: tenantProcedure
    .input(z.object({ executionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenant.tenantId;
        const execution = await ctx.prismaWithTenant.workflowExecution.findFirst({
          where: { id: input.executionId, tenantId },
          include: {
            workflow: {
              select: { name: true, category: true, steps: true },
            },
          },
        });

        if (!execution) return null;
        return toExecutionDetail(execution);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve workflow execution',
          cause: error,
        });
      }
    }),

  /**
   * PG-193 — Fetch the most recent WorkflowExecution for a given
   * `(entityType, entityId)` pair. Used by the progress panel when it only
   * has a ConversationRecord's contextType/contextId to link by.
   */
  getExecutionsByEntity: tenantProcedure
    .input(
      z.object({
        entityType: z.string().min(1),
        entityId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenant.tenantId;
        const execution = await ctx.prismaWithTenant.workflowExecution.findFirst({
          where: {
            tenantId,
            entityType: input.entityType,
            entityId: input.entityId,
          },
          orderBy: { startedAt: 'desc' },
          include: {
            workflow: {
              select: { name: true, category: true, steps: true },
            },
          },
        });

        if (!execution) return null;
        return toExecutionDetail(execution);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve workflow executions by entity',
          cause: error,
        });
      }
    }),
});
