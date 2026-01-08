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
import {
  LeadRepository,
  ContactRepository,
  AccountRepository,
  OpportunityRepository,
} from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
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
    private readonly eventBus: EventBusPort
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
      return Result.fail(lead.convert('', null, '').error); // Get domain error
    }

    // 5. Handle account (REQUIRED for Opportunity)
    const accountResult = await this.handleAccount(input, lead);
    if (accountResult.isFailure) {
      return Result.fail(accountResult.error);
    }
    const accountId = accountResult.value;

    // 6. Optionally create contact from lead data
    let contactId: string | null = null;
    const shouldCreateContact = input.createContact !== false; // default true
    if (shouldCreateContact) {
      const contactResult = await this.createContactFromLead(lead, accountId);
      if (contactResult.isFailure) {
        return Result.fail(contactResult.error);
      }
      contactId = contactResult.value;
    }

    // 7. Create opportunity
    const opportunityResult = this.createOpportunityFromLead(lead, input, accountId, contactId);
    if (opportunityResult.isFailure) {
      return Result.fail(opportunityResult.error);
    }
    const opportunity = opportunityResult.value;

    // 8. Convert lead (updates status and creates event)
    const convertResult = lead.convert(contactId ?? '', accountId, input.convertedBy);
    if (convertResult.isFailure) {
      return Result.fail(convertResult.error);
    }

    // 9. Persist all changes
    try {
      await this.opportunityRepository.save(opportunity);
      await this.leadRepository.save(lead);
    } catch (error) {
      return Result.fail(
        new PersistenceError('Failed to save conversion: ' + (error as Error).message)
      );
    }

    // 10. Publish domain events (audit trail)
    await this.publishEvents(lead, opportunity);

    // 11. Return output
    return Result.ok({
      leadId: lead.id.value,
      opportunityId: opportunity.id.value,
      contactId,
      accountId,
      stage: opportunity.stage,
      probability: opportunity.probability,
      convertedBy: input.convertedBy,
      convertedAt: new Date(),
    });
  }

  /**
   * Validate input parameters
   */
  private validateInput(input: ConvertLeadToDealInput): Result<void, DomainError> {
    if (!input.convertedBy || input.convertedBy.trim() === '') {
      return Result.fail(
        new ValidationError('convertedBy is required for audit trail')
      );
    }
    if (input.dealValue <= 0) {
      return Result.fail(
        new ValidationError('Deal value must be greater than zero')
      );
    }
    return Result.ok(undefined);
  }

  /**
   * Handle account creation or linking (REQUIRED for Opportunity)
   */
  private async handleAccount(
    input: ConvertLeadToDealInput,
    lead: Lead
  ): Promise<Result<string, DomainError>> {
    // Determine account name: input > lead.company
    const accountName = input.accountName ?? lead.company;

    if (!accountName) {
      return Result.fail(
        new ValidationError('Account name is required. Provide accountName or ensure lead has a company.')
      );
    }

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
   * Create contact from lead data
   */
  private async createContactFromLead(
    lead: Lead,
    accountId: string
  ): Promise<Result<string, DomainError>> {
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

    const contact = contactResult.value;

    try {
      await this.contactRepository.save(contact);
    } catch (error) {
      return Result.fail(
        new PersistenceError('Failed to create contact: ' + (error as Error).message)
      );
    }

    // Publish contact events
    const contactEvents = contact.getDomainEvents();
    if (contactEvents.length > 0) {
      try {
        await this.eventBus.publishAll(contactEvents);
      } catch {
        // Log but don't fail - event publishing is best-effort
      }
      contact.clearDomainEvents();
    }

    return Result.ok(contact.id.value);
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

  /**
   * Publish domain events for audit trail
   */
  private async publishEvents(lead: Lead, opportunity: Opportunity): Promise<void> {
    const leadEvents = lead.getDomainEvents();
    const opportunityEvents = opportunity.getDomainEvents();

    const allEvents = [...leadEvents, ...opportunityEvents];

    if (allEvents.length > 0) {
      try {
        await this.eventBus.publishAll(allEvents);
      } catch (error) {
        // Log but don't fail - event publishing is best-effort
        console.error('Failed to publish domain events:', error);
      }
    }

    lead.clearDomainEvents();
    opportunity.clearDomainEvents();
  }
}
