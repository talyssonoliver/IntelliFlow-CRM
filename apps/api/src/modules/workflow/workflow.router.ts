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
import { Prisma } from '@intelliflow/db';
import {
  WorkflowNodeConfigSchema,
  NODE_TYPE_IDS,
  isNodeTypeId,
  buildZodFromDescriptors,
} from '@intelliflow/domain';
import { getCustomNodeTypeRegistry } from '../../workflow/registries/custom-node-type-registry';
import { createTRPCRouter, tenantProcedure } from '../../trpc';

// ---------------------------------------------------------------------------
// Zod schemas for JSON columns
// ---------------------------------------------------------------------------

/**
 * Workflow step definition.
 *
 * The `config` payload is kept permissive at the router level so legacy
 * workflows (seeded before the domain node catalog existed — types like
 * "approval", "condition", "notify") can still round-trip through
 * list/getById/update without a data migration.
 *
 * When the step's `type` IS one of the catalog-registered node types
 * (`NODE_TYPE_IDS` — start/action/decision/human/end), the config is
 * additionally validated against `WorkflowNodeConfigSchema` from
 * `@intelliflow/domain`. Unknown types (legacy) still pass through.
 */
const workflowStepDefSchema = z
  .object({
    id: z.number().int().positive(),
    type: z.string(),
    config: z.record(z.string(), z.unknown()).default({}),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
  })
  .superRefine((val, ctx) => {
    if (!isNodeTypeId(val.type)) {
      // Legacy / unknown type — accept without strict config validation.
      return;
    }
    const parsed = WorkflowNodeConfigSchema.safeParse({
      type: val.type,
      ...val.config,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          code: 'custom',
          message: `Invalid ${val.type} node config: ${issue.message}`,
          path: ['config', ...issue.path.filter((p) => p !== 'type')],
        });
      }
    }
  });

export { NODE_TYPE_IDS };

const workflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
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
// Entity type normalisation (PG-193 wiring fix)
// ---------------------------------------------------------------------------

/**
 * Canonical `WorkflowExecution.entityType` values accepted by the workflow
 * engine. Mirrors the domain vocabulary used by seed data at
 * `packages/db/prisma/seed.ts:8090-8128` and the Prisma schema comment on
 * `WorkflowExecution.entityType`.
 */
const KNOWN_ENTITY_TYPES: ReadonlySet<string> = new Set([
  'lead',
  'deal',
  'ticket',
  'contact',
  'opportunity',
  'case',
  'account',
]);

/**
 * Normalise a `ConversationRecord.contextType` value into a candidate
 * `WorkflowExecution.entityType` value. Real data is action-qualified
 * (`'lead_qualification'`, `'deal_approved'`, `'email_generation'`) while
 * the workflow engine's `entityType` uses plain entity kinds (`'lead'`,
 * `'deal'`). The panel join would never resolve without this mapping.
 *
 * Rules, in order:
 * 1. If `raw` is already a known entity kind, return it unchanged.
 * 2. Otherwise, walk through the known entity kinds and return the first
 *    one whose snake_case prefix matches (`lead_qualification` → `lead`,
 *    `deal_stage_changed` → `deal`).
 * 3. Otherwise, return `raw` unchanged (best effort — the caller will
 *    still query it, and a null result is a legal return shape).
 */
export function normalizeEntityType(raw: string): string {
  if (KNOWN_ENTITY_TYPES.has(raw)) return raw;
  const lower = raw.toLowerCase();
  for (const kind of KNOWN_ENTITY_TYPES) {
    if (lower === kind || lower.startsWith(`${kind}_`)) return kind;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// JSON parsers with safe fallback
// ---------------------------------------------------------------------------

/**
 * Parse the JSON step definition array stored on WorkflowDefinition.steps.
 * Valid entries are kept, invalid entries are silently dropped. A single
 * malformed row must NOT discard the rest of the workflow definition.
 *
 * Supports two storage formats:
 *   - Legacy flat array: `[{id, type, config}, ...]`
 *   - Envelope (IFC-031): `{ nodes: [{id, type, config}, ...], edges: [...] }`
 */
export function parseStepDefinitions(raw: unknown): WorkflowStepDef[] {
  // Unwrap envelope format: { nodes: [...], edges: [...] }
  let items: unknown;
  if (Array.isArray(raw)) {
    items = raw; // legacy flat array
  } else if (raw && typeof raw === 'object' && 'nodes' in raw) {
    items = (raw as Record<string, unknown>).nodes;
  } else {
    return [];
  }
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
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

export type WorkflowExecutionStatus = 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

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
  status: WorkflowExecutionStatus
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
// Input schemas for CRUD procedures (IFC-031)
// ---------------------------------------------------------------------------

const workflowCreateInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().min(1),
  triggerType: z.string().min(1),
  triggerConfig: z.record(z.string(), z.unknown()).default({}),
  steps: z.array(workflowStepDefSchema).min(1),
  edges: z.array(workflowEdgeSchema).default([]),
});

const workflowUpdateInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  triggerType: z.string().optional(),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  steps: z.array(workflowStepDefSchema).min(1).optional(),
  edges: z.array(workflowEdgeSchema).optional(),
});

// ---------------------------------------------------------------------------
// Server-side topology validation (mirrors client-side validation.ts rules)
// ---------------------------------------------------------------------------

interface GraphInput {
  steps: Array<{ id: number; type: string }>;
  edges: Array<{ source: string; target: string }>;
}

/**
 * Validate step configs for non-canonical types against the tenant's
 * CustomNodeTypeRegistry (IFC-031 FU-011). Hydrates the registry from
 * Postgres if needed, then runs each descriptor-reconstructed Zod schema
 * against the step's `config` payload.
 *
 * Returns a list of error messages (empty = success).
 */
async function validateCustomNodeConfigs(
  steps: Array<{ id: number; type: string; config?: Record<string, unknown> }>,
  tenantId: string,
  prisma: { customNodeType: { findMany: (args: unknown) => Promise<unknown[]> } }
): Promise<string[]> {
  const unknownTypes = steps
    .filter((s) => !isNodeTypeId(s.type))
    .map((s) => ({ stepId: s.id, type: s.type, config: s.config ?? {} }));
  if (unknownTypes.length === 0) return [];

  const registry = getCustomNodeTypeRegistry();
  await registry.loadTenant(prisma as never, tenantId);

  const errors: string[] = [];
  for (const u of unknownTypes) {
    const descriptor = registry.get(tenantId, u.type);
    if (!descriptor) {
      errors.push(
        `Step ${u.stepId} uses unknown node type "${u.type}" (not in catalog nor custom registry)`
      );
      continue;
    }
    if (!descriptor.isActive) {
      errors.push(`Step ${u.stepId} uses deactivated custom node type "${u.type}"`);
      continue;
    }
    const schema = buildZodFromDescriptors(descriptor.configSchema);
    const parsed = schema.safeParse(u.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(
          `Step ${u.stepId} (${u.type}) config.${issue.path.join('.') || '<root>'}: ${issue.message}`
        );
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// validateWorkflowGraph helpers
// ---------------------------------------------------------------------------

type GraphStep = { id: number; type: string };
type GraphEdge = { source: string; target: string };

interface AdjacencyData {
  outgoing: Map<string, string[]>;
  inDegree: Map<string, number>;
  nodeIds: Set<string>;
}

function checkNodeCounts(steps: GraphStep[]): string[] {
  const errors: string[] = [];
  if (steps.filter((s) => s.type === 'start').length !== 1)
    errors.push('Workflow must have exactly one Start node');
  if (steps.filter((s) => s.type === 'end').length !== 1)
    errors.push('Workflow must have exactly one End node');
  return errors;
}

function buildAdjacencyMap(steps: GraphStep[], edges: GraphEdge[]): AdjacencyData {
  const nodeIds = new Set(steps.map((s) => `node-${s.id}`));
  const outgoing = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    inDegree.set(id, 0);
  }
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      outgoing.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
  }
  return { outgoing, inDegree, nodeIds };
}

function checkBfsConnectivity(
  nodeIds: Set<string>,
  startId: string,
  outgoing: Map<string, string[]>
): string[] {
  const visited = new Set<string>([startId]);
  const bfsQueue = [startId];
  while (bfsQueue.length > 0) {
    const current = bfsQueue.shift()!;
    for (const neighbor of outgoing.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        bfsQueue.push(neighbor);
      }
    }
  }
  return visited.size < nodeIds.size ? ['All nodes must be connected'] : [];
}

function checkFallbackConnectivity(
  steps: GraphStep[],
  outgoing: Map<string, string[]>,
  inDegree: Map<string, number>
): string[] {
  for (const s of steps) {
    const nid = `node-${s.id}`;
    if ((outgoing.get(nid)?.length ?? 0) === 0 && (inDegree.get(nid) ?? 0) === 0)
      return ['All nodes must be connected'];
  }
  return [];
}

function checkConnectivity(
  steps: GraphStep[],
  nodeIds: Set<string>,
  outgoing: Map<string, string[]>,
  inDegree: Map<string, number>
): string[] {
  if (steps.length <= 1) return [];
  const startNode = steps.find((s) => s.type === 'start');
  if (startNode) {
    return checkBfsConnectivity(nodeIds, `node-${startNode.id}`, outgoing);
  }
  return checkFallbackConnectivity(steps, outgoing, inDegree);
}

function checkDecisionNodes(steps: GraphStep[], outgoing: Map<string, string[]>): string[] {
  const errors: string[] = [];
  for (const s of steps) {
    if (s.type === 'decision') {
      const out = outgoing.get(`node-${s.id}`)?.length ?? 0;
      if (out < 2)
        errors.push(
          `Decision nodes must have at least 2 outgoing connections (node ${s.id} has ${out})`
        );
    }
  }
  return errors;
}

function checkCycles(
  nodeIds: Set<string>,
  inDegree: Map<string, number>,
  outgoing: Map<string, string[]>
): string[] {
  const degCopy = new Map(inDegree);
  const queue: string[] = [];
  for (const [id, d] of degCopy) if (d === 0) queue.push(id);
  let processed = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    processed++;
    for (const nb of outgoing.get(cur) ?? []) {
      const nd = (degCopy.get(nb) ?? 1) - 1;
      degCopy.set(nb, nd);
      if (nd === 0) queue.push(nb);
    }
  }
  return processed < nodeIds.size ? ['Workflow must not have cycles'] : [];
}

/** Extracts the node/edge arrays from the stored JSON graph envelope. */
function extractGraphEnvelope(stored: unknown): { nodes: GraphStep[]; edges: GraphEdge[] } {
  const g = stored as Record<string, unknown> | unknown[] | null;
  const nodes = Array.isArray(g)
    ? (g as GraphStep[])
    : (((g as Record<string, unknown>)?.nodes ?? []) as GraphStep[]);
  const edges = Array.isArray(g)
    ? []
    : (((g as Record<string, unknown>)?.edges ?? []) as GraphEdge[]);
  return { nodes, edges };
}

/** Merges incoming step/edge updates with the existing stored graph envelope. */
function mergeGraphEnvelope(
  stored: unknown,
  newSteps: GraphStep[] | undefined,
  newEdges: GraphEdge[] | undefined
): Prisma.InputJsonValue {
  const prev = extractGraphEnvelope(stored);
  return {
    nodes: newSteps ?? prev.nodes,
    edges: newEdges ?? prev.edges,
  } as unknown as Prisma.InputJsonValue;
}

function validateWorkflowGraph(graph: GraphInput): string[] {
  const { steps, edges } = graph;
  const { outgoing, inDegree, nodeIds } = buildAdjacencyMap(steps, edges);
  return [
    ...checkNodeCounts(steps),
    ...checkConnectivity(steps, nodeIds, outgoing, inDegree),
    ...checkDecisionNodes(steps, outgoing),
    ...checkCycles(nodeIds, inDegree, outgoing),
  ];
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const workflowRouter = createTRPCRouter({
  // -------------------------------------------------------------------------
  // CRUD procedures — IFC-031
  // -------------------------------------------------------------------------

  /** Create a new workflow definition. */
  create: tenantProcedure.input(workflowCreateInput).mutation(async ({ ctx, input }) => {
    try {
      // Server-side topology validation (AC-008)
      const topologyErrors = validateWorkflowGraph({
        steps: input.steps,
        edges: input.edges ?? [],
      });
      if (topologyErrors.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Topology validation failed: ${topologyErrors.join('; ')}`,
        });
      }

      // Custom node type validation (IFC-031 FU-011)
      const customErrors = await validateCustomNodeConfigs(
        input.steps,
        ctx.tenant.tenantId,
        ctx.prismaWithTenant as never
      );
      if (customErrors.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Custom node validation failed: ${customErrors.join('; ')}`,
        });
      }

      const tenantId = ctx.tenant.tenantId;
      const createdBy = ctx.user!.userId;
      // Store both nodes and edges in the `steps` JSON column as an envelope
      const graphPayload = {
        nodes: input.steps,
        edges: input.edges ?? [],
      };
      return await ctx.prismaWithTenant.workflowDefinition.create({
        data: {
          name: input.name,
          description: input.description,
          category: input.category,
          triggerType: input.triggerType,
          triggerConfig: input.triggerConfig as Prisma.InputJsonValue,
          steps: graphPayload as unknown as Prisma.InputJsonValue,
          tenantId,
          createdBy,
        },
      });
    } catch (error: unknown) {
      // Re-throw TRPCErrors (e.g. BAD_REQUEST from topology validation) as-is
      if (error instanceof TRPCError) throw error;
      if ((error as { code?: string }).code === 'P2002') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A workflow with this name already exists in this tenant',
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create workflow',
        cause: error,
      });
    }
  }),

  /** Update an existing workflow definition (increments version). */
  update: tenantProcedure.input(workflowUpdateInput).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const { id, ...data } = input;

    const existing = await ctx.prismaWithTenant.workflowDefinition.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Workflow not found' });
    }

    // Server-side topology validation when steps or edges change (AC-008)
    if (data.steps || data.edges) {
      const prev = extractGraphEnvelope(existing.steps);
      const topologyErrors = validateWorkflowGraph({
        steps: data.steps ?? prev.nodes,
        edges: (data.edges ?? prev.edges) as GraphEdge[],
      });
      if (topologyErrors.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Topology validation failed: ${topologyErrors.join('; ')}`,
        });
      }

      // Custom node type validation (IFC-031 FU-011)
      const stepsForCheck = (data.steps ?? prev.nodes) as Array<{
        id: number;
        type: string;
        config?: Record<string, unknown>;
      }>;
      const customErrors = await validateCustomNodeConfigs(
        stepsForCheck,
        tenantId,
        ctx.prismaWithTenant as never
      );
      if (customErrors.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Custom node validation failed: ${customErrors.join('; ')}`,
        });
      }
    }

    return ctx.prismaWithTenant.workflowDefinition.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.triggerType !== undefined && { triggerType: data.triggerType }),
        ...(data.triggerConfig !== undefined && {
          triggerConfig: data.triggerConfig as Prisma.InputJsonValue,
        }),
        ...((data.steps !== undefined || data.edges !== undefined) && {
          steps: mergeGraphEnvelope(existing.steps, data.steps, data.edges),
        }),
        version: existing.version + 1,
      },
    });
  }),

  /** Soft-delete a workflow definition (sets deletedAt, does not remove). */
  delete: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      const existing = await ctx.prismaWithTenant.workflowDefinition.findFirst({
        where: { id: input.id, tenantId, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workflow not found' });
      }

      return ctx.prismaWithTenant.workflowDefinition.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
    }),

  /** Toggle the isActive flag on a workflow definition. */
  setActive: tenantProcedure
    .input(z.object({ id: z.string().min(1), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      const existing = await ctx.prismaWithTenant.workflowDefinition.findFirst({
        where: { id: input.id, tenantId, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workflow not found' });
      }

      return ctx.prismaWithTenant.workflowDefinition.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
    }),

  /** List workflow definitions with cursor pagination (excludes soft-deleted). */
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      const { limit, cursor } = input;

      const items = await ctx.prismaWithTenant.workflowDefinition.findMany({
        where: { tenantId, deletedAt: null },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
      });

      const hasMore = items.length > limit;
      const results = hasMore ? items.slice(0, limit) : items;

      return {
        items: results,
        nextCursor: hasMore ? (results[results.length - 1]?.id ?? null) : null,
      };
    }),

  /** Get a single workflow definition by ID (excludes soft-deleted). */
  getById: tenantProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const workflow = await ctx.prismaWithTenant.workflowDefinition.findFirst({
      where: { id: input.id, tenantId, deletedAt: null },
    });
    return workflow ?? null;
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
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenant.tenantId;
        const normalized = normalizeEntityType(input.entityType);

        // Real data writes `ConversationRecord.contextType` with a mix of
        // vocabularies:
        //   - canonical entity kinds     ('lead', 'deal')
        //   - action-qualified prefixes  ('lead_qualification', 'deal_approved')
        //   - pure task kinds            ('email_generation', 'followup_management')
        //   - infrastructure tokens      ('job')
        //
        // The workflow engine always writes `entityType` as a plain entity
        // kind. Resolve the join in two passes so the panel lights up against
        // every one of those shapes:
        //
        //   Pass 1. Query `entityType IN [normalized, raw]` with the exact
        //           `entityId`. Handles canonical + prefix cases.
        //   Pass 2. If pass 1 returns null AND the normaliser didn't recognise
        //           a prefix (i.e. the task-kind vocabulary), query by
        //           `entityId` alone. cuid IDs are effectively globally unique
        //           across entity kinds, so an entityId-only match is a safe
        //           best-effort link for tasks like 'email_generation' that
        //           clearly operate on a specific entity but don't spell it
        //           out in the type string.
        const candidateTypes =
          normalized === input.entityType ? [input.entityType] : [normalized, input.entityType];

        let execution = await ctx.prismaWithTenant.workflowExecution.findFirst({
          where: {
            tenantId,
            entityType: { in: candidateTypes },
            entityId: input.entityId,
          },
          orderBy: { startedAt: 'desc' },
          include: {
            workflow: {
              select: { name: true, category: true, steps: true },
            },
          },
        });

        // Pass 2: entityId-only fallback when the normaliser couldn't derive
        // an entity kind (the raw value passed through unchanged AND is not
        // already a canonical kind).
        const normaliserMatched =
          normalized !== input.entityType || KNOWN_ENTITY_TYPES.has(input.entityType);
        if (!execution && !normaliserMatched) {
          execution = await ctx.prismaWithTenant.workflowExecution.findFirst({
            where: {
              tenantId,
              entityId: input.entityId,
            },
            orderBy: { startedAt: 'desc' },
            include: {
              workflow: {
                select: { name: true, category: true, steps: true },
              },
            },
          });
        }

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
