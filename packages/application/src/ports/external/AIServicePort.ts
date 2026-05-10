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

/**
 * Options for AI service calls.
 * Allows callers to pass per-request metadata such as tenantId and leadId
 * without altering the core LeadScoringInput shape.
 */
export interface AIServiceCallOptions {
  /** Tenant ID to scope the AI call (overrides service-level default). */
  tenantId?: string;
  /** Lead ID to associate with the scoring job (defaults to a synthetic UUID). */
  leadId?: string;
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
