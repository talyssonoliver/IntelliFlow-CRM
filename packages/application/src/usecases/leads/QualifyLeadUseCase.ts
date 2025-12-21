import { Result, DomainError, LeadId } from '@intelliflow/domain';
import { LeadRepository } from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import { PersistenceError, ValidationError } from '../../errors';

/**
 * Input DTO for qualifying a lead
 */
export interface QualifyLeadInput {
  leadId: string;
  qualifiedBy: string;
  reason: string;
}

/**
 * Output DTO for qualified lead
 */
export interface QualifyLeadOutput {
  leadId: string;
  status: string;
  qualifiedBy: string;
  reason: string;
}

/**
 * Qualify Lead Use Case
 * Marks a lead as qualified
 */
export class QualifyLeadUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly eventBus: EventBusPort
  ) {}

  async execute(input: QualifyLeadInput): Promise<Result<QualifyLeadOutput, DomainError>> {
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

    // 3. Execute domain logic
    const qualifyResult = lead.qualify(input.qualifiedBy, input.reason);

    if (qualifyResult.isFailure) {
      return Result.fail(qualifyResult.error);
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
      status: lead.status,
      qualifiedBy: input.qualifiedBy,
      reason: input.reason,
    });
  }
}
