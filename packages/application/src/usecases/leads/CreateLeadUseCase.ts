import { Result, DomainError, Lead } from '@intelliflow/domain';
import { LeadRepository } from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import { PersistenceError } from '../../errors';

/**
 * Input DTO for creating a lead
 */
export interface CreateLeadInput {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
  source?: string;
  ownerId: string;
}

/**
 * Output DTO for created lead
 */
export interface CreateLeadOutput {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
  source: string;
  status: string;
  ownerId: string;
  createdAt: Date;
}

/**
 * Create Lead Use Case
 * Orchestrates the creation of a new lead
 */
export class CreateLeadUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly eventBus: EventBusPort
  ) {}

  async execute(input: CreateLeadInput): Promise<Result<CreateLeadOutput, DomainError>> {
    // 1. Create lead entity using domain factory
    const leadResult = Lead.create({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      company: input.company,
      title: input.title,
      phone: input.phone,
      source: input.source as any,
      ownerId: input.ownerId,
    });

    if (leadResult.isFailure) {
      return Result.fail(leadResult.error);
    }

    const lead = leadResult.value;

    // 2. Persist the lead
    try {
      await this.leadRepository.save(lead);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save lead'));
    }

    // 3. Publish domain events
    const events = lead.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        // Log error but don't fail the operation
        console.error('Failed to publish domain events:', error);
      }
    }

    // 4. Clear domain events
    lead.clearDomainEvents();

    // 5. Return output DTO
    return Result.ok({
      id: lead.id.value,
      email: lead.email.value,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      title: lead.title,
      phone: lead.phone,
      source: lead.source,
      status: lead.status,
      ownerId: lead.ownerId,
      createdAt: lead.createdAt,
    });
  }
}
