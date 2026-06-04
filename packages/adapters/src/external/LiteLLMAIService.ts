import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { AIServicePort, LeadScoringInput, LeadScoringResult } from '@intelliflow/application';
import { Result, type DomainError } from '@intelliflow/domain';

const log = {
  info: (meta: Record<string, unknown>, msg: string) =>
    console.info('[litellm-ai-service]', msg, meta),
  error: (meta: Record<string, unknown>, msg: string) =>
    console.error('[litellm-ai-service]', msg, meta),
};

export interface LiteLLMAIServiceConfig {
  /** LiteLLM proxy base URL, e.g. http://localhost:4000/v1 */
  baseUrl: string | (() => string);
  /** LITELLM_MASTER_KEY */
  masterKey: string;
  /** Request timeout in ms (default 120_000) */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Structured output schemas
// ---------------------------------------------------------------------------

const ScoreLeadOutputSchema = z.object({
  score: z.number().min(0).max(100).describe('Lead quality score 0–100'),
  confidence: z.number().min(0).max(1).describe('Model confidence 0–1'),
  reasoning: z.string().describe('Brief explanation of the score'),
  factors: z.object({
    companySize: z.number().min(0).max(1),
    titleRelevance: z.number().min(0).max(1),
    emailQuality: z.number().min(0).max(1),
    sourceCredibility: z.number().min(0).max(1),
  }),
});

const QualifyLeadOutputSchema = z.object({
  qualified: z.boolean().describe('Whether the lead meets qualification criteria'),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
});

const GenerateEmailOutputSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

// ---------------------------------------------------------------------------
// LiteLLM routing model aliases
// These correspond to free-tier model routes configured in the LiteLLM proxy.
// ---------------------------------------------------------------------------
const MODEL_SCORING = 'scoring-free';
const MODEL_QUALIFY = 'qualification-free';
const MODEL_EMAIL = 'email-free';

/**
 * LiteLLMAIService
 *
 * AIServicePort adapter that routes requests through a LiteLLM proxy.
 * Use when AI_PROVIDER=litellm or AI_PROVIDER=openai (LiteLLM proxies both).
 *
 * All LLM calls use `withStructuredOutput(zodSchema)` for guaranteed-valid
 * JSON responses with no manual parsing required.
 */
export class LiteLLMAIService implements AIServicePort {
  private scoringModel: ReturnType<ChatOpenAI['withStructuredOutput']> | null = null;
  private qualifyModel: ReturnType<ChatOpenAI['withStructuredOutput']> | null = null;
  private emailModel: ReturnType<ChatOpenAI['withStructuredOutput']> | null = null;
  private readonly baseUrlFactory: () => string;

  readonly modelVersion: string;

  constructor(private readonly config: LiteLLMAIServiceConfig) {
    const rawBaseUrl = config.baseUrl;
    this.baseUrlFactory = typeof rawBaseUrl === 'function' ? rawBaseUrl : () => rawBaseUrl;
    this.modelVersion = `litellm:${MODEL_SCORING}:v1`;
  }

  private ensureModels(): {
    scoringModel: ReturnType<ChatOpenAI['withStructuredOutput']>;
    qualifyModel: ReturnType<ChatOpenAI['withStructuredOutput']>;
    emailModel: ReturnType<ChatOpenAI['withStructuredOutput']>;
  } {
    if (this.scoringModel && this.qualifyModel && this.emailModel) {
      return {
        scoringModel: this.scoringModel,
        qualifyModel: this.qualifyModel,
        emailModel: this.emailModel,
      };
    }

    const timeout = this.config.timeout ?? 120_000;
    const commonConfig = {
      configuration: {
        baseURL: this.baseUrlFactory(),
        defaultHeaders: {
          Authorization: `Bearer ${this.config.masterKey}`,
        },
        timeout,
      },
      temperature: 0.1,
      maxRetries: 2,
    };

    const scoringBase = new ChatOpenAI({ ...commonConfig, model: MODEL_SCORING });
    const qualifyBase = new ChatOpenAI({ ...commonConfig, model: MODEL_QUALIFY });
    const emailBase = new ChatOpenAI({ ...commonConfig, model: MODEL_EMAIL });

    this.scoringModel = scoringBase.withStructuredOutput(ScoreLeadOutputSchema);
    this.qualifyModel = qualifyBase.withStructuredOutput(QualifyLeadOutputSchema);
    this.emailModel = emailBase.withStructuredOutput(GenerateEmailOutputSchema);

    return {
      scoringModel: this.scoringModel,
      qualifyModel: this.qualifyModel,
      emailModel: this.emailModel,
    };
  }

  async scoreLead(input: LeadScoringInput): Promise<Result<LeadScoringResult, DomainError>> {
    const { scoringModel } = this.ensureModels();
    try {
      const prompt = `You are a lead scoring AI for a CRM system.
Analyze the following lead and score them based on their likely conversion potential.

Lead data:
- Email: ${input.email}
- First Name: ${input.firstName ?? 'N/A'}
- Last Name: ${input.lastName ?? 'N/A'}
- Company: ${input.company ?? 'N/A'}
- Title: ${input.title ?? 'N/A'}
- Phone: ${input.phone ?? 'N/A'}
- Source: ${input.source}

Scoring anchors:
- 80–100: C-level executives at established companies with corporate email
- 60–79: Directors/managers at known companies
- 40–59: Individual contributors or small business owners
- 20–39: Generic email, unclear role or company
- 0–19: Incomplete data, free email with no company info

Score the lead and provide confidence and factor breakdowns.`;

      const parsed = (await scoringModel.invoke(prompt)) as z.infer<typeof ScoreLeadOutputSchema>;

      log.info(
        { email: input.email, score: parsed.score, confidence: parsed.confidence },
        'LiteLLM lead scoring complete'
      );

      return Result.ok({
        score: Math.min(100, Math.max(0, parsed.score)),
        confidence: Math.min(1, Math.max(0, parsed.confidence)),
        modelVersion: this.modelVersion,
        reasoning: parsed.reasoning,
        factors: {
          companySize: parsed.factors.companySize,
          titleRelevance: parsed.factors.titleRelevance,
          emailQuality: parsed.factors.emailQuality,
          sourceCredibility: parsed.factors.sourceCredibility,
        },
      });
    } catch (error) {
      log.error(
        { email: input.email, error: error instanceof Error ? error.message : String(error) },
        'LiteLLM scoreLead failed'
      );
      return Result.fail({
        message: `LiteLLM scoring failed: ${error instanceof Error ? error.message : String(error)}`,
        code: 'LITELLM_SERVICE_ERROR',
      } as DomainError);
    }
  }

  async qualifyLead(input: LeadScoringInput): Promise<Result<boolean, DomainError>> {
    const { qualifyModel } = this.ensureModels();
    try {
      const prompt = `You are a lead qualification AI for a CRM system.
Determine whether this lead meets minimum qualification criteria (score >= 70).

Lead data:
- Email: ${input.email}
- Company: ${input.company ?? 'N/A'}
- Title: ${input.title ?? 'N/A'}
- Source: ${input.source}

Evaluate and return whether the lead is qualified.`;

      const parsed = (await qualifyModel.invoke(prompt)) as z.infer<typeof QualifyLeadOutputSchema>;

      log.info(
        { email: input.email, qualified: parsed.qualified, score: parsed.score },
        'LiteLLM lead qualification complete'
      );

      return Result.ok(parsed.qualified);
    } catch (error) {
      log.error(
        { email: input.email, error: error instanceof Error ? error.message : String(error) },
        'LiteLLM qualifyLead failed'
      );
      return Result.fail({
        message: `LiteLLM qualification failed: ${error instanceof Error ? error.message : String(error)}`,
        code: 'LITELLM_SERVICE_ERROR',
      } as DomainError);
    }
  }

  async generateEmail(leadId: string, template: string): Promise<Result<string, DomainError>> {
    const { emailModel } = this.ensureModels();
    try {
      const prompt = `You are an email generation AI for a CRM system.
Generate a professional outreach email using the following template guidance.

Lead ID: ${leadId}
Template: ${template}

Write a compelling, personalized outreach email with a clear subject line and body.`;

      const parsed = (await emailModel.invoke(prompt)) as z.infer<typeof GenerateEmailOutputSchema>;

      log.info({ leadId }, 'LiteLLM email generation complete');

      return Result.ok(parsed.body);
    } catch (error) {
      log.error(
        { leadId, error: error instanceof Error ? error.message : String(error) },
        'LiteLLM generateEmail failed'
      );
      return Result.fail({
        message: `LiteLLM email generation failed: ${error instanceof Error ? error.message : String(error)}`,
        code: 'LITELLM_SERVICE_ERROR',
      } as DomainError);
    }
  }
}
