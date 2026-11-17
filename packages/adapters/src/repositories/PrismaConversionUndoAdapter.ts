/**
 * Prisma implementation of ConversionUndoPort (MVP-003): finds what has happened to a converted
 * deal since the conversion, and deletes the records the conversion created.
 *
 * "Since the conversion" is read from what exists, so no migration is needed: a conversion
 * creates the deal at PROSPECTING with nothing attached, and the contact it creates carries the
 * lead's id (Contact.leadId, unique). Records written by the AI on its own (insight notes signed
 * "AI Insights", AI scores, reply drafts) do not count and are removed with the contact.
 */
import type { PrismaClient } from '@intelliflow/db';
import type { RepositoryTransaction } from '@intelliflow/domain';
import type {
  ConversionUndoBlocker,
  ConversionUndoPort,
  ConvertedDeal,
} from '@intelliflow/application';

/** userName on the ContactActivity notes the AI insight job writes by itself. */
export const AI_INSIGHT_AUTHOR = 'AI Insights';

const anyPositive = (counts: number[]) => counts.some((n) => n > 0);

export class PrismaConversionUndoAdapter implements ConversionUndoPort {
  constructor(private readonly prisma: PrismaClient) {}

  private client(tx?: RepositoryTransaction): PrismaClient {
    return (tx as unknown as PrismaClient) ?? this.prisma;
  }

  async findDeal(
    opportunityId: string,
    tenantId: string,
    tx?: RepositoryTransaction
  ): Promise<ConvertedDeal | null> {
    const deal = await this.client(tx).opportunity.findFirst({
      where: { id: opportunityId, tenantId },
      select: {
        id: true,
        tenantId: true,
        sourceLeadId: true,
        stage: true,
        deletedAt: true,
        contactId: true,
        contact: { select: { leadId: true } },
      },
    });
    if (!deal) return null;
    return {
      opportunityId: deal.id,
      tenantId: deal.tenantId,
      sourceLeadId: deal.sourceLeadId,
      stage: deal.stage,
      deleted: deal.deletedAt !== null,
      contactId: deal.contactId,
      contactCreatedByConversion:
        deal.sourceLeadId !== null && deal.contact?.leadId === deal.sourceLeadId,
    };
  }

  async findBlockers(
    deal: ConvertedDeal,
    tx?: RepositoryTransaction
  ): Promise<ConversionUndoBlocker[]> {
    const db = this.client(tx);
    const blockers: ConversionUndoBlocker[] = [];
    if (deal.stage !== 'PROSPECTING') blockers.push('STAGE_CHANGED');

    const opportunityId = deal.opportunityId;
    const dealTasks = await db.task.count({ where: { opportunityId } });
    if (dealTasks > 0) blockers.push('DEAL_HAS_TASKS');

    const dealRecords = await Promise.all([
      db.dealProduct.count({ where: { opportunityId } }),
      db.setupInstalment.count({ where: { opportunityId } }),
      db.dealFile.count({ where: { opportunityId } }),
      db.activityEvent.count({ where: { opportunityId } }),
      db.emailRecord.count({ where: { dealId: opportunityId } }),
      db.callRecord.count({ where: { dealId: opportunityId } }),
      db.document.count({ where: { dealId: opportunityId } }),
      db.feedbackSurvey.count({ where: { dealId: opportunityId } }),
    ]);
    if (anyPositive(dealRecords)) blockers.push('DEAL_HAS_ACTIVITY');

    if (deal.contactCreatedByConversion && deal.contactId) {
      const contactId = deal.contactId;
      const contactRecords = await Promise.all([
        db.task.count({ where: { contactId } }),
        db.ticket.count({ where: { contactId } }),
        db.contactNote.count({ where: { contactId } }),
        db.contactActivity.count({ where: { contactId, NOT: { userName: AI_INSIGHT_AUTHOR } } }),
        db.emailRecord.count({ where: { contactId } }),
        db.callRecord.count({ where: { contactId } }),
        db.calendarEvent.count({ where: { contactId } }),
        db.document.count({ where: { contactId } }),
        db.chatConversation.count({ where: { contactId } }),
        db.feedbackSurvey.count({ where: { contactId } }),
      ]);
      if (anyPositive(contactRecords)) blockers.push('CONTACT_HAS_ACTIVITY');
      const otherDeals = await db.opportunity.count({
        where: { contactId, id: { not: opportunityId } },
      });
      if (otherDeals > 0) blockers.push('CONTACT_HAS_OTHER_DEALS');
    }
    return blockers;
  }

  async removeCreatedRecords(deal: ConvertedDeal, tx: RepositoryTransaction): Promise<void> {
    const db = this.client(tx);
    await db.opportunity.delete({ where: { id: deal.opportunityId } });
    if (deal.contactCreatedByConversion && deal.contactId) {
      await db.contact.delete({ where: { id: deal.contactId } });
    }
  }
}
