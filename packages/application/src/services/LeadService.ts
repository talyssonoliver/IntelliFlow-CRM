import {
  Result,
  DomainError,
  Lead,
  LeadId,
  LeadScore,
  LeadStatus,
  LeadSource,
  Email,
  LeadRepository,
  Contact,
  ContactId,
  Account,
  AccountId,
  CreateLeadProps,
} from '@intelliflow/domain';
import { AIServicePort, EventBusPort } from '../ports/external';
import { ContactRepository, AccountRepository } from '../ports/repositories';
import { PersistenceError, ValidationError } from '../errors';

/**
 * Lead qualification thresholds
 */
export const LEAD_SCORE_THRESHOLDS = {
  HOT: 80,
  WARM: 50,
  COLD: 0,
  AUTO_QUALIFY: 75,
  AUTO_DISQUALIFY: 20,
} as const;

/**
 * Lead qualification criteria
 */
export interface LeadQualificationCriteria {
  minScore: number;
  requiredFields: (keyof CreateLeadProps)[];
  allowedSources: LeadSource[];
}

/**
 * Lead conversion result
 */
export interface LeadConversionResult {
  leadId: string;
  contactId: string;
  accountId: string | null;
  convertedBy: string;
  convertedAt: Date;
}

/**
 * Lead score update result (after AI scoring)
 */
export interface LeadScoreUpdateResult {
  leadId: string;
  previousScore: number;
  newScore: number;
  confidence: number;
  tier: 'HOT' | 'WARM' | 'COLD';
  autoQualified: boolean;
  autoDisqualified: boolean;
}

/**
 * Lead bulk operation result
 */
export interface BulkOperationResult {
  successful: string[];
  failed: Array<{ id: string; error: string }>;
  totalProcessed: number;
}

/**
 * Lead Service
 *
 * Orchestrates lead-related business logic including:
 * - Lead qualification based on scoring thresholds
 * - AI-powered scoring integration
 * - Lead conversion to contacts/accounts
 * - Bulk operations with validation
 * - Business rule enforcement
 */
export class LeadService {
  private readonly defaultQualificationCriteria: LeadQualificationCriteria = {
    minScore: LEAD_SCORE_THRESHOLDS.WARM,
    requiredFields: ['email', 'ownerId'],
    allowedSources: ['WEBSITE', 'REFERRAL', 'SOCIAL', 'EMAIL', 'COLD_CALL', 'EVENT', 'OTHER'],
  };

  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly contactRepository: ContactRepository,
    private readonly accountRepository: AccountRepository,
    private readonly aiService: AIServicePort,
    private readonly eventBus: EventBusPort
  ) {}

  /**
   * Create a new lead with validation
   */
  async createLead(props: CreateLeadProps): Promise<Result<Lead, DomainError>> {
    // Check for duplicate email
    const emailResult = Email.create(props.email);
    if (emailResult.isFailure) {
      return Result.fail(emailResult.error);
    }

    const existingLead = await this.leadRepository.existsByEmail(emailResult.value);
    if (existingLead) {
      return Result.fail(new ValidationError(`Lead with email ${props.email} already exists`));
    }

    // Create lead
    const leadResult = Lead.create(props);
    if (leadResult.isFailure) {
      return Result.fail(leadResult.error);
    }

    const lead = leadResult.value;

    // Persist
    try {
      await this.leadRepository.save(lead);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save lead'));
    }

    // Publish events
    await this.publishEvents(lead);

    return Result.ok(lead);
  }

  /**
   * Score a lead using AI service
   */
  async scoreLead(leadId: string): Promise<Result<LeadScoreUpdateResult, DomainError>> {
    const leadIdResult = LeadId.create(leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new ValidationError(`Lead not found: ${leadId}`));
    }

    const previousScore = lead.score.value;

    // Call AI service
    const scoringResult = await this.aiService.scoreLead({
      email: lead.email.value,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      title: lead.title,
      phone: lead.phone,
      source: lead.source,
    });

    if (scoringResult.isFailure) {
      return Result.fail(scoringResult.error);
    }

    const { score, confidence, modelVersion } = scoringResult.value;

    // Update lead score
    const updateResult = lead.updateScore(score, confidence, modelVersion);
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    // Auto-qualify or auto-disqualify based on score
    let autoQualified = false;
    let autoDisqualified = false;

    if (score >= LEAD_SCORE_THRESHOLDS.AUTO_QUALIFY && lead.status === 'NEW') {
      const qualifyResult = lead.qualify(
        'AI-AutoQualify',
        `Score ${score} exceeds threshold ${LEAD_SCORE_THRESHOLDS.AUTO_QUALIFY}`
      );
      if (qualifyResult.isSuccess) {
        autoQualified = true;
      }
    } else if (score <= LEAD_SCORE_THRESHOLDS.AUTO_DISQUALIFY && lead.status === 'NEW') {
      const statusResult = lead.changeStatus('UNQUALIFIED', 'AI-AutoDisqualify');
      if (statusResult.isSuccess) {
        autoDisqualified = true;
      }
    }

    // Persist changes
    try {
      await this.leadRepository.save(lead);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save lead after scoring'));
    }

    // Publish events
    await this.publishEvents(lead);

    return Result.ok({
      leadId: lead.id.value,
      previousScore,
      newScore: score,
      confidence,
      tier: lead.score.tier,
      autoQualified,
      autoDisqualified,
    });
  }

  /**
   * Qualify a lead manually
   */
  async qualifyLead(
    leadId: string,
    qualifiedBy: string,
    reason: string
  ): Promise<Result<Lead, DomainError>> {
    const leadIdResult = LeadId.create(leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new ValidationError(`Lead not found: ${leadId}`));
    }

    // Business rule: Check minimum score for qualification
    if (lead.score.value < this.defaultQualificationCriteria.minScore) {
      return Result.fail(
        new ValidationError(
          `Lead score ${lead.score.value} is below minimum qualification threshold ${this.defaultQualificationCriteria.minScore}`
        )
      );
    }

    const qualifyResult = lead.qualify(qualifiedBy, reason);
    if (qualifyResult.isFailure) {
      return Result.fail(qualifyResult.error);
    }

    try {
      await this.leadRepository.save(lead);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save lead'));
    }

    await this.publishEvents(lead);

    return Result.ok(lead);
  }

  /**
   * Convert a lead to contact and optionally create account
   */
  async convertLead(
    leadId: string,
    accountName: string | null,
    convertedBy: string
  ): Promise<Result<LeadConversionResult, DomainError>> {
    const leadIdResult = LeadId.create(leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new ValidationError(`Lead not found: ${leadId}`));
    }

    // Business rule: Only qualified leads can be converted
    if (lead.status !== 'QUALIFIED') {
      return Result.fail(
        new ValidationError(`Only qualified leads can be converted. Current status: ${lead.status}`)
      );
    }

    // Create or find account if provided
    let accountId: string | null = null;
    if (accountName) {
      // Check if account already exists
      const existingAccounts = await this.accountRepository.findByName(accountName);
      if (existingAccounts.length > 0) {
        accountId = existingAccounts[0].id.value;
      } else {
        // Create new account
        const accountResult = Account.create({
          name: accountName,
          website: undefined,
          industry: undefined,
          ownerId: lead.ownerId,
        });

        if (accountResult.isSuccess) {
          const account = accountResult.value;
          await this.accountRepository.save(account);
          await this.publishAccountEvents(account);
          accountId = account.id.value;
        }
      }
    }

    // Create contact from lead
    const contactResult = Contact.create({
      email: lead.email.value,
      firstName: lead.firstName ?? 'Unknown',
      lastName: lead.lastName ?? 'Unknown',
      title: lead.title,
      phone: lead.phone,
      accountId: accountId ?? undefined,
      leadId: lead.id.value,
      ownerId: lead.ownerId,
    });

    if (contactResult.isFailure) {
      return Result.fail(contactResult.error);
    }

    const contact = contactResult.value;

    // Convert lead
    const convertResult = lead.convert(contact.id.value, accountId, convertedBy);
    if (convertResult.isFailure) {
      return Result.fail(convertResult.error);
    }

    // Persist all changes
    try {
      await this.contactRepository.save(contact);
      await this.leadRepository.save(lead);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save conversion'));
    }

    // Publish events
    await this.publishEvents(lead);
    await this.publishContactEvents(contact);

    return Result.ok({
      leadId: lead.id.value,
      contactId: contact.id.value,
      accountId,
      convertedBy,
      convertedAt: new Date(),
    });
  }

  /**
   * Bulk score leads
   */
  async bulkScoreLeads(leadIds: string[]): Promise<BulkOperationResult> {
    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const leadId of leadIds) {
      const result = await this.scoreLead(leadId);
      if (result.isSuccess) {
        successful.push(leadId);
      } else {
        failed.push({ id: leadId, error: result.error.message });
      }
    }

    return {
      successful,
      failed,
      totalProcessed: leadIds.length,
    };
  }

  /**
   * Get leads ready for qualification
   */
  async getLeadsReadyForQualification(ownerId?: string): Promise<Lead[]> {
    const leads = await this.leadRepository.findByMinScore(LEAD_SCORE_THRESHOLDS.WARM, ownerId);

    // Filter to only NEW or CONTACTED leads
    return leads.filter((lead) => lead.status === 'NEW' || lead.status === 'CONTACTED');
  }

  /**
   * Get hot leads (high score, high priority)
   */
  async getHotLeads(ownerId?: string): Promise<Lead[]> {
    return this.leadRepository.findByMinScore(LEAD_SCORE_THRESHOLDS.HOT, ownerId);
  }

  /**
   * Get leads requiring attention (unscored or stale)
   */
  async getLeadsForScoring(limit: number = 50): Promise<Lead[]> {
    return this.leadRepository.findForScoring(limit);
  }

  /**
   * Update lead contact information with validation
   */
  async updateLeadContactInfo(
    leadId: string,
    updates: {
      firstName?: string;
      lastName?: string;
      company?: string;
      title?: string;
      phone?: string;
    }
  ): Promise<Result<Lead, DomainError>> {
    const leadIdResult = LeadId.create(leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new ValidationError(`Lead not found: ${leadId}`));
    }

    // Business rule: Cannot update converted leads
    if (lead.isConverted) {
      return Result.fail(new ValidationError('Cannot update a converted lead'));
    }

    lead.updateContactInfo(updates);

    try {
      await this.leadRepository.save(lead);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save lead'));
    }

    return Result.ok(lead);
  }

  /**
   * Change lead status with business rule validation
   */
  async changeLeadStatus(
    leadId: string,
    newStatus: LeadStatus,
    changedBy: string
  ): Promise<Result<Lead, DomainError>> {
    const leadIdResult = LeadId.create(leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new ValidationError(`Lead not found: ${leadId}`));
    }

    // Business rules for status transitions
    const validTransitions: Record<LeadStatus, LeadStatus[]> = {
      NEW: ['CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'LOST'],
      CONTACTED: ['QUALIFIED', 'UNQUALIFIED', 'LOST'],
      QUALIFIED: ['CONVERTED', 'LOST'],
      UNQUALIFIED: ['CONTACTED', 'LOST'], // Can be re-engaged
      CONVERTED: [], // Terminal state
      LOST: ['NEW'], // Can be reopened
    };

    const allowedTransitions = validTransitions[lead.status];
    if (!allowedTransitions.includes(newStatus)) {
      return Result.fail(
        new ValidationError(
          `Invalid status transition from ${lead.status} to ${newStatus}. Allowed: ${allowedTransitions.join(', ')}`
        )
      );
    }

    const statusResult = lead.changeStatus(newStatus, changedBy);
    if (statusResult.isFailure) {
      return Result.fail(statusResult.error);
    }

    try {
      await this.leadRepository.save(lead);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save lead'));
    }

    await this.publishEvents(lead);

    return Result.ok(lead);
  }

  /**
   * Get lead statistics
   */
  async getLeadStatistics(ownerId?: string): Promise<{
    total: number;
    byStatus: Record<LeadStatus, number>;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    averageScore: number;
  }> {
    const statusCounts = await this.leadRepository.countByStatus(ownerId);
    const hotLeads = await this.leadRepository.findByMinScore(LEAD_SCORE_THRESHOLDS.HOT, ownerId);
    const warmLeads = await this.leadRepository.findByMinScore(LEAD_SCORE_THRESHOLDS.WARM, ownerId);
    const allLeads = ownerId
      ? await this.leadRepository.findByOwnerId(ownerId)
      : await this.leadRepository.findByStatus('NEW');

    const totalScore = allLeads.reduce((sum, lead) => sum + lead.score.value, 0);
    const averageScore = allLeads.length > 0 ? totalScore / allLeads.length : 0;

    return {
      total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
      byStatus: statusCounts as Record<LeadStatus, number>,
      hotLeads: hotLeads.length,
      warmLeads: warmLeads.filter((l) => l.score.value < LEAD_SCORE_THRESHOLDS.HOT).length,
      coldLeads: allLeads.filter((l) => l.score.value < LEAD_SCORE_THRESHOLDS.WARM).length,
      averageScore: Math.round(averageScore * 100) / 100,
    };
  }

  private async publishEvents(lead: Lead): Promise<void> {
    const events = lead.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish lead domain events:', error);
      }
    }
    lead.clearDomainEvents();
  }

  private async publishContactEvents(contact: Contact): Promise<void> {
    const events = contact.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish contact domain events:', error);
      }
    }
    contact.clearDomainEvents();
  }

  private async publishAccountEvents(account: Account): Promise<void> {
    const events = account.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish account domain events:', error);
      }
    }
    account.clearDomainEvents();
  }
}
