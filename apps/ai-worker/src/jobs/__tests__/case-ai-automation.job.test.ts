/**
 * PG-190 — Unit tests for processCaseAiAutomationJob.
 *
 * Mocks @intelliflow/db prisma + the 4 chains to confirm flag gating.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

const H = vi.hoisted(() => ({
  insightMock: vi.fn(),
  summarizeMock: vi.fn(),
  priorityMock: vi.fn(),
  resolutionMock: vi.fn(),
  findUniqueMock: vi.fn(),
}));
const { insightMock, summarizeMock, priorityMock, resolutionMock, findUniqueMock } = H;

vi.mock('@intelliflow/db', () => ({
  prisma: {
    caseAutomationSetting: { findUnique: H.findUniqueMock },
  },
}));
vi.mock('../../case-insight.chain.js', () => ({ generateCaseInsight: H.insightMock }));
vi.mock('../../case-summarization.chain.js', () => ({ generateCaseSummary: H.summarizeMock }));
vi.mock('../../case-priority-prediction.chain.js', () => ({ predictCasePriority: H.priorityMock }));
vi.mock('../../case-resolution-suggestion.chain.js', () => ({
  suggestCaseResolution: H.resolutionMock,
}));

import { processCaseAiAutomationJob } from '../case-ai-automation.job';

function makeJob(operation: string, extras: Record<string, unknown> = {}): Job {
  return {
    id: '1',
    data: {
      tenantId: 't1',
      caseId: 'c1',
      operation,
      ...extras,
    },
  } as unknown as Job;
}

describe('processCaseAiAutomationJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips insight-generation when aiInsightGeneration=false', async () => {
    findUniqueMock.mockResolvedValue({
      aiCaseSummarization: false,
      aiPriorityPrediction: false,
      aiResolutionSuggestion: false,
      aiTagSuggestions: false,
      aiInsightGeneration: false,
    });
    const result = await processCaseAiAutomationJob(makeJob('insight-generation'));
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('aiInsightGeneration=false');
    expect(insightMock).not.toHaveBeenCalled();
  });

  it('runs insight-generation when aiInsightGeneration=true', async () => {
    findUniqueMock.mockResolvedValue({
      aiCaseSummarization: false,
      aiPriorityPrediction: false,
      aiResolutionSuggestion: false,
      aiTagSuggestions: false,
      aiInsightGeneration: true,
    });
    insightMock.mockResolvedValue({ success: true, source: 'llm', modelVersion: 'v1' });
    const result = await processCaseAiAutomationJob(makeJob('insight-generation'));
    expect(result.skipped).toBe(false);
    expect(insightMock).toHaveBeenCalledWith({ caseId: 'c1', tenantId: 't1', context: {} });
  });

  it('runs summarization when aiCaseSummarization=true', async () => {
    findUniqueMock.mockResolvedValue({
      aiCaseSummarization: true,
      aiPriorityPrediction: false,
      aiResolutionSuggestion: false,
      aiTagSuggestions: false,
      aiInsightGeneration: false,
    });
    summarizeMock.mockResolvedValue({ success: true });
    const result = await processCaseAiAutomationJob(makeJob('summarization'));
    expect(result.skipped).toBe(false);
    expect(summarizeMock).toHaveBeenCalled();
  });

  it('runs priority-prediction when aiPriorityPrediction=true', async () => {
    findUniqueMock.mockResolvedValue({
      aiCaseSummarization: false,
      aiPriorityPrediction: true,
      aiResolutionSuggestion: false,
      aiTagSuggestions: false,
      aiInsightGeneration: false,
    });
    priorityMock.mockResolvedValue({ success: true });
    const result = await processCaseAiAutomationJob(makeJob('priority-prediction'));
    expect(result.skipped).toBe(false);
    expect(priorityMock).toHaveBeenCalled();
  });

  it('runs resolution-suggestion when aiResolutionSuggestion=true', async () => {
    findUniqueMock.mockResolvedValue({
      aiCaseSummarization: false,
      aiPriorityPrediction: false,
      aiResolutionSuggestion: true,
      aiTagSuggestions: false,
      aiInsightGeneration: false,
    });
    resolutionMock.mockResolvedValue({ success: true });
    const result = await processCaseAiAutomationJob(makeJob('resolution-suggestion'));
    expect(result.skipped).toBe(false);
    expect(resolutionMock).toHaveBeenCalled();
  });

  it('tag-suggestions skips in favour of AI_TAG_SUGGESTION queue routing', async () => {
    findUniqueMock.mockResolvedValue({
      aiCaseSummarization: false,
      aiPriorityPrediction: false,
      aiResolutionSuggestion: false,
      aiTagSuggestions: true,
      aiInsightGeneration: false,
    });
    const result = await processCaseAiAutomationJob(makeJob('tag-suggestions'));
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('routed-via-AI_TAG_SUGGESTION-queue');
  });

  it('skips when the automation row is missing', async () => {
    findUniqueMock.mockResolvedValue(null);
    const result = await processCaseAiAutomationJob(makeJob('insight-generation'));
    expect(result.skipped).toBe(true);
  });
});
