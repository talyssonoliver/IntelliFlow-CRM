import { describe, it, expect, beforeEach, vi } from 'vitest';

let mockInvoke: ReturnType<typeof vi.fn>;
let mockOllamaInvoke: ReturnType<typeof vi.fn>;

vi.mock('@langchain/openai', () => {
  const M = function (this: any, o?: any) {
    mockInvoke = mockInvoke ?? vi.fn();
    this.invoke = mockInvoke;
    this._callbacks = o?.callbacks;
  };
  return { ChatOpenAI: M };
});

vi.mock('@langchain/ollama', () => {
  const M = function (this: any) {
    mockOllamaInvoke = mockOllamaInvoke ?? vi.fn();
    this.invoke = mockOllamaInvoke;
  };
  return { ChatOllama: M };
});

vi.mock('@langchain/core/prompts', () => ({
  PromptTemplate: function (this: any) {
    this.format = vi.fn().mockResolvedValue('fp');
  },
}));

vi.mock('@langchain/core/output_parsers', () => ({
  StructuredOutputParser: {
    fromZodSchema: () => ({
      getFormatInstructions: () => 'fi',
      parse: vi.fn().mockResolvedValue({
        score: 65,
        confidence: 0.75,
        factors: [
          {
            name: 'TF',
            impact: 20,
            reasoning: 'Test reasoning for this factor is valid and detailed.',
          },
        ],
      }),
    }),
  },
}));

vi.mock('../utils/cost-tracker', () => ({ costTracker: { recordUsage: vi.fn() } }));
vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

let mockAiConfig: any;
vi.mock('../config/ai.config', () => ({
  get aiConfig() {
    return mockAiConfig;
  },
}));

import {
  LeadScoringChain,
  LeadInput,
  getLeadScoringChain,
  leadScoringChain,
} from './scoring.chain';

const baseCfg = {
  provider: 'openai' as const,
  openai: {
    apiKey: 'k',
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 2000,
    timeout: 30000,
  },
  ollama: { baseUrl: 'http://localhost:11434', model: 'mistral', temperature: 0.7, timeout: 60000 },
  costTracking: { enabled: false, warningThreshold: 10 },
  performance: {
    cacheEnabled: false,
    cacheTTL: 3600,
    rateLimitPerMinute: 0,
    retryAttempts: 3,
    retryDelay: 1000,
  },
  features: {
    enableChainLogging: false,
    enableConfidenceScores: true,
    enableStructuredOutputs: true,
    enableMultiAgentWorkflows: false,
  },
};

const sJson = JSON.stringify({
  score: 65,
  confidence: 0.75,
  factors: [
    { name: 'TF', impact: 20, reasoning: 'Test reasoning for this factor is valid and detailed.' },
  ],
});

describe('LeadScoringChain - additional', () => {
  beforeEach(() => {
    mockInvoke = vi.fn().mockResolvedValue({ content: sJson });
    mockOllamaInvoke = vi.fn().mockResolvedValue({ content: sJson });
    mockAiConfig = { ...baseCfg };
  });

  it('creates chain with Ollama', () => {
    mockAiConfig = { ...baseCfg, provider: 'ollama' };
    expect(new LeadScoringChain()).toBeDefined();
  });
  it('throws for unsupported provider', () => {
    mockAiConfig = { ...baseCfg, provider: 'unsupported' };
    expect(() => new LeadScoringChain()).toThrow('Unsupported AI provider');
  });
  it('returns error on LLM throw', async () => {
    mockInvoke.mockRejectedValue(new Error('rate limit'));
    const r = await new LeadScoringChain().scoreLead({ email: 'f@e.com', source: 'WEB' });
    expect(r.score).toBe(0);
    expect(r.confidence).toBe(0);
    expect(r.modelVersion).toBe('error:v1');
    expect(r.factors[0].reasoning).toContain('rate limit');
  });
  it('handles non-Error thrown', async () => {
    mockInvoke.mockRejectedValue('oops');
    const r = await new LeadScoringChain().scoreLead({ email: 'f@e.com', source: 'W' });
    expect(r.factors[0].reasoning).toContain('Unknown error');
  });
  it('sets openai model version', async () => {
    const r = await new LeadScoringChain().scoreLead({ email: 't@a.com', source: 'W' });
    expect(r.modelVersion).toBe('openai:gpt-4-turbo-preview:v1');
  });
  it('sets ollama model version', async () => {
    mockAiConfig = { ...baseCfg, provider: 'ollama' };
    const r = await new LeadScoringChain().scoreLead({ email: 't@a.com', source: 'W' });
    expect(r.modelVersion).toBe('ollama:mistral:v1');
  });
  it('batch scores leads', async () => {
    const rs = await new LeadScoringChain().scoreLeads([
      { email: 'a@a.com', source: 'W' },
      { email: 'b@b.com', source: 'R' },
    ]);
    expect(rs).toHaveLength(2);
  });
  it('delays for rate limit', async () => {
    mockAiConfig = { ...baseCfg, performance: { ...baseCfg.performance, rateLimitPerMinute: 120 } };
    const t = Date.now();
    await new LeadScoringChain().scoreLeads([
      { email: 'a@t.com', source: 'W' },
      { email: 'b@t.com', source: 'W' },
    ]);
    expect(Date.now() - t).toBeGreaterThanOrEqual(400);
  });
  it('handles empty batch', async () => {
    expect(await new LeadScoringChain().scoreLeads([])).toHaveLength(0);
  });
  it('formatLeadInfo minimal', () => {
    const f = (new LeadScoringChain() as any).formatLeadInfo({ email: 'm@t.com', source: 'CC' });
    expect(f).toContain('m@t.com');
    expect(f).toContain('Email Domain: t.com');
  });
  it('formatLeadInfo firstName', () => {
    expect(
      (new LeadScoringChain() as any).formatLeadInfo({
        email: 'a@b.c',
        firstName: 'Al',
        source: 'W',
      })
    ).toContain('Name: Al');
  });
  it('formatLeadInfo lastName', () => {
    expect(
      (new LeadScoringChain() as any).formatLeadInfo({
        email: 'a@b.c',
        lastName: 'Sm',
        source: 'W',
      })
    ).toContain('Name: Sm');
  });
  it('formatLeadInfo phone', () => {
    expect(
      (new LeadScoringChain() as any).formatLeadInfo({ email: 'a@b.c', phone: '+1', source: 'W' })
    ).toContain('Phone: Available');
  });
  it('formatLeadInfo metadata', () => {
    expect(
      (new LeadScoringChain() as any).formatLeadInfo({
        email: 'a@b.c',
        source: 'W',
        metadata: { k: 'v' },
      })
    ).toContain('Additional Data:');
  });
  it('validate: short reasoning', () => {
    const v = new LeadScoringChain().validateScoringResult({
      score: 80,
      confidence: 0.9,
      factors: [
        { name: 'F', impact: 20, reasoning: 'Short' },
        { name: 'G', impact: 15, reasoning: 'Detailed explanation that is long enough here.' },
      ],
      modelVersion: 'v1',
    });
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.includes('factors lack detailed reasoning'))).toBe(true);
  });
  it('validate: 0.5 confidence valid', () => {
    const v = new LeadScoringChain().validateScoringResult({
      score: 50,
      confidence: 0.5,
      factors: [{ name: 'F', impact: 10, reasoning: 'Sufficiently detailed reasoning text.' }],
      modelVersion: 'v1',
    });
    expect(v.valid).toBe(true);
  });
  it('validate: multiple issues', () => {
    const v = new LeadScoringChain().validateScoringResult({
      score: 10,
      confidence: 0.2,
      factors: [],
      modelVersion: 'e',
    });
    expect(v.valid).toBe(false);
    expect(v.issues.length).toBe(2);
  });
  it('singleton returns instance', () => {
    expect(getLeadScoringChain()).toBeInstanceOf(LeadScoringChain);
  });
  it('proxy scoreLead', () => {
    expect(typeof leadScoringChain.scoreLead).toBe('function');
  });
  it('proxy validateScoringResult', () => {
    expect(typeof leadScoringChain.validateScoringResult).toBe('function');
  });
  it('chain logging + cost tracking', () => {
    mockAiConfig = {
      ...baseCfg,
      features: { ...baseCfg.features, enableChainLogging: true },
      costTracking: { enabled: true, warningThreshold: 10 },
    };
    expect(new LeadScoringChain()).toBeDefined();
  });
});
