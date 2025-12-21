import { Lead, LeadId, Email } from '@intelliflow/domain';
import { LeadRepository } from '@intelliflow/application';

/**
 * In-Memory Lead Repository
 * Used for testing and development
 */
export class InMemoryLeadRepository implements LeadRepository {
  private leads: Map<string, Lead> = new Map();

  async save(lead: Lead): Promise<void> {
    this.leads.set(lead.id.value, lead);
  }

  async findById(id: LeadId): Promise<Lead | null> {
    return this.leads.get(id.value) ?? null;
  }

  async findByEmail(email: Email): Promise<Lead | null> {
    for (const lead of this.leads.values()) {
      if (lead.email.equals(email)) {
        return lead;
      }
    }
    return null;
  }

  async findByOwnerId(ownerId: string): Promise<Lead[]> {
    return Array.from(this.leads.values())
      .filter((lead) => lead.ownerId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByStatus(status: string, ownerId?: string): Promise<Lead[]> {
    return Array.from(this.leads.values())
      .filter((lead) => {
        const matchesStatus = lead.status === status;
        const matchesOwner = !ownerId || lead.ownerId === ownerId;
        return matchesStatus && matchesOwner;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByMinScore(minScore: number, ownerId?: string): Promise<Lead[]> {
    return Array.from(this.leads.values())
      .filter((lead) => {
        const matchesScore = lead.score.value >= minScore;
        const matchesOwner = !ownerId || lead.ownerId === ownerId;
        return matchesScore && matchesOwner;
      })
      .sort((a, b) => b.score.value - a.score.value);
  }

  async delete(id: LeadId): Promise<void> {
    this.leads.delete(id.value);
  }

  async existsByEmail(email: Email): Promise<boolean> {
    for (const lead of this.leads.values()) {
      if (lead.email.equals(email)) {
        return true;
      }
    }
    return false;
  }

  async countByStatus(ownerId?: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    for (const lead of this.leads.values()) {
      if (!ownerId || lead.ownerId === ownerId) {
        counts[lead.status] = (counts[lead.status] ?? 0) + 1;
      }
    }

    return counts;
  }

  async findForScoring(limit: number): Promise<Lead[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return Array.from(this.leads.values())
      .filter((lead) => {
        return lead.score.value === 0 || lead.updatedAt < thirtyDaysAgo;
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
  }

  // Test helper methods
  clear(): void {
    this.leads.clear();
  }

  getAll(): Lead[] {
    return Array.from(this.leads.values());
  }
}
