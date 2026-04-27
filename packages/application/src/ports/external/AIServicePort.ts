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
 * IFC-212 follow-up: optional context propagated from the application caller to
 * the underlying AI strategy. Carries the lead's real `tenantId` and `leadId` so
 * queue-backed adapters can tag payloads with the correct keys instead of falling
 * back to a literal default. Backwards-compatible — implementations may ignore.
 */
export interface AIServiceCallOptions {
  /** Real tenant id of the calling lead (NOT the worker's literal default). */
  tenantId?: string;
  /** Real lead id (so worker `LeadAIInsight.upsert` resolves the FK correctly). */
  leadId?: string;
}

export interface AIServicePort {
  /**
   * Score a lead using AI.
   *
   * @param input lead scoring input
   * @param opts optional caller context — see {@link AIServiceCallOptions}.
   */
  scoreLead(
    input: LeadScoringInput,
    opts?: AIServiceCallOptions,
  ): Promise<Result<LeadScoringResult, DomainError>>;

  /**
   * Qualify a lead using AI
   */
  qualifyLead(
    input: LeadScoringInput,
    opts?: AIServiceCallOptions,
  ): Promise<Result<boolean, DomainError>>;

  /**
   * Generate email content for lead outreach
   */
  generateEmail(leadId: string, template: string): Promise<Result<string, DomainError>>;
}
