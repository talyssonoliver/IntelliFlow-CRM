/**
 * Saved chain versions take effect.
 *
 * Wires the shared loader the way the ai-worker does at startup (configureVersionLoaderFromPrisma),
 * with the real ChainVersionService and Prisma chain-version repository over an in-memory Prisma
 * double that filters rows by its `where` like the database would. Then runs the lead scoring chain
 * and reads the prompt the model was handed.
 *
 * Stubs only: the model and the tenant tier lookup are mocked; no DB, no model call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { configureVersionLoader, configureVersionLoaderFromPrisma } from '../chain-version-loader';
import { LeadScoringChain } from '../../chains/scoring.chain';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '33333333-3333-4333-8333-333333333333';
const MARKER = 'SAVED SCORING VERSION FOR THIS TENANT';

interface Row {
  id: string;
  chainType: string;
  status: string;
  tenantId: string;
  prompt: string;
}

/** A Prisma double whose chainVersion.findFirst filters by every field in `where`. */
function fakePrisma(rows: Row[]) {
  const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const row = rows.find((r) =>
      Object.entries(where).every(
        ([key, value]) => (r as unknown as Record<string, unknown>)[key] === value
      )
    );
    return row
      ? {
          ...row,
          model: 'gpt-4o-mini',
          temperature: 0.2,
          maxTokens: 800,
          config: null,
          rolloutStrategy: 'IMMEDIATE',
          rolloutPercent: null,
          experimentId: null,
          createdBy: 'user-1',
          createdAt: new Date('2026-11-01T00:00:00Z'),
        }
      : null;
  });
  return { prisma: { chainVersion: { findFirst } }, findFirst };
}

const version = (tenantId: string, prompt: string): Row => ({
  id: `v-${tenantId.slice(0, 4)}`,
  chainType: 'SCORING',
  status: 'ACTIVE',
  tenantId,
  prompt,
});

/** The model is stopped after it receives the prompt; only the prompt matters here. */
async function scoringPrompt(tenantId: string): Promise<string> {
  await new LeadScoringChain({ tenantId })
    .scoreLead({ email: 'buyer@acme.example.invalid', company: 'Acme', source: 'WEBSITE' })
    .catch(() => undefined);
  const call = structuredInvoke.mock.calls[0] ?? rawInvoke.mock.calls[0];
  expect(call, 'the model was never called').toBeDefined();
  return String(call![0]);
}

describe('saved chain versions take effect in the ai-worker chains', () => {
  beforeEach(() => {
    structuredInvoke.mockReset().mockRejectedValue(new Error('stop after the prompt'));
    rawInvoke.mockReset().mockRejectedValue(new Error('stop after the prompt'));
    configureVersionLoader(undefined);
  });

  it("uses the tenant's saved, active version when its prompt carries the chain's input", async () => {
    const { prisma } = fakePrisma([version(TENANT_A, `${MARKER}\n\nLead:\n{lead_info}`)]);
    await configureVersionLoaderFromPrisma(prisma);

    const prompt = await scoringPrompt(TENANT_A);

    expect(prompt).toContain(MARKER);
    expect(prompt).toContain('Acme');
  });

  it("keeps the chain's own prompt when the saved version has no slot for the input", async () => {
    const { prisma } = fakePrisma([version(TENANT_A, `${MARKER} (no input slot)`)]);
    await configureVersionLoaderFromPrisma(prisma);

    const prompt = await scoringPrompt(TENANT_A);

    expect(prompt).not.toContain(MARKER);
    expect(prompt).toContain('Company: Acme');
  });

  it("keeps the chain's own prompt when the tenant has no active version", async () => {
    const { prisma, findFirst } = fakePrisma([]);
    await configureVersionLoaderFromPrisma(prisma);

    const prompt = await scoringPrompt(TENANT_A);

    expect(prompt).toContain('Company: Acme');
    expect(prompt).not.toContain('You are an expert B2B lead scoring assistant');
    expect(findFirst).toHaveBeenCalledWith({
      where: { chainType: 'SCORING', tenantId: TENANT_A, status: 'ACTIVE' },
    });
  });

  it("never reads another tenant's version", async () => {
    const { prisma, findFirst } = fakePrisma([version(TENANT_A, `${MARKER}\n{lead_info}`)]);
    await configureVersionLoaderFromPrisma(prisma);

    const prompt = await scoringPrompt(TENANT_B);

    expect(prompt).not.toContain(MARKER);
    expect(prompt).toContain('Company: Acme');
    for (const [args] of findFirst.mock.calls) {
      expect(args.where.tenantId).toBe(TENANT_B);
    }
  });
});
