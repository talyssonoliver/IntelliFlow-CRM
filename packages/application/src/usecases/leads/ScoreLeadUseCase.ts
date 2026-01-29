import { Result, DomainError, LeadId } from '@intelliflow/domain';
import { LeadRepository } from '../../ports/repositories';
import { AIServicePort, EventBusPort } from '../../ports/external';
import { PersistenceError, ValidationError } from '../../errors';

/**
 * Input DTO for scoring a lead
 */
export interface ScoreLeadInput {
  leadId: string;
}

/**
 * Output DTO for lead score
 */
export interface ScoreLeadOutput {
  leadId: string;
  score: number;
  confidence: number;
  modelVersion: string;
  reasoning?: string;
}

/**
 * Score Lead Use Case
 * Orchestrates AI-powered lead scoring
 */
export class ScoreLeadUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly aiService: AIServicePort,
    private readonly eventBus: EventBusPort
  ) {}

  async execute(input: ScoreLeadInput): Promise<Result<ScoreLeadOutput, DomainError>> {
    // 1. Parse and validate lead ID
    const leadIdResult = LeadId.create(input.leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    // 2. Load lead from repository
    const lead = await this.leadRepository.findById(leadIdResult.value);

    if (!lead) {
      return Result.fail(new ValidationError(`Lead not found: ${input.leadId}`));
    }

    // 2. Call AI service to calculate score
    const scoringResult = await this.aiService.scoreLead({
      email: lead.email.value,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      title: lead.title,
      phone: lead.phone?.value,
      source: lead.source,
    });

    if (scoringResult.isFailure) {
      return Result.fail(scoringResult.error);
    }

    const { score, confidence, modelVersion, reasoning } = scoringResult.value;

    // 3. Update domain entity
    const updateResult = lead.updateScore(score, confidence, modelVersion);

    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    // 4. Persist changes
    try {
      await this.leadRepository.save(lead);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save lead'));
    }

    // 5. Publish domain events
    const events = lead.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish domain events:', error);
      }
    }

    lead.clearDomainEvents();

    // 6. Return output DTO
    return Result.ok({
      leadId: lead.id.value,
      score,
      confidence,
      modelVersion,
      reasoning,
    });
  }
}
