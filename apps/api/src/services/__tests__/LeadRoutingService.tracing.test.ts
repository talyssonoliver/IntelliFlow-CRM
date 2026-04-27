/**
 * LeadRoutingService Tracing Tests (IFC-032 — Section F)
 *
 * 6 tests asserting the workflow.lead.route span hierarchy required by
 * ADR-017 §3 ("All workflow steps emit OTel traces with route_id/workflow_id").
 *
 * Lives separately from LeadRoutingService.test.ts because the apps/api global
 * setup (apps/api/src/test/setup.ts:40-64) replaces @opentelemetry/api with a
 * stub. We re-mock with vi.importActual at the top of this file so that
 * BasicTracerProvider + SimpleSpanProcessor + InMemorySpanExporter actually
 * capture spans.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return actual;
});

import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@intelliflow/db';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  BasicTracerProvider,
  SimpleSpanProcessor,
} from '@intelliflow/observability';
import { LeadRoutingService, setWorkflowTracer } from '../LeadRoutingService';

const TENANT_ID = 'tenant-001';
const LEAD_ID = 'lead-001';
const AGENT_ID_1 = 'agent-001';
const RULE_ID = 'rule-001';

function makeAgent() {
  return {
    userId: AGENT_ID_1,
    userName: 'Alice Agent',
    status: 'ONLINE',
    currentCapacity: 2,
    maxCapacity: 10,
    tenantId: TENANT_ID,
    user: { id: AGENT_ID_1, name: 'Alice Agent' },
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
    tags: ['enterprise', 'saas'],
    ownerId: null,
  };
}

function makeRule() {
  return {
    id: RULE_ID,
    tenantId: TENANT_ID,
    name: 'Hot Lead Rule',
    isActive: true,
    priority: 10,
    conditions: JSON.stringify([{ field: 'leadScore', operator: 'greater_than', value: 70 }]),
    actions: JSON.stringify([{ type: 'assign_to_user', target: AGENT_ID_1 }]),
  };
}

let prismaMock: DeepMockProxy<PrismaClient>;
let txMock: {
  lead: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  agentAvailability: {
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  agentSkill: { findMany: ReturnType<typeof vi.fn> };
  routingRule: { findMany: ReturnType<typeof vi.fn> };
  routingAudit: { create: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};
let service: LeadRoutingService;

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
  service = new LeadRoutingService(prismaMock);
});

describe('Section F: Tracing (IFC-032)', () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  function setupHappyPathMocks() {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);
  }

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    setWorkflowTracer(provider.getTracer('intelliflow-workflow', '1.0.0'));
  });

  afterEach(async () => {
    setWorkflowTracer(null);
    exporter.reset();
    await provider.shutdown();
  });

  it('F1: emits parent span workflow.lead.route with required attributes', async () => {
    setupHappyPathMocks();
    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    const spans = exporter.getFinishedSpans();
    const parent = spans.find((s) => s.name === 'workflow.lead.route');
    expect(parent).toBeDefined();
    expect(parent!.attributes['workflow.id']).toBeDefined();
    expect(parent!.attributes['lead.id']).toBe(LEAD_ID);
    expect(parent!.attributes['tenant.id']).toBe(TENANT_ID);
    expect(parent!.attributes['route.id']).toBeDefined();
    expect(parent!.attributes['routing.method']).toBeDefined();
    expect(parent!.attributes['routing.score']).toBeDefined();
    expect(parent!.status.code).toBe(SpanStatusCode.OK);
    expect(result.workflowId).toBe(parent!.attributes['workflow.id']);
  });

  it('F2: emits child span workflow.lead.route.evaluate_rules', async () => {
    setupHappyPathMocks();
    await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    const spans = exporter.getFinishedSpans();
    const child = spans.find((s) => s.name === 'workflow.lead.route.evaluate_rules');
    expect(child).toBeDefined();
    expect(child!.attributes['workflow.id']).toBeDefined();
    expect(child!.attributes['tenant.id']).toBe(TENANT_ID);
  });

  it('F3: emits child span workflow.lead.route.score_agents with eligible count', async () => {
    setupHappyPathMocks();
    await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    const spans = exporter.getFinishedSpans();
    const child = spans.find((s) => s.name === 'workflow.lead.route.score_agents');
    expect(child).toBeDefined();
    expect(child!.attributes['workflow.id']).toBeDefined();
    expect(typeof child!.attributes['agents.eligible_count']).toBe('number');
  });

  it('F4: emits child span workflow.lead.route.persist_audit', async () => {
    setupHappyPathMocks();
    await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    const spans = exporter.getFinishedSpans();
    const child = spans.find((s) => s.name === 'workflow.lead.route.persist_audit');
    expect(child).toBeDefined();
    expect(child!.attributes['workflow.id']).toBeDefined();
    expect(child!.attributes['lead.id']).toBe(LEAD_ID);
    expect(child!.attributes['audit.id']).toBe('audit-001');
  });

  it('F5: parent span ends with status ERROR on lead-not-found', async () => {
    txMock.lead.findFirst.mockResolvedValue(null);

    await expect(service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID })).rejects.toThrow();

    const spans = exporter.getFinishedSpans();
    const parent = spans.find((s) => s.name === 'workflow.lead.route');
    expect(parent).toBeDefined();
    expect(parent!.status.code).toBe(SpanStatusCode.ERROR);
    expect(parent!.events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('F6: workflowId is persisted on RoutingAudit.create input and matches parent span attribute', async () => {
    setupHappyPathMocks();

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(txMock.routingAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowId: result.workflowId,
        ticketId: LEAD_ID,
      }),
    });
    expect(result.workflowId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    const spans = exporter.getFinishedSpans();
    const parent = spans.find((s) => s.name === 'workflow.lead.route');
    expect(parent!.attributes['workflow.id']).toBe(result.workflowId);
  });
});
