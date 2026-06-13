import {
  Result,
  DomainError,
  Opportunity,
  OpportunityId,
  OpportunityStage,
  OpportunityRepository,
  OpportunitySearchParams,
  OpportunitySearchResult,
  AccountRepository,
  ContactRepository,
  AccountId,
  ContactId,
  CreateOpportunityProps,
} from '@intelliflow/domain';
import { EventBusPort } from '../ports/external';
import { PersistenceError, ValidationError, NotFoundError } from '../errors';

/**
 * Stage transition rules - defines valid transitions between stages
 */
export const STAGE_TRANSITION_RULES: Record<OpportunityStage, OpportunityStage[]> = {
  PROSPECTING: ['QUALIFICATION', 'CLOSED_LOST'],
  QUALIFICATION: ['NEEDS_ANALYSIS', 'PROSPECTING', 'CLOSED_LOST'],
  NEEDS_ANALYSIS: ['PROPOSAL', 'QUALIFICATION', 'CLOSED_LOST'],
  PROPOSAL: ['NEGOTIATION', 'NEEDS_ANALYSIS', 'CLOSED_LOST'],
  NEGOTIATION: ['CLOSED_WON', 'CLOSED_LOST', 'PROPOSAL'],
  CLOSED_WON: [], // Terminal state
  CLOSED_LOST: ['PROSPECTING'], // Can reopen
};

/**
 * Default probabilities for each stage
 */
export const STAGE_PROBABILITIES: Record<OpportunityStage, number> = {
  PROSPECTING: 10,
  QUALIFICATION: 20,
  NEEDS_ANALYSIS: 40,
  PROPOSAL: 60,
  NEGOTIATION: 80,
  CLOSED_WON: 100,
  CLOSED_LOST: 0,
};

/**
 * Pipeline forecast result
 */
export interface PipelineForecast {
  totalPipelineValue: number;
  weightedPipelineValue: number;
  byStage: Record<
    OpportunityStage,
    {
      count: number;
      totalValue: number;
      weightedValue: number;
    }
  >;
  closingThisMonth: number;
  closingThisQuarter: number;
}

/**
 * Stage velocity metrics
 */
export interface StageVelocityMetrics {
  averageDaysInStage: Record<OpportunityStage, number>;
  averageTimeToClose: number;
  fastestClose: number;
  slowestClose: number;
}

/**
 * Opportunity Service
 *
 * Orchestrates opportunity-related business logic including:
 * - Opportunity stage transitions with validation
 * - Probability calculation based on stage
 * - Pipeline forecasting and analysis
 * - Win/loss tracking and analysis
 * - Stage velocity metrics
 */
export class OpportunityService {
  constructor(
    private readonly opportunityRepository: OpportunityRepository,
    private readonly accountRepository: AccountRepository,
    private readonly contactRepository: ContactRepository,
    private readonly eventBus: EventBusPort
  ) {}

  /**
   * Create a new opportunity with validation
   */
  async createOpportunity(
    props: CreateOpportunityProps
  ): Promise<Result<Opportunity, DomainError>> {
    // Validate account exists
    const accountIdResult = AccountId.create(props.accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value, props.tenantId);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${props.accountId}`));
    }

    // Validate contact exists if provided
    if (props.contactId) {
      const contactIdResult = ContactId.create(props.contactId);
      if (contactIdResult.isFailure) {
        return Result.fail(contactIdResult.error);
      }

      const contact = await this.contactRepository.findById(contactIdResult.value);
      if (!contact) {
        return Result.fail(new ValidationError(`Contact not found: ${props.contactId}`));
      }

      // Business rule: Contact must belong to the specified account
      if (contact.accountId !== props.accountId) {
        return Result.fail(new ValidationError('Contact must belong to the specified account'));
      }
    }

    // Create opportunity
    const opportunityResult = Opportunity.create(props);
    if (opportunityResult.isFailure) {
      return Result.fail(opportunityResult.error);
    }

    const opportunity = opportunityResult.value;

    // Persist
    try {
      await this.opportunityRepository.save(opportunity);
    } catch {
      return Result.fail(new PersistenceError('Failed to save opportunity'));
    }

    // Publish events
    await this.publishEvents(opportunity);

    return Result.ok(opportunity);
  }

  /**
   * Get opportunity by ID
   */
  async getOpportunityById(
    opportunityId: string,
    tenantId: string
  ): Promise<Result<Opportunity, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findById(oppIdResult.value, tenantId);
    if (!opportunity) {
      return Result.fail(new NotFoundError(`Opportunity not found: ${opportunityId}`));
    }

    return Result.ok(opportunity);
  }

  /**
   * List opportunities with filtering and pagination
   */
  async listOpportunities(params: OpportunitySearchParams): Promise<OpportunitySearchResult> {
    // For now, delegate to repository search if available
    // This is a read-through query that doesn't involve domain logic
    const opportunities = await this.opportunityRepository.findByOwnerId(params.ownerId || '');

    // Apply filters in-memory (repository should ideally support these)
    let filtered = opportunities;

    if (params.stage && params.stage.length > 0) {
      filtered = filtered.filter((o) => params.stage!.includes(o.stage));
    }

    if (params.accountId) {
      filtered = filtered.filter((o) => o.accountId === params.accountId);
    }

    if (params.contactId) {
      filtered = filtered.filter((o) => o.contactId === params.contactId);
    }

    if (params.minValue !== undefined) {
      filtered = filtered.filter((o) => o.value.amount >= params.minValue!);
    }

    if (params.maxValue !== undefined) {
      filtered = filtered.filter((o) => o.value.amount <= params.maxValue!);
    }

    if (params.query) {
      const searchLower = params.query.toLowerCase();
      filtered = filtered.filter((o) => o.name.toLowerCase().includes(searchLower));
    }

    // Sort
    const sortBy = (params.sortBy || 'createdAt') as keyof Opportunity;
    const sortOrder = params.sortOrder || 'desc';
    filtered.sort((a, b) => {
      const aVal = a[sortBy] as unknown;
      const bVal = b[sortBy] as unknown;
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const comparison = aVal < bVal ? -1 : 1;
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Paginate
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;
    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + limit);

    return {
      opportunities: paginated,
      total,
      page,
      limit,
      hasMore: skip + paginated.length < total,
    };
  }

  private async validateAccountId(
    accountId: string,
    tenantId: string
  ): Promise<DomainError | null> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) return accountIdResult.error;
    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) return new NotFoundError(`Account not found: ${accountId}`);
    return null;
  }

  private async validateContactId(contactId: string): Promise<DomainError | null> {
    const contactIdResult = ContactId.create(contactId);
    if (contactIdResult.isFailure) return contactIdResult.error;
    const contact = await this.contactRepository.findById(contactIdResult.value);
    if (!contact) return new NotFoundError(`Contact not found: ${contactId}`);
    return null;
  }

  private applyValueUpdate(
    opportunity: Opportunity,
    value: number | undefined,
    updatedBy: string
  ): DomainError | null {
    if (value === undefined) return null;
    const result = opportunity.updateValue(value, updatedBy);
    return result.isFailure ? result.error : null;
  }

  private applyProbabilityUpdate(
    opportunity: Opportunity,
    probability: number | undefined,
    updatedBy: string
  ): DomainError | null {
    if (probability === undefined) return null;
    const result = opportunity.updateProbability(probability, updatedBy);
    return result.isFailure ? result.error : null;
  }

  private applyExpectedCloseDateUpdate(
    opportunity: Opportunity,
    expectedCloseDate: Date | null | undefined,
    updatedBy: string
  ): DomainError | null {
    if (expectedCloseDate === undefined || expectedCloseDate === null) return null;
    const result = opportunity.updateExpectedCloseDate(expectedCloseDate, updatedBy);
    return result.isFailure ? result.error : null;
  }

  /**
   * Validate optional accountId and contactId references before updating.
   * Returns the first validation error found, or null if all valid.
   */
  private async validateForeignKeys(
    data: {
      accountId?: string;
      contactId?: string | null;
    },
    tenantId?: string
  ): Promise<DomainError | null> {
    if (data.accountId !== undefined && tenantId) {
      const accountError = await this.validateAccountId(data.accountId, tenantId);
      if (accountError) return accountError;
    }
    if (data.contactId !== undefined && data.contactId !== null) {
      const contactError = await this.validateContactId(data.contactId);
      if (contactError) return contactError;
    }
    return null;
  }

  /**
   * IFC-280: apply account/contact re-assignment to the aggregate. Enforces the
   * contact-belongs-to-account invariant (mirrors the create path) so a stakeholder
   * change cannot persist a mismatched pair. accountId/contactId existence is already
   * checked by validateForeignKeys; this adds the cross-field relationship guard.
   */
  private async applyStakeholderUpdates(
    opportunity: Opportunity,
    data: { accountId?: string; contactId?: string | null }
  ): Promise<DomainError | null> {
    const effectiveAccountId = data.accountId ?? opportunity.accountId;
    // The contact that will be attached after this update: an explicit change
    // wins, otherwise the deal's current contact. Validating the EFFECTIVE pair
    // also catches re-assigning the account while an incompatible contact stays
    // attached (account-only change must not leave a stale cross-account contact).
    const effectiveContactId =
      data.contactId !== undefined ? data.contactId : (opportunity.contactId ?? null);
    if (effectiveContactId) {
      const contactIdResult = ContactId.create(effectiveContactId);
      if (contactIdResult.isFailure) return contactIdResult.error;
      const contact = await this.contactRepository.findById(contactIdResult.value);
      if (contact && contact.accountId !== effectiveAccountId) {
        return new ValidationError('Contact does not belong to the selected account');
      }
    }
    if (data.accountId !== undefined) {
      opportunity.changeAccount(data.accountId);
    }
    if (data.contactId !== undefined) {
      opportunity.changeContact(data.contactId);
    }
    return null;
  }

  /**
   * Apply all scalar field updates to the opportunity domain entity.
   * Returns the first domain error encountered, or null if all updates succeed.
   */
  private applyScalarUpdates(
    opportunity: Opportunity,
    data: {
      value?: number;
      probability?: number;
      stage?: OpportunityStage;
      expectedCloseDate?: Date | null;
    },
    updatedBy: string
  ): DomainError | null {
    const valueError = this.applyValueUpdate(opportunity, data.value, updatedBy);
    if (valueError) return valueError;

    // IFC-280: apply stage BEFORE probability. changeStage resets probability to
    // the stage default, so applying an explicit probability afterwards lets a
    // user-supplied probability override the default rather than be overwritten.
    if (data.stage !== undefined) {
      const stageError = this.applyStageChange(opportunity, data.stage, updatedBy);
      if (stageError) return stageError;
    }

    const probError = this.applyProbabilityUpdate(opportunity, data.probability, updatedBy);
    if (probError) return probError;

    return this.applyExpectedCloseDateUpdate(opportunity, data.expectedCloseDate, updatedBy);
  }

  /**
   * Update opportunity with validation
   */
  async updateOpportunity(
    opportunityId: string,
    data: {
      name?: string;
      value?: number;
      probability?: number;
      stage?: OpportunityStage;
      expectedCloseDate?: Date | null;
      description?: string;
      accountId?: string;
      contactId?: string | null;
    },
    updatedBy: string,
    tenantId: string
  ): Promise<Result<Opportunity, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) return Result.fail(oppIdResult.error);

    const opportunity = await this.opportunityRepository.findById(oppIdResult.value, tenantId);
    if (!opportunity) {
      return Result.fail(new NotFoundError(`Opportunity not found: ${opportunityId}`));
    }

    const fkError = await this.validateForeignKeys(data, tenantId);
    if (fkError) return Result.fail(fkError);

    // IFC-282 B-04: apply the name change first (validate-then-mutate ordering)
    // so an invalid name surfaces before any scalar mutation. Previously the name
    // was silently dropped (the old TODO).
    if (data.name !== undefined) {
      const nameResult = opportunity.updateName(data.name, updatedBy);
      if (nameResult.isFailure) return Result.fail(nameResult.error);
    }

    // IFC-280: description was silently dropped (omitted from the data param,
    // like the IFC-282 B-04 name gap). Thread it through so the Edit dialog's
    // description field actually persists instead of faking a save.
    if (data.description !== undefined) {
      opportunity.updateDescription(data.description);
    }

    // IFC-280: accountId/contactId were FK-validated but never applied — the
    // Edit/Stakeholders dialog's stakeholder change was silently dropped. Apply
    // them, enforcing the contact-belongs-to-account invariant (mirrors create)
    // before mutating, so a re-assignment cannot persist a mismatched pair.
    const stakeholderError = await this.applyStakeholderUpdates(opportunity, data);
    if (stakeholderError) return Result.fail(stakeholderError);

    const updateError = this.applyScalarUpdates(opportunity, data, updatedBy);
    if (updateError) return Result.fail(updateError);

    try {
      await this.opportunityRepository.save(opportunity);
    } catch {
      return Result.fail(new PersistenceError('Failed to save opportunity'));
    }

    await this.publishEvents(opportunity);

    return Result.ok(opportunity);
  }

  /**
   * Advance opportunity to next stage
   */
  async advanceStage(
    opportunityId: string,
    advancedBy: string,
    tenantId: string
  ): Promise<Result<Opportunity, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findById(oppIdResult.value, tenantId);
    if (!opportunity) {
      return Result.fail(new ValidationError(`Opportunity not found: ${opportunityId}`));
    }

    // Determine next stage
    const nextStage = this.getNextStage(opportunity.stage);
    if (!nextStage) {
      return Result.fail(
        new ValidationError(`Cannot advance from terminal stage: ${opportunity.stage}`)
      );
    }

    return this.changeStage(opportunityId, nextStage, advancedBy, tenantId);
  }

  /**
   * Change opportunity stage with validation
   */
  async changeStage(
    opportunityId: string,
    newStage: OpportunityStage,
    changedBy: string,
    tenantId: string
  ): Promise<Result<Opportunity, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findById(oppIdResult.value, tenantId);
    if (!opportunity) {
      return Result.fail(new ValidationError(`Opportunity not found: ${opportunityId}`));
    }

    // Validate stage transition
    const allowedTransitions = STAGE_TRANSITION_RULES[opportunity.stage];
    if (!allowedTransitions.includes(newStage)) {
      return Result.fail(
        new ValidationError(
          `Invalid stage transition from ${opportunity.stage} to ${newStage}. Allowed: ${allowedTransitions.join(', ')}`
        )
      );
    }

    const stageResult = opportunity.changeStage(newStage, changedBy);
    if (stageResult.isFailure) {
      return Result.fail(stageResult.error);
    }

    try {
      await this.opportunityRepository.save(opportunity);
    } catch {
      return Result.fail(new PersistenceError('Failed to save opportunity'));
    }

    await this.publishEvents(opportunity);

    return Result.ok(opportunity);
  }

  /**
   * Update opportunity value
   */
  async updateValue(
    opportunityId: string,
    newValue: number,
    updatedBy: string,
    tenantId: string
  ): Promise<Result<Opportunity, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findById(oppIdResult.value, tenantId);
    if (!opportunity) {
      return Result.fail(new ValidationError(`Opportunity not found: ${opportunityId}`));
    }

    const updateResult = opportunity.updateValue(newValue, updatedBy);
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    try {
      await this.opportunityRepository.save(opportunity);
    } catch {
      return Result.fail(new PersistenceError('Failed to save opportunity'));
    }

    await this.publishEvents(opportunity);

    return Result.ok(opportunity);
  }

  /**
   * Update probability with validation
   */
  async updateProbability(
    opportunityId: string,
    newProbability: number,
    updatedBy: string,
    tenantId: string
  ): Promise<Result<Opportunity, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findById(oppIdResult.value, tenantId);
    if (!opportunity) {
      return Result.fail(new ValidationError(`Opportunity not found: ${opportunityId}`));
    }

    // Business rule: Probability must be consistent with stage
    const stageProbability = STAGE_PROBABILITIES[opportunity.stage];
    const tolerance = 20; // Allow 20% variance from stage default

    if (
      opportunity.stage !== 'CLOSED_WON' &&
      opportunity.stage !== 'CLOSED_LOST' &&
      Math.abs(newProbability - stageProbability) > tolerance
    ) {
      return Result.fail(
        new ValidationError(
          `Probability ${newProbability}% is too far from stage default ${stageProbability}% (max variance: ${tolerance}%)`
        )
      );
    }

    const updateResult = opportunity.updateProbability(newProbability, updatedBy);
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    try {
      await this.opportunityRepository.save(opportunity);
    } catch {
      return Result.fail(new PersistenceError('Failed to save opportunity'));
    }

    await this.publishEvents(opportunity);

    return Result.ok(opportunity);
  }

  /**
   * Update expected close date
   */
  async updateExpectedCloseDate(
    opportunityId: string,
    newDate: Date,
    changedBy: string,
    tenantId: string
  ): Promise<Result<Opportunity, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findById(oppIdResult.value, tenantId);
    if (!opportunity) {
      return Result.fail(new ValidationError(`Opportunity not found: ${opportunityId}`));
    }

    // Business rule: Close date cannot be in the past for open opportunities
    if (newDate < new Date() && !opportunity.isClosed) {
      return Result.fail(new ValidationError('Expected close date cannot be in the past'));
    }

    const updateResult = opportunity.updateExpectedCloseDate(newDate, changedBy);
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    try {
      await this.opportunityRepository.save(opportunity);
    } catch {
      return Result.fail(new PersistenceError('Failed to save opportunity'));
    }

    await this.publishEvents(opportunity);

    return Result.ok(opportunity);
  }

  /**
   * Mark opportunity as won
   */
  async markAsWon(
    opportunityId: string,
    closedBy: string,
    tenantId: string
  ): Promise<Result<Opportunity, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findById(oppIdResult.value, tenantId);
    if (!opportunity) {
      return Result.fail(new ValidationError(`Opportunity not found: ${opportunityId}`));
    }

    // Business rule: Only opportunities in NEGOTIATION can be won
    if (opportunity.stage !== 'NEGOTIATION') {
      return Result.fail(
        new ValidationError(
          `Cannot mark opportunity as won from stage ${opportunity.stage}. Must be in NEGOTIATION stage.`
        )
      );
    }

    const wonResult = opportunity.markAsWon(closedBy);
    if (wonResult.isFailure) {
      return Result.fail(wonResult.error);
    }

    try {
      await this.opportunityRepository.save(opportunity);
    } catch {
      return Result.fail(new PersistenceError('Failed to save opportunity'));
    }

    await this.publishEvents(opportunity);

    return Result.ok(opportunity);
  }

  /**
   * Mark opportunity as lost
   */
  async markAsLost(
    opportunityId: string,
    reason: string,
    closedBy: string,
    tenantId: string
  ): Promise<Result<Opportunity, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findById(oppIdResult.value, tenantId);
    if (!opportunity) {
      return Result.fail(new ValidationError(`Opportunity not found: ${opportunityId}`));
    }

    // Business rule: Must provide a reason for loss
    if (!reason || reason.trim().length < 10) {
      return Result.fail(new ValidationError('Loss reason must be at least 10 characters'));
    }

    const lostResult = opportunity.markAsLost(reason, closedBy);
    if (lostResult.isFailure) {
      return Result.fail(lostResult.error);
    }

    try {
      await this.opportunityRepository.save(opportunity);
    } catch {
      return Result.fail(new PersistenceError('Failed to save opportunity'));
    }

    await this.publishEvents(opportunity);

    return Result.ok(opportunity);
  }

  /**
   * Reopen a lost opportunity
   */
  async reopenOpportunity(
    opportunityId: string,
    reopenedBy: string,
    tenantId: string
  ): Promise<Result<Opportunity, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findById(oppIdResult.value, tenantId);
    if (!opportunity) {
      return Result.fail(new ValidationError(`Opportunity not found: ${opportunityId}`));
    }

    // Use domain method which validates and handles reopening
    const reopenResult = opportunity.reopen(reopenedBy);
    if (reopenResult.isFailure) {
      return Result.fail(reopenResult.error);
    }

    try {
      await this.opportunityRepository.save(opportunity);
    } catch {
      return Result.fail(new PersistenceError('Failed to save opportunity'));
    }

    await this.publishEvents(opportunity);

    return Result.ok(opportunity);
  }

  /**
   * Get pipeline forecast
   */
  async getPipelineForecast(ownerId?: string, tenantId?: string): Promise<PipelineForecast> {
    const opportunities =
      ownerId && tenantId ? await this.opportunityRepository.findByOwnerId(ownerId, tenantId) : [];

    const activeOpportunities = opportunities.filter((o) => !o.isClosed);

    const byStage: PipelineForecast['byStage'] = {
      PROSPECTING: { count: 0, totalValue: 0, weightedValue: 0 },
      QUALIFICATION: { count: 0, totalValue: 0, weightedValue: 0 },
      NEEDS_ANALYSIS: { count: 0, totalValue: 0, weightedValue: 0 },
      PROPOSAL: { count: 0, totalValue: 0, weightedValue: 0 },
      NEGOTIATION: { count: 0, totalValue: 0, weightedValue: 0 },
      CLOSED_WON: { count: 0, totalValue: 0, weightedValue: 0 },
      CLOSED_LOST: { count: 0, totalValue: 0, weightedValue: 0 },
    };

    let totalPipelineValue = 0;
    let weightedPipelineValue = 0;

    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const endOfQuarter = new Date(now.getFullYear(), Math.ceil((now.getMonth() + 1) / 3) * 3, 0);

    let closingThisMonth = 0;
    let closingThisQuarter = 0;

    activeOpportunities.forEach((opp) => {
      const stage = opp.stage;
      byStage[stage].count++;
      byStage[stage].totalValue += opp.value.amount;
      byStage[stage].weightedValue += opp.weightedValue.amount;

      totalPipelineValue += opp.value.amount;
      weightedPipelineValue += opp.weightedValue.amount;

      if (opp.expectedCloseDate) {
        if (opp.expectedCloseDate <= endOfMonth) {
          closingThisMonth += opp.weightedValue.amount;
        }
        if (opp.expectedCloseDate <= endOfQuarter) {
          closingThisQuarter += opp.weightedValue.amount;
        }
      }
    });

    return {
      totalPipelineValue,
      weightedPipelineValue,
      byStage,
      closingThisMonth,
      closingThisQuarter,
    };
  }

  /**
   * Get opportunities closing soon
   */
  async getOpportunitiesClosingSoon(
    days: number = 7,
    tenantId: string,
    ownerId?: string
  ): Promise<Opportunity[]> {
    return this.opportunityRepository.findClosingSoon(days, tenantId, ownerId);
  }

  /**
   * Get high-value opportunities
   */
  async getHighValueOpportunities(
    minValue: number,
    tenantId: string,
    ownerId?: string
  ): Promise<Opportunity[]> {
    return this.opportunityRepository.findHighValue(minValue, tenantId, ownerId);
  }

  /**
   * Get opportunities by account
   */
  async getOpportunitiesByAccount(accountId: string, tenantId: string): Promise<Opportunity[]> {
    return this.opportunityRepository.findByAccountId(accountId, tenantId);
  }

  /**
   * Get opportunities by contact
   */
  async getOpportunitiesByContact(contactId: string, tenantId: string): Promise<Opportunity[]> {
    return this.opportunityRepository.findByContactId(contactId, tenantId);
  }

  /**
   * Get win rate statistics
   */
  async getWinRateStatistics(
    ownerId?: string,
    tenantId?: string
  ): Promise<{
    totalClosed: number;
    wonCount: number;
    lostCount: number;
    winRate: number;
    totalWonValue: number;
    averageWonValue: number;
  }> {
    const opportunities =
      ownerId && tenantId ? await this.opportunityRepository.findByOwnerId(ownerId, tenantId) : [];

    const closedOpportunities = opportunities.filter((o) => o.isClosed);
    const wonOpportunities = closedOpportunities.filter((o) => o.isWon);
    const lostOpportunities = closedOpportunities.filter((o) => o.isLost);

    const totalWonValue = wonOpportunities.reduce((sum, o) => sum + o.value.amount, 0);

    return {
      totalClosed: closedOpportunities.length,
      wonCount: wonOpportunities.length,
      lostCount: lostOpportunities.length,
      winRate:
        closedOpportunities.length > 0
          ? Math.round((wonOpportunities.length / closedOpportunities.length) * 100)
          : 0,
      totalWonValue,
      averageWonValue: wonOpportunities.length > 0 ? totalWonValue / wonOpportunities.length : 0,
    };
  }

  /**
   * Delete opportunity with business rules
   */
  async deleteOpportunity(
    opportunityId: string,
    tenantId: string
  ): Promise<Result<void, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findById(oppIdResult.value, tenantId);
    if (!opportunity) {
      return Result.fail(new ValidationError(`Opportunity not found: ${opportunityId}`));
    }

    // Business rule: Cannot delete won opportunities (audit trail)
    if (opportunity.isWon) {
      return Result.fail(
        new ValidationError('Cannot delete won opportunities. Archive them instead.')
      );
    }

    try {
      await this.opportunityRepository.softDelete(oppIdResult.value, tenantId);
    } catch {
      return Result.fail(new PersistenceError('Failed to delete opportunity'));
    }

    return Result.ok(undefined);
  }

  /**
   * Restore a soft-deleted opportunity from trash
   */
  async restoreOpportunity(
    opportunityId: string,
    tenantId: string
  ): Promise<Result<void, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findByIdIncludingDeleted(
      oppIdResult.value
    );
    if (!opportunity) {
      return Result.fail(new NotFoundError(`Opportunity not found: ${opportunityId}`));
    }

    if (opportunity.tenantId !== tenantId) {
      return Result.fail(new NotFoundError(`Opportunity not found: ${opportunityId}`));
    }

    if (!opportunity.isDeleted) {
      return Result.fail(new ValidationError('Can only restore deals that are in trash'));
    }

    try {
      await this.opportunityRepository.restore(oppIdResult.value, tenantId);
    } catch {
      return Result.fail(new PersistenceError('Failed to restore opportunity'));
    }

    return Result.ok(undefined);
  }

  /**
   * Permanently delete a soft-deleted opportunity
   * Only records already in trash (deletedAt set) can be permanently deleted
   */
  async permanentDeleteOpportunity(
    opportunityId: string,
    tenantId: string
  ): Promise<Result<void, DomainError>> {
    const oppIdResult = OpportunityId.create(opportunityId);
    if (oppIdResult.isFailure) {
      return Result.fail(oppIdResult.error);
    }

    const opportunity = await this.opportunityRepository.findByIdIncludingDeleted(
      oppIdResult.value
    );
    if (!opportunity) {
      return Result.fail(new NotFoundError(`Opportunity not found: ${opportunityId}`));
    }

    if (opportunity.tenantId !== tenantId) {
      return Result.fail(new NotFoundError(`Opportunity not found: ${opportunityId}`));
    }

    if (!opportunity.isDeleted) {
      return Result.fail(
        new ValidationError('Can only permanently delete deals that are in trash')
      );
    }

    try {
      await this.opportunityRepository.delete(oppIdResult.value, tenantId);
    } catch {
      return Result.fail(new PersistenceError('Failed to permanently delete opportunity'));
    }

    return Result.ok(undefined);
  }

  /**
   * Validate and apply a stage change to an opportunity.
   * Returns a DomainError if invalid, or null on success.
   */
  private applyStageChange(
    opportunity: Opportunity,
    newStage: OpportunityStage,
    changedBy: string
  ): DomainError | null {
    if (opportunity.stage === newStage) return null;
    const allowedTransitions = STAGE_TRANSITION_RULES[opportunity.stage];
    if (!allowedTransitions.includes(newStage)) {
      return new ValidationError(
        `Invalid stage transition from ${opportunity.stage} to ${newStage}. Allowed: ${allowedTransitions.join(', ')}`
      );
    }
    const stageResult = opportunity.changeStage(newStage, changedBy);
    return stageResult.isFailure ? stageResult.error : null;
  }

  /**
   * Get next stage in the pipeline
   */
  private getNextStage(currentStage: OpportunityStage): OpportunityStage | null {
    const progression: Record<OpportunityStage, OpportunityStage | null> = {
      PROSPECTING: 'QUALIFICATION',
      QUALIFICATION: 'NEEDS_ANALYSIS',
      NEEDS_ANALYSIS: 'PROPOSAL',
      PROPOSAL: 'NEGOTIATION',
      NEGOTIATION: 'CLOSED_WON',
      CLOSED_WON: null,
      CLOSED_LOST: null,
    };

    return progression[currentStage];
  }

  private async publishEvents(opportunity: Opportunity): Promise<void> {
    const events = opportunity.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish opportunity domain events:', error);
      }
    }
    opportunity.clearDomainEvents();
  }
}
