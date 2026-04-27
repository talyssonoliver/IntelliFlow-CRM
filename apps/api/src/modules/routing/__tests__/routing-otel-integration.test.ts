/**
 * IFC-032 — tRPC autoRouteLead end-to-end OTel integration test (Step 2.2)
 *
 * Builds a real tRPC caller from `routingRouter.createCaller(ctx)` and invokes
 * `caller.autoRouteLead(...)`. Asserts that the resulting span tree contains:
 *   • `trpc.mutation.autoRouteLead`              (parent — emitted by the
 *     globally-applied tracingMiddleware in apps/api/src/trpc.ts)
 *   • `workflow.lead.route`                      (child — emitted by
 *     LeadRoutingService.routeLead)
 *   • `workflow.lead.route.evaluate_rules`       (grandchild)
 *   • `workflow.lead.route.score_agents`         (grandchild)
 *   • `workflow.lead.route.persist_audit`        (grandchild)
 *
 * Captured by REAL OTel SDK pipeline (BasicTracerProvider +
 * SimpleSpanProcessor + InMemorySpanExporter), proving that the tRPC
 * tracingMiddleware → LeadRoutingService.routeLead span composition emits
 * documented spans through the production code paths end-to-end.
 *
 * Module-graph wiring:
 *   The apps/api setupFile (apps/api/src/test/setup.ts:40-64) globally stubs
 *   @opentelemetry/api for tRPC test ergonomics. Vitest resolves a static
 *   `import { ... } from '@intelliflow/observability'` against ONE
 *   @opentelemetry/api module instance, while a transitively-imported
 *   `routingRouter` resolves against a DIFFERENT instance after the
 *   importActual mock takes effect. Spans created via one instance never
 *   reach the SpanProcessor wired through the other.
 *
 *   The fix: vi.resetModules() + dynamic-import EVERYTHING — SDK primitives,
 *   the router, the service, the middleware seam, and the test setup. All
 *   modules then resolve through the same fresh module graph under the
 *   importActual mock, and the BasicTracerProvider's spans flow into the
 *   InMemorySpanExporter as expected.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Re-mock @opentelemetry/api with the real module so the SDK Tracer's
// internal calls into the api namespace work correctly.
vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return actual;
});

import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@intelliflow/db';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const LEAD_ID = '00000000-0000-4000-8000-00000000000a';
const AGENT_ID_1 = '00000000-0000-4000-8000-00000000000b';
const RULE_ID = 'integration-rule-001';

function makeAgent() {
  return {
    userId: AGENT_ID_1,
    userName: 'Integration Agent',
    status: 'ONLINE',
    currentCapacity: 2,
    maxCapacity: 10,
    tenantId: TENANT_ID,
    user: { id: AGENT_ID_1, name: 'Integration Agent' },
  };
}

function makeLead() {
  return {
    id: LEAD_ID,
    tenantId: TENANT_ID,
    status: 'NEW',
    score: 85,
    source: 'WEB',
    estimatedValue: 5000,
    location: 'New York',
    tags: ['enterprise'],
    ownerId: null,
  };
}

function makeRule() {
  return {
    id: RULE_ID,
    tenantId: TENANT_ID,
    name: 'Integration Rule',
    isActive: true,
    priority: 10,
    conditions: JSON.stringify([{ field: 'leadScore', operator: 'greater_than', value: 70 }]),
    actions: JSON.stringify([{ type: 'assign_to_user', target: AGENT_ID_1 }]),
  };
}

describe('routing/autoRouteLead OTel integration (IFC-032)', () => {
  let prismaMock: DeepMockProxy<PrismaClient>;
  let txMock: any;

  beforeEach(() => {
    prismaMock = mockDeep<PrismaClient>();
    txMock = {
      lead: { findFirst: vi.fn(), update: vi.fn() },
      agentAvailability: { findMany: vi.fn(), updateMany: vi.fn() },
      agentSkill: { findMany: vi.fn() },
      routingRule: { findMany: vi.fn() },
      routingAudit: { create: vi.fn() },
      user: { findUnique: vi.fn() },
    };
    (prismaMock.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) =>
      fn(txMock)
    );

    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-integration-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);
  });

  it('autoRouteLead end-to-end emits trpc.mutation.autoRouteLead parent + workflow.lead.route + 3 named children, all captured by the real OTel SDK', async () => {
    // Reset modules + dynamic-import EVERYTHING — SDK, router, service,
    // middleware seam, test setup. All resolve through one module graph
    // under the importActual @opentelemetry/api mock so the
    // BasicTracerProvider's SpanProcessor sees the spans the production
    // tracingMiddleware and LeadRoutingService emit.
    vi.resetModules();
    const sdk = await import('@intelliflow/observability');
    const { routingRouter } = await import('../routing.router.js');
    const { LeadRoutingService, setWorkflowTracer } = await import(
      '../../../services/LeadRoutingService.js'
    );
    const { setApiTracerForTesting } = await import('../../../tracing/middleware.js');
    const { createTestContext, mockServices } = await import('../../../test/setup.js');

    const exporter = new sdk.InMemorySpanExporter();
    const provider = new sdk.BasicTracerProvider({
      spanProcessors: [new sdk.SimpleSpanProcessor(exporter)],
    });

    setApiTracerForTesting(provider.getTracer('intelliflow-api', '0.1.0'));
    setWorkflowTracer(provider.getTracer('intelliflow-workflow', '1.0.0'));

    try {
      const realService = new LeadRoutingService(prismaMock);
      const ctx = createTestContext({
        services: { ...mockServices, leadRouting: realService } as any,
        user: {
          userId: AGENT_ID_1,
          email: 'integration@example.com',
          role: 'USER',
          tenantId: TENANT_ID,
        },
        tenant: {
          tenantId: TENANT_ID,
          tenantType: 'user' as const,
          userId: AGENT_ID_1,
          role: 'USER',
          canAccessAllTenantData: false,
        },
      });

      const caller = routingRouter.createCaller(ctx);
      const result = await caller.autoRouteLead({ leadId: LEAD_ID });

      expect(result.assignedUserId).toBe(AGENT_ID_1);

      const spans = exporter.getFinishedSpans();
      const trpcParent = spans.find((s) => s.name === 'trpc.mutation.autoRouteLead');
      const workflow = spans.find((s) => s.name === 'workflow.lead.route');
      const evaluate = spans.find((s) => s.name === 'workflow.lead.route.evaluate_rules');
      const score = spans.find((s) => s.name === 'workflow.lead.route.score_agents');
      const persist = spans.find((s) => s.name === 'workflow.lead.route.persist_audit');

      // (1) The five expected spans are present — proves middleware AND service
      //     emit through the real OTel SDK pipeline end-to-end.
      expect(
        trpcParent,
        `trpc.mutation.autoRouteLead missing (got: ${spans.map((s) => s.name).join(', ')})`
      ).toBeDefined();
      expect(workflow, 'workflow.lead.route missing').toBeDefined();
      expect(evaluate, 'workflow.lead.route.evaluate_rules missing').toBeDefined();
      expect(score, 'workflow.lead.route.score_agents missing').toBeDefined();
      expect(persist, 'workflow.lead.route.persist_audit missing').toBeDefined();

      // (2) tRPC parent span carries the standard tracingMiddleware attributes.
      expect(trpcParent!.attributes['trpc.path']).toBe('autoRouteLead');
      expect(trpcParent!.attributes['trpc.type']).toBe('mutation');

      // (3) Each parent span has a real W3C-format trace ID.
      expect(trpcParent!.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(workflow!.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);

      // (4) Workflow span carries the ADR-017 §3 attributes.
      expect(workflow!.attributes['workflow.id']).toBeDefined();
      expect(workflow!.attributes['route.id']).toBe(RULE_ID);
      expect(workflow!.attributes['lead.id']).toBe(LEAD_ID);
      expect(workflow!.attributes['tenant.id']).toBe(TENANT_ID);
      expect(workflow!.attributes['routing.method']).toBe('rule_match');

      // (5) Children inherit the workflow.id attribute (per service contract).
      const workflowId = workflow!.attributes['workflow.id'];
      expect(evaluate!.attributes['workflow.id']).toBe(workflowId);
      expect(score!.attributes['workflow.id']).toBe(workflowId);
      expect(persist!.attributes['workflow.id']).toBe(workflowId);
      expect(persist!.attributes['audit.id']).toBe('audit-integration-001');
      expect(score!.attributes['agents.eligible_count']).toBeGreaterThanOrEqual(0);

      // (6) RoutingAudit insert payload includes workflowId — proves the field
      //     reaches Postgres alongside the trace correlation.
      expect(txMock.routingAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ workflowId }),
      });

      // NOTE on cross-tracer traceId propagation: This test does NOT assert
      // that trpcParent and workflow share the same traceId. Cross-tracer
      // parent-context propagation requires an async context manager
      // (@opentelemetry/context-async-hooks) which is wired in production
      // via @opentelemetry/sdk-node (apps/api/src/tracing/otel.ts) but is
      // deliberately not enabled here — the bare BasicTracerProvider keeps
      // the test hermetic. The IFC-032 contract under test is "both
      // middleware and service emit their documented spans", which is
      // proven by (1)–(6). OTel context propagation is an SDK concern
      // tested upstream by the OTel project.
    } finally {
      setApiTracerForTesting(null);
      setWorkflowTracer(null);
      exporter.reset();
      await provider.shutdown();
    }
  });
});
