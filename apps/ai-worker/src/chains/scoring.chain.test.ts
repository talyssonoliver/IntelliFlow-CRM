import { describe, it, expect, beforeEach } from 'vitest';
import { LeadScoringChain, LeadInput } from './scoring.chain';

describe('LeadScoringChain', () => {
  let chain: LeadScoringChain;

  beforeEach(() => {
    chain = new LeadScoringChain();
  });

  describe('scoreLead', () => {
    it('should score a complete lead profile highly', async () => {
      const lead: LeadInput = {
        email: 'john.doe@acme.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'VP of Sales',
        phone: '+1-555-0123',
        source: 'WEBSITE',
      };

      const result = await chain.scoreLead(lead);

      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.factors).toBeInstanceOf(Array);
      expect(result.factors.length).toBeGreaterThan(0);
      expect(result.modelVersion).toBeDefined();
    });

    it('should score an incomplete lead profile lower', async () => {
      const lead: LeadInput = {
        email: 'test@gmail.com',
        source: 'COLD_CALL',
      };

      const result = await chain.scoreLead(lead);

      expect(result).toBeDefined();
      expect(result.score).toBeLessThanOrEqual(50);
    });

    it('should include detailed scoring factors', async () => {
      const lead: LeadInput = {
        email: 'jane@enterprise.com',
        firstName: 'Jane',
        company: 'Enterprise Inc',
        source: 'REFERRAL',
      };

      const result = await chain.scoreLead(lead);

      expect(result.factors.length).toBeGreaterThan(0);
      result.factors.forEach((factor) => {
        expect(factor.name).toBeDefined();
        expect(factor.impact).toBeDefined();
        expect(factor.reasoning).toBeDefined();
        expect(typeof factor.reasoning).toBe('string');
        expect(factor.reasoning.length).toBeGreaterThan(10);
      });
    });
  });

  describe('validateScoringResult', () => {
    it('should validate a good scoring result', () => {
      const result = {
        score: 85,
        confidence: 0.9,
        factors: [
          {
            name: 'Contact Completeness',
            impact: 25,
            reasoning: 'Complete contact information with corporate email',
          },
        ],
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateScoringResult(result);

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should flag low confidence results', () => {
      const result = {
        score: 50,
        confidence: 0.3,
        factors: [
          {
            name: 'Data Quality',
            impact: 10,
            reasoning: 'Incomplete information',
          },
        ],
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateScoringResult(result);

      expect(validation.valid).toBe(false);
      expect(validation.issues.some((issue) => issue.includes('Low confidence'))).toBe(
        true
      );
    });

    it('should flag missing factors', () => {
      const result = {
        score: 75,
        confidence: 0.8,
        factors: [],
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateScoringResult(result);

      expect(validation.valid).toBe(false);
      expect(validation.issues.some((issue) => issue.includes('No scoring factors'))).toBe(
        true
      );
    });
  });

  describe('formatLeadInfo', () => {
    it('should format complete lead information', () => {
      const lead: LeadInput = {
        email: 'john@acme.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'CEO',
        phone: '+1-555-0123',
        source: 'WEBSITE',
        metadata: {
          industry: 'Technology',
          employees: '500-1000',
        },
      };

      // Access private method for testing
      const formatted = (chain as any).formatLeadInfo(lead);

      expect(formatted).toContain('john@acme.com');
      expect(formatted).toContain('John Doe');
      expect(formatted).toContain('Acme Corp');
      expect(formatted).toContain('CEO');
      expect(formatted).toContain('WEBSITE');
    });
  });
});
