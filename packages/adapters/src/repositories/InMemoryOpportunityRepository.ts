import {
  Opportunity,
  OpportunityId,
  OpportunityStage,
  OpportunityRepository,
} from '@intelliflow/domain';

/**
 * In-Memory Opportunity Repository
 * Used for testing and development
 */
export class InMemoryOpportunityRepository implements OpportunityRepository {
  private opportunities: Map<string, Opportunity> = new Map();

  async save(opportunity: Opportunity): Promise<void> {
    this.opportunities.set(opportunity.id.value, opportunity);
  }

  async findById(id: OpportunityId): Promise<Opportunity | null> {
    return this.opportunities.get(id.value) ?? null;
  }

  async findByOwnerId(ownerId: string): Promise<Opportunity[]> {
    return Array.from(this.opportunities.values())
      .filter((opp) => opp.ownerId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByAccountId(accountId: string): Promise<Opportunity[]> {
    return Array.from(this.opportunities.values())
      .filter((opp) => opp.accountId === accountId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByStage(stage: OpportunityStage, ownerId?: string): Promise<Opportunity[]> {
    return Array.from(this.opportunities.values())
      .filter((opp) => {
        const matchesStage = opp.stage === stage;
        const matchesOwner = !ownerId || opp.ownerId === ownerId;
        return matchesStage && matchesOwner;
      })
      .sort((a, b) => b.value.amount - a.value.amount); // Compare Money amounts
  }

  async findByContactId(contactId: string): Promise<Opportunity[]> {
    return Array.from(this.opportunities.values())
      .filter((opp) => opp.contactId === contactId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async delete(id: OpportunityId): Promise<void> {
    this.opportunities.delete(id.value);
  }

  async findClosingSoon(days: number, ownerId?: string): Promise<Opportunity[]> {
    const now = new Date();
    const deadline = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return Array.from(this.opportunities.values())
      .filter((opp) => {
        const isActive = !opp.isClosed;
        const hasDueDate = opp.expectedCloseDate !== undefined;
        const isClosingSoon =
          opp.expectedCloseDate !== undefined && opp.expectedCloseDate <= deadline;
        const matchesOwner = !ownerId || opp.ownerId === ownerId;
        return isActive && hasDueDate && isClosingSoon && matchesOwner;
      })
      .sort((a, b) => {
        const aDate = a.expectedCloseDate?.getTime() ?? 0;
        const bDate = b.expectedCloseDate?.getTime() ?? 0;
        return aDate - bDate;
      });
  }

  async findHighValue(minValue: number, ownerId?: string): Promise<Opportunity[]> {
    return Array.from(this.opportunities.values())
      .filter((opp) => {
        const isHighValue = opp.value.amount >= minValue; // Compare Money amount
        const isActive = !opp.isClosed;
        const matchesOwner = !ownerId || opp.ownerId === ownerId;
        return isHighValue && isActive && matchesOwner;
      })
      .sort((a, b) => b.value.amount - a.value.amount); // Compare Money amounts
  }

  // Test helper methods
  clear(): void {
    this.opportunities.clear();
  }

  getAll(): Opportunity[] {
    return Array.from(this.opportunities.values());
  }
}
