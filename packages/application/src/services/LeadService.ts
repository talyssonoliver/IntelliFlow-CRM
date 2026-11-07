import {
  Result,
  DomainError,
  Lead,
  LeadId,
  LeadStatus,
  LeadSource,
  Email,
  PhoneNumber,
  LeadRepository,
  LeadStatusConflictError,
  LeadIdentityChangedError,
  Contact,
  Account,
  CreateLeadProps,
  RepositoryTransaction,
  ProcessingRestrictedError,
  isErasedEmail,
  normalizeSubjectEmail,
  requiresHumanReview,
} from '@intelliflow/domain';
import { AIServicePort, EventBusPort } from '../ports/external';
import { ContactRepository, AccountRepository } from '../ports/repositories';
import {
  ALLOW_ALL_RESTRICTIONS,
  type ProcessingRestrictionPort,
} from '../ports/repositories/ProcessingRestrictionPort';
import { TransactionPort } from '../ports/TransactionPort';
import {
  PersistenceError,
  ValidationError,
  NotFoundError,
  LeadScoreBelowMinimumError,
  LeadScoringFailedError,
} from '../errors';

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
 * Why a lead is being qualified.
 *
 * - `AUTOMATIC`: a rule or system decided it. The minimum score applies.
 * - `HUMAN`: a person decided it, with a reason. The score does not block it.
 * - `INBOUND_REPLY`: the lead replied. The score does not block it.
 *
 * The score is the AI's guess about fit. A person's decision, or the lead's own reply, is
 * stronger evidence, so neither is refused because of the score.
 */
export type QualificationBasis = 'AUTOMATIC' | 'HUMAN' | 'INBOUND_REPLY';

/** The status transitions a lead may make (CONVERTED goes through the convert operation). */
const VALID_LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'UNQUALIFIED', 'LOST'],
  QUALIFIED: ['NEGOTIATING', 'CONVERTED', 'LOST'],
  NEGOTIATING: ['CONVERTED', 'LOST'], // In negotiation phase
  UNQUALIFIED: ['CONTACTED', 'LOST'], // Can be re-engaged
  CONVERTED: [], // Terminal state
  LOST: ['NEW'], // Can be reopened
};

/** Fields updateLead copies as given when the caller provides them. */
const CONTACT_UPDATE_FIELDS = [
  'firstName',
  'lastName',
  'company',
  'title',
  'location',
  'website',
  'avatarUrl',
  'lastContactedAt',
  'estimatedValue',
  'tags',
  'budget',
  'authority',
  'need',
  'timeline',
  'annualRevenue',
] as const;

type ContactUpdateProps = Parameters<Lead['updateContactInfo']>[0];

/**
 * Build the props for Lead.updateContactInfo from an update, including only the fields the
 * caller provided. A phone is validated; `null` is an explicit clear (IFC-412).
 */
function buildContactUpdate(
  updates: Partial<Record<(typeof CONTACT_UPDATE_FIELDS)[number], unknown>> & {
    phone?: string | null;
  }
): Result<ContactUpdateProps, DomainError> {
  const props: ContactUpdateProps = {};
  for (const field of CONTACT_UPDATE_FIELDS) {
    if (updates[field] !== undefined) {
      (props as Record<string, unknown>)[field] = updates[field];
    }
  }
  if (updates.phone === null) {
    // IFC-412: explicit clear — nothing to validate, forward the null.
    props.phone = null;
  } else if (updates.phone !== undefined) {
    const phoneResult = PhoneNumber.create(updates.phone);
    if (phoneResult.isFailure) {
      return Result.fail(phoneResult.error);
    }
    props.phone = phoneResult.value;
  }
  return Result.ok(props);
}

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
    private readonly eventBus: EventBusPort,
    private readonly transactionManager: TransactionPort,
    /** PG-203 DSAR: a restricted person is never AI-scored. Optional so existing call sites compile. */
    private readonly processingRestrictions: Pick<
      ProcessingRestrictionPort,
      'status'
    > = ALLOW_ALL_RESTRICTIONS
  ) {}

  /**
   * Create a new lead with validation
   */
  async createLead(
    props: CreateLeadProps,
    opts?: { note?: { content: string; author: string } }
  ): Promise<Result<Lead, DomainError>> {
    // Check for duplicate email
    const emailResult = Email.create(props.email);
    if (emailResult.isFailure) {
      return Result.fail(emailResult.error);
    }

    const existingLead = await this.leadRepository.existsByEmailInTenant(
      emailResult.value,
      props.tenantId
    );
    if (existingLead) {
      return Result.fail(new ValidationError(`Lead with email ${props.email} already exists`));
    }

    // Create lead
    const leadResult = Lead.create(props);
    if (leadResult.isFailure) {
      return Result.fail(leadResult.error);
    }

    const lead = leadResult.value;

    // Persist the lead (plus its optional initial note) AND its domain events
    // atomically (DDD-002): the aggregate save and the event outbox share one
    // transaction, so a crash can never leave a persisted lead with no
    // LeadCreated event (ADR-011 zero-lost-events).
    try {
      await this.transactionManager.run((tx) => this.persistNewLead(lead, tx, opts));
    } catch {
      return Result.fail(new PersistenceError('Failed to save lead'));
    }

    return Result.ok(lead);
  }

  /**
   * PG-203: create a lead on the CALLER's transaction (public booking, ADR-083).
   * The aggregate save and the LeadCreated outbox write share `tx`; there is no
   * duplicate pre-check (the caller resolves existing records itself, under its
   * own lock) and persistence errors propagate so the caller's transaction
   * rolls back.
   */
  async createLeadInTransaction(
    props: CreateLeadProps,
    tx: RepositoryTransaction
  ): Promise<Result<Lead, DomainError>> {
    const leadResult = Lead.create(props);
    if (leadResult.isFailure) {
      return Result.fail(leadResult.error);
    }
    await this.persistNewLead(leadResult.value, tx);
    return Result.ok(leadResult.value);
  }

  private async persistNewLead(
    lead: Lead,
    tx: RepositoryTransaction,
    opts?: { note?: { content: string; author: string } }
  ): Promise<void> {
    await this.leadRepository.save(lead, opts, tx);
    await this.publishEvents(lead, tx);
  }

  /**
   * Get a lead by ID
   */
  async getLeadById(leadId: string): Promise<Result<Lead, DomainError>> {
    const leadIdResult = LeadId.create(leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new NotFoundError(`Lead not found: ${leadId}`));
    }

    return Result.ok(lead);
  }

  /**
   * Delete a lead
   */
  async deleteLead(leadId: string): Promise<Result<void, DomainError>> {
    const leadIdResult = LeadId.create(leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new NotFoundError(`Lead not found: ${leadId}`));
    }

    // Business rule: Cannot delete converted leads
    if (lead.isConverted) {
      return Result.fail(new ValidationError('Cannot delete a converted lead'));
    }

    try {
      await this.leadRepository.delete(leadIdResult.value);
    } catch {
      return Result.fail(new PersistenceError('Failed to delete lead'));
    }

    return Result.ok(undefined);
  }

  /** Load a lead that may be scored: it exists, and its person is neither erased nor restricted. */
  private async loadScorableLead(
    leadId: string
  ): Promise<Result<{ lead: Lead; scoredEmail: string }, DomainError>> {
    const leadIdResult = LeadId.create(leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new ValidationError(`Lead not found: ${leadId}`));
    }

    // PG-203 DSAR (owner Q18): processing is restricted for this person — no AI call.
    const scoredEmail = normalizeSubjectEmail(lead.email.value);
    // An erased lead is never scored again, whatever port the service was built with.
    if (isErasedEmail(scoredEmail)) return Result.fail(new ProcessingRestrictedError());
    const restriction = await this.processingRestrictions.status(lead.tenantId, scoredEmail);
    if (restriction.restricted) {
      return Result.fail(new ProcessingRestrictedError());
    }
    return Result.ok({ lead, scoredEmail });
  }

  /**
   * Score a lead using AI service.
   *
   * @param actorUserId authenticated user requesting the score; forwarded to the
   *   AI service so guardrails sanitize and audit under the real actor. Omit for
   *   system-initiated scoring.
   */
  async scoreLead(
    leadId: string,
    actorUserId?: string
  ): Promise<Result<LeadScoreUpdateResult, DomainError>> {
    const scorable = await this.loadScorableLead(leadId);
    if (scorable.isFailure) return Result.fail(scorable.error);
    const { lead, scoredEmail } = scorable.value;

    const previousScore = lead.score.value;
    const expectedStatus = lead.status;

    // Call AI service. IFC-212: thread lead.tenantId + lead.id.value through the
    // optional opts so queue-backed adapters tag the worker payload with the real
    // tenant + lead keys (NOT the literal 'default' fallback). Synchronous adapters
    // are free to ignore the opts.
    const scoringResult = await this.aiService.scoreLead(
      {
        email: lead.email.value,
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        title: lead.title,
        phone: lead.phone?.value,
        source: lead.source,
      },
      { tenantId: lead.tenantId, leadId: lead.id.value, userId: actorUserId }
    );

    // #1218: a failed scoring is never stored as a score. The lead keeps its previous score
    // and status, and is marked FAILED so it reads as "not scored" rather than a real 0.
    if (scoringResult.isFailure) {
      if (!(scoringResult.error instanceof ProcessingRestrictedError)) {
        await this.markScoringFailed(lead);
      }
      // The provider's own error is returned, so callers keep telling failures apart.
      return Result.fail(scoringResult.error);
    }

    const { score, confidence, modelVersion } = scoringResult.value;
    // The review rule is applied here, not left to the adapter: only the queue adapter sets
    // requiresReview, so the domain threshold covers the synchronous adapters too (codex).
    const requiresReview =
      scoringResult.value.requiresReview === true ||
      requiresHumanReview(confidence, 'LEAD_SCORING');
    if (!(confidence > 0)) {
      await this.markScoringFailed(lead);
      return Result.fail(new LeadScoringFailedError('NO_USABLE_SCORE'));
    }

    // Update lead score
    const updateResult = lead.updateScore(score, confidence, modelVersion);
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    // A low-confidence score is kept but marked for review, and it never changes the status.
    const { autoQualified, autoDisqualified } = requiresReview
      ? { autoQualified: false, autoDisqualified: false }
      : this.applyAutoStatus(lead, score);
    const scoringStatus = requiresReview ? 'NEEDS_REVIEW' : 'SCORED';

    // Persist changes + events atomically (DDD-002 pattern). Scoring mutates the
    // score fields; the auto-(dis)qualify above is the only status change. The
    // plain save never writes `status`, so a status change goes through a
    // compare-and-set on the status the scoring was based on (first, so a lost
    // race rolls back before anything else is written).
    // PG-203 DSAR: the person may have been restricted during the AI call; then the
    // result is discarded, not stored. The check runs in the write's transaction under the
    // person's address lock, so a restriction cannot commit between it and the write (codex).
    // Locks are taken in the worker's order (writeIfStillEligible): the lead row first, by the
    // score-only write, then the address lock in the check; a restricted result rolls back.
    try {
      await this.transactionManager.run(async (tx) => {
        // Score-only, and only while the email is still the one scored: a result that
        // returns after an erasure cannot restore the erased person's data (codex).
        await this.leadRepository.save(lead, { scoreOnlyIfEmail: scoredEmail, scoringStatus }, tx);
        const after = await this.processingRestrictions.status(lead.tenantId, scoredEmail, tx);
        if (after.restricted) throw new ProcessingRestrictedError();
        if (lead.status !== expectedStatus) {
          await this.leadRepository.save(lead, { expectedStatus }, tx);
        }
        await this.publishEvents(lead, tx);
      });
    } catch (error) {
      if (error instanceof ProcessingRestrictedError) return Result.fail(error);
      if (error instanceof LeadIdentityChangedError) {
        return Result.fail(new ValidationError(error.message));
      }
      return Result.fail(
        this.saveFailure(error, expectedStatus, 'Failed to save lead after scoring')
      );
    }

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
   * #1218: best effort; a failure to record the failure must not hide the original one.
   * `lead` is still as read before the AI call (nothing mutates it on the failure paths), so
   * its email and updatedAt guard the mark against a newer write.
   */
  private async markScoringFailed(lead: Lead): Promise<void> {
    try {
      await this.leadRepository.markScoringFailed?.(lead.id, lead.tenantId, {
        email: lead.email.value,
        updatedAt: lead.updatedAt,
      });
    } catch {
      // The scoring failure is still returned to the caller.
    }
  }

  /** Auto-qualify or auto-disqualify a NEW lead based on its AI score. */
  private applyAutoStatus(
    lead: Lead,
    score: number
  ): { autoQualified: boolean; autoDisqualified: boolean } {
    if (lead.status !== 'NEW') return { autoQualified: false, autoDisqualified: false };
    if (score >= LEAD_SCORE_THRESHOLDS.AUTO_QUALIFY) {
      const qualifyResult = lead.qualify(
        'AI-AutoQualify',
        `Score ${score} exceeds threshold ${LEAD_SCORE_THRESHOLDS.AUTO_QUALIFY}`
      );
      return { autoQualified: qualifyResult.isSuccess, autoDisqualified: false };
    }
    if (score <= LEAD_SCORE_THRESHOLDS.AUTO_DISQUALIFY) {
      const statusResult = lead.changeStatus('UNQUALIFIED', 'AI-AutoDisqualify');
      return { autoQualified: false, autoDisqualified: statusResult.isSuccess };
    }
    return { autoQualified: false, autoDisqualified: false };
  }

  /**
   * Qualify a lead.
   *
   * The minimum score applies only to AUTOMATIC qualification (the default). A HUMAN
   * qualification or an INBOUND_REPLY is allowed at any score, and needs a reason.
   */
  async qualifyLead(
    leadId: string,
    qualifiedBy: string,
    reason: string,
    options: { basis?: QualificationBasis } = {}
  ): Promise<Result<Lead, DomainError>> {
    const basis = options.basis ?? 'AUTOMATIC';
    const leadIdResult = LeadId.create(leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    if (basis !== 'AUTOMATIC' && !reason.trim()) {
      return Result.fail(new ValidationError('A reason is required to qualify a lead'));
    }

    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new ValidationError(`Lead not found: ${leadId}`));
    }

    // Business rule: automatic qualification needs the minimum score
    if (basis === 'AUTOMATIC' && lead.score.value < this.defaultQualificationCriteria.minScore) {
      return Result.fail(
        new LeadScoreBelowMinimumError(lead.score.value, this.defaultQualificationCriteria.minScore)
      );
    }

    const expectedStatus = lead.status;
    const qualifyResult = lead.qualify(qualifiedBy, reason);
    if (qualifyResult.isFailure) {
      return Result.fail(qualifyResult.error);
    }

    try {
      await this.transactionManager.run(async (tx) => {
        await this.leadRepository.save(lead, { expectedStatus }, tx);
        await this.publishEvents(lead, tx);
      });
    } catch (error) {
      return Result.fail(this.saveFailure(error, expectedStatus, 'Failed to save lead'));
    }

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

    // Prepare account if provided (find existing or build new — NO write yet)
    let accountId: string | null = null;
    let newAccount: Account | null = null;
    if (accountName) {
      const existingAccounts = await this.accountRepository.findByName(accountName, lead.tenantId);
      if (existingAccounts.length > 0) {
        accountId = existingAccounts[0].id.value;
      } else {
        const accountResult = Account.create({
          name: accountName,
          website: undefined,
          industry: undefined,
          ownerId: lead.ownerId,
          tenantId: lead.tenantId,
        });

        if (accountResult.isSuccess) {
          newAccount = accountResult.value;
          accountId = newAccount.id.value;
        }
      }
    }

    // Create contact from lead (NO write yet)
    const contactResult = Contact.create({
      email: lead.email.value,
      firstName: lead.firstName ?? 'Unknown',
      lastName: lead.lastName ?? 'Unknown',
      title: lead.title,
      phone: lead.phone,
      accountId: accountId ?? undefined,
      tenantId: lead.tenantId,
      leadId: lead.id.value,
      ownerId: lead.ownerId,
    });

    if (contactResult.isFailure) {
      return Result.fail(contactResult.error);
    }

    const contact = contactResult.value;

    // Convert lead
    const expectedStatus = lead.status;
    const convertResult = lead.convert(contact.id.value, accountId, convertedBy);
    if (convertResult.isFailure) {
      return Result.fail(convertResult.error);
    }

    // Persist Account + Contact + Lead and their events atomically (DDD-001):
    // one transaction so a failure rolls the whole conversion back rather than
    // orphaning an Account/Contact while the Lead stays QUALIFIED.
    try {
      await this.transactionManager.run(async (tx) => {
        if (newAccount) {
          await this.accountRepository.save(newAccount, tx);
        }
        await this.contactRepository.save(contact, tx);
        await this.leadRepository.save(lead, { expectedStatus }, tx);

        if (newAccount) {
          await this.publishAccountEvents(newAccount, tx);
        }
        await this.publishContactEvents(contact, tx);
        await this.publishEvents(lead, tx);
      });
    } catch (error) {
      return Result.fail(this.saveFailure(error, expectedStatus, 'Failed to save conversion'));
    }

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
  async bulkScoreLeads(leadIds: string[], actorUserId?: string): Promise<BulkOperationResult> {
    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    // NP-002: parallelise per-lead scoring (each scoreLead does an indexed
    // findById + an AI call + a save) with a BOUNDED concurrency so a large
    // batch no longer runs as a serial waterfall. The tRPC input is hard-capped
    // (.max) to bound total work. Result ordering + shape are preserved: chunks
    // run in input order and within-chunk order is retained.
    const CONCURRENCY = 8;
    for (let i = 0; i < leadIds.length; i += CONCURRENCY) {
      const chunk = leadIds.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(
        chunk.map(async (leadId) => ({ leadId, result: await this.scoreLead(leadId, actorUserId) }))
      );
      for (const { leadId, result } of settled) {
        if (result.isSuccess) {
          successful.push(leadId);
        } else {
          failed.push({ id: leadId, error: result.error.message });
        }
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

    // Convert phone string to PhoneNumber value object if provided
    const updateProps: {
      firstName?: string;
      lastName?: string;
      company?: string;
      title?: string;
      phone?: PhoneNumber;
    } = {
      firstName: updates.firstName,
      lastName: updates.lastName,
      company: updates.company,
      title: updates.title,
    };

    if (updates.phone !== undefined) {
      const phoneResult = PhoneNumber.create(updates.phone);
      if (phoneResult.isFailure) {
        return Result.fail(phoneResult.error);
      }
      updateProps.phone = phoneResult.value;
    }

    lead.updateContactInfo(updateProps);

    try {
      await this.leadRepository.save(lead);
    } catch {
      return Result.fail(new PersistenceError('Failed to save lead'));
    }

    return Result.ok(lead);
  }

  /**
   * Update lead with all editable fields
   * Unified method for the update procedure — handles contact + Lead 360 fields
   */
  async updateLead(
    leadId: string,
    updates: {
      // IFC-412 (owner ruling 2026-10-12): these "required-looking" fields must
      // be explicitly clearable from the lead edit form. `undefined`/omitted
      // leaves the field unchanged; `null` clears it (forwarded to
      // `Lead.updateContactInfo`, which normalizes it to the domain's
      // `undefined` "absent" representation).
      firstName?: string | null;
      lastName?: string | null;
      company?: string | null;
      title?: string;
      phone?: string | null;
      location?: string | null;
      website?: string | null;
      avatarUrl?: string;
      lastContactedAt?: Date;
      estimatedValue?: number | null;
      tags?: string[];
      // BANT qualification fields (IFC-242)
      budget?: string;
      authority?: string;
      need?: string;
      timeline?: string;
      annualRevenue?: string;
      /**
       * A status set from the lead record. It is applied through the allowed transitions or
       * the update fails: a requested status is never dropped. QUALIFIED is a human
       * qualification, so the score does not block it. CONVERTED goes through convert.
       */
      status?: LeadStatus;
    },
    changedBy = 'system'
  ): Promise<Result<Lead, DomainError>> {
    const leadIdResult = LeadId.create(leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    const lead = await this.leadRepository.findById(leadIdResult.value);
    if (!lead) {
      return Result.fail(new NotFoundError(`Lead not found: ${leadId}`));
    }

    if (lead.isConverted) {
      return Result.fail(new ValidationError('Cannot update a converted lead'));
    }

    const expectedStatus = lead.status;
    const requestedStatus =
      updates.status !== undefined && updates.status !== lead.status ? updates.status : null;
    const statusRefusal = requestedStatus ? this.recordStatusRefusal(lead, requestedStatus) : null;
    if (statusRefusal) {
      return Result.fail(statusRefusal);
    }

    const updatePropsResult = buildContactUpdate(updates);
    if (updatePropsResult.isFailure) {
      return Result.fail(updatePropsResult.error);
    }
    lead.updateContactInfo(updatePropsResult.value);

    const statusResult: Result<void, DomainError> = requestedStatus
      ? this.applyRecordStatus(lead, requestedStatus, changedBy)
      : Result.ok(undefined);
    if (statusResult.isFailure) {
      return Result.fail(statusResult.error);
    }

    try {
      if (requestedStatus) {
        // Two writes in one transaction. The compare-and-set save writes only the status,
        // and only if it is still the status this change was validated against. The
        // plain save then writes the other fields (it never writes the status). Either
        // both land or neither does.
        // The status events (LeadQualified / LeadStatusChanged) are written in the same
        // transaction, as qualifyLead does, so a committed status never loses its event.
        await this.transactionManager.run(async (tx) => {
          await this.leadRepository.save(lead, { expectedStatus }, tx);
          await this.leadRepository.save(lead, undefined, tx);
          await this.publishEvents(lead, tx);
        });
        return Result.ok(lead);
      }
      await this.leadRepository.save(lead);
    } catch (error) {
      return Result.fail(this.saveFailure(error, expectedStatus, 'Failed to save lead'));
    }

    await this.publishEvents(lead);

    return Result.ok(lead);
  }

  /**
   * Why a status set on the lead record cannot be applied, or null when it can. CONVERTED
   * goes through the convert operation; anything else must be an allowed transition.
   */
  private recordStatusRefusal(lead: Lead, requested: LeadStatus): DomainError | null {
    if (requested === 'CONVERTED') {
      return new ValidationError(
        'Use the convert action to convert a lead; the status was not changed'
      );
    }
    const allowed = VALID_LEAD_TRANSITIONS[lead.status];
    if (!allowed.includes(requested)) {
      return new ValidationError(
        `Invalid status transition from ${lead.status} to ${requested}. Allowed: ${allowed.join(', ')}`
      );
    }
    return null;
  }

  /** Apply a status set on the lead record. QUALIFIED there is a person's qualification. */
  private applyRecordStatus(
    lead: Lead,
    requested: LeadStatus,
    changedBy: string
  ): Result<void, DomainError> {
    return requested === 'QUALIFIED'
      ? lead.qualify(changedBy, 'Set to Qualified on the lead record')
      : lead.changeStatus(requested, changedBy);
  }

  /**
   * Map a failed lead save: a lost compare-and-set race gets a distinct,
   * actionable message; anything else is a generic persistence failure.
   */
  private saveFailure(
    error: unknown,
    expectedStatus: LeadStatus,
    message: string
  ): PersistenceError {
    if (error instanceof LeadStatusConflictError) {
      return new PersistenceError(`Lead status changed concurrently (expected ${expectedStatus})`);
    }
    return new PersistenceError(message);
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
    const allowedTransitions = VALID_LEAD_TRANSITIONS[lead.status];
    if (!allowedTransitions.includes(newStatus)) {
      return Result.fail(
        new ValidationError(
          `Invalid status transition from ${lead.status} to ${newStatus}. Allowed: ${allowedTransitions.join(', ')}`
        )
      );
    }

    const expectedStatus = lead.status;
    const statusResult = lead.changeStatus(newStatus, changedBy);
    if (statusResult.isFailure) {
      return Result.fail(statusResult.error);
    }

    try {
      // Compare-and-set on the status the transition was validated against, so a
      // concurrent writer that moved the lead first is never overwritten.
      await this.leadRepository.save(lead, { expectedStatus });
    } catch (error) {
      return Result.fail(this.saveFailure(error, expectedStatus, 'Failed to save lead'));
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

  // Event publishers accept the caller's transaction so events land in the
  // outbox atomically with the aggregate save (DDD-002). Failures propagate —
  // the swallow-and-log was removed so a lost event fails the whole operation
  // (ADR-011 zero-lost-events) rather than being hidden in a console.error.
  private async publishEvents(lead: Lead, tx?: RepositoryTransaction): Promise<void> {
    const events = lead.getDomainEvents();
    if (events.length > 0) {
      await this.eventBus.publishAll(events, tx);
    }
    lead.clearDomainEvents();
  }

  private async publishContactEvents(contact: Contact, tx?: RepositoryTransaction): Promise<void> {
    const events = contact.getDomainEvents();
    if (events.length > 0) {
      await this.eventBus.publishAll(events, tx);
    }
    contact.clearDomainEvents();
  }

  private async publishAccountEvents(account: Account, tx?: RepositoryTransaction): Promise<void> {
    const events = account.getDomainEvents();
    if (events.length > 0) {
      await this.eventBus.publishAll(events, tx);
    }
    account.clearDomainEvents();
  }
}
