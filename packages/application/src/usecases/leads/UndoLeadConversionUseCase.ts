/**
 * UndoLeadConversionUseCase (MVP-003)
 *
 * Undoes a lead-to-deal conversion while nothing has happened to the deal since: the lead goes
 * back to QUALIFIED, the deal is deleted, and the contact too when the conversion created it.
 * Once the deal has moved stage or has tasks, emails, calls, files, products or other records
 * (or the contact the conversion created has its own records or another deal), the conversion
 * stays and the reasons are returned instead.
 */
import { Result, DomainError, Lead, LeadId } from '@intelliflow/domain';
import type { LeadRepository } from '../../ports/repositories';
import type {
  ConversionUndoBlocker,
  ConversionUndoPort,
  ConvertedDeal,
} from '../../ports/repositories/ConversionUndoPort';
import { EventBusPort } from '../../ports/external';
import { TransactionPort } from '../../ports/TransactionPort';
import { ValidationError, NotFoundError, PersistenceError } from '../../errors';

export const CONVERSION_UNDO_REASONS: Record<ConversionUndoBlocker, string> = {
  STAGE_CHANGED: 'the deal has moved past Prospecting',
  DEAL_HAS_TASKS: 'the deal has tasks',
  DEAL_HAS_ACTIVITY: 'the deal has emails, calls, files, products or other records',
  CONTACT_HAS_ACTIVITY: 'the contact created with it has notes, tasks, emails or other records',
  CONTACT_HAS_OTHER_DEALS: 'the contact created with it is on another deal',
};

const NOT_FROM_A_LEAD = 'This deal was not converted from a lead, so there is nothing to undo.';

/** Thrown inside the transaction when something happened since the check; rolls it back. */
class UndoBlockedError extends Error {
  constructor(readonly blockers: ConversionUndoBlocker[]) {
    super('blocked');
  }
}

export interface UndoLeadConversionInput {
  opportunityId: string;
  tenantId: string;
  /** Who undid it, for the audit trail */
  undoneBy?: string;
}

export interface ConversionUndoStatus {
  canUndo: boolean;
  /** The lead the deal came from, when it came from one */
  leadId: string | null;
  /** Why it cannot be undone, in plain words; empty when it can */
  reasons: string[];
}

export function describeUndoBlockers(blockers: ConversionUndoBlocker[]): string {
  return `This conversion can no longer be undone: ${blockers
    .map((b) => CONVERSION_UNDO_REASONS[b])
    .join('; ')}.`;
}

export class UndoLeadConversionUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly conversionUndo: ConversionUndoPort,
    private readonly eventBus: EventBusPort,
    private readonly transactionManager: TransactionPort
  ) {}

  /** Whether the deal's conversion can be undone now, and why not when it cannot. */
  async check(input: UndoLeadConversionInput): Promise<Result<ConversionUndoStatus, DomainError>> {
    const deal = await this.conversionUndo.findDeal(input.opportunityId, input.tenantId);
    if (!deal || deal.deleted) {
      return Result.fail(new NotFoundError(`Deal not found: ${input.opportunityId}`));
    }
    if (!deal.sourceLeadId) {
      return Result.ok({ canUndo: false, leadId: null, reasons: [NOT_FROM_A_LEAD] });
    }
    const lead = await this.loadLead(deal.sourceLeadId);
    if (!lead || !lead.isConverted) {
      return Result.ok({ canUndo: false, leadId: deal.sourceLeadId, reasons: [NOT_FROM_A_LEAD] });
    }
    const blockers = await this.conversionUndo.findBlockers(deal);
    return Result.ok({
      canUndo: blockers.length === 0,
      leadId: deal.sourceLeadId,
      reasons: blockers.map((b) => CONVERSION_UNDO_REASONS[b]),
    });
  }

  async execute(input: UndoLeadConversionInput): Promise<Result<{ leadId: string }, DomainError>> {
    if (!input.undoneBy || input.undoneBy.trim() === '') {
      return Result.fail(new ValidationError('undoneBy is required for audit trail'));
    }
    const deal = await this.conversionUndo.findDeal(input.opportunityId, input.tenantId);
    if (!deal || deal.deleted) {
      return Result.fail(new NotFoundError(`Deal not found: ${input.opportunityId}`));
    }
    if (!deal.sourceLeadId) return Result.fail(new ValidationError(NOT_FROM_A_LEAD));

    const lead = await this.loadLead(deal.sourceLeadId);
    if (!lead || lead.tenantId !== input.tenantId) {
      return Result.fail(new NotFoundError(`Lead not found: ${deal.sourceLeadId}`));
    }
    if (!lead.isConverted) return Result.fail(new ValidationError(NOT_FROM_A_LEAD));

    const blockers = await this.conversionUndo.findBlockers(deal);
    if (blockers.length > 0)
      return Result.fail(new ValidationError(describeUndoBlockers(blockers)));

    // Change the lead only once the undo is going ahead.
    const undone = lead.undoConversion(input.undoneBy);
    if (undone.isFailure) return Result.fail(new ValidationError(NOT_FROM_A_LEAD));

    const persisted = await this.persist(deal, lead);
    if (persisted.isFailure) return Result.fail(persisted.error);
    lead.clearDomainEvents();
    return Result.ok({ leadId: lead.id.value });
  }

  private async loadLead(leadId: string): Promise<Lead | null> {
    const id = LeadId.create(leadId);
    return id.isSuccess ? this.leadRepository.findById(id.value) : null;
  }

  /**
   * One transaction: re-check (something may have happened since), remove what the conversion
   * created, put the lead back (only if it is still CONVERTED) and publish its event.
   */
  private async persist(deal: ConvertedDeal, lead: Lead): Promise<Result<void, DomainError>> {
    try {
      await this.transactionManager.run(async (tx) => {
        // Lock first, then look: what is seen below is what the delete removes (see lockRecords).
        await this.conversionUndo.lockRecords(deal, tx);
        const current = await this.conversionUndo.findDeal(deal.opportunityId, deal.tenantId, tx);
        if (!current || current.deleted) throw new Error('the deal was deleted meanwhile');
        if (current.contactId !== deal.contactId) throw new Error('the deal changed meanwhile');
        const blockers = await this.conversionUndo.findBlockers(current, tx);
        if (blockers.length > 0) throw new UndoBlockedError(blockers);
        await this.conversionUndo.removeCreatedRecords(current, tx);
        await this.leadRepository.save(lead, { expectedStatus: 'CONVERTED' }, tx);
        const events = lead.getDomainEvents();
        if (events.length > 0) await this.eventBus.publishAll([...events], tx);
      });
    } catch (error) {
      if (error instanceof UndoBlockedError) {
        return Result.fail(new ValidationError(describeUndoBlockers(error.blockers)));
      }
      return Result.fail(
        new PersistenceError('Failed to undo the conversion: ' + (error as Error).message)
      );
    }
    return Result.ok(undefined);
  }
}
