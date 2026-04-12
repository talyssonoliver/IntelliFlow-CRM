import { Result, DomainError } from '@intelliflow/domain';
import { AIServicePort, LeadScoringInput, LeadScoringResult } from '@intelliflow/application';
import { ChatOllama } from '@langchain/ollama';

export interface OllamaAIServiceConfig {
  baseUrl: string;
  model: string;
  temperature?: number;
  timeout?: number;
}

const SCORE_LEAD_PROMPT = `You are a lead scoring AI for a CRM system.
Analyze the following lead and return a JSON object with your assessment.

Lead data:
- Email: {email}
- First Name: {firstName}
- Last Name: {lastName}
- Company: {company}
- Title: {title}
- Phone: {phone}
- Source: {source}

Scoring anchors:
- 80-100: C-level executives at established companies with corporate email
- 60-79: Directors/managers at known companies
- 40-59: Individual contributors or small business owners
- 20-39: Generic email, unclear role or company
- 0-19: Incomplete data, free email with no company info

Return ONLY valid JSON with this exact structure:
{
  "score": <number 0-100>,
  "confidence": <number 0-1>,
  "reasoning": "<brief explanation>",
  "factors": {
    "companySize": <number 0-1>,
    "titleRelevance": <number 0-1>,
    "emailQuality": <number 0-1>,
    "sourceCredibility": <number 0-1>
  }
}`;

const GENERATE_EMAIL_PROMPT = `You are an email generation AI for a CRM system.
Generate a professional outreach email using the following template guidance.

Lead ID: {leadId}
Template: {template}

Return ONLY valid JSON with this exact structure:
{
  "subject": "<email subject line>",
  "body": "<full email body>"
}`;

/**
 * Ollama AI Service
 * Uses local Ollama LLM for real AI-powered lead scoring and email generation.
 * Activate with AI_PROVIDER=ollama environment variable.
 */
export class OllamaAIService implements AIServicePort {
  private readonly model: ChatOllama;
  readonly modelVersion: string;

  constructor(config: OllamaAIServiceConfig) {
    const ollamaTimeout = config.timeout ?? 60_000;

    this.model = new ChatOllama({
      baseUrl: config.baseUrl,
      model: config.model,
      temperature: config.temperature ?? 0.1,
      numCtx: 4096,
      format: 'json',
      fetch: (url: string | URL | Request, init?: RequestInit) => {
        return globalThis.fetch(url, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(ollamaTimeout),
        });
      },
    });

    this.modelVersion = `ollama:${config.model}:v1`;
  }

  async scoreLead(input: LeadScoringInput): Promise<Result<LeadScoringResult, DomainError>> {
    try {
      const prompt = SCORE_LEAD_PROMPT.replaceAll('{email}', input.email)
        .replaceAll('{firstName}', input.firstName ?? 'N/A')
        .replaceAll('{lastName}', input.lastName ?? 'N/A')
        .replaceAll('{company}', input.company ?? 'N/A')
        .replaceAll('{title}', input.title ?? 'N/A')
        .replaceAll('{phone}', input.phone ?? 'N/A')
        .replaceAll('{source}', input.source);

      const response = await this.model.invoke(prompt);
      const content =
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      const parsed = this.parseJsonResponse(content);

      const score = Math.min(100, Math.max(0, Number(parsed.score) || 0));
      const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));

      return Result.ok({
        score,
        confidence,
        modelVersion: this.modelVersion,
        reasoning: parsed.reasoning ?? 'Ollama scoring',
        factors: {
          companySize: Number(parsed.factors?.companySize) || 0,
          titleRelevance: Number(parsed.factors?.titleRelevance) || 0,
          emailQuality: Number(parsed.factors?.emailQuality) || 0,
          sourceCredibility: Number(parsed.factors?.sourceCredibility) || 0,
        },
      });
    } catch (error) {
      return Result.fail({
        message: `Ollama scoring failed: ${error instanceof Error ? error.message : String(error)}`,
        code: 'OLLAMA_SERVICE_ERROR',
      } as DomainError);
    }
  }

  async qualifyLead(input: LeadScoringInput): Promise<Result<boolean, DomainError>> {
    const scoringResult = await this.scoreLead(input);

    if (scoringResult.isFailure) {
      return Result.fail(scoringResult.error);
    }

    const isQualified = scoringResult.value.score >= 70;
    return Result.ok(isQualified);
  }

  async generateEmail(leadId: string, template: string): Promise<Result<string, DomainError>> {
    try {
      const prompt = GENERATE_EMAIL_PROMPT.replaceAll('{leadId}', leadId).replaceAll(
        '{template}',
        template
      );

      const response = await this.model.invoke(prompt);
      const content =
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      const parsed = this.parseJsonResponse(content);

      // Return body if available, otherwise the full content
      const body = parsed.body ?? content;
      return Result.ok(body);
    } catch (error) {
      return Result.fail({
        message: `Ollama email generation failed: ${error instanceof Error ? error.message : String(error)}`,
        code: 'OLLAMA_SERVICE_ERROR',
      } as DomainError);
    }
  }

  /**
   * Parse JSON from LLM response, with markdown code block fallback.
   * Ollama sometimes wraps JSON in ```json ... ``` blocks.
   */
  private parseJsonResponse(content: string): any {
    try {
      return JSON.parse(content);
    } catch {
      // Fallback: extract JSON from markdown code blocks
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match?.[1]) {
        return JSON.parse(match[1].trim());
      }
      throw new Error(`Failed to parse JSON from Ollama response: ${content.slice(0, 200)}`);
    }
  }
}
