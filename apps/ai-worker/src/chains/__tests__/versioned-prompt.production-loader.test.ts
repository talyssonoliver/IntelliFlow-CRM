/**
 * The version loader is NOT mocked here. In production nothing calls configureVersionLoader(),
 * so getChainConfig() always returns the loader's own fallback (DEFAULT_CONFIGS in
 * versioning/version-loader.ts). Those prompts have no input slots, and they replaced each
 * chain's prompt whenever a tenantId was set: the model got instructions without the data.
 * Each test runs a chain with a tenantId and reads the prompt the model was handed.
 * Stubs only: the model and the tenant tier lookup are mocked; no DB, no model call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const structuredInvoke = vi.fn();
const rawInvoke = vi.fn();
const fakeModel = () => ({
  withStructuredOutput: vi.fn(() => ({ invoke: structuredInvoke })),
  invoke: rawInvoke,
});

vi.mock('../../lib/llm-factory.js', () => ({
  createLLM: vi.fn(() => fakeModel()),
  createLLMForTenant: vi.fn(async () => fakeModel()),
  createEmbeddings: vi.fn(),
  getLLMBreaker: vi.fn(() => ({ execute: vi.fn(async (fn: () => unknown) => fn()) })),
  __resetBreakers: vi.fn(),
}));
vi.mock('../../lib/llm-factory', () => ({
  createLLM: vi.fn(() => fakeModel()),
  createLLMForTenant: vi.fn(async () => fakeModel()),
  createEmbeddings: vi.fn(),
  getLLMBreaker: vi.fn(() => ({ execute: vi.fn(async (fn: () => unknown) => fn()) })),
  __resetBreakers: vi.fn(),
}));
vi.mock('../../lib/tenant-ai-config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveEffectiveTier: vi.fn(async () => ({ tier: 'free' })),
}));

import { getVersionLoader } from '../../versioning/chain-version-loader';
import { LeadScoringChain } from '../scoring.chain';
import { ChurnRiskChain } from '../churn-risk.chain';
import { InsightGenerationChain } from '../insight-generation.chain';
import { SentimentAnalysisChain } from '../sentiment.chain';
import { TicketRoutingChain } from '../ticket-routing.chain';
import { AutoResponseChain } from '../auto-response.chain';

const TENANT = '11111111-1111-4111-8111-111111111111';
const ENTITY = '22222222-2222-4222-8222-222222222222';

/** The model is stopped after it receives the prompt; only the prompt matters here. */
async function promptFrom(run: () => Promise<unknown>): Promise<string> {
  await run().catch(() => undefined);
  const call = structuredInvoke.mock.calls[0] ?? rawInvoke.mock.calls[0];
  expect(call, 'the model was never called').toBeDefined();
  return String(call![0]);
}

beforeEach(() => {
  structuredInvoke.mockReset().mockRejectedValue(new Error('stop after the prompt'));
  rawInvoke.mockReset().mockRejectedValue(new Error('stop after the prompt'));
});

describe('the loader fallback prompts carry no data slots (why the data was missing)', () => {
  it.each(['SCORING', 'QUALIFICATION', 'EMAIL_WRITER', 'FOLLOWUP'] as const)('%s', async (type) => {
    const { prompt } = await getVersionLoader().getChainConfig(type, { tenantId: TENANT });
    expect(prompt).not.toMatch(/\{[a-z_A-Z]+\}/);
  });
});

describe('with a tenantId and the production loader, the model receives the data', () => {
  it('lead scoring: the lead fields and engagement lines', async () => {
    const engagement =
      'Engagement: 1 emails sent to the lead, 1 replies from the lead\n' +
      '- 2026-11-05 EMAIL inbound: Reply received: what is the price?';
    const prompt = await promptFrom(() =>
      new LeadScoringChain({ tenantId: TENANT }).scoreLead({
        email: 'buyer@acme.example.invalid',
        company: 'Acme',
        source: 'WEBSITE',
        activity: engagement,
      })
    );
    expect(prompt).toContain('Company: Acme');
    expect(prompt).toContain(engagement);
    expect(prompt).not.toContain('You are an expert B2B lead scoring assistant');
  });

  it('churn risk: the customer data, under churn instructions', async () => {
    const prompt = await promptFrom(() =>
      new ChurnRiskChain({ tenantId: TENANT }).predictChurnRisk({
        entityType: 'account',
        entityId: ENTITY,
        daysSinceLastLogin: 47,
        supportTickets30d: 9,
      } as never)
    );
    expect(prompt).toContain(ENTITY);
    expect(prompt).toContain('47');
    expect(prompt).toContain('churn');
    expect(prompt).not.toContain('You are an expert B2B lead scoring assistant');
  });

  it('insight generation: the pipeline snapshot', async () => {
    const prompt = await promptFrom(() =>
      new InsightGenerationChain({ tenantId: TENANT }).generateInsightsWithMeta({
        tenantId: TENANT,
        userId: 'user-1',
        dealsAtRisk: [{ id: ENTITY, name: 'Northwind renewal', daysSinceUpdate: 21 }],
        hotLeads: [],
        overdueTasksCount: 4,
        staleContacts: [],
      } as never)
    );
    expect(prompt).toContain('Northwind renewal');
    expect(prompt).toContain('OVERDUE TASKS: 4');
    expect(prompt).not.toContain('BANT Framework');
  });

  it('sentiment: the text to analyse, under sentiment instructions', async () => {
    const prompt = await promptFrom(() =>
      new SentimentAnalysisChain({ tenantId: TENANT }).analyze({
        text: 'Third outage this month, we are looking at other vendors.',
        source: 'email',
      } as never)
    );
    expect(prompt).toContain('Third outage this month, we are looking at other vendors.');
    expect(prompt).toContain('sentiment');
    expect(prompt).not.toContain('You are a professional B2B email writer');
  });

  it('ticket routing: the ticket and the agent roster', async () => {
    const prompt = await promptFrom(() =>
      new TicketRoutingChain({ tenantId: TENANT }).routeTicket({
        subject: 'Invoice charged twice',
        description: 'We were billed twice for October.',
        priority: 'HIGH',
        agentCandidates: [
          {
            agentId: 'agent-7',
            name: 'Billing desk',
            skills: ['billing'],
            currentLoad: 1,
            maxCapacity: 5,
            status: 'ONLINE',
          },
        ],
      } as never)
    );
    expect(prompt).toContain('Invoice charged twice');
    expect(prompt).toContain('ID: agent-7');
    expect(prompt).not.toContain('You are a sales follow-up strategist');
  });

  it("auto-response: the tenant's own custom instructions are kept", async () => {
    const prompt = await promptFrom(() =>
      new AutoResponseChain({ tenantId: TENANT }).generateResponse({
        triggerType: 'EMAIL_RECEIVED',
        leadInfo: { id: ENTITY, name: 'Dana', email: 'dana@acme.example.invalid', status: 'NEW' },
        context: { originalMessage: 'Do you integrate with our ERP?' },
        tenantSettings: {
          companyName: 'Acme',
          tone: 'friendly',
          customInstructions: 'Always offer the 30-day trial.',
        },
      })
    );
    expect(prompt).toContain('Do you integrate with our ERP?');
    expect(prompt).toContain('Always offer the 30-day trial.');
    expect(prompt).not.toContain('You are a professional B2B email writer');
  });
});
