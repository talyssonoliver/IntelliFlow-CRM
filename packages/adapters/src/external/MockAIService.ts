import { Result, DomainError } from '@intelliflow/domain';
import {
  AIServicePort,
  LeadScoringInput,
  LeadScoringResult,
} from '@intelliflow/application';

/**
 * Mock AI Service
 * Returns deterministic scores for testing
 * For production, implement OpenAIAdapter or OllamaAdapter
 */
export class MockAIService implements AIServicePort {
  constructor(private readonly defaultScore: number = 50) {}

  async scoreLead(input: LeadScoringInput): Promise<Result<LeadScoringResult, DomainError>> {
    // Simple scoring logic for testing
    let score = this.defaultScore;
    let confidence = 0.5;

    // Higher score for company emails
    if (input.company) {
      score += 20;
      confidence += 0.2;
    }

    // Higher score for specific titles
    if (input.title?.toLowerCase().includes('director')) {
      score += 15;
      confidence += 0.15;
    }
    if (input.title?.toLowerCase().includes('vp')) {
      score += 20;
      confidence += 0.2;
    }
    if (input.title?.toLowerCase().includes('ceo')) {
      score += 25;
      confidence += 0.25;
    }

    // Cap at 100
    score = Math.min(score, 100);
    confidence = Math.min(confidence, 1.0);

    return Result.ok({
      score,
      confidence,
      modelVersion: 'mock-v1.0',
      reasoning: 'Mock scoring based on company and title',
      factors: {
        companySize: input.company ? 0.8 : 0.2,
        titleRelevance: input.title ? 0.7 : 0.3,
        emailQuality: 0.6,
        sourceCredibility: 0.5,
      },
    });
  }

  async qualifyLead(input: LeadScoringInput): Promise<Result<boolean, DomainError>> {
    const scoringResult = await this.scoreLead(input);

    if (scoringResult.isFailure) {
      return Result.fail(scoringResult.error);
    }

    // Qualify if score >= 70
    const isQualified = scoringResult.value.score >= 70;
    return Result.ok(isQualified);
  }

  async generateEmail(
    leadId: string,
    template: string
  ): Promise<Result<string, DomainError>> {
    return Result.ok(
      `Mock email generated for lead ${leadId} using template: ${template}`
    );
  }
}
