import {
  Lead,
  LeadId,
  Email,
  LeadStatusConflictError,
  type LeadStatus,
  type RepositoryTransaction,
} from '@intelliflow/domain';
import { LeadRepository } from '@intelliflow/application';

/**
 * Copy a lead into an independent aggregate (like a DB round trip would), so
 * mutating a lead the caller holds never changes what is stored, and a later
 * compare-and-set sees the status that was actually persisted.
 */
function snapshot(lead: Lead, override?: { status?: LeadStatus; updatedAt?: Date }): Lead {
  return Lead.reconstitute(lead.id, {
    email: lead.email,
    firstName: lead.firstName,
    lastName: lead.lastName,
    company: lead.company,
    title: lead.title,
    phone: lead.phone,
    source: lead.source,
    status: override?.status ?? lead.status,
    score: { value: lead.score.value, confidence: lead.score.confidence },
    ownerId: lead.ownerId,
    tenantId: lead.tenantId,
    createdAt: new Date(lead.createdAt.getTime()),
    updatedAt: new Date((override?.updatedAt ?? lead.updatedAt).getTime()),
    location: lead.location,
    website: lead.website,
    avatarUrl: lead.avatarUrl,
    lastContactedAt: lead.lastContactedAt ? new Date(lead.lastContactedAt.getTime()) : undefined,
    estimatedValue: lead.estimatedValue,
    tags: lead.tags ? [...lead.tags] : undefined,
    budget: lead.budget,
    authority: lead.authority,
    need: lead.need,
    timeline: lead.timeline,
    annualRevenue: lead.annualRevenue,
  });
}

/**
 * In-Memory Lead Repository
 * Used for testing and development
 */
export class InMemoryLeadRepository implements LeadRepository {
  private readonly leads: Map<string, Lead> = new Map();
  /** Initial notes captured on save (opts.note), keyed by lead id. */
  private readonly leadNotes: Map<string, Array<{ content: string; author: string }>> = new Map();

  async save(
    lead: Lead,
    opts?: { note?: { content: string; author: string }; expectedStatus?: string },
    tx?: RepositoryTransaction
  ): Promise<void> {
    // Persist the lead and, per the repository contract, any initial note
    // together — atomic by construction here since both writes are synchronous
    // in-memory map mutations that cannot partially fail.
    const stored = this.leads.get(lead.id.value);
    if (opts?.expectedStatus !== undefined) {
      // Compare-and-set, mirroring PrismaLeadRepository: write ONLY status and
      // updatedAt onto the STORED lead so a concurrent non-status change survives.
      if (!stored || stored.status !== opts.expectedStatus) {
        throw new LeadStatusConflictError(lead.id.value, opts.expectedStatus);
      }
      this.leads.set(
        lead.id.value,
        snapshot(stored, { status: lead.status, updatedAt: lead.updatedAt })
      );
    } else if (stored) {
      // Plain save never rewrites status (a stale snapshot must not revert it).
      this.leads.set(lead.id.value, snapshot(lead, { status: stored.status }));
    } else {
      this.leads.set(lead.id.value, snapshot(lead));
    }
    if (opts?.note) {
      const existing = this.leadNotes.get(lead.id.value) ?? [];
      existing.push(opts.note);
      this.leadNotes.set(lead.id.value, existing);
    }
  }

  /** Initial notes captured for a lead — test/dev introspection only. */
  getNotes(leadId: string): Array<{ content: string; author: string }> {
    return this.leadNotes.get(leadId) ?? [];
  }

  async findById(id: LeadId): Promise<Lead | null> {
    const stored = this.leads.get(id.value);
    return stored ? snapshot(stored) : null;
  }

  async findByEmail(email: Email): Promise<Lead | null> {
    for (const lead of this.leads.values()) {
      if (lead.email.equals(email)) {
        return snapshot(lead);
      }
    }
    return null;
  }

  async findByOwnerId(ownerId: string): Promise<Lead[]> {
    return Array.from(this.leads.values())
      .filter((lead) => lead.ownerId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((l) => snapshot(l));
  }

  async findByStatus(status: string, ownerId?: string): Promise<Lead[]> {
    return Array.from(this.leads.values())
      .filter((lead) => {
        const matchesStatus = lead.status === status;
        const matchesOwner = !ownerId || lead.ownerId === ownerId;
        return matchesStatus && matchesOwner;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((l) => snapshot(l));
  }

  async findByMinScore(minScore: number, ownerId?: string): Promise<Lead[]> {
    return Array.from(this.leads.values())
      .filter((lead) => {
        const matchesScore = lead.score.value >= minScore;
        const matchesOwner = !ownerId || lead.ownerId === ownerId;
        return matchesScore && matchesOwner;
      })
      .sort((a, b) => b.score.value - a.score.value)
      .map((l) => snapshot(l));
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
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

    return Array.from(this.leads.values())
      .filter((lead) => {
        return lead.score.value === 0 || lead.updatedAt < thirtyDaysAgo;
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit)
      .map((l) => snapshot(l));
  }

  // Test helper methods
  clear(): void {
    this.leads.clear();
  }

  getAll(): Lead[] {
    return Array.from(this.leads.values()).map((l) => snapshot(l));
  }
}
