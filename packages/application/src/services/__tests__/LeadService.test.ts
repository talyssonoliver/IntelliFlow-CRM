/**
 * LeadService Tests
 *
 * Tests the LeadService application service which orchestrates
 * lead-related business logic including scoring, qualification,
 * and conversion.
 *
 * Coverage target: >90% for application layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LeadService, LEAD_SCORE_THRESHOLDS } from '../LeadService';
import { Lead, LeadId, Email, Account, Contact, Result, DomainError } from '@intelliflow/domain';
import { LeadRepository, ContactRepository, AccountRepository } from '@intelliflow/domain';
import { AIServicePort, EventBusPort, LeadScoringResult } from '../../ports';
import { ValidationError, PersistenceError } from '../../errors';

// Mock implementations
class MockLeadRepository implements LeadRepository {
  private leads = new Map<string, Lead>();

  async save(lead: Lead): Promise<void> {
    this.leads.set(lead.id.value, lead);
  }

  async findById(id: LeadId): Promise<Lead | null> {
    return this.leads.get(id.value) ?? null;
  }

  async findByEmail(email: Email): Promise<Lead | null> {
    for (const lead of this.leads.values()) {
      if (lead.email.equals(email)) return lead;
    }
    return null;
  }

  async findByOwnerId(ownerId: string): Promise<Lead[]> {
    return Array.from(this.leads.values()).filter((l) => l.ownerId === ownerId);
  }

  async findByStatus(status: string, ownerId?: string): Promise<Lead[]> {
    return Array.from(this.leads.values()).filter((l) => {
      const matchesStatus = l.status === status;
      const matchesOwner = !ownerId || l.ownerId === ownerId;
      return matchesStatus && matchesOwner;
    });
  }

  async findByMinScore(minScore: number, ownerId?: string): Promise<Lead[]> {
    return Array.from(this.leads.values()).filter((l) => {
      const matchesScore = l.score.value >= minScore;
      const matchesOwner = !ownerId || l.ownerId === ownerId;
      return matchesScore && matchesOwner;
    });
  }

  async delete(id: LeadId): Promise<void> {
    this.leads.delete(id.value);
  }

  async existsByEmail(email: Email): Promise<boolean> {
    for (const lead of this.leads.values()) {
      if (lead.email.equals(email)) return true;
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
    return Array.from(this.leads.values())
      .filter((l) => l.score.value === 0)
      .slice(0, limit);
  }

  // Helper for tests
  clear(): void {
    this.leads.clear();
  }

  add(lead: Lead): void {
    this.leads.set(lead.id.value, lead);
  }
}

class MockContactRepository implements ContactRepository {
  private contacts = new Map<string, Contact>();

  async save(contact: Contact): Promise<void> {
    this.contacts.set(contact.id.value, contact);
  }

  async findById(): Promise<Contact | null> {
    return null;
  }

  async findByEmail(): Promise<Contact | null> {
    return null;
  }

  async findByAccountId(): Promise<Contact[]> {
    return [];
  }

  async findByOwnerId(): Promise<Contact[]> {
    return [];
  }

  async delete(): Promise<void> {}
}

class MockAccountRepository implements AccountRepository {
  private accounts = new Map<string, Account>();

  async save(account: Account): Promise<void> {
    this.accounts.set(account.id.value, account);
  }

  async findById(): Promise<Account | null> {
    return null;
  }

  async findByName(name: string): Promise<Account[]> {
    return Array.from(this.accounts.values()).filter((a) => a.name === name);
  }

  async findByOwnerId(): Promise<Account[]> {
    return [];
  }

  async delete(): Promise<void> {}

  // Helper
  add(account: Account): void {
    this.accounts.set(account.id.value, account);
  }
}

class MockAIService implements AIServicePort {
  private mockScore = 50;
  private mockConfidence = 0.8;
  private shouldFail = false;

  setMockScore(score: number, confidence: number = 0.8): void {
    this.mockScore = score;
    this.mockConfidence = confidence;
  }

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  async scoreLead(): Promise<Result<LeadScoringResult, DomainError>> {
    if (this.shouldFail) {
      return Result.fail(new DomainError('AI service error'));
    }

    return Result.ok({
      score: this.mockScore,
      confidence: this.mockConfidence,
      modelVersion: 'mock-v1.0',
      reasoning: 'Mock scoring',
      factors: {},
    });
  }

  async qualifyLead(): Promise<Result<boolean, DomainError>> {
    return Result.ok(this.mockScore >= 70);
  }

  async generateEmail(): Promise<Result<string, DomainError>> {
    return Result.ok('Mock email');
  }
}

class MockEventBus implements EventBusPort {
  private events: unknown[] = [];

  async publish(event: unknown): Promise<void> {
    this.events.push(event);
  }

  async publishAll(events: unknown[]): Promise<void> {
    this.events.push(...events);
  }

  async subscribe(): Promise<void> {}

  getEvents(): unknown[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

describe('LeadService', () => {
  let leadService: LeadService;
  let leadRepository: MockLeadRepository;
  let contactRepository: MockContactRepository;
  let accountRepository: MockAccountRepository;
  let aiService: MockAIService;
  let eventBus: MockEventBus;

  beforeEach(() => {
    leadRepository = new MockLeadRepository();
    contactRepository = new MockContactRepository();
    accountRepository = new MockAccountRepository();
    aiService = new MockAIService();
    eventBus = new MockEventBus();

    leadService = new LeadService(
      leadRepository,
      contactRepository,
      accountRepository,
      aiService,
      eventBus
    );
  });

  describe('createLead()', () => {
    it('should create a new lead successfully', async () => {
      const result = await leadService.createLead({
        email: 'newlead@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Inc',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.email.value).toBe('newlead@example.com');
      expect(result.value.firstName).toBe('John');
    });

    it('should fail with invalid email', async () => {
      const result = await leadService.createLead({
        email: 'invalid-email',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      });

      expect(result.isFailure).toBe(true);
    });

    it('should fail for duplicate email', async () => {
      // Create first lead
      await leadService.createLead({
        email: 'duplicate@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      });

      // Try to create duplicate
      const result = await leadService.createLead({
        email: 'duplicate@example.com',
        source: 'REFERRAL',
        ownerId: 'owner-456',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.message).toContain('already exists');
    });

    it('should publish domain events after creation', async () => {
      await leadService.createLead({
        email: 'events@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      });

      const events = eventBus.getEvents();
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('scoreLead()', () => {
    it('should score a lead successfully', async () => {
      const lead = Lead.create({
        email: 'score@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      leadRepository.add(lead);

      aiService.setMockScore(75, 0.9);

      const result = await leadService.scoreLead(lead.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.newScore).toBe(75);
      expect(result.value.confidence).toBe(0.9);
      expect(result.value.tier).toBe('WARM');
    });

    it('should auto-qualify lead with high score', async () => {
      const lead = Lead.create({
        email: 'hotlead@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      leadRepository.add(lead);

      aiService.setMockScore(85, 0.95);

      const result = await leadService.scoreLead(lead.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.autoQualified).toBe(true);
      expect(result.value.tier).toBe('HOT');
    });

    it('should auto-disqualify lead with low score', async () => {
      const lead = Lead.create({
        email: 'coldlead@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      leadRepository.add(lead);

      aiService.setMockScore(15, 0.8);

      const result = await leadService.scoreLead(lead.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.autoDisqualified).toBe(true);
    });

    it('should fail for non-existent lead', async () => {
      const fakeId = LeadId.generate().value;
      const result = await leadService.scoreLead(fakeId);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(ValidationError);
    });

    it('should fail for invalid lead ID', async () => {
      const result = await leadService.scoreLead('invalid-uuid');

      expect(result.isFailure).toBe(true);
    });

    it('should handle AI service failure gracefully', async () => {
      const lead = Lead.create({
        email: 'aifail@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      leadRepository.add(lead);

      aiService.setShouldFail(true);

      const result = await leadService.scoreLead(lead.id.value);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('qualifyLead()', () => {
    it('should qualify a lead with sufficient score', async () => {
      const lead = Lead.create({
        email: 'qualify@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead.updateScore(60, 0.8, 'test-v1');
      leadRepository.add(lead);

      const result = await leadService.qualifyLead(
        lead.id.value,
        'sales-rep',
        'Good fit for product'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('QUALIFIED');
    });

    it('should reject qualification for low score', async () => {
      const lead = Lead.create({
        email: 'lowscore@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead.updateScore(30, 0.8, 'test-v1');
      leadRepository.add(lead);

      const result = await leadService.qualifyLead(lead.id.value, 'sales-rep', 'Reason');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.message).toContain('below minimum');
    });

    it('should fail for non-existent lead', async () => {
      const fakeId = LeadId.generate().value;
      const result = await leadService.qualifyLead(fakeId, 'user', 'reason');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('convertLead()', () => {
    it('should convert a qualified lead to contact', async () => {
      const lead = Lead.create({
        email: 'convert@example.com',
        firstName: 'John',
        lastName: 'Doe',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead.updateScore(70, 0.8, 'test-v1');
      lead.qualify('user-123', 'Good fit');
      leadRepository.add(lead);

      const result = await leadService.convertLead(lead.id.value, 'New Company', 'sales-rep');

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).toBeDefined();
      expect(result.value.accountId).not.toBeNull();
      expect(result.value.leadId).toBe(lead.id.value);
    });

    it('should convert without creating account when not provided', async () => {
      const lead = Lead.create({
        email: 'nocompany@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        source: 'REFERRAL',
        ownerId: 'owner-123',
      }).value;
      lead.updateScore(70, 0.8, 'test-v1');
      lead.qualify('user-123', 'Direct contact');
      leadRepository.add(lead);

      const result = await leadService.convertLead(lead.id.value, null, 'sales-rep');

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBeNull();
    });

    it('should use existing account if name matches', async () => {
      const existingAccount = Account.create({
        name: 'Existing Corp',
        ownerId: 'owner-123',
      }).value;
      accountRepository.add(existingAccount);

      const lead = Lead.create({
        email: 'existing@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead.updateScore(70, 0.8, 'test-v1');
      lead.qualify('user-123', 'Good fit');
      leadRepository.add(lead);

      const result = await leadService.convertLead(lead.id.value, 'Existing Corp', 'sales-rep');

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBe(existingAccount.id.value);
    });

    it('should reject conversion of non-qualified lead', async () => {
      const lead = Lead.create({
        email: 'unqualified@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      leadRepository.add(lead);

      const result = await leadService.convertLead(lead.id.value, 'Company', 'sales-rep');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('qualified');
    });

    it('should fail for non-existent lead', async () => {
      const fakeId = LeadId.generate().value;
      const result = await leadService.convertLead(fakeId, 'Company', 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('bulkScoreLeads()', () => {
    it('should score multiple leads', async () => {
      const lead1 = Lead.create({
        email: 'bulk1@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      const lead2 = Lead.create({
        email: 'bulk2@example.com',
        source: 'REFERRAL',
        ownerId: 'owner-123',
      }).value;

      leadRepository.add(lead1);
      leadRepository.add(lead2);

      aiService.setMockScore(70, 0.8);

      const result = await leadService.bulkScoreLeads([lead1.id.value, lead2.id.value]);

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalProcessed).toBe(2);
    });

    it('should handle partial failures', async () => {
      const lead = Lead.create({
        email: 'valid@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      leadRepository.add(lead);

      const fakeId = LeadId.generate().value;

      const result = await leadService.bulkScoreLeads([lead.id.value, fakeId]);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe(fakeId);
    });
  });

  describe('getLeadsReadyForQualification()', () => {
    it('should return warm leads with NEW or CONTACTED status', async () => {
      const lead1 = Lead.create({
        email: 'warm1@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead1.updateScore(60, 0.8, 'test-v1');

      const lead2 = Lead.create({
        email: 'warm2@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead2.updateScore(70, 0.9, 'test-v1');
      lead2.changeStatus('CONTACTED', 'user-123');

      const lead3 = Lead.create({
        email: 'cold@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead3.updateScore(30, 0.7, 'test-v1');

      leadRepository.add(lead1);
      leadRepository.add(lead2);
      leadRepository.add(lead3);

      const leads = await leadService.getLeadsReadyForQualification('owner-123');

      expect(leads).toHaveLength(2);
    });
  });

  describe('getHotLeads()', () => {
    it('should return leads with score >= 80', async () => {
      const hotLead = Lead.create({
        email: 'hot@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      hotLead.updateScore(85, 0.9, 'test-v1');

      const warmLead = Lead.create({
        email: 'warm@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      warmLead.updateScore(60, 0.8, 'test-v1');

      leadRepository.add(hotLead);
      leadRepository.add(warmLead);

      const leads = await leadService.getHotLeads();

      expect(leads).toHaveLength(1);
      expect(leads[0].score.value).toBe(85);
    });
  });

  describe('getLeadsForScoring()', () => {
    it('should return unscored leads', async () => {
      const unscored = Lead.create({
        email: 'unscored@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;

      const scored = Lead.create({
        email: 'scored@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      scored.updateScore(50, 0.8, 'test-v1');

      leadRepository.add(unscored);
      leadRepository.add(scored);

      const leads = await leadService.getLeadsForScoring(10);

      expect(leads).toHaveLength(1);
      expect(leads[0].score.value).toBe(0);
    });
  });

  describe('updateLeadContactInfo()', () => {
    it('should update contact information', async () => {
      const lead = Lead.create({
        email: 'update@example.com',
        firstName: 'Old',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      leadRepository.add(lead);

      const result = await leadService.updateLeadContactInfo(lead.id.value, {
        firstName: 'New',
        lastName: 'Name',
        company: 'Updated Corp',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.firstName).toBe('New');
      expect(result.value.lastName).toBe('Name');
      expect(result.value.company).toBe('Updated Corp');
    });

    it('should reject update for converted lead', async () => {
      const lead = Lead.create({
        email: 'converted@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead.updateScore(70, 0.8, 'test-v1');
      lead.qualify('user-123', 'Good');
      lead.convert('contact-123', 'account-123', 'user-123');
      leadRepository.add(lead);

      const result = await leadService.updateLeadContactInfo(lead.id.value, { firstName: 'New' });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('converted');
    });

    it('should fail for non-existent lead', async () => {
      const fakeId = LeadId.generate().value;
      const result = await leadService.updateLeadContactInfo(fakeId, { firstName: 'New' });

      expect(result.isFailure).toBe(true);
    });
  });

  describe('changeLeadStatus()', () => {
    it('should allow valid status transitions', async () => {
      const lead = Lead.create({
        email: 'status@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      leadRepository.add(lead);

      const result = await leadService.changeLeadStatus(lead.id.value, 'CONTACTED', 'sales-rep');

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('CONTACTED');
    });

    it('should reject invalid status transitions', async () => {
      const lead = Lead.create({
        email: 'invalid@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      leadRepository.add(lead);

      // Try to go directly from NEW to CONVERTED (invalid)
      const result = await leadService.changeLeadStatus(lead.id.value, 'CONVERTED', 'sales-rep');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid status transition');
    });

    it('should allow reopening lost leads', async () => {
      const lead = Lead.create({
        email: 'lost@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead.changeStatus('LOST', 'user-123');
      leadRepository.add(lead);

      const result = await leadService.changeLeadStatus(lead.id.value, 'NEW', 'sales-rep');

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('NEW');
    });

    it('should fail for non-existent lead', async () => {
      const fakeId = LeadId.generate().value;
      const result = await leadService.changeLeadStatus(fakeId, 'CONTACTED', 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('getLeadStatistics()', () => {
    it('should return comprehensive statistics', async () => {
      const lead1 = Lead.create({
        email: 'stat1@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead1.updateScore(85, 0.9, 'test-v1');

      const lead2 = Lead.create({
        email: 'stat2@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead2.updateScore(60, 0.8, 'test-v1');

      const lead3 = Lead.create({
        email: 'stat3@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      }).value;
      lead3.updateScore(30, 0.7, 'test-v1');

      leadRepository.add(lead1);
      leadRepository.add(lead2);
      leadRepository.add(lead3);

      const stats = await leadService.getLeadStatistics();

      expect(stats.total).toBe(3);
      expect(stats.hotLeads).toBe(1);
      expect(stats.warmLeads).toBe(1);
      expect(stats.coldLeads).toBe(1);
      expect(stats.averageScore).toBeCloseTo(58.33, 0);
    });

    it('should filter by owner', async () => {
      const lead1 = Lead.create({
        email: 'owner1@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-1',
      }).value;
      const lead2 = Lead.create({
        email: 'owner2@example.com',
        source: 'WEBSITE',
        ownerId: 'owner-2',
      }).value;

      leadRepository.add(lead1);
      leadRepository.add(lead2);

      const owner1Stats = await leadService.getLeadStatistics('owner-1');

      expect(owner1Stats.total).toBe(1);
    });

    it('should handle empty repository', async () => {
      const stats = await leadService.getLeadStatistics();

      expect(stats.total).toBe(0);
      expect(stats.averageScore).toBe(0);
    });
  });

  describe('LEAD_SCORE_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(LEAD_SCORE_THRESHOLDS.HOT).toBe(80);
      expect(LEAD_SCORE_THRESHOLDS.WARM).toBe(50);
      expect(LEAD_SCORE_THRESHOLDS.COLD).toBe(0);
      expect(LEAD_SCORE_THRESHOLDS.AUTO_QUALIFY).toBe(75);
      expect(LEAD_SCORE_THRESHOLDS.AUTO_DISQUALIFY).toBe(20);
    });
  });
});
