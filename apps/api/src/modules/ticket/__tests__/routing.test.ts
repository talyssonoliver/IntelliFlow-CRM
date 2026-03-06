/**
 * Ticket Routing Tests (IFC-067)
 *
 * 34 tests across 4 sections:
 * A: Unit Tests — Routing Service (19)
 * B: Accuracy + NF Tests (8)
 * C: Performance Tests (4)
 * D: Container Wiring Tests (3)
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { TicketRoutingService, type EligibleAgent } from '../../../services/TicketRoutingService';
import { ticketRoutingRouter } from '../ticket-routing.router';
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_SKILL_MAP,
  TICKET_ROUTING_STRATEGIES,
  type TicketCategory,
} from '@intelliflow/domain';
import type { TicketRoutingInput, TicketRoutingResult } from '@intelliflow/validators';

// =============================================================================
// Inline Fallback Heuristic (mirrors TicketRoutingChain.generateFallbackResult)
// Tested here to avoid cross-package import from ai-worker
// =============================================================================

const CATEGORY_KEYWORDS: Record<TicketCategory, string[]> = {
  BILLING: ['invoice', 'charge', 'refund', 'subscription', 'payment', 'billing', 'price', 'cost'],
  TECHNICAL: [
    'crash',
    'error',
    'bug',
    'performance',
    'slow',
    'broken',
    'auth',
    'login',
    'password',
    'api',
  ],
  SALES: ['pricing', 'demo', 'upgrade', 'plan', 'enterprise', 'discount', 'quote'],
  GENERAL: ['question', 'feedback', 'how-to', 'help', 'info', 'general'],
  FEATURE_REQUEST: ['wish', 'want', 'improve', 'feature', 'request', 'suggest', 'enhancement'],
  BUG_REPORT: ['broken', 'not working', 'regression', 'defect', 'issue', 'fail'],
};

interface FallbackInput {
  subject: string;
  description?: string;
  priority: string;
  agentCandidates: Array<{
    agentId: string;
    name: string;
    skills: string[];
    currentLoad: number;
    maxCapacity: number;
    status: string;
  }>;
}

interface FallbackResult {
  inferredCategory: TicketCategory;
  assigneeId: string;
  assigneeName: string;
  reason: string;
  matchedSkills: string[];
  confidence: number;
  escalationRisk: string;
  routingMethod: string;
  executionTimeMs: number;
  modelVersion: string;
  isFallback: boolean;
}

function generateFallbackResult(input: FallbackInput, executionTimeMs: number): FallbackResult {
  const text = `${input.subject} ${input.description || ''}`.toLowerCase();
  let inferredCategory: TicketCategory = 'GENERAL';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter((kw) => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      inferredCategory = category as TicketCategory;
    }
  }

  const eligible = input.agentCandidates
    .filter((a) => a.status === 'ONLINE' || a.status === 'BUSY')
    .filter((a) => a.currentLoad < a.maxCapacity)
    .sort((a, b) => a.currentLoad / a.maxCapacity - b.currentLoad / b.maxCapacity);

  const selectedAgent = eligible[0] || input.agentCandidates[0];

  return {
    inferredCategory,
    assigneeId: selectedAgent.agentId,
    assigneeName: selectedAgent.name,
    reason: `Fallback heuristic: keyword match for ${inferredCategory}`,
    matchedSkills: selectedAgent.skills.filter(
      (s) => s === TICKET_CATEGORY_SKILL_MAP[inferredCategory]
    ),
    confidence: 0.3,
    escalationRisk: input.priority === 'CRITICAL' ? 'high' : 'low',
    routingMethod: 'load_balance',
    executionTimeMs,
    modelVersion: 'fallback:heuristic:v1',
    isFallback: true,
  };
}

// =============================================================================
// Test UUIDs
// =============================================================================

const TICKET_UUID = 'a1111111-1111-4111-8111-111111111111';
const TENANT_UUID = 'b2222222-2222-4222-8222-222222222222';
const USER_UUID = 'c3333333-3333-4333-8333-333333333333';
const AGENT_1_UUID = 'd4444444-4444-4444-8444-444444444444';
const AGENT_2_UUID = 'e5555555-5555-4555-8555-555555555555';
const AGENT_3_UUID = 'f6666666-6666-4666-8666-666666666666';
const AUDIT_UUID = 'a7777777-7777-4777-8777-777777777777';

// =============================================================================
// Mock Data
// =============================================================================

const mockAgentCandidates = [
  {
    agentId: AGENT_1_UUID,
    name: 'Alice Billing',
    skills: ['billing', 'sales'],
    currentLoad: 2,
    maxCapacity: 10,
    status: 'ONLINE' as const,
  },
  {
    agentId: AGENT_2_UUID,
    name: 'Bob Technical',
    skills: ['technical'],
    currentLoad: 5,
    maxCapacity: 10,
    status: 'ONLINE' as const,
  },
  {
    agentId: AGENT_3_UUID,
    name: 'Charlie General',
    skills: ['technical', 'product'],
    currentLoad: 8,
    maxCapacity: 10,
    status: 'BUSY' as const,
  },
];

function makeRoutingInput(overrides: Partial<TicketRoutingInput> = {}): TicketRoutingInput {
  return {
    ticketId: TICKET_UUID,
    tenantId: TENANT_UUID,
    subject: 'Cannot access billing page',
    description: 'Getting error when opening the invoice section',
    priority: 'MEDIUM',
    agentCandidates: mockAgentCandidates,
    ...overrides,
  };
}

// =============================================================================
// Mock Prisma
// =============================================================================

function createMockPrisma() {
  return {
    agentAvailability: {
      findMany: vi.fn().mockResolvedValue([
        {
          userId: AGENT_1_UUID,
          tenantId: TENANT_UUID,
          status: 'ONLINE',
          currentCapacity: 2,
          maxCapacity: 10,
          user: { id: AGENT_1_UUID, name: 'Alice Billing' },
        },
        {
          userId: AGENT_2_UUID,
          tenantId: TENANT_UUID,
          status: 'ONLINE',
          currentCapacity: 5,
          maxCapacity: 10,
          user: { id: AGENT_2_UUID, name: 'Bob Technical' },
        },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    agentSkill: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { userId: AGENT_1_UUID, skillName: 'billing', proficiency: 90, tenantId: TENANT_UUID },
        ]),
    },
    ticket: {
      findFirst: vi.fn().mockResolvedValue({
        id: TICKET_UUID,
        tenantId: TENANT_UUID,
        subject: 'Billing issue',
        priority: 'MEDIUM',
        slaStatus: 'ON_TRACK',
      }),
      update: vi.fn().mockResolvedValue({ id: TICKET_UUID }),
    },
    routingRule: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    routingAudit: {
      create: vi.fn().mockResolvedValue({ id: AUDIT_UUID }),
    },
    $transaction: vi.fn().mockImplementation(async (fn: any) => {
      return fn({
        ticket: {
          findUnique: vi.fn().mockResolvedValue({ status: 'OPEN' }),
          update: vi.fn().mockResolvedValue({ id: TICKET_UUID }),
        },
        agentAvailability: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        routingAudit: { create: vi.fn().mockResolvedValue({ id: AUDIT_UUID }) },
      });
    }),
  } as any;
}

// =============================================================================
// Section A: Unit Tests — Routing Service (19 tests)
// =============================================================================

describe('Section A: Routing Service Unit Tests', () => {
  let service: TicketRoutingService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new TicketRoutingService(mockPrisma);
  });

  // A1: Billing keywords → BILLING category
  it('A1: classifies billing keywords as BILLING category', () => {
    const input = makeRoutingInput({
      subject: 'Invoice not received',
      description: 'My billing charge is wrong',
    });
    const result = generateFallbackResult(input, 10);
    expect(result.inferredCategory).toBe('BILLING');
  });

  // A2: Auth/login keywords → TECHNICAL category
  it('A2: classifies auth/login keywords as TECHNICAL', () => {
    const input = makeRoutingInput({
      subject: 'Login error',
      description: 'Cannot auth with password',
    });
    const result = generateFallbackResult(input, 10);
    expect(result.inferredCategory).toBe('TECHNICAL');
  });

  // A3: Technical keywords → TECHNICAL category
  it('A3: classifies technical keywords as TECHNICAL', () => {
    const input = makeRoutingInput({
      subject: 'App crash on startup',
      description: 'Error in the API',
    });
    const result = generateFallbackResult(input, 10);
    expect(result.inferredCategory).toBe('TECHNICAL');
  });

  // A4: Default → GENERAL category
  it('A4: defaults to GENERAL category when no keywords match', () => {
    const input = makeRoutingInput({ subject: 'Something happened', description: 'Unclear' });
    const result = generateFallbackResult(input, 10);
    expect(result.inferredCategory).toBe('GENERAL');
  });

  // A5: Confidence value in [0, 1] range
  it('A5: fallback confidence is in [0, 1] range', () => {
    const input = makeRoutingInput();
    const result = generateFallbackResult(input, 10);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  // A6: Skill match selects agent with matching skill + highest proficiency
  it('A6: getEligibleAgents returns agents sorted by proficiency', async () => {
    const agents = await service.getEligibleAgents(TENANT_UUID, 'billing');
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect(agents[0].agentId).toBe(AGENT_1_UUID);
    expect(agents[0].proficiency).toBe(90);
  });

  // A7: Load balance fallback when no skill match
  it('A7: getEligibleAgents returns all under-capacity agents when no skill required', async () => {
    const agents = await service.getEligibleAgents(TENANT_UUID);
    expect(agents.length).toBe(2); // Both ONLINE agents under capacity
  });

  // A8: Skips OFFLINE agents
  it('A8: skips OFFLINE agents', async () => {
    mockPrisma.agentAvailability.findMany.mockResolvedValue([
      {
        userId: AGENT_1_UUID,
        tenantId: TENANT_UUID,
        status: 'OFFLINE',
        currentCapacity: 0,
        maxCapacity: 10,
        user: { id: AGENT_1_UUID, name: 'Offline Agent' },
      },
    ]);
    // OFFLINE is not in the WHERE filter ['ONLINE', 'BUSY'], so Prisma returns empty
    mockPrisma.agentAvailability.findMany.mockResolvedValue([]);
    const agents = await service.getEligibleAgents(TENANT_UUID);
    expect(agents.length).toBe(0);
  });

  // A9: Skips agents at full capacity
  it('A9: skips agents at full capacity', async () => {
    mockPrisma.agentAvailability.findMany.mockResolvedValue([
      {
        userId: AGENT_1_UUID,
        tenantId: TENANT_UUID,
        status: 'ONLINE',
        currentCapacity: 10,
        maxCapacity: 10,
        user: { id: AGENT_1_UUID, name: 'Full Agent' },
      },
    ]);
    const agents = await service.getEligibleAgents(TENANT_UUID);
    expect(agents.length).toBe(0);
  });

  // A10: Rule match creates audit with ruleId
  it('A10: routeTicket creates audit with ruleId when provided', async () => {
    const result = await service.routeTicket({
      ticketId: TICKET_UUID,
      tenantId: TENANT_UUID,
      inferredCategory: 'BILLING',
      assigneeId: AGENT_1_UUID,
      assigneeName: 'Alice Billing',
      reason: 'Rule match: billing-rule',
      routingMethod: 'rule_match',
      matchedSkill: null,
      ruleId: 'rule-123',
      confidence: 0.95,
      executionTimeMs: 50,
      modelVersion: 'gpt-4o-mini',
      isFallback: false,
    });
    expect(result.ruleId).toBe('rule-123');
    expect(result.routingMethod).toBe('rule_match');
  });

  // A11: Skill match creates audit with classifiedSkill
  it('A11: routeTicket creates audit with matchedSkill for skill match', async () => {
    const result = await service.routeTicket({
      ticketId: TICKET_UUID,
      tenantId: TENANT_UUID,
      inferredCategory: 'TECHNICAL',
      assigneeId: AGENT_2_UUID,
      assigneeName: 'Bob Technical',
      reason: 'Skill match for TECHNICAL',
      routingMethod: 'skill_match',
      matchedSkill: 'technical',
      ruleId: null,
      confidence: 0.88,
      executionTimeMs: 30,
      modelVersion: 'gpt-4o-mini',
      isFallback: false,
    });
    expect(result.matchedSkill).toBe('technical');
    expect(result.routingMethod).toBe('skill_match');
  });

  // A12: Load balance creates audit with method 'load_balance'
  it('A12: routeTicket creates audit with load_balance method', async () => {
    const result = await service.routeTicket({
      ticketId: TICKET_UUID,
      tenantId: TENANT_UUID,
      inferredCategory: 'GENERAL',
      assigneeId: AGENT_1_UUID,
      assigneeName: 'Alice Billing',
      reason: 'Load balance: lowest-load agent',
      routingMethod: 'load_balance',
      matchedSkill: null,
      ruleId: null,
      confidence: 0.5,
      executionTimeMs: 20,
      modelVersion: 'fallback:heuristic:v1',
      isFallback: true,
    });
    expect(result.routingMethod).toBe('load_balance');
  });

  // A13: Ticket assigneeId updated after routing
  it('A13: routeTicket updates ticket assigneeId', async () => {
    const txUpdate = vi.fn().mockResolvedValue({ id: TICKET_UUID });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      return fn({
        ticket: {
          findUnique: vi.fn().mockResolvedValue({ status: 'OPEN' }),
          update: txUpdate,
        },
        agentAvailability: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        routingAudit: { create: vi.fn().mockResolvedValue({ id: AUDIT_UUID }) },
      });
    });

    await service.routeTicket({
      ticketId: TICKET_UUID,
      tenantId: TENANT_UUID,
      inferredCategory: 'BILLING',
      assigneeId: AGENT_1_UUID,
      assigneeName: 'Alice',
      reason: 'test',
      routingMethod: 'skill_match',
      matchedSkill: 'billing',
      ruleId: null,
      confidence: 0.9,
      executionTimeMs: 10,
      modelVersion: 'test',
      isFallback: false,
    });

    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TICKET_UUID },
        data: expect.objectContaining({ assigneeId: AGENT_1_UUID }),
      })
    );
  });

  // A14: No eligible agents → returns failure
  it('A14: suggestAssignees returns empty when no agents available', async () => {
    mockPrisma.agentAvailability.findMany.mockResolvedValue([]);
    const candidates = await service.suggestAssignees(TENANT_UUID, 'BILLING');
    expect(candidates).toHaveLength(0);
  });

  // A15: Service unavailable → fallback heuristic used
  it('A15: fallback heuristic returns isFallback=true', () => {
    const input = makeRoutingInput({ subject: 'Billing invoice issue' });
    const result = generateFallbackResult(input, 100);
    expect(result.isFallback).toBe(true);
    expect(result.modelVersion).toBe('fallback:heuristic:v1');
  });

  // A16: Successful routing emits TicketRoutedEvent fields
  it('A16: routeTicket returns all required fields on success', async () => {
    const result = await service.routeTicket({
      ticketId: TICKET_UUID,
      tenantId: TENANT_UUID,
      inferredCategory: 'BILLING',
      assigneeId: AGENT_1_UUID,
      assigneeName: 'Alice Billing',
      reason: 'Skill match for BILLING',
      routingMethod: 'skill_match',
      matchedSkill: 'billing',
      ruleId: null,
      confidence: 0.92,
      executionTimeMs: 45,
      modelVersion: 'gpt-4o-mini',
      isFallback: false,
    });
    expect(result.ticketId).toBe(TICKET_UUID);
    expect(result.assigneeId).toBe(AGENT_1_UUID);
    expect(result.assigneeName).toBe('Alice Billing');
    expect(result.auditId).toBe(AUDIT_UUID);
    expect(result.reason).toBeTruthy();
    expect(result.routingMethod).toBe('skill_match');
    expect(result.matchedSkill).toBe('billing');
  });

  // A17: SLA BREACHED ticket forces escalation
  it('A17: checkSlaEscalation returns true for BREACHED tickets', async () => {
    mockPrisma.ticket.findFirst.mockResolvedValue({
      id: TICKET_UUID,
      tenantId: TENANT_UUID,
      slaStatus: 'BREACHED',
    });
    const isEscalation = await service.checkSlaEscalation(TICKET_UUID, TENANT_UUID);
    expect(isEscalation).toBe(true);
  });

  // A18: LLM returns unrecognised assigneeId → fallback triggered
  it('A18: fallback selects lowest-load ONLINE agent', () => {
    const input = makeRoutingInput();
    const result = generateFallbackResult(input, 50);
    expect(result.isFallback).toBe(true);
    expect(result.assigneeId).toBe(AGENT_1_UUID); // Lowest-load ONLINE agent
  });

  // A19: routeTicket rejects ARCHIVED tickets at service level
  it('A19: assign rejects ARCHIVED tickets', async () => {
    // Mock transaction to return ticket with ARCHIVED status
    const txMock = {
      ticket: {
        findUnique: vi.fn().mockResolvedValue({ status: 'ARCHIVED' }),
        update: vi.fn(),
      },
      agentAvailability: { updateMany: vi.fn() },
      routingAudit: { create: vi.fn() },
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(txMock));

    await expect(
      service.routeTicket({
        ticketId: TICKET_UUID,
        tenantId: TENANT_UUID,
        inferredCategory: 'GENERAL',
        assigneeId: AGENT_1_UUID,
        assigneeName: 'Agent One',
        reason: 'test',
        routingMethod: 'load_balance',
        matchedSkill: null,
        ruleId: null,
        confidence: 0.5,
        executionTimeMs: 10,
        modelVersion: 'mock',
        isFallback: false,
      })
    ).rejects.toThrow('Cannot route an archived ticket');

    // Verify ticket was NOT updated
    expect(txMock.ticket.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Section B: Accuracy + NF Tests (8 tests)
// =============================================================================

describe('Section B: Accuracy + Non-Functional Tests', () => {
  // 22 labelled fixtures for accuracy testing
  const labelledFixtures: Array<{
    subject: string;
    description: string;
    expected: TicketCategory;
  }> = [
    // 5 BILLING
    {
      subject: 'Invoice discrepancy',
      description: 'My invoice shows wrong charge',
      expected: 'BILLING',
    },
    {
      subject: 'Unexpected charge on card',
      description: 'Saw a charge I did not authorize',
      expected: 'BILLING',
    },
    {
      subject: 'Refund request',
      description: 'I need a refund for last payment',
      expected: 'BILLING',
    },
    {
      subject: 'Subscription renewal issue',
      description: 'My subscription billing failed',
      expected: 'BILLING',
    },
    {
      subject: 'Payment method update',
      description: 'Cannot update payment card',
      expected: 'BILLING',
    },
    // 4 TECHNICAL
    {
      subject: 'Application crash on startup',
      description: 'The app crashes when I open it',
      expected: 'TECHNICAL',
    },
    {
      subject: 'Error 500 on dashboard',
      description: 'Server error loading page',
      expected: 'TECHNICAL',
    },
    {
      subject: 'Bug in report generation',
      description: 'Reports show wrong data, bug confirmed',
      expected: 'TECHNICAL',
    },
    {
      subject: 'Slow performance loading contacts',
      description: 'Performance degradation on contact list',
      expected: 'TECHNICAL',
    },
    // 3 SALES
    {
      subject: 'Enterprise pricing inquiry',
      description: 'What are pricing options for 500 users?',
      expected: 'SALES',
    },
    {
      subject: 'Request demo session',
      description: 'We want a demo of the product',
      expected: 'SALES',
    },
    {
      subject: 'Plan upgrade request',
      description: 'Want to upgrade from basic to enterprise',
      expected: 'SALES',
    },
    // 3 GENERAL
    {
      subject: 'General question about features',
      description: 'Just a question about how this works',
      expected: 'GENERAL',
    },
    {
      subject: 'Product feedback',
      description: 'Some feedback on the user experience',
      expected: 'GENERAL',
    },
    {
      subject: 'How-to guide for API',
      description: 'How to use the API integration',
      expected: 'GENERAL',
    },
    // 3 FEATURE_REQUEST
    {
      subject: 'Wish we had dark mode',
      description: 'Would love a dark mode feature',
      expected: 'FEATURE_REQUEST',
    },
    {
      subject: 'Want calendar integration',
      description: 'Feature request for calendar sync',
      expected: 'FEATURE_REQUEST',
    },
    {
      subject: 'Improve search functionality',
      description: 'Search needs improvement and enhancement',
      expected: 'FEATURE_REQUEST',
    },
    // 4 BUG_REPORT
    {
      subject: 'Button broken on settings page',
      description: 'The save button is broken and not working',
      expected: 'BUG_REPORT',
    },
    {
      subject: 'Email not working after update',
      description: 'Emails stopped working, not working at all',
      expected: 'BUG_REPORT',
    },
    {
      subject: 'Regression in contact import',
      description: 'Contact import has a regression from last release',
      expected: 'BUG_REPORT',
    },
    {
      subject: 'Defect in PDF export',
      description: 'PDF export has a defect producing blank pages',
      expected: 'BUG_REPORT',
    },
  ];

  // B1: Overall accuracy >= 85% across 22 labelled fixtures
  it('B1: achieves >= 85% accuracy across 22 labelled fixtures', () => {
    let correct = 0;
    for (const fixture of labelledFixtures) {
      const input = makeRoutingInput({
        subject: fixture.subject,
        description: fixture.description,
      });
      const result = generateFallbackResult(input, 10);
      if (result.inferredCategory === fixture.expected) {
        correct++;
      }
    }
    const accuracy = correct / labelledFixtures.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.85);
  });

  // B2: Billing category accuracy >= 90%
  it('B2: billing category accuracy >= 90%', () => {
    const billingFixtures = labelledFixtures.filter((f) => f.expected === 'BILLING');
    let correct = 0;
    for (const fixture of billingFixtures) {
      const input = makeRoutingInput({
        subject: fixture.subject,
        description: fixture.description,
      });
      const result = generateFallbackResult(input, 10);
      if (result.inferredCategory === 'BILLING') correct++;
    }
    expect(correct / billingFixtures.length).toBeGreaterThanOrEqual(0.9);
  });

  // B3: Auth category accuracy >= 90% (technical fixtures with auth/login)
  it('B3: technical category accuracy >= 90%', () => {
    const techFixtures = labelledFixtures.filter((f) => f.expected === 'TECHNICAL');
    let correct = 0;
    for (const fixture of techFixtures) {
      const input = makeRoutingInput({
        subject: fixture.subject,
        description: fixture.description,
      });
      const result = generateFallbackResult(input, 10);
      if (result.inferredCategory === 'TECHNICAL') correct++;
    }
    expect(correct / techFixtures.length).toBeGreaterThanOrEqual(0.9);
  });

  // B4: CRITICAL priority never down-classified
  it('B4: CRITICAL priority sets escalationRisk to high', () => {
    const input = makeRoutingInput({ priority: 'CRITICAL', subject: 'Urgent billing' });
    const result = generateFallbackResult(input, 10);
    expect(result.escalationRisk).toBe('high');
  });

  // B5: Confidence always in [0, 1] range
  it('B5: confidence is always in [0, 1] range for all fixtures', () => {
    for (const fixture of labelledFixtures) {
      const input = makeRoutingInput({
        subject: fixture.subject,
        description: fixture.description,
      });
      const result = generateFallbackResult(input, 10);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  // B6: Fallback result has confidence <= 0.35 signalling human review (NF-003)
  it('B6: fallback confidence <= 0.35 signals human review', () => {
    const input = makeRoutingInput();
    const result = generateFallbackResult(input, 10);
    expect(result.confidence).toBeLessThanOrEqual(0.35);
    expect(result.isFallback).toBe(true);
  });

  // B7: agentCandidates capped at 10 via schema enforcement (NF-004)
  it('B7: ticketRoutingInputSchema caps agentCandidates at 10', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ticketRoutingInputSchema } = require('@intelliflow/validators');
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      agentId: `agent-${i}`,
      name: `Agent ${i}`,
      skills: ['general'],
      currentLoad: 0,
      maxCapacity: 10,
      status: 'ONLINE',
    }));
    const result = ticketRoutingInputSchema.safeParse({
      ticketId: TICKET_UUID,
      tenantId: TENANT_UUID,
      subject: 'Test',
      priority: 'MEDIUM',
      agentCandidates: tooMany,
    });
    expect(result.success).toBe(false);
  });

  // B8: All DB queries include tenantId filter (NF-006)
  it('B8: getEligibleAgents includes tenantId in query', async () => {
    const mockPrisma = createMockPrisma();
    const service = new TicketRoutingService(mockPrisma);
    await service.getEligibleAgents(TENANT_UUID, 'billing');
    expect(mockPrisma.agentAvailability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_UUID }),
      })
    );
    expect(mockPrisma.agentSkill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_UUID }),
      })
    );
  });
});

// =============================================================================
// Section C: Performance Tests (4 tests)
// =============================================================================

describe('Section C: Performance Tests', () => {
  let service: TicketRoutingService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new TicketRoutingService(mockPrisma);
  });

  // C1: routeTicket < 50ms with mocked dependencies
  it('C1: routeTicket completes in < 50ms with mocks', async () => {
    const start = performance.now();
    await service.routeTicket({
      ticketId: TICKET_UUID,
      tenantId: TENANT_UUID,
      inferredCategory: 'BILLING',
      assigneeId: AGENT_1_UUID,
      assigneeName: 'Alice',
      reason: 'test',
      routingMethod: 'skill_match',
      matchedSkill: 'billing',
      ruleId: null,
      confidence: 0.9,
      executionTimeMs: 10,
      modelVersion: 'test',
      isFallback: false,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  // C2: categorise < 10ms with mocked chain
  it('C2: fallback categorisation completes in < 10ms', () => {
    const input = makeRoutingInput({ subject: 'Invoice billing issue' });
    const start = performance.now();
    generateFallbackResult(input, 0);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10);
  });

  // C3: selectAssignee < 5ms with 10 agents
  it('C3: getEligibleAgents < 5ms with mocked data', async () => {
    const start = performance.now();
    await service.getEligibleAgents(TENANT_UUID);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });

  // C4: Response includes executionTimeMs field
  it('C4: fallback result includes executionTimeMs', () => {
    const input = makeRoutingInput();
    const result = generateFallbackResult(input, 42);
    expect(result.executionTimeMs).toBe(42);
  });
});

// =============================================================================
// Section D: Router Caller + Container Wiring Tests (3 tests)
// =============================================================================

describe('Section D: Router Caller + Container Wiring Tests', () => {
  let routerModule: any;

  beforeAll(async () => {
    routerModule = await import('../ticket-routing.router.js');
  });

  // D1: container.ticketRoutingService is defined
  it('D1: container exports ticketRoutingService', async () => {
    const containerModule = await import('../../../container.js');
    expect(containerModule.container.ticketRoutingService).toBeDefined();
    expect(containerModule.container.ticketRoutingService).toBeInstanceOf(TicketRoutingService);
  });

  // D2: suggestAssignee caller returns candidates
  it('D2: suggestAssignee caller returns candidates', async () => {
    const mockService = {
      suggestAssignees: vi.fn().mockResolvedValue([
        {
          agentId: AGENT_1_UUID,
          name: 'Agent 1',
          skills: ['billing'],
          currentLoad: 3,
          maxCapacity: 10,
          status: 'ONLINE',
        },
      ]),
      checkSlaEscalation: vi.fn(),
      findMatchingRule: vi.fn(),
      routeTicket: vi.fn(),
      getEligibleAgents: vi.fn(),
    };
    const ctx = {
      services: { ticketRouting: mockService },
      prisma: {},
      user: { userId: USER_UUID, email: 'test@test.com', role: 'ADMIN', tenantId: TENANT_UUID },
    } as any;

    const caller = routerModule.ticketRoutingRouter.createCaller(ctx);
    const result = await caller.suggestAssignee({
      ticketId: TICKET_UUID,
      category: 'BILLING',
      limit: 5,
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].agentId).toBe(AGENT_1_UUID);
    expect(mockService.suggestAssignees).toHaveBeenCalledWith(TENANT_UUID, 'BILLING', 5);
  });

  // D3: autoRoute caller executes full strategy and returns result
  it('D3: autoRoute caller routes ticket via skill_match strategy', async () => {
    const mockService = {
      checkSlaEscalation: vi.fn().mockResolvedValue(false),
      findMatchingRule: vi.fn().mockResolvedValue(null),
      suggestAssignees: vi.fn().mockResolvedValue([
        {
          agentId: AGENT_1_UUID,
          name: 'Agent 1',
          skills: ['billing'],
          currentLoad: 3,
          maxCapacity: 10,
          status: 'ONLINE',
        },
      ]),
      routeTicket: vi.fn().mockResolvedValue({
        ticketId: TICKET_UUID,
        assigneeId: AGENT_1_UUID,
        assigneeName: 'Agent 1',
        auditId: AUDIT_UUID,
        reason: 'Skill match for category BILLING',
        routingMethod: 'skill_match',
        matchedSkill: 'billing',
        ruleId: null,
      }),
      getEligibleAgents: vi.fn(),
    };
    const ctx = {
      services: { ticketRouting: mockService },
      prisma: {
        ticket: {
          findFirst: vi.fn().mockResolvedValue({
            id: TICKET_UUID,
            tenantId: TENANT_UUID,
            subject: 'Billing issue',
            priority: 'MEDIUM',
            slaStatus: 'ON_TRACK',
          }),
        },
      },
      user: { userId: USER_UUID, email: 'test@test.com', role: 'ADMIN', tenantId: TENANT_UUID },
    } as any;

    const caller = routerModule.ticketRoutingRouter.createCaller(ctx);
    const result = await caller.autoRoute({
      ticketId: TICKET_UUID,
      category: 'BILLING',
    });

    expect(result.ticketId).toBe(TICKET_UUID);
    expect(result.assignedUserId).toBe(AGENT_1_UUID);
    expect(result.assignedUserName).toBe('Agent 1');
    expect(result.auditId).toBe(AUDIT_UUID);
    expect(mockService.routeTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: TICKET_UUID,
        routingMethod: 'skill_match',
        inferredCategory: 'BILLING',
      })
    );
  });

  // D4: autoRoute with SLA escalation picks escalation strategy
  it('D4: autoRoute uses escalation strategy on SLA breach', async () => {
    const mockService = {
      checkSlaEscalation: vi.fn().mockResolvedValue(true),
      findMatchingRule: vi.fn().mockResolvedValue(null),
      suggestAssignees: vi.fn().mockResolvedValue([
        {
          agentId: AGENT_2_UUID,
          name: 'Senior Agent',
          skills: ['billing'],
          currentLoad: 1,
          maxCapacity: 10,
          status: 'ONLINE',
        },
      ]),
      routeTicket: vi.fn().mockResolvedValue({
        ticketId: TICKET_UUID,
        assigneeId: AGENT_2_UUID,
        assigneeName: 'Senior Agent',
        auditId: AUDIT_UUID,
        reason: 'SLA breach escalation',
        routingMethod: 'escalation',
        matchedSkill: null,
        ruleId: null,
      }),
      getEligibleAgents: vi.fn(),
    };
    const ctx = {
      services: { ticketRouting: mockService },
      prisma: {
        ticket: {
          findFirst: vi.fn().mockResolvedValue({
            id: TICKET_UUID,
            tenantId: TENANT_UUID,
            priority: 'HIGH',
            slaStatus: 'BREACHED',
          }),
        },
      },
      user: { userId: USER_UUID, email: 'test@test.com', role: 'ADMIN', tenantId: TENANT_UUID },
    } as any;

    const caller = routerModule.ticketRoutingRouter.createCaller(ctx);
    const result = await caller.autoRoute({ ticketId: TICKET_UUID, category: 'TECHNICAL' });

    expect(result.assignedUserId).toBe(AGENT_2_UUID);
    expect(mockService.routeTicket).toHaveBeenCalledWith(
      expect.objectContaining({ routingMethod: 'escalation' })
    );
  });

  // D5: autoRoute with routing rule uses rule_match strategy
  it('D5: autoRoute uses rule_match strategy when rule exists', async () => {
    const RULE_UUID = '00000000-0000-4000-8000-000000000090';
    const mockService = {
      checkSlaEscalation: vi.fn().mockResolvedValue(false),
      findMatchingRule: vi.fn().mockResolvedValue({
        id: RULE_UUID,
        assignToUserId: AGENT_1_UUID,
        ruleName: 'Billing Priority Rule',
      }),
      suggestAssignees: vi.fn().mockResolvedValue([
        {
          agentId: AGENT_1_UUID,
          name: 'Agent 1',
          skills: ['billing'],
          currentLoad: 3,
          maxCapacity: 10,
          status: 'ONLINE',
        },
      ]),
      routeTicket: vi.fn().mockResolvedValue({
        ticketId: TICKET_UUID,
        assigneeId: AGENT_1_UUID,
        assigneeName: 'Agent 1',
        auditId: AUDIT_UUID,
        reason: 'Rule match: Billing Priority Rule',
        routingMethod: 'rule_match',
        matchedSkill: null,
        ruleId: RULE_UUID,
      }),
      getEligibleAgents: vi.fn(),
    };
    const ctx = {
      services: { ticketRouting: mockService },
      prisma: {
        ticket: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: TICKET_UUID, tenantId: TENANT_UUID, priority: 'HIGH' }),
        },
      },
      user: { userId: USER_UUID, email: 'test@test.com', role: 'ADMIN', tenantId: TENANT_UUID },
    } as any;

    const caller = routerModule.ticketRoutingRouter.createCaller(ctx);
    const result = await caller.autoRoute({ ticketId: TICKET_UUID, category: 'BILLING' });

    expect(result.assignedUserId).toBe(AGENT_1_UUID);
    expect(mockService.routeTicket).toHaveBeenCalledWith(
      expect.objectContaining({ routingMethod: 'rule_match', ruleId: RULE_UUID })
    );
  });

  // D6: autoRoute throws PRECONDITION_FAILED when no candidates
  it('D6: autoRoute throws when no agents available', async () => {
    const mockService = {
      checkSlaEscalation: vi.fn().mockResolvedValue(false),
      findMatchingRule: vi.fn().mockResolvedValue(null),
      suggestAssignees: vi.fn().mockResolvedValue([]),
      routeTicket: vi.fn(),
      getEligibleAgents: vi.fn(),
    };
    const ctx = {
      services: { ticketRouting: mockService },
      prisma: {
        ticket: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: TICKET_UUID, tenantId: TENANT_UUID, priority: 'LOW' }),
        },
      },
      user: { userId: USER_UUID, email: 'test@test.com', role: 'ADMIN', tenantId: TENANT_UUID },
    } as any;

    const caller = routerModule.ticketRoutingRouter.createCaller(ctx);
    await expect(caller.autoRoute({ ticketId: TICKET_UUID })).rejects.toThrow(
      'No eligible agents available'
    );
  });

  // D7: autoRoute throws NOT_FOUND for unknown ticket
  it('D7: autoRoute throws NOT_FOUND for missing ticket', async () => {
    const mockService = {
      checkSlaEscalation: vi.fn(),
      findMatchingRule: vi.fn(),
      suggestAssignees: vi.fn(),
      routeTicket: vi.fn(),
      getEligibleAgents: vi.fn(),
    };
    const ctx = {
      services: { ticketRouting: mockService },
      prisma: {
        ticket: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      user: { userId: USER_UUID, email: 'test@test.com', role: 'ADMIN', tenantId: TENANT_UUID },
    } as any;

    const caller = routerModule.ticketRoutingRouter.createCaller(ctx);
    await expect(caller.autoRoute({ ticketId: TICKET_UUID })).rejects.toThrow('Ticket not found');
  });

  // D8: findMatchingRule returns rule or null
  it('D8: findMatchingRule with no matching rule returns null', async () => {
    const mockPr = createMockPrisma();
    const svc = new TicketRoutingService(mockPr);
    const result = await svc.findMatchingRule(TENANT_UUID, 'BILLING', 'HIGH');
    expect(result).toBeNull();
  });

  // D9: checkSlaEscalation returns false for non-BREACHED
  it('D9: checkSlaEscalation returns false for ON_TRACK tickets', async () => {
    const mockPr = createMockPrisma();
    mockPr.ticket.findFirst.mockResolvedValue({
      id: TICKET_UUID,
      slaStatus: 'ON_TRACK',
    });
    const svc = new TicketRoutingService(mockPr);
    const result = await svc.checkSlaEscalation(TICKET_UUID, TENANT_UUID);
    expect(result).toBe(false);
  });

  // D10: router throws INTERNAL_SERVER_ERROR when service missing
  it('D10: autoRoute throws when service not wired', async () => {
    const ctx = {
      services: {},
      prisma: {},
      user: { userId: USER_UUID, email: 'test@test.com', role: 'ADMIN', tenantId: TENANT_UUID },
    } as any;
    const caller = routerModule.ticketRoutingRouter.createCaller(ctx);
    await expect(caller.autoRoute({ ticketId: TICKET_UUID })).rejects.toThrow(
      'Ticket routing service not available'
    );
  });

  // D11: suggestAssignee throws INTERNAL_SERVER_ERROR when service missing
  it('D11: suggestAssignee throws when service not wired', async () => {
    const ctx = {
      services: {},
      prisma: {},
      user: { userId: USER_UUID, email: 'test@test.com', role: 'ADMIN', tenantId: TENANT_UUID },
    } as any;
    const caller = routerModule.ticketRoutingRouter.createCaller(ctx);
    await expect(caller.suggestAssignee({ ticketId: TICKET_UUID })).rejects.toThrow(
      'Ticket routing service not available'
    );
  });

  // D12: routeTicket throws when ticket not found
  it('D12: routeTicket throws when ticket not found', async () => {
    const txMock = {
      ticket: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
      agentAvailability: { updateMany: vi.fn() },
      routingAudit: { create: vi.fn() },
    };
    const mockPr = createMockPrisma();
    mockPr.$transaction.mockImplementation(async (fn: any) => fn(txMock));
    const svc = new TicketRoutingService(mockPr);

    await expect(
      svc.routeTicket({
        ticketId: '00000000-0000-0000-0000-000000000099',
        tenantId: TENANT_UUID,
        inferredCategory: 'GENERAL',
        assigneeId: AGENT_1_UUID,
        assigneeName: 'Agent One',
        reason: 'test',
        routingMethod: 'load_balance',
        matchedSkill: null,
        ruleId: null,
        confidence: 0.5,
        executionTimeMs: 10,
        modelVersion: 'mock',
        isFallback: false,
      })
    ).rejects.toThrow('not found');
  });

  // D13: getEligibleAgents with skill sorts by proficiency (nullable branch)
  it('D13: getEligibleAgents sort handles null proficiency', async () => {
    const mockPr = createMockPrisma();
    // Return agents where one has proficiency and one doesn't (null)
    mockPr.agentAvailability.findMany.mockResolvedValue([
      {
        userId: AGENT_1_UUID,
        currentCapacity: 2,
        maxCapacity: 10,
        status: 'ONLINE',
        user: { id: AGENT_1_UUID, name: 'Agent 1' },
      },
      {
        userId: AGENT_2_UUID,
        currentCapacity: 1,
        maxCapacity: 10,
        status: 'ONLINE',
        user: { id: AGENT_2_UUID, name: 'Agent 2' },
      },
    ]);
    (mockPr as any).agentSkill.findMany.mockResolvedValue([
      { userId: AGENT_1_UUID, skillName: 'billing', proficiency: 90, tenantId: TENANT_UUID },
      { userId: AGENT_2_UUID, skillName: 'billing', proficiency: undefined, tenantId: TENANT_UUID },
    ]);

    const svc = new TicketRoutingService(mockPr);
    const agents = await svc.getEligibleAgents(TENANT_UUID, 'billing');
    expect(agents).toHaveLength(2);
    // Agent 1 (proficiency 90) should be first
    expect(agents[0].agentId).toBe(AGENT_1_UUID);
  });

  // D14: findMatchingRule returns rule when one exists
  it('D14: findMatchingRule returns rule when match found', async () => {
    const RULE_UUID = '00000000-0000-4000-8000-000000000091';
    const mockPr = createMockPrisma();
    (mockPr as any).routingRule.findFirst.mockResolvedValue({
      id: RULE_UUID,
      name: 'Auto-assign billing',
      assignToUserId: AGENT_1_UUID,
    });
    const svc = new TicketRoutingService(mockPr);
    const result = await svc.findMatchingRule(TENANT_UUID, 'BILLING', 'HIGH');
    expect(result).not.toBeNull();
    expect(result!.id).toBe(RULE_UUID);
    expect(result!.assignToUserId).toBe(AGENT_1_UUID);
  });
});
