/**
 * ConvertLeadToDealUseCase
 *
 * FLOW-006: Lead to Deal Conversion Logic
 * Task: IFC-062
 *
 * Converts a lead to a deal/opportunity with:
 * - Pipeline assignment (stage=PROSPECTING, probability=10%)
 * - Account creation/linking (required for Opportunity)
 * - Optional contact creation
 * - Audit trail via domain events
 * - Performance target: <200ms
 */

import {
  Result,
  DomainError,
  Lead,
  LeadId,
  Contact,
  Account,
  Opportunity,
} from '@intelliflow/domain';
import { ConversionSnapshot } from './ConversionSnapshot';
import {
  LeadRepository,
  ContactRepository,
  AccountRepository,
  OpportunityRepository,
} from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import { TransactionPort } from '../../ports/TransactionPort';
import { ValidationError, NotFoundError, PersistenceError } from '../../errors';

// =============================================================================
// Input/Output DTOs
// =============================================================================

/**
 * Input for converting a lead to deal/opportunity
 */
export interface ConvertLeadToDealInput {
  /** The lead ID to convert */
  leadId: string;
  /** Optional deal name - auto-generated from lead if not provided */
  dealName?: string;
  /** Deal value (required) */
  dealValue: number;
  /** Expected close date (optional) */
  expectedCloseDate?: Date;
  /** Account name - creates new or links existing (uses lead.company if not provided) */
  accountName?: string;
  /** Whether to create contact from lead (default: true) */
  createContact?: boolean;
  /** User performing the conversion (required for audit) */
  convertedBy: string;
}

/**
 * Output after successful conversion
 */
export interface ConvertLeadToDealOutput {
  /** Original lead ID */
  leadId: string;
  /** Newly created opportunity ID */
  opportunityId: string;
  /** Contact ID (if created) or null */
  contactId: string | null;
  /** Account ID (new or existing) */
  accountId: string;
  /** Pipeline stage (PROSPECTING) */
  stage: string;
  /** Initial probability (10%) */
  probability: number;
  /** User who performed conversion */
  convertedBy: string;
  /** Timestamp of conversion */
  convertedAt: Date;
  /** Snapshot of lead data at conversion time for audit */
  conversionSnapshot: Record<string, unknown>;
}

// =============================================================================
// Use Case Implementation
// =============================================================================

/**
 * ConvertLeadToDealUseCase
 *
 * Orchestrates the conversion of a lead to a deal/opportunity:
 * 1. Validates input
 * 2. Loads lead from repository
 * 3. Checks if lead is already converted
 * 4. Handles account (create or find existing - REQUIRED)
 * 5. Optionally creates contact from lead data
 * 6. Creates opportunity with pipeline assignment
 * 7. Marks lead as CONVERTED
 * 8. Persists all changes atomically
 * 9. Publishes domain events for audit trail
 */
export class ConvertLeadToDealUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly contactRepository: ContactRepository,
    private readonly accountRepository: AccountRepository,
    private readonly opportunityRepository: OpportunityRepository,
    private readonly eventBus: EventBusPort,
    private readonly transactionManager: TransactionPort
  ) {}

  async execute(
    input: ConvertLeadToDealInput
  ): Promise<Result<ConvertLeadToDealOutput, DomainError>> {
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
      return Result.fail(lead.convert(null, null, '').error); // Get domain error
    }

    // 4.5. QUALIFIED gate — only qualified leads can be converted to deals (AC-008)
    if (lead.status !== 'QUALIFIED') {
      return Result.fail(new ValidationError('Only qualified leads can be converted to deals'));
    }

    // 4.6. Capture ConversionSnapshot for audit trail (AC-012)
    const conversionSnapshot = ConversionSnapshot.fromLead(lead);

    // 5. Prepare account (find existing or build a new entity — NO write yet)
    const accountResult = await this.prepareAccount(input, lead);
    if (accountResult.isFailure) {
      return Result.fail(accountResult.error);
    }
    const { accountId, newAccount } = accountResult.value;

    // 6. Optionally prepare a contact from lead data (NO write yet)
    let contactId: string | null = null;
    let contact: Contact | null = null;
    const shouldCreateContact = input.createContact !== false; // default true
    if (shouldCreateContact) {
      const contactResult = this.prepareContactFromLead(lead, accountId);
      if (contactResult.isFailure) {
        return Result.fail(contactResult.error);
      }
      contact = contactResult.value;
      contactId = contact.id.value;
    }

    // 7. Create opportunity
    const opportunityResult = this.createOpportunityFromLead(lead, input, accountId, contactId);
    if (opportunityResult.isFailure) {
      return Result.fail(opportunityResult.error);
    }
    const opportunity = opportunityResult.value;

    // 8. Convert lead (updates status and creates event)
    const convertResult = lead.convert(contactId, accountId, input.convertedBy);
    if (convertResult.isFailure) {
      return Result.fail(convertResult.error);
    }

    // 9. Persist ALL aggregates + their domain events atomically (DDD-001).
    // Account + Contact + Opportunity + Lead and the event outbox share ONE
    // transaction: a failure anywhere rolls the whole conversion back, so there
    // is never an orphaned Account/Contact/Opportunity while the source Lead
    // stays QUALIFIED (ADR-002 aggregate boundaries, ADR-011 zero-lost-events).
    const aggregates = [newAccount, contact, opportunity, lead].filter(
      (a): a is NonNullable<typeof a> => a !== null
    );
    try {
      await this.transactionManager.run(async (tx) => {
        if (newAccount) {
          await this.accountRepository.save(newAccount, tx);
        }
        if (contact) {
          await this.contactRepository.save(contact, tx);
        }
        await this.opportunityRepository.save(opportunity, tx);
        await this.leadRepository.save(lead, undefined, tx);

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

    // 10. Clear domain events now the transaction has committed
    for (const aggregate of aggregates) {
      aggregate.clearDomainEvents();
    }

    // 11. Return output
    return Result.ok({
      leadId: lead.id.value,
      opportunityId: opportunity.id.value,
      contactId,
      accountId,
      stage: opportunity.stage,
      probability: opportunity.probability.value,
      convertedBy: input.convertedBy,
      convertedAt: new Date(),
      conversionSnapshot: conversionSnapshot.toValue(),
    });
  }

  /**
   * Validate input parameters
   */
  private validateInput(input: ConvertLeadToDealInput): Result<void, DomainError> {
    if (!input.convertedBy || input.convertedBy.trim() === '') {
      return Result.fail(new ValidationError('convertedBy is required for audit trail'));
    }
    if (input.dealValue <= 0) {
      return Result.fail(new ValidationError('Deal value must be greater than zero'));
    }
    return Result.ok(undefined);
  }

  /**
   * Resolve the account for the conversion WITHOUT persisting.
   *
   * Returns the id of an existing account (no write needed) or a freshly-built
   * Account entity to be saved inside the conversion transaction. Keeping the
   * write out of here is what lets `execute` commit every aggregate atomically
   * (DDD-001).
   */
  private async prepareAccount(
    input: ConvertLeadToDealInput,
    lead: Lead
  ): Promise<Result<{ accountId: string; newAccount: Account | null }, DomainError>> {
    // Determine account name: input > lead.company
    const accountName = input.accountName ?? lead.company;

    if (!accountName) {
      return Result.fail(
        new ValidationError(
          'Account name is required. Provide accountName or ensure lead has a company.'
        )
      );
    }

    // Check if account already exists (read-only)
    const existingAccounts = await this.accountRepository.findByName(accountName, lead.tenantId);
    if (existingAccounts.length > 0) {
      return Result.ok({ accountId: existingAccounts[0].id.value, newAccount: null });
    }

    // Build a new account entity (persisted later, inside the transaction)
    const accountResult = Account.create({
      name: accountName,
      ownerId: lead.ownerId,
      tenantId: lead.tenantId,
    });

    if (accountResult.isFailure) {
      return Result.fail(accountResult.error);
    }

    const account = accountResult.value;
    return Result.ok({ accountId: account.id.value, newAccount: account });
  }

  /**
   * Build a contact entity from lead data WITHOUT persisting.
   * Saved inside the conversion transaction by `execute` (DDD-001).
   */
  private prepareContactFromLead(lead: Lead, accountId: string): Result<Contact, DomainError> {
    const contactResult = Contact.create({
      email: lead.email.value,
      firstName: lead.firstName ?? 'Unknown',
      lastName: lead.lastName ?? 'Unknown',
      title: lead.title,
      phone: lead.phone,
      accountId,
      leadId: lead.id.value,
      ownerId: lead.ownerId,
      tenantId: lead.tenantId,
    });

    if (contactResult.isFailure) {
      return Result.fail(contactResult.error);
    }

    return Result.ok(contactResult.value);
  }

  /**
   * Create opportunity from lead data with pipeline assignment
   */
  private createOpportunityFromLead(
    lead: Lead,
    input: ConvertLeadToDealInput,
    accountId: string,
    contactId: string | null
  ): Result<Opportunity, DomainError> {
    // Generate deal name if not provided
    const dealName = input.dealName ?? this.generateDealName(lead);

    return Opportunity.create({
      name: dealName,
      value: input.dealValue,
      accountId,
      contactId: contactId ?? undefined,
      sourceLeadId: lead.id.value,
      expectedCloseDate: input.expectedCloseDate,
      ownerId: lead.ownerId,
      tenantId: lead.tenantId,
    });
  }

  /**
   * Generate deal name from lead data
   */
  private generateDealName(lead: Lead): string {
    const parts: string[] = [];

    if (lead.company) {
      parts.push(lead.company);
    }

    if (lead.firstName || lead.lastName) {
      const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
      if (fullName && parts.length > 0) {
        parts.push('-');
      }
      if (fullName) {
        parts.push(fullName);
      }
    }

    return parts.join(' ') || 'New Deal';
  }
}
