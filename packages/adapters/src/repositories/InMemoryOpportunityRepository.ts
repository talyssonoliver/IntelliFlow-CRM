import {
  Opportunity,
  OpportunityId,
  OpportunityStage,
  OpportunityRepository,
  type RepositoryTransaction,
} from '@intelliflow/domain';

/**
 * In-Memory Opportunity Repository
 * Used for testing and development
 */
export class InMemoryOpportunityRepository implements OpportunityRepository {
  private readonly opportunities: Map<string, Opportunity> = new Map();

  async save(opportunity: Opportunity, tx?: RepositoryTransaction): Promise<void> {
    this.opportunities.set(opportunity.id.value, opportunity);
  }

  async findById(id: OpportunityId, _tenantId?: string): Promise<Opportunity | null> {
    const opp = this.opportunities.get(id.value) ?? null;
    if (!opp) return null;
    if (opp.deletedAt) return null; // exclude soft-deleted records
    if (_tenantId && opp.tenantId !== _tenantId) return null;
    return opp;
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

  async delete(id: OpportunityId, tenantId: string): Promise<void> {
    const opp = this.opportunities.get(id.value);
    if (!opp || opp.tenantId !== tenantId) {
      throw new Error(`Opportunity not found or tenant mismatch: ${id.value}`);
    }
    this.opportunities.delete(id.value);
  }

  async softDelete(id: OpportunityId, tenantId: string): Promise<void> {
    const opp = this.opportunities.get(id.value);
    if (!opp || opp.tenantId !== tenantId)
      throw new Error(`Opportunity not found or tenant mismatch: ${id.value}`);
    // In-memory: reconstitute with deletedAt set — used for testing only
    const updated = Opportunity.reconstitute(id, {
      name: opp.name,
      value: opp.value,
      stage: opp.stage,
      probability: opp.probability,
      expectedCloseDate: opp.expectedCloseDate,
      description: opp.description,
      accountId: opp.accountId,
      contactId: opp.contactId,
      ownerId: opp.ownerId,
      tenantId: opp.tenantId,
      createdAt: opp.createdAt,
      updatedAt: opp.updatedAt,
      closedAt: opp.closedAt,
      deletedAt: new Date(),
    });
    this.opportunities.set(id.value, updated);
  }

  async restore(id: OpportunityId, tenantId: string): Promise<void> {
    const opp = this.opportunities.get(id.value);
    if (!opp || opp.tenantId !== tenantId)
      throw new Error(`Opportunity not found or tenant mismatch: ${id.value}`);
    const updated = Opportunity.reconstitute(id, {
      name: opp.name,
      value: opp.value,
      stage: opp.stage,
      probability: opp.probability,
      expectedCloseDate: opp.expectedCloseDate,
      description: opp.description,
      accountId: opp.accountId,
      contactId: opp.contactId,
      ownerId: opp.ownerId,
      tenantId: opp.tenantId,
      createdAt: opp.createdAt,
      updatedAt: opp.updatedAt,
      closedAt: opp.closedAt,
      deletedAt: null,
    });
    this.opportunities.set(id.value, updated);
  }

  async findByIdIncludingDeleted(id: OpportunityId): Promise<Opportunity | null> {
    return this.opportunities.get(id.value) ?? null;
  }

  async findTrashed(params: {
    tenantId: string;
    search?: string;
    skip?: number;
    take?: number;
    orderBy?: Record<string, string>;
  }): Promise<{ items: Opportunity[]; total: number }> {
    let items = Array.from(this.opportunities.values()).filter(
      (opp) => opp.tenantId === params.tenantId && opp.isDeleted
    );
    if (params.search) {
      const q = params.search.toLowerCase();
      items = items.filter((opp) => opp.name.toLowerCase().includes(q));
    }
    const total = items.length;
    if (params.skip !== undefined) items = items.slice(params.skip);
    if (params.take !== undefined) items = items.slice(0, params.take);
    return { items, total };
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
