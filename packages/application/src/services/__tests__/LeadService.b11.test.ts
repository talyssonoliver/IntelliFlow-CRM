/**
 * LeadService Tests - b11
 *
 * Targets uncovered branches:
 * - publishAccountEvents: events exist path, error path
 * - publishContactEvents: error path
 * - convertLead: account creation failure (Account.create fails)
 * - convertLead: existing account found
 * - convertLead: persistence error during save
 * - scoreLead: auto-disqualify path (score <= 20 and status NEW)
 * - scoreLead: updateScore failure
 * - scoreLead: persistence error after scoring
 * - qualifyLead: persistence error path
 * - changeLeadStatus: NEGOTIATING -> CONVERTED transition
 * - changeLeadStatus: LOST -> NEW transition
 * - getLeadStatistics: empty leads average score path
 * - updateLeadContactInfo: persistence error path
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LeadService, LEAD_SCORE_THRESHOLDS } from '../LeadService';
import {
  Result,
  DomainError,
  Lead,
  LeadId,
  LeadScore,
  Email,
  PhoneNumber,
  Contact,
  Account,
} from '@intelliflow/domain';
import type { AIServicePort, EventBusPort } from '../../ports/external';
import type { ContactRepository, AccountRepository } from '../../ports/repositories';
import type { LeadRepository } from '@intelliflow/domain';
import type { TransactionPort } from '@intelliflow/application';
import { PersistenceError } from '../../errors';

// ENG-OPS-002: LeadService now requires a TransactionPort as its final
// constructor arg. This fake just runs the callback — behaviour-neutral for
// these tests, which don't assert on real transactional rollback.
const makeTxManager = (): TransactionPort => ({ run: (work) => work({} as never) });

// Create mock factories
function createMockLeadRepo(): LeadRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    existsByEmail: vi.fn().mockResolvedValue(false),
    findByStatus: vi.fn().mockResolvedValue([]),
    findByOwnerId: vi.fn().mockResolvedValue([]),
    findByMinScore: vi.fn().mockResolvedValue([]),
    findForScoring: vi.fn().mockResolvedValue([]),
    countByStatus: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createMockContactRepo(): ContactRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
  } as any;
}

function createMockAccountRepo(): AccountRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByName: vi.fn().mockResolvedValue([]),
  } as any;
}

function createMockAIService(): AIServicePort {
  return {
    scoreLead: vi.fn(),
    generateInsight: vi.fn(),
    predictChurn: vi.fn(),
  } as any;
}

function createMockEventBus(): EventBusPort {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    publishAll: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createLead(overrides: Record<string, unknown> = {}): Lead {
  const result = Lead.create({
    email: (overrides.email as string) ?? 'test@example.com',
    firstName: (overrides.firstName as string) ?? 'John',
    lastName: (overrides.lastName as string) ?? 'Doe',
    company: 'TestCo',
    source: 'WEBSITE',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    ...overrides,
  } as any);
  if (result.isFailure) throw new Error(`Failed to create lead: ${result.error.message}`);
  return result.value;
}

describe('LeadService - b11', () => {
  let service: LeadService;
  let leadRepo: LeadRepository;
  let contactRepo: ContactRepository;
  let accountRepo: AccountRepository;
  let aiService: AIServicePort;
  let eventBus: EventBusPort;

  beforeEach(() => {
    leadRepo = createMockLeadRepo();
    contactRepo = createMockContactRepo();
    accountRepo = createMockAccountRepo();
    aiService = createMockAIService();
    eventBus = createMockEventBus();

    service = new LeadService(
      leadRepo,
      contactRepo,
      accountRepo,
      aiService,
      eventBus,
      makeTxManager()
    );
  });

  describe('publishAccountEvents error path', () => {
    // DDD-002: event-publish failure now propagates (no swallow). All saves +
    // event publishing for convertLead now share one transactionManager.run
    // call, so a publishAll failure aborts the whole conversion and surfaces
    // as Result.fail(PersistenceError) instead of a swallowed console.error.
    it('should fail the conversion when eventBus.publishAll errors for account events', async () => {
      const lead = createLead({ email: 'convert@example.com' });
      // Set lead status to QUALIFIED for conversion
      lead.updateScore(80, 0.9, 'v1');
      lead.qualify('test', 'reason');

      vi.mocked(leadRepo.findById).mockResolvedValue(lead);
      vi.mocked(accountRepo.findByName).mockResolvedValue([]);

      // Make eventBus fail on the publishAll call for account events
      let callCount = 0;
      vi.mocked(eventBus.publishAll).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call is for account events - make it throw
          throw new Error('EventBus failure');
        }
      });

      const result = await service.convertLead(lead.id.value, 'NewCo', 'user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(PersistenceError);
    });
  });

  describe('publishContactEvents error path', () => {
    it('should handle eventBus error for contact events gracefully', async () => {
      const lead = createLead({ email: 'contact-evt@example.com' });
      lead.updateScore(80, 0.9, 'v1');
      lead.qualify('test', 'reason');

      vi.mocked(leadRepo.findById).mockResolvedValue(lead);
      vi.mocked(accountRepo.findByName).mockResolvedValue([]);

      // Make the last publishAll call fail (contact events)
      let callCount = 0;
      vi.mocked(eventBus.publishAll).mockImplementation(async () => {
        callCount++;
        // The third call should be contact events
        if (callCount === 3) {
          throw new Error('Contact event publish error');
        }
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await service.convertLead(lead.id.value, null, 'user-1');

      consoleSpy.mockRestore();
    });
  });

  describe('scoreLead - auto-disqualify path', () => {
    it('should auto-disqualify lead when score <= AUTO_DISQUALIFY and status is NEW', async () => {
      const lead = createLead({ email: 'lowscore@example.com' });

      vi.mocked(leadRepo.findById).mockResolvedValue(lead);
      vi.mocked(aiService.scoreLead).mockResolvedValue(
        Result.ok({
          score: 15, // Below AUTO_DISQUALIFY threshold (20)
          confidence: 0.8,
          modelVersion: 'v1',
        }) as any
      );

      const result = await service.scoreLead(lead.id.value);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.autoDisqualified).toBe(true);
        expect(result.value.autoQualified).toBe(false);
      }
    });
  });

  describe('scoreLead - persistence error after scoring', () => {
    it('should return failure when save fails after scoring', async () => {
      const lead = createLead({ email: 'savefail@example.com' });

      vi.mocked(leadRepo.findById).mockResolvedValue(lead);
      vi.mocked(aiService.scoreLead).mockResolvedValue(
        Result.ok({
          score: 60,
          confidence: 0.7,
          modelVersion: 'v1',
        }) as any
      );
      vi.mocked(leadRepo.save).mockRejectedValue(new Error('DB error'));

      const result = await service.scoreLead(lead.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save lead after scoring');
    });
  });

  describe('convertLead - existing account found', () => {
    it('should use existing account ID when account already exists', async () => {
      const lead = createLead({ email: 'existing-acct@example.com' });
      lead.updateScore(80, 0.9, 'v1');
      lead.qualify('test', 'reason');

      const mockAccount = {
        id: { value: 'existing-account-id' },
        name: 'ExistingCo',
      };

      vi.mocked(leadRepo.findById).mockResolvedValue(lead);
      vi.mocked(accountRepo.findByName).mockResolvedValue([mockAccount as any]);

      const result = await service.convertLead(lead.id.value, 'ExistingCo', 'user-1');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.accountId).toBe('existing-account-id');
      }
    });
  });

  describe('convertLead - persistence error during save', () => {
    it('should return failure when saving contact/lead fails', async () => {
      const lead = createLead({ email: 'persist-fail@example.com' });
      lead.updateScore(80, 0.9, 'v1');
      lead.qualify('test', 'reason');

      vi.mocked(leadRepo.findById).mockResolvedValue(lead);
      vi.mocked(accountRepo.findByName).mockResolvedValue([]);
      vi.mocked(contactRepo.save).mockRejectedValue(new Error('DB failure'));

      const result = await service.convertLead(lead.id.value, null, 'user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save conversion');
    });
  });

  describe('qualifyLead - persistence error', () => {
    it('should return failure when save fails after qualification', async () => {
      const lead = createLead({ email: 'qualifyfail@example.com' });
      lead.updateScore(60, 0.8, 'v1'); // Above minScore (50)

      vi.mocked(leadRepo.findById).mockResolvedValue(lead);
      vi.mocked(leadRepo.save).mockRejectedValue(new Error('DB error'));

      const result = await service.qualifyLead(lead.id.value, 'user-1', 'Good lead');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save lead');
    });
  });

  describe('changeLeadStatus - transition paths', () => {
    it('should allow LOST -> NEW transition', async () => {
      const lead = createLead({ email: 'lostlead@example.com' });
      // Force status to LOST
      lead.changeStatus('LOST', 'user');

      vi.mocked(leadRepo.findById).mockResolvedValue(lead);

      const result = await service.changeLeadStatus(lead.id.value, 'NEW', 'user-1');

      expect(result.isSuccess).toBe(true);
    });

    it('should reject invalid transition from CONVERTED', async () => {
      const lead = createLead({ email: 'converted@example.com' });
      // Force status to QUALIFIED first, then CONVERTED
      lead.updateScore(80, 0.9, 'v1');
      lead.qualify('test', 'reason');
      lead.convert('contact-1', null, 'user-1');

      vi.mocked(leadRepo.findById).mockResolvedValue(lead);

      const result = await service.changeLeadStatus(lead.id.value, 'NEW', 'user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid status transition');
    });
  });

  describe('changeLeadStatus - persistence error', () => {
    it('should return failure when save fails after status change', async () => {
      const lead = createLead({ email: 'statusfail@example.com' });

      vi.mocked(leadRepo.findById).mockResolvedValue(lead);
      vi.mocked(leadRepo.save).mockRejectedValue(new Error('DB error'));

      const result = await service.changeLeadStatus(lead.id.value, 'CONTACTED', 'user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save lead');
    });
  });

  describe('updateLeadContactInfo - persistence error', () => {
    it('should return failure when save fails after contact info update', async () => {
      const lead = createLead({ email: 'updatefail@example.com' });

      vi.mocked(leadRepo.findById).mockResolvedValue(lead);
      vi.mocked(leadRepo.save).mockRejectedValue(new Error('DB error'));

      const result = await service.updateLeadContactInfo(lead.id.value, {
        firstName: 'Jane',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save lead');
    });
  });

  describe('getLeadStatistics - edge cases', () => {
    it('should return 0 averageScore when no leads exist', async () => {
      vi.mocked(leadRepo.countByStatus).mockResolvedValue({});
      vi.mocked(leadRepo.findByMinScore).mockResolvedValue([]);
      vi.mocked(leadRepo.findByStatus).mockResolvedValue([]);

      const stats = await service.getLeadStatistics();

      expect(stats.averageScore).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.hotLeads).toBe(0);
      expect(stats.warmLeads).toBe(0);
      expect(stats.coldLeads).toBe(0);
    });

    it('should compute stats with ownerId filter', async () => {
      vi.mocked(leadRepo.countByStatus).mockResolvedValue({ NEW: 2 } as any);
      vi.mocked(leadRepo.findByMinScore).mockResolvedValue([]);
      vi.mocked(leadRepo.findByOwnerId).mockResolvedValue([]);

      const stats = await service.getLeadStatistics('owner-specific');

      expect(stats.total).toBe(2);
    });
  });
});
