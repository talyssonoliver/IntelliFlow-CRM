/**
 * ConvertLeadToContactUseCase
 *
 * FLOW-006: Lead to Contact Conversion Logic
 * Task: IFC-061
 *
 * Converts a lead to a contact with:
 * - All lead data preserved in contact
 * - Optional account creation/linking
 * - Audit trail via domain events and ConversionSnapshot
 * - Idempotency support
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
  LeadConversionAudit,
  LeadConversionAuditRepository,
} from '@intelliflow/domain';
import {
  LeadRepository,
  ContactRepository,
  AccountRepository,
} from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import { ValidationError, NotFoundError, PersistenceError } from '../../errors';
import { ConversionSnapshot } from './ConversionSnapshot';

// =============================================================================
// Custom Errors
// =============================================================================

export class ContactEmailExistsError extends DomainError {
  readonly code = 'CONTACT_EMAIL_EXISTS';
  constructor(email: string) {
    super(`Contact with email ${email} already exists`);
  }
}

// =============================================================================
// Input/Output DTOs
// =============================================================================

/** Merge strategy for handling contact email conflicts */
export type MergeStrategy = 'SKIP' | 'UPDATE' | 'CREATE_NEW';

/**
 * Input for converting a lead to contact
 */
export interface ConvertLeadToContactInput {
  /** The lead ID to convert */
  leadId: string;
  /** Optional account name - creates new or links to existing */
  accountName?: string;
  /** Optional account ID - link to existing account by ID */
  accountId?: string;
  /** User performing the conversion (required for audit) */
  convertedBy: string;
  /** Optional idempotency key for retry safety */
  idempotencyKey?: string;
  /** Strategy for handling existing contact with same email */
  mergeStrategy?: MergeStrategy;
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
  /** Snapshot of lead data at conversion time */
  conversionSnapshot: Record<string, unknown>;
}

// =============================================================================
// Use Case Implementation
// =============================================================================

/**
 * ConvertLeadToContactUseCase
 *
 * Orchestrates the conversion of a lead to a contact:
 * 1. Validates input and checks idempotency
 * 2. Creates/finds account if provided
 * 3. Checks for contact email conflicts
 * 4. Creates contact from lead data (preserving all fields)
 * 5. Creates ConversionSnapshot for audit
 * 6. Marks lead as CONVERTED
 * 7. Persists all changes with audit record
 * 8. Publishes domain events for audit trail
 */
export class ConvertLeadToContactUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly contactRepository: ContactRepository,
    private readonly accountRepository: AccountRepository,
    private readonly conversionAuditRepository: LeadConversionAuditRepository,
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

    // 2. Generate or use provided idempotency key
    const idempotencyKey = input.idempotencyKey ?? this.generateIdempotencyKey(input);

    // 3. Check idempotency - return existing result if found
    const existingAudit = await this.conversionAuditRepository.findByIdempotencyKey(idempotencyKey);
    if (existingAudit) {
      return Result.ok(existingAudit.toOutput());
    }

    // 4. Parse and validate lead ID
    const leadIdResult = LeadId.create(input.leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    // 5. Load lead from repository
    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new NotFoundError(`Lead not found: ${input.leadId}`));
    }

    // 6. Check if lead is already converted
    if (lead.isConverted) {
      return Result.fail(lead.convert('', null, '').error); // Get domain error
    }

    // 7. Create ConversionSnapshot for audit
    const snapshot = ConversionSnapshot.fromLead(lead);

    // 8. Check for contact email conflict
    const mergeStrategy = input.mergeStrategy ?? 'SKIP';
    const existingContact = await this.contactRepository.findByEmail(lead.email);
    if (existingContact && mergeStrategy === 'SKIP') {
      return Result.fail(new ContactEmailExistsError(lead.email.value));
    }

    // 9. Handle account creation/linking
    let accountId: string | null = null;
    if (input.accountId) {
      accountId = input.accountId;
    } else if (input.accountName) {
      const accountResult = await this.handleAccount(input.accountName, lead);
      if (accountResult.isFailure) {
        return Result.fail(accountResult.error);
      }
      accountId = accountResult.value;
    }

    // 10. Create contact from lead data
    const contactResult = this.createContactFromLead(lead, accountId);
    if (contactResult.isFailure) {
      return Result.fail(contactResult.error);
    }
    const contact = contactResult.value;

    // 11. Convert lead (updates status and creates event)
    const convertResult = lead.convert(contact.id.value, accountId, input.convertedBy);
    if (convertResult.isFailure) {
      return Result.fail(convertResult.error);
    }

    // 12. Create audit record
    const audit = LeadConversionAudit.create({
      leadId: lead.id.value,
      contactId: contact.id.value,
      accountId,
      tenantId: lead.tenantId,
      convertedBy: input.convertedBy,
      conversionSnapshot: snapshot.toValue(),
      idempotencyKey,
    });

    // 13. Persist all changes
    try {
      await this.contactRepository.save(contact);
      await this.leadRepository.save(lead);
      await this.conversionAuditRepository.save(audit);
    } catch (error) {
      return Result.fail(
        new PersistenceError('Failed to save conversion: ' + (error as Error).message)
      );
    }

    // 14. Publish domain events (audit trail)
    await this.publishEvents(lead, contact);

    // 15. Return output
    return Result.ok({
      leadId: lead.id.value,
      contactId: contact.id.value,
      accountId,
      leadStatus: lead.status,
      convertedBy: input.convertedBy,
      convertedAt: new Date(),
      conversionSnapshot: snapshot.toValue(),
    });
  }

  /**
   * Generate idempotency key from input
   */
  private generateIdempotencyKey(input: ConvertLeadToContactInput): string {
    return `${input.leadId}:${input.convertedBy}`;
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
      company: lead.company,
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
