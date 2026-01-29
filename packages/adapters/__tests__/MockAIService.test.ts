import { describe, it, expect, beforeEach } from 'vitest';
import { MockAIService } from '../src/external/MockAIService';
import type { LeadScoringInput } from '@intelliflow/application';

describe('MockAIService', () => {
  let aiService: MockAIService;

  beforeEach(() => {
    aiService = new MockAIService();
  });

  describe('constructor', () => {
    it('should initialize with default score of 50', async () => {
      const service = new MockAIService();
      const result = await service.scoreLead({
        leadId: 'test-lead',
        email: 'test@example.com',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.score).toBe(50);
    });

    it('should initialize with custom default score', async () => {
      const service = new MockAIService(75);
      const result = await service.scoreLead({
        leadId: 'test-lead',
        email: 'test@example.com',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.score).toBe(75);
    });

    it('should accept zero as default score', async () => {
      const service = new MockAIService(0);
      const result = await service.scoreLead({
        leadId: 'test-lead',
        email: 'test@example.com',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.score).toBe(0);
    });
  });

  describe('scoreLead()', () => {
    describe('basic scoring', () => {
      it('should return successful result with base score', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(50);
        expect(result.value.confidence).toBe(0.5);
        expect(result.value.modelVersion).toBe('mock-v1.0');
        expect(result.value.reasoning).toBe('Mock scoring based on company and title');
      });

      it('should include scoring factors in result', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.factors).toEqual({
          companySize: 0.2,
          titleRelevance: 0.3,
          emailQuality: 0.6,
          sourceCredibility: 0.5,
        });
      });

      it('should be deterministic for same input', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          company: 'Acme Corp',
          title: 'Director',
        };

        const result1 = await aiService.scoreLead(input);
        const result2 = await aiService.scoreLead(input);

        expect(result1.value).toEqual(result2.value);
      });
    });

    describe('company scoring', () => {
      it('should add 20 points for company presence', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          company: 'Acme Corp',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(70); // 50 + 20
        expect(result.value.confidence).toBe(0.7); // 0.5 + 0.2
      });

      it('should update company factor when company provided', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          company: 'Tech Inc',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.factors.companySize).toBe(0.8);
      });

      it('should handle empty company string as no company', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          company: '',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(50); // No bonus for empty string
      });
    });

    describe('title scoring - Director', () => {
      it('should add 15 points for "director" title (lowercase)', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'director',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(65); // 50 + 15
        expect(result.value.confidence).toBe(0.65); // 0.5 + 0.15
      });

      it('should add 15 points for "Director" title (capitalized)', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'Director',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(65);
      });

      it('should add 15 points for "DIRECTOR" title (uppercase)', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'DIRECTOR',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(65);
      });

      it('should add 15 points for title containing "director"', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'Technical Director',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(65);
      });

      it('should update title factor when director title provided', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'Director of Engineering',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.factors.titleRelevance).toBe(0.7);
      });
    });

    describe('title scoring - VP', () => {
      it('should add 20 points for "vp" title', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'vp',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(70); // 50 + 20
        expect(result.value.confidence).toBe(0.7); // 0.5 + 0.2
      });

      it('should add 20 points for "VP" title', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'VP',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(70);
      });

      it('should add 20 points for title containing "vp"', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'VP of Sales',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(70);
      });
    });

    describe('title scoring - CEO', () => {
      it('should add 25 points for "ceo" title', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'ceo',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(75); // 50 + 25
        expect(result.value.confidence).toBe(0.75); // 0.5 + 0.25
      });

      it('should add 25 points for "CEO" title', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'CEO',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(75);
      });

      it('should add 25 points for title containing "ceo"', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'CEO & Founder',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(75);
      });
    });

    describe('combined scoring', () => {
      it('should combine company and director title bonuses', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          company: 'Acme Corp',
          title: 'Director',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(85); // 50 + 20 + 15
        expect(result.value.confidence).toBe(0.85); // 0.5 + 0.2 + 0.15
      });

      it('should combine company and VP title bonuses', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          company: 'Tech Inc',
          title: 'VP of Engineering',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(90); // 50 + 20 + 20
        expect(result.value.confidence).toBeCloseTo(0.9, 10); // 0.5 + 0.2 + 0.2
      });

      it('should combine company and CEO title bonuses', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          company: 'Startup Inc',
          title: 'CEO',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(95); // 50 + 20 + 25
        expect(result.value.confidence).toBe(0.95); // 0.5 + 0.2 + 0.25
      });

      it('should update both company and title factors when both provided', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          company: 'Acme Corp',
          title: 'VP',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.factors.companySize).toBe(0.8);
        expect(result.value.factors.titleRelevance).toBe(0.7);
      });
    });

    describe('score capping', () => {
      it('should cap score at 100 when it would exceed', async () => {
        const service = new MockAIService(90);
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          company: 'Acme Corp',
          title: 'CEO',
        };

        const result = await service.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(100); // Capped at 100 instead of 135
      });

      it('should cap confidence at 1.0 when it would exceed', async () => {
        const service = new MockAIService(90);
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          company: 'Acme Corp',
          title: 'CEO and VP and Director', // Multiple title matches
        };

        const result = await service.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        // 0.5 + 0.2 (company) + 0.15 (director) + 0.2 (vp) + 0.25 (ceo) = 1.3, capped at 1.0
        expect(result.value.confidence).toBe(1.0);
      });

      it('should handle exact score of 100', async () => {
        const service = new MockAIService(55);
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          company: 'Acme Corp',
          title: 'CEO',
        };

        const result = await service.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(100); // 55 + 20 + 25 = 100
      });
    });

    describe('edge cases', () => {
      it('should handle missing optional fields', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(50);
      });

      it('should handle undefined title', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: undefined,
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(50);
        expect(result.value.factors.titleRelevance).toBe(0.3);
      });

      it('should handle empty title string', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: '',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(50);
      });

      it('should handle title without matching keywords', async () => {
        const input: LeadScoringInput = {
          leadId: 'lead-123',
          email: 'test@example.com',
          title: 'Software Engineer',
        };

        const result = await aiService.scoreLead(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.score).toBe(50);
        expect(result.value.factors.titleRelevance).toBe(0.7);
      });
    });
  });

  describe('qualifyLead()', () => {
    it('should qualify lead with score >= 70', async () => {
      const input: LeadScoringInput = {
        leadId: 'lead-123',
        email: 'test@example.com',
        company: 'Acme Corp',
      };

      const result = await aiService.qualifyLead(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should not qualify lead with score < 70', async () => {
      const input: LeadScoringInput = {
        leadId: 'lead-123',
        email: 'test@example.com',
      };

      const result = await aiService.qualifyLead(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should qualify lead with exact score of 70', async () => {
      const service = new MockAIService(50);
      const input: LeadScoringInput = {
        leadId: 'lead-123',
        email: 'test@example.com',
        company: 'Acme Corp',
      };

      const result = await service.qualifyLead(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should not qualify lead with score of 69', async () => {
      const service = new MockAIService(49);
      const input: LeadScoringInput = {
        leadId: 'lead-123',
        email: 'test@example.com',
        company: 'Acme Corp',
      };

      const result = await service.qualifyLead(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should qualify high-value leads', async () => {
      const input: LeadScoringInput = {
        leadId: 'lead-123',
        email: 'test@example.com',
        company: 'Tech Inc',
        title: 'CEO',
      };

      const result = await aiService.qualifyLead(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should be deterministic for same input', async () => {
      const input: LeadScoringInput = {
        leadId: 'lead-123',
        email: 'test@example.com',
        company: 'Acme Corp',
        title: 'Director',
      };

      const result1 = await aiService.qualifyLead(input);
      const result2 = await aiService.qualifyLead(input);

      expect(result1.value).toBe(result2.value);
    });
  });

  describe('generateEmail()', () => {
    it('should generate email with lead ID and template', async () => {
      const leadId = 'lead-123';
      const template = 'welcome-template';

      const result = await aiService.generateEmail(leadId, template);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(
        `Mock email generated for lead ${leadId} using template: ${template}`
      );
    });

    it('should handle different lead IDs', async () => {
      const result1 = await aiService.generateEmail('lead-abc', 'template-1');
      const result2 = await aiService.generateEmail('lead-xyz', 'template-2');

      expect(result1.isSuccess).toBe(true);
      expect(result2.isSuccess).toBe(true);
      expect(result1.value).toContain('lead-abc');
      expect(result1.value).toContain('template-1');
      expect(result2.value).toContain('lead-xyz');
      expect(result2.value).toContain('template-2');
    });

    it('should handle empty strings', async () => {
      const result = await aiService.generateEmail('', '');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe('Mock email generated for lead  using template: ');
    });

    it('should handle special characters in inputs', async () => {
      const leadId = 'lead-@#$%';
      const template = 'template-!&*()';

      const result = await aiService.generateEmail(leadId, template);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toContain(leadId);
      expect(result.value).toContain(template);
    });

    it('should be deterministic for same inputs', async () => {
      const leadId = 'lead-123';
      const template = 'welcome';

      const result1 = await aiService.generateEmail(leadId, template);
      const result2 = await aiService.generateEmail(leadId, template);

      expect(result1.value).toBe(result2.value);
    });
  });
});
