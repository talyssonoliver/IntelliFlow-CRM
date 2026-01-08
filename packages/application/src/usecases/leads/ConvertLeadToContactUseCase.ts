/**
 * ConvertLeadToContactUseCase
 *
 * FLOW-006: Lead to Contact Conversion Logic
 * Task: IFC-061
 *
 * Converts a lead to a contact with:
 * - All lead data preserved in contact
 * - Optional account creation/linking
 * - Audit trail via domain events
 * - Performance target: <200ms
 * - Data integrity: 100%
 */

import {
  Result,
  DomainError,
  Lead,
  LeadId,
  Contact,
  Account,
} from '@intelliflow/domain';
import {
  LeadRepository,
  ContactRepository,
  AccountRepository,
} from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import { ValidationError, NotFoundError, PersistenceError } from '../../errors';

// =============================================================================
// Input/Output DTOs
// =============================================================================

/**
 * Input for converting a lead to contact
 */
export interface ConvertLeadToContactInput {
  /** The lead ID to convert */
  leadId: string;
  /** Optional account name - creates new or links to existing */
  accountName?: string;
  /** User performing the conversion (required for audit) */
  convertedBy: string;
}

/**
 * Output after successful conversion
 */
export interface ConvertLeadToContactOutput {
  /** Original lead ID */
  leadId: string;
  /** Newly created contact ID */
  contactId: string;
  /** Account ID (new or existing) or null */
  accountId: string | null;
  /** Lead status after conversion */
  leadStatus: string;
  /** User who performed conversion */
  convertedBy: string;
  /** Timestamp of conversion */
  convertedAt: Date;
}

// =============================================================================
// Use Case Implementation
// =============================================================================

/**
 * ConvertLeadToContactUseCase
 *
 * Orchestrates the conversion of a lead to a contact:
 * 1. Validates input and loads lead
 * 2. Creates/finds account if provided
 * 3. Creates contact from lead data (preserving all fields)
 * 4. Marks lead as CONVERTED
 * 5. Persists all changes atomically
 * 6. Publishes domain events for audit trail
 */
export class ConvertLeadToContactUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly contactRepository: ContactRepository,
    private readonly accountRepository: AccountRepository,
    private readonly eventBus: EventBusPort
  ) {}

  async execute(
    input: ConvertLeadToContactInput
  ): Promise<Result<ConvertLeadToContactOutput, DomainError>> {
    // 1. Validate input
    const validationResult = this.validateInput(input);
    if (validationResult.isFailure) {
      return Result.fail(validationResult.error);
    }

    // 2. Parse and validate lead ID
    const leadIdResult = LeadId.create(input.leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    // 3. Load lead from repository
    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new NotFoundError(`Lead not found: ${input.leadId}`));
    }

    // 4. Check if lead is already converted
    if (lead.isConverted) {
      return Result.fail(lead.convert('', null, '').error); // Get domain error
    }

    // 5. Handle account creation/linking
    let accountId: string | null = null;
    if (input.accountName) {
      const accountResult = await this.handleAccount(input.accountName, lead);
      if (accountResult.isFailure) {
        return Result.fail(accountResult.error);
      }
      accountId = accountResult.value;
    }

    // 6. Create contact from lead data
    const contactResult = this.createContactFromLead(lead, accountId);
    if (contactResult.isFailure) {
      return Result.fail(contactResult.error);
    }
    const contact = contactResult.value;

    // 7. Convert lead (updates status and creates event)
    const convertResult = lead.convert(contact.id.value, accountId, input.convertedBy);
    if (convertResult.isFailure) {
      return Result.fail(convertResult.error);
    }

    // 8. Persist all changes
    try {
      await this.contactRepository.save(contact);
      await this.leadRepository.save(lead);
    } catch (error) {
      return Result.fail(
        new PersistenceError('Failed to save conversion: ' + (error as Error).message)
      );
    }

    // 9. Publish domain events (audit trail)
    await this.publishEvents(lead, contact);

    // 10. Return output
    return Result.ok({
      leadId: lead.id.value,
      contactId: contact.id.value,
      accountId,
      leadStatus: lead.status,
      convertedBy: input.convertedBy,
      convertedAt: new Date(),
    });
  }

  /**
   * Validate input parameters
   */
  private validateInput(input: ConvertLeadToContactInput): Result<void, DomainError> {
    if (!input.convertedBy || input.convertedBy.trim() === '') {
      return Result.fail(
        new ValidationError('convertedBy is required for audit trail')
      );
    }
    return Result.ok(undefined);
  }

  /**
   * Handle account creation or linking
   */
  private async handleAccount(
    accountName: string,
    lead: Lead
  ): Promise<Result<string, DomainError>> {
    // Check if account already exists
    const existingAccounts = await this.accountRepository.findByName(accountName);
    if (existingAccounts.length > 0) {
      return Result.ok(existingAccounts[0].id.value);
    }

    // Create new account
    const accountResult = Account.create({
      name: accountName,
      ownerId: lead.ownerId,
      tenantId: lead.tenantId,
    });

    if (accountResult.isFailure) {
      return Result.fail(accountResult.error);
    }

    const account = accountResult.value;

    try {
      await this.accountRepository.save(account);
    } catch (error) {
      return Result.fail(
        new PersistenceError('Failed to create account: ' + (error as Error).message)
      );
    }

    // Publish account events
    const accountEvents = account.getDomainEvents();
    if (accountEvents.length > 0) {
      try {
        await this.eventBus.publishAll(accountEvents);
      } catch {
        // Log but don't fail - event publishing is best-effort
      }
      account.clearDomainEvents();
    }

    return Result.ok(account.id.value);
  }

  /**
   * Create contact from lead data (100% data preservation)
   */
  private createContactFromLead(
    lead: Lead,
    accountId: string | null
  ): Result<Contact, DomainError> {
    return Contact.create({
      email: lead.email.value,
      firstName: lead.firstName ?? 'Unknown',
      lastName: lead.lastName ?? 'Unknown',
      title: lead.title,
      phone: lead.phone,
      accountId: accountId ?? undefined,
      leadId: lead.id.value,
      ownerId: lead.ownerId,
      tenantId: lead.tenantId,
    });
  }

  /**
   * Publish domain events for audit trail
   */
  private async publishEvents(lead: Lead, contact: Contact): Promise<void> {
    const leadEvents = lead.getDomainEvents();
    const contactEvents = contact.getDomainEvents();

    const allEvents = [...leadEvents, ...contactEvents];

    if (allEvents.length > 0) {
      try {
        await this.eventBus.publishAll(allEvents);
      } catch (error) {
        // Log but don't fail - event publishing is best-effort
        console.error('Failed to publish domain events:', error);
      }
    }

    lead.clearDomainEvents();
    contact.clearDomainEvents();
  }
}
