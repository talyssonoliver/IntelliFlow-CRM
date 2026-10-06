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
import { LeadRepository, ContactRepository, AccountRepository } from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import { TransactionPort } from '../../ports/TransactionPort';
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
 * 7. Persists lead (compare-and-set), contact, audit record and any new
 *    account plus their domain events in ONE transaction
 * 8. Clears domain events once the transaction has committed
 */
export class ConvertLeadToContactUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly contactRepository: ContactRepository,
    private readonly accountRepository: AccountRepository,
    private readonly conversionAuditRepository: LeadConversionAuditRepository,
    private readonly eventBus: EventBusPort,
    private readonly transactionManager: TransactionPort
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
    // #427: scope the conflict check to the lead's tenant (DB unique is
    // [tenantId, email]); an email-only check false-conflicts across tenants.
    const existingContact = await this.contactRepository.findByEmailInTenant(
      lead.email,
      lead.tenantId
    );
    if (existingContact && mergeStrategy === 'SKIP') {
      return Result.fail(new ContactEmailExistsError(lead.email.value));
    }

    // 9. Handle account creation/linking
    // (a new Account is only built here; it is saved inside the transaction below)
    let accountId: string | null = null;
    let newAccount: Account | null = null;
    if (input.accountId) {
      accountId = input.accountId;
    } else if (input.accountName) {
      const accountResult = await this.prepareAccount(input.accountName, lead);
      if (accountResult.isFailure) {
        return Result.fail(accountResult.error);
      }
      accountId = accountResult.value.accountId;
      newAccount = accountResult.value.newAccount;
    }

    // 10. Create contact from lead data
    const contactResult = this.createContactFromLead(lead, accountId);
    if (contactResult.isFailure) {
      return Result.fail(contactResult.error);
    }
    const contact = contactResult.value;

    // 11. Convert lead (updates status and creates event)
    const expectedStatus = lead.status;
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

    // 13. Persist everything atomically. Lead (compare-and-set), Contact, audit
    // row, any new Account and the event outbox share ONE transaction: a failure
    // anywhere (including a CAS conflict, which throws LeadStatusConflictError)
    // rolls the whole conversion back, so the lead is never left CONVERTED
    // without its Contact and audit row.
    const aggregates = [newAccount, lead, contact].filter(
      (a): a is NonNullable<typeof a> => a !== null
    );
    try {
      await this.transactionManager.run(async (tx) => {
        if (newAccount) {
          await this.accountRepository.save(newAccount, tx);
        }
        await this.leadRepository.save(lead, { expectedStatus }, tx);
        await this.contactRepository.save(contact, tx);
        await this.conversionAuditRepository.save(audit, tx);

        const events = aggregates.flatMap((aggregate) => aggregate.getDomainEvents());
        if (events.length > 0) {
          await this.eventBus.publishAll(events, tx);
        }
      });
    } catch (error) {
      return Result.fail(
        new PersistenceError('Failed to save conversion: ' + (error as Error).message)
      );
    }

    // 14. Clear domain events now the transaction has committed
    for (const aggregate of aggregates) {
      aggregate.clearDomainEvents();
    }

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
      return Result.fail(new ValidationError('convertedBy is required for audit trail'));
    }
    return Result.ok(undefined);
  }

  /**
   * Resolve an existing account by name or build a new one (NO write yet; the
   * caller saves `newAccount` inside the conversion transaction).
   */
  private async prepareAccount(
    accountName: string,
    lead: Lead
  ): Promise<Result<{ accountId: string; newAccount: Account | null }, DomainError>> {
    const existingAccounts = await this.accountRepository.findByName(accountName, lead.tenantId);
    if (existingAccounts.length > 0) {
      return Result.ok({ accountId: existingAccounts[0].id.value, newAccount: null });
    }

    const accountResult = Account.create({
      name: accountName,
      ownerId: lead.ownerId,
      tenantId: lead.tenantId,
    });
    if (accountResult.isFailure) {
      return Result.fail(accountResult.error);
    }
    return Result.ok({ accountId: accountResult.value.id.value, newAccount: accountResult.value });
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
}
