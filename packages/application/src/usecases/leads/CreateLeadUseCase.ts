import { Result, DomainError, Lead } from '@intelliflow/domain';
import { LeadRepository } from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import { TransactionPort } from '../../ports/TransactionPort';
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
  tenantId: string;
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
    private readonly eventBus: EventBusPort,
    private readonly transactionManager: TransactionPort
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
      tenantId: input.tenantId,
    });

    if (leadResult.isFailure) {
      return Result.fail(leadResult.error);
    }

    const lead = leadResult.value;

    // 2. Persist the lead AND its domain events atomically (DDD-002).
    // The aggregate save and the outbox write share one transaction: either
    // both commit or neither does, so a crash can never leave a persisted lead
    // with no LeadCreated event (ADR-011 zero-lost-events). Event-publish
    // failure now fails the whole use case rather than being swallowed.
    const events = lead.getDomainEvents();
    try {
      await this.transactionManager.run(async (tx) => {
        await this.leadRepository.save(lead, undefined, tx);
        if (events.length > 0) {
          await this.eventBus.publishAll(events, tx);
        }
      });
    } catch {
      return Result.fail(new PersistenceError('Failed to persist lead and its domain events'));
    }

    // 3. Clear domain events (state has been committed)
    lead.clearDomainEvents();

    // 5. Return output DTO
    return Result.ok({
      id: lead.id.value,
      email: lead.email.value,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      title: lead.title,
      phone: lead.phone?.value,
      source: lead.source,
      status: lead.status,
      ownerId: lead.ownerId,
      createdAt: lead.createdAt,
    });
  }
}
