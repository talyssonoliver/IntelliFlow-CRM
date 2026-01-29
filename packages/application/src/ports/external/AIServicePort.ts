import { Result, DomainError, Lead, LeadScore } from '@intelliflow/domain';

/**
 * AI Service Port
 * Defines the contract for AI-powered lead scoring
 * Implementation lives in adapters layer (OpenAI, Ollama, etc.)
 */

export interface LeadScoringInput {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
  source: string;
}

export interface LeadScoringResult {
  score: number;
  confidence: number;
  modelVersion: string;
  reasoning?: string;
  factors?: {
    companySize?: number;
    titleRelevance?: number;
    emailQuality?: number;
    sourceCredibility?: number;
  };
}

export interface AIServicePort {
  /**
   * Score a lead using AI
   */
  scoreLead(input: LeadScoringInput): Promise<Result<LeadScoringResult, DomainError>>;

  /**
   * Qualify a lead using AI
   */
  qualifyLead(input: LeadScoringInput): Promise<Result<boolean, DomainError>>;

  /**
   * Generate email content for lead outreach
   */
  generateEmail(leadId: string, template: string): Promise<Result<string, DomainError>>;
}
