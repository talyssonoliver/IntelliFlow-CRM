import { Result, DomainError, LeadId } from '@intelliflow/domain';
import { LeadRepository } from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import { PersistenceError, ValidationError } from '../../errors';

/**
 * Input DTO for converting a lead
 */
export interface ConvertLeadInput {
  leadId: string;
  contactId: string;
  accountId: string | null;
  convertedBy: string;
}

/**
 * Output DTO for converted lead
 */
export interface ConvertLeadOutput {
  leadId: string;
  contactId: string;
  accountId: string | null;
  status: string;
  convertedBy: string;
}

/**
 * Convert Lead Use Case
 * Converts a lead to a contact (and optionally account)
 */
export class ConvertLeadUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly eventBus: EventBusPort
  ) {}

  async execute(input: ConvertLeadInput): Promise<Result<ConvertLeadOutput, DomainError>> {
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
    const convertResult = lead.convert(
      input.contactId,
      input.accountId,
      input.convertedBy
    );

    if (convertResult.isFailure) {
      return Result.fail(convertResult.error);
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
      contactId: input.contactId,
      accountId: input.accountId,
      status: lead.status,
      convertedBy: input.convertedBy,
    });
  }
}
