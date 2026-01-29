/**
 * Scoring Job Tests
 *
 * @implements IFC-168: Lead Scoring Job Handler
 *
 * Tests for BullMQ job handler for processing lead scoring requests:
 * - Schema validation
 * - Tier computation
 * - Recommendations generation
 * - Job processing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import {
  SCORING_QUEUE,
  ScoringJobDataSchema,
  ScoringJobResultSchema,
  processScoringJob,
  DEFAULT_SCORING_JOB_OPTIONS,
  type ScoringJobData,
  type ScoringJobResult,
  type LeadTier,
} from './scoring.job';

// Mock the scoring chain
const mockScoreLead = vi.fn();

vi.mock('../chains/scoring.chain', () => ({
  leadScoringChain: {
    scoreLead: (input: any) => mockScoreLead(input),
  },
}));

// Test UUID constants
const TEST_UUIDS = {
  lead1: '12345678-0000-4000-8000-000012345678',
  lead2: '23456789-0000-4000-8000-000023456789',
};

// Mock scoring result
const mockScoringResult = {
  score: 75,
  confidence: 0.85,
  factors: [
    {
      name: 'Contact Completeness',
      impact: 20,
      reasoning: 'Complete contact information with corporate email domain.',
    },
    {
      name: 'Engagement Quality',
      impact: 15,
      reasoning: 'Website source suggests active interest.',
    },
    {
      name: 'Qualification Signals',
      impact: 25,
      reasoning: 'VP-level title indicates decision-making authority.',
    },
  ],
  modelVersion: 'openai:gpt-4:v1',
};

// Create mock job
function createMockJob(data: ScoringJobData): Job<ScoringJobData> {
  return {
    data,
    id: 'test-job-id',
    name: 'scoring',
    updateProgress: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    progress: 0,
    attemptsMade: 0,
  } as unknown as Job<ScoringJobData>;
}

describe('ScoringJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScoreLead.mockResolvedValue(mockScoringResult);
  });

  // ============================================
  // Queue Name Tests
  // ============================================

  describe('SCORING_QUEUE', () => {
    it('should have the correct queue name', () => {
      expect(SCORING_QUEUE).toBe('ai-scoring');
    });
  });

  // ============================================
  // Schema Validation Tests
  // ============================================

  describe('ScoringJobDataSchema', () => {
    const validJobData = {
      leadId: TEST_UUIDS.lead1,
      lead: {
        email: 'john.doe@acme.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'VP of Sales',
        phone: '+1-555-0123',
        source: 'WEBSITE',
      },
      priority: 5,
    };

    it('should validate a complete job data object', () => {
      const result = ScoringJobDataSchema.safeParse(validJobData);
      expect(result.success).toBe(true);
    });

    it('should validate minimal job data', () => {
      const minimalData = {
        leadId: TEST_UUIDS.lead1,
        lead: {
          email: 'test@example.com',
          source: 'COLD_CALL',
        },
      };

      const result = ScoringJobDataSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const invalidData = {
        ...validJobData,
        leadId: 'not-a-uuid',
      };

      const result = ScoringJobDataSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        leadId: TEST_UUIDS.lead1,
        lead: {
          email: 'not-an-email',
          source: 'WEBSITE',
        },
      };

      const result = ScoringJobDataSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject priority out of range', () => {
      const invalidData = {
        ...validJobData,
        priority: 15,
      };

      const result = ScoringJobDataSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should default priority to 5', () => {
      const dataWithoutPriority = {
        leadId: TEST_UUIDS.lead1,
        lead: {
          email: 'test@example.com',
          source: 'WEBSITE',
        },
      };

      const result = ScoringJobDataSchema.parse(dataWithoutPriority);
      expect(result.priority).toBe(5);
    });

    it('should accept metadata', () => {
      const dataWithMetadata = {
        leadId: TEST_UUIDS.lead1,
        lead: {
          email: 'test@example.com',
          source: 'WEBSITE',
          metadata: {
            industry: 'Technology',
            employees: '500-1000',
            customField: true,
          },
        },
      };

      const result = ScoringJobDataSchema.safeParse(dataWithMetadata);
      expect(result.success).toBe(true);
    });
  });

  describe('ScoringJobResultSchema', () => {
    const validResult: ScoringJobResult = {
      leadId: TEST_UUIDS.lead1,
      score: 75,
      confidence: 0.85,
      tier: 'WARM',
      factors: [
        {
          name: 'Contact Completeness',
          impact: 20,
          reasoning: 'Complete information provided.',
        },
      ],
      recommendations: ['Schedule follow-up call'],
      modelVersion: 'openai:gpt-4:v1',
      processedAt: new Date().toISOString(),
      processingTimeMs: 150,
    };

    it('should validate a complete result object', () => {
      const result = ScoringJobResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it('should reject score out of range', () => {
      const invalidResult = {
        ...validResult,
        score: 150,
      };

      const result = ScoringJobResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });

    it('should reject confidence out of range', () => {
      const invalidResult = {
        ...validResult,
        confidence: 1.5,
      };

      const result = ScoringJobResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });

    it('should reject invalid tier', () => {
      const invalidResult = {
        ...validResult,
        tier: 'INVALID_TIER',
      };

      const result = ScoringJobResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });

    it('should accept all valid tiers', () => {
      const tiers: LeadTier[] = ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'];

      tiers.forEach((tier) => {
        const testResult = { ...validResult, tier };
        const parseResult = ScoringJobResultSchema.safeParse(testResult);
        expect(parseResult.success).toBe(true);
      });
    });
  });

  // ============================================
  // Tier Computation Tests
  // ============================================

  describe('computeTier (via processScoringJob)', () => {
    it('should compute HOT tier for score >= 80', async () => {
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 85 });

      const jobData: ScoringJobData = {
        leadId: TEST_UUIDS.lead1,
        lead: {
          email: 'test@example.com',
          source: 'WEBSITE',
        },
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processScoringJob(job);

      expect(result.tier).toBe('HOT');
    });

    it('should compute WARM tier for score >= 60 and < 80', async () => {
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 65 });

      const jobData: ScoringJobData = {
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processScoringJob(job);

      expect(result.tier).toBe('WARM');
    });

    it('should compute COLD tier for score >= 30 and < 60', async () => {
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 45 });

      const jobData: ScoringJobData = {
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processScoringJob(job);

      expect(result.tier).toBe('COLD');
    });

    it('should compute UNQUALIFIED tier for score < 30', async () => {
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 15 });

      const jobData: ScoringJobData = {
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processScoringJob(job);

      expect(result.tier).toBe('UNQUALIFIED');
    });

    it('should compute tier at boundary values', async () => {
      // Test boundary at 80
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 80 });
      let job = createMockJob({
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      });
      let result = await processScoringJob(job);
      expect(result.tier).toBe('HOT');

      // Test boundary at 60
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 60 });
      job = createMockJob({
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      });
      result = await processScoringJob(job);
      expect(result.tier).toBe('WARM');

      // Test boundary at 30
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 30 });
      job = createMockJob({
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      });
      result = await processScoringJob(job);
      expect(result.tier).toBe('COLD');
    });
  });

  // ============================================
  // Recommendations Tests
  // ============================================

  describe('generateRecommendations (via processScoringJob)', () => {
    it('should generate HOT tier recommendations', async () => {
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 90 });

      const job = createMockJob({
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      });
      const result = await processScoringJob(job);

      expect(result.recommendations).toContain('Schedule immediate follow-up call');
      expect(result.recommendations).toContain('Assign to senior sales rep');
      expect(result.recommendations).toContain('Prepare custom proposal');
    });

    it('should generate WARM tier recommendations', async () => {
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 70 });

      const job = createMockJob({
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      });
      const result = await processScoringJob(job);

      expect(result.recommendations).toContain('Send personalized email sequence');
      expect(result.recommendations).toContain('Schedule discovery call within 48 hours');
      expect(result.recommendations).toContain('Add to nurture campaign');
    });

    it('should generate COLD tier recommendations', async () => {
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 40 });

      const job = createMockJob({
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      });
      const result = await processScoringJob(job);

      expect(result.recommendations).toContain('Add to long-term nurture campaign');
      expect(result.recommendations).toContain('Monitor engagement metrics');
      expect(result.recommendations).toContain('Re-evaluate in 30 days');
    });

    it('should generate UNQUALIFIED tier recommendations with educational content', async () => {
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 15 });

      const job = createMockJob({
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      });
      const result = await processScoringJob(job);

      expect(result.recommendations).toContain('Archive for potential future outreach');
      expect(result.recommendations).toContain('Request additional information if available');
      expect(result.recommendations).toContain('Add to educational content list');
    });

    it('should generate UNQUALIFIED tier recommendations without educational content for score 0', async () => {
      mockScoreLead.mockResolvedValueOnce({ ...mockScoringResult, score: 0 });

      const job = createMockJob({
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      });
      const result = await processScoringJob(job);

      expect(result.recommendations).toContain('No action recommended');
    });
  });

  // ============================================
  // Job Processing Tests
  // ============================================

  describe('processScoringJob', () => {
    it('should process a complete lead scoring job', async () => {
      const jobData: ScoringJobData = {
        leadId: TEST_UUIDS.lead1,
        lead: {
          email: 'john.doe@acme.com',
          firstName: 'John',
          lastName: 'Doe',
          company: 'Acme Corp',
          title: 'VP of Sales',
          phone: '+1-555-0123',
          source: 'WEBSITE',
          metadata: { industry: 'Technology' },
        },
        correlationId: 'corr-123',
        priority: 8,
      };

      const job = createMockJob(jobData);
      const result = await processScoringJob(job);

      expect(result.leadId).toBe(TEST_UUIDS.lead1);
      expect(result.score).toBe(75);
      expect(result.confidence).toBe(0.85);
      expect(result.tier).toBe('WARM');
      expect(result.factors).toHaveLength(3);
      expect(result.recommendations).toHaveLength(3);
      expect(result.modelVersion).toBe('openai:gpt-4:v1');
      expect(result.processedAt).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should call leadScoringChain.scoreLead with correct input', async () => {
      const jobData: ScoringJobData = {
        leadId: TEST_UUIDS.lead1,
        lead: {
          email: 'test@example.com',
          firstName: 'Test',
          company: 'Test Corp',
          source: 'REFERRAL',
        },
        priority: 5,
      };

      const job = createMockJob(jobData);
      await processScoringJob(job);

      expect(mockScoreLead).toHaveBeenCalledWith({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: undefined,
        company: 'Test Corp',
        title: undefined,
        phone: undefined,
        source: 'REFERRAL',
        metadata: undefined,
      });
    });

    it('should update job progress throughout processing', async () => {
      const jobData: ScoringJobData = {
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      };

      const job = createMockJob(jobData);
      await processScoringJob(job);

      // Should call updateProgress multiple times: 10, 90, 100
      expect(job.updateProgress).toHaveBeenCalledTimes(3);
      expect(job.updateProgress).toHaveBeenCalledWith(10);
      expect(job.updateProgress).toHaveBeenCalledWith(90);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should include processing time in result', async () => {
      const jobData: ScoringJobData = {
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processScoringJob(job);

      expect(typeof result.processingTimeMs).toBe('number');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include ISO timestamp in processedAt', async () => {
      const jobData: ScoringJobData = {
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processScoringJob(job);

      // Verify it's a valid ISO date string
      const parsedDate = new Date(result.processedAt);
      expect(parsedDate.toISOString()).toBe(result.processedAt);
    });

    it('should return result matching ScoringJobResultSchema', async () => {
      const jobData: ScoringJobData = {
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processScoringJob(job);

      // Validate the result matches the schema
      const validation = ScoringJobResultSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });

    it('should propagate errors from scoring chain', async () => {
      mockScoreLead.mockRejectedValueOnce(new Error('LLM API error'));

      const jobData: ScoringJobData = {
        leadId: TEST_UUIDS.lead1,
        lead: { email: 'test@example.com', source: 'WEBSITE' },
        priority: 5,
      };

      const job = createMockJob(jobData);

      await expect(processScoringJob(job)).rejects.toThrow('LLM API error');
    });
  });

  // ============================================
  // Job Options Tests
  // ============================================

  describe('DEFAULT_SCORING_JOB_OPTIONS', () => {
    it('should have correct retry attempts', () => {
      expect(DEFAULT_SCORING_JOB_OPTIONS.attempts).toBe(3);
    });

    it('should have exponential backoff', () => {
      expect(DEFAULT_SCORING_JOB_OPTIONS.backoff.type).toBe('exponential');
      expect(DEFAULT_SCORING_JOB_OPTIONS.backoff.delay).toBe(1000);
    });

    it('should remove completed jobs after 24 hours', () => {
      expect(DEFAULT_SCORING_JOB_OPTIONS.removeOnComplete.age).toBe(24 * 60 * 60);
    });

    it('should remove failed jobs after 7 days', () => {
      expect(DEFAULT_SCORING_JOB_OPTIONS.removeOnFail.age).toBe(7 * 24 * 60 * 60);
    });

    it('should keep max 1000 completed jobs', () => {
      expect(DEFAULT_SCORING_JOB_OPTIONS.removeOnComplete.count).toBe(1000);
    });
  });
});
