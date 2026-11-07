/**
 * The version loader is not mocked here: in production nothing calls configureVersionLoader(),
 * so getChainConfig('SCORING') always returns DEFAULT_CONFIGS.SCORING from
 * versioning/version-loader.ts, a prompt with no {lead_info} slot. Every scoring call with a
 * tenantId used that text, and the model never saw the lead or its engagement history.
 */
import { describe, it, expect, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('../../lib/llm-factory.js', () => ({
  createLLM: vi.fn(() => ({ withStructuredOutput: vi.fn(() => ({ invoke })) })),
  createLLMForTenant: vi.fn(async () => ({ withStructuredOutput: vi.fn(() => ({ invoke })) })),
  createEmbeddings: vi.fn(),
  getLLMBreaker: vi.fn(() => ({ execute: vi.fn(async (fn: () => unknown) => fn()) })),
  __resetBreakers: vi.fn(),
}));

// No database: the tenant tier lookup is stubbed.
vi.mock('../../lib/tenant-ai-config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveEffectiveTier: vi.fn(async () => ({ tier: 'free' })),
}));

import { LeadScoringChain } from '../scoring.chain';
import { getVersionLoader } from '../../versioning/chain-version-loader';

describe('scoring prompt with the production version loader', () => {
  it('the loader fallback for SCORING has no {lead_info} slot (why the lead was missing)', async () => {
    const config = await getVersionLoader().getChainConfig('SCORING', { tenantId: 't-1' });
    expect(config.prompt).toContain('You are an expert B2B lead scoring assistant.');
    expect(config.prompt).not.toContain('{lead_info}');
  });

  it('the prompt sent to the model still carries the lead and its engagement lines', async () => {
    invoke.mockResolvedValueOnce({
      score: 70,
      confidence: 0.8,
      factors: [{ name: 'Reply', impact: 20, reasoning: 'The lead asked about the price.' }],
    });
    const engagement =
      'Engagement: 1 emails sent to the lead, 1 replies from the lead\n' +
      '- 2026-11-05 EMAIL inbound: Reply received: what is the price?';

    await new LeadScoringChain({ tenantId: 't-1' }).scoreLead({
      email: 'buyer@acme.example.invalid',
      company: 'Acme',
      source: 'WEBSITE',
      activity: engagement,
    });

    const prompt = invoke.mock.calls[0]![0] as string;
    expect(prompt.startsWith('You are an expert B2B lead scoring assistant.')).toBe(true);
    expect(prompt).toContain('Company: Acme');
    expect(prompt).toContain(engagement);
  });
});
