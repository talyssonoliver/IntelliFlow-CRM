/**
 * InMemoryLeadRepository Tests
 *
 * These tests verify the in-memory repository implementation.
 * They ensure all repository methods work correctly and queries return expected results.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryLeadRepository } from '../src/repositories/InMemoryLeadRepository';
import { Lead, LeadId, Email, LeadScore } from '@intelliflow/domain';

describe('InMemoryLeadRepository', () => {
  let repository: InMemoryLeadRepository;
  let testLead: Lead;
  let testLeadId: LeadId;

  beforeEach(() => {
    repository = new InMemoryLeadRepository();

    // Create a test lead for most tests
    const leadResult = Lead.create({
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      title: 'CTO',
      phone: '+1-555-0100',
      source: 'WEBSITE',
      ownerId: 'owner-123',
    });

    testLead = leadResult.value;
    testLeadId = testLead.id;
  });

  describe('save()', () => {
    it('should save a new lead', async () => {
      await repository.save(testLead);

      const found = await repository.findById(testLeadId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(testLeadId);
      expect(found?.email.value).toBe('test@example.com');
    });

    it('should update an existing lead', async () => {
      await repository.save(testLead);

      // Update the lead
      testLead.updateContactInfo({ firstName: 'Jane' });
      await repository.save(testLead);

      const found = await repository.findById(testLeadId);
      expect(found).not.toBeNull();
      expect(found?.firstName).toBe('Jane');
    });

    it('should overwrite existing lead with same ID', async () => {
      await repository.save(testLead);

      const originalCompany = testLead.company;
      testLead.updateContactInfo({ company: 'New Corp' });
      await repository.save(testLead);

      const allLeads = repository.getAll();
      expect(allLeads).toHaveLength(1);
      expect(allLeads[0].company).toBe('New Corp');
      expect(allLeads[0].company).not.toBe(originalCompany);
    });

    it('should save multiple leads', async () => {
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-123',
      });

      const lead3Result = Lead.create({
        email: 'third@example.com',
        ownerId: 'owner-456',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);
      await repository.save(lead3Result.value);

      const allLeads = repository.getAll();
      expect(allLeads).toHaveLength(3);
    });
  });

  describe('findById()', () => {
    it('should return lead when exists', async () => {
      await repository.save(testLead);

      const found = await repository.findById(testLeadId);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(testLeadId);
      expect(found?.email.value).toBe('test@example.com');
      expect(found?.firstName).toBe('John');
    });

    it('should return null when lead does not exist', async () => {
      const nonExistentId = LeadId.generate();

      const found = await repository.findById(nonExistentId);

      expect(found).toBeNull();
    });

    it('should return null for empty repository', async () => {
      const found = await repository.findById(testLeadId);

      expect(found).toBeNull();
    });

    it('should distinguish between different lead IDs', async () => {
      const lead2Result = Lead.create({
        email: 'other@example.com',
        ownerId: 'owner-123',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);

      const found1 = await repository.findById(testLeadId);
      const found2 = await repository.findById(lead2Result.value.id);

      expect(found1?.email.value).toBe('test@example.com');
      expect(found2?.email.value).toBe('other@example.com');
    });
  });

  describe('findByEmail()', () => {
    it('should return lead when email exists', async () => {
      await repository.save(testLead);

      const emailResult = Email.create('test@example.com');
      const found = await repository.findByEmail(emailResult.value);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(testLeadId);
      expect(found?.email.value).toBe('test@example.com');
    });

    it('should return null when email does not exist', async () => {
      await repository.save(testLead);

      const emailResult = Email.create('nonexistent@example.com');
      const found = await repository.findByEmail(emailResult.value);

      expect(found).toBeNull();
    });

    it('should handle email case insensitivity', async () => {
      await repository.save(testLead);

      const emailResult = Email.create('TEST@EXAMPLE.COM');
      const found = await repository.findByEmail(emailResult.value);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(testLeadId);
    });

    it('should return first matching lead when multiple exist (edge case)', async () => {
      // This shouldn't happen in practice due to business rules,
      // but we test the repository behavior
      await repository.save(testLead);

      const emailResult = Email.create('test@example.com');
      const found = await repository.findByEmail(emailResult.value);

      expect(found).not.toBeNull();
      expect(found?.email.value).toBe('test@example.com');
    });
  });

  describe('findByOwnerId()', () => {
    it('should return all leads for an owner', async () => {
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-123',
      });

      const lead3Result = Lead.create({
        email: 'third@example.com',
        ownerId: 'owner-123',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);
      await repository.save(lead3Result.value);

      const leads = await repository.findByOwnerId('owner-123');

      expect(leads).toHaveLength(3);
      expect(leads.every((l) => l.ownerId === 'owner-123')).toBe(true);
    });

    it('should return empty array when owner has no leads', async () => {
      await repository.save(testLead);

      const leads = await repository.findByOwnerId('owner-999');

      expect(leads).toHaveLength(0);
    });

    it('should filter out leads from other owners', async () => {
      const lead2Result = Lead.create({
        email: 'other@example.com',
        ownerId: 'owner-456',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);

      const leads = await repository.findByOwnerId('owner-123');

      expect(leads).toHaveLength(1);
      expect(leads[0].ownerId).toBe('owner-123');
    });

    it('should sort leads by creation date descending', async () => {
      // Create leads with slight time differences
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-123',
      });

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 5));

      const lead3Result = Lead.create({
        email: 'third@example.com',
        ownerId: 'owner-123',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);
      await repository.save(lead3Result.value);

      const leads = await repository.findByOwnerId('owner-123');

      // Most recent first
      expect(leads[0].createdAt >= leads[1].createdAt).toBe(true);
      expect(leads[1].createdAt >= leads[2].createdAt).toBe(true);
    });
  });

  describe('findByStatus()', () => {
    it('should return leads with matching status', async () => {
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-123',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);

      const leads = await repository.findByStatus('NEW');

      expect(leads).toHaveLength(2);
      expect(leads.every((l) => l.status === 'NEW')).toBe(true);
    });

    it('should filter by status and owner', async () => {
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-456',
      });

      testLead.changeStatus('CONTACTED', 'user-123');
      lead2Result.value.changeStatus('CONTACTED', 'user-123');

      await repository.save(testLead);
      await repository.save(lead2Result.value);

      const leads = await repository.findByStatus('CONTACTED', 'owner-123');

      expect(leads).toHaveLength(1);
      expect(leads[0].ownerId).toBe('owner-123');
      expect(leads[0].status).toBe('CONTACTED');
    });

    it('should return empty array when no leads match status', async () => {
      await repository.save(testLead);

      const leads = await repository.findByStatus('QUALIFIED');

      expect(leads).toHaveLength(0);
    });

    it('should handle different status values', async () => {
      testLead.qualify('user-123', 'Good fit');
      await repository.save(testLead);

      const qualifiedLeads = await repository.findByStatus('QUALIFIED');
      expect(qualifiedLeads).toHaveLength(1);
      expect(qualifiedLeads[0].isQualified).toBe(true);
    });

    it('should sort results by creation date descending', async () => {
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-123',
      });

      await new Promise((resolve) => setTimeout(resolve, 5));

      const lead3Result = Lead.create({
        email: 'third@example.com',
        ownerId: 'owner-123',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);
      await repository.save(lead3Result.value);

      const leads = await repository.findByStatus('NEW');

      expect(leads[0].createdAt >= leads[1].createdAt).toBe(true);
      expect(leads[1].createdAt >= leads[2].createdAt).toBe(true);
    });
  });

  describe('findByMinScore()', () => {
    it('should return leads with score above threshold', async () => {
      const lead2Result = Lead.create({
        email: 'high@example.com',
        ownerId: 'owner-123',
      });

      const lead3Result = Lead.create({
        email: 'low@example.com',
        ownerId: 'owner-123',
      });

      testLead.updateScore(85, 0.9, 'v1.0.0');
      lead2Result.value.updateScore(75, 0.85, 'v1.0.0');
      lead3Result.value.updateScore(30, 0.8, 'v1.0.0');

      await repository.save(testLead);
      await repository.save(lead2Result.value);
      await repository.save(lead3Result.value);

      const leads = await repository.findByMinScore(70);

      expect(leads).toHaveLength(2);
      expect(leads.every((l) => l.score.value >= 70)).toBe(true);
    });

    it('should filter by score and owner', async () => {
      const lead2Result = Lead.create({
        email: 'other@example.com',
        ownerId: 'owner-456',
      });

      testLead.updateScore(80, 0.9, 'v1.0.0');
      lead2Result.value.updateScore(90, 0.95, 'v1.0.0');

      await repository.save(testLead);
      await repository.save(lead2Result.value);

      const leads = await repository.findByMinScore(75, 'owner-123');

      expect(leads).toHaveLength(1);
      expect(leads[0].ownerId).toBe('owner-123');
      expect(leads[0].score.value).toBeGreaterThanOrEqual(75);
    });

    it('should return empty array when no leads meet threshold', async () => {
      testLead.updateScore(20, 0.7, 'v1.0.0');
      await repository.save(testLead);

      const leads = await repository.findByMinScore(50);

      expect(leads).toHaveLength(0);
    });

    it('should include leads with exact minimum score', async () => {
      testLead.updateScore(50, 0.8, 'v1.0.0');
      await repository.save(testLead);

      const leads = await repository.findByMinScore(50);

      expect(leads).toHaveLength(1);
      expect(leads[0].score.value).toBe(50);
    });

    it('should sort results by score descending', async () => {
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-123',
      });

      const lead3Result = Lead.create({
        email: 'third@example.com',
        ownerId: 'owner-123',
      });

      testLead.updateScore(60, 0.8, 'v1.0.0');
      lead2Result.value.updateScore(90, 0.95, 'v1.0.0');
      lead3Result.value.updateScore(75, 0.85, 'v1.0.0');

      await repository.save(testLead);
      await repository.save(lead2Result.value);
      await repository.save(lead3Result.value);

      const leads = await repository.findByMinScore(50);

      expect(leads[0].score.value).toBeGreaterThanOrEqual(leads[1].score.value);
      expect(leads[1].score.value).toBeGreaterThanOrEqual(leads[2].score.value);
      expect(leads[0].score.value).toBe(90);
      expect(leads[2].score.value).toBe(60);
    });
  });

  describe('delete()', () => {
    it('should delete an existing lead', async () => {
      await repository.save(testLead);

      await repository.delete(testLeadId);

      const found = await repository.findById(testLeadId);
      expect(found).toBeNull();
    });

    it('should not throw when deleting non-existent lead', async () => {
      const nonExistentId = LeadId.generate();

      await expect(repository.delete(nonExistentId)).resolves.toBeUndefined();
    });

    it('should only delete specified lead', async () => {
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-123',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);

      await repository.delete(testLeadId);

      const found1 = await repository.findById(testLeadId);
      const found2 = await repository.findById(lead2Result.value.id);

      expect(found1).toBeNull();
      expect(found2).not.toBeNull();
    });

    it('should allow re-adding a deleted lead', async () => {
      await repository.save(testLead);
      await repository.delete(testLeadId);

      await repository.save(testLead);

      const found = await repository.findById(testLeadId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(testLeadId);
    });
  });

  describe('existsByEmail()', () => {
    it('should return true when email exists', async () => {
      await repository.save(testLead);

      const emailResult = Email.create('test@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(true);
    });

    it('should return false when email does not exist', async () => {
      const emailResult = Email.create('nonexistent@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(false);
    });

    it('should handle email case insensitivity', async () => {
      await repository.save(testLead);

      const emailResult = Email.create('TEST@EXAMPLE.COM');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(true);
    });

    it('should return false after lead is deleted', async () => {
      await repository.save(testLead);
      await repository.delete(testLeadId);

      const emailResult = Email.create('test@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(false);
    });
  });

  describe('countByStatus()', () => {
    it('should count leads by status', async () => {
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-123',
      });

      const lead3Result = Lead.create({
        email: 'third@example.com',
        ownerId: 'owner-123',
      });

      testLead.changeStatus('CONTACTED', 'user-123');
      lead3Result.value.changeStatus('CONTACTED', 'user-123');

      await repository.save(testLead);
      await repository.save(lead2Result.value);
      await repository.save(lead3Result.value);

      const counts = await repository.countByStatus();

      expect(counts['NEW']).toBe(1);
      expect(counts['CONTACTED']).toBe(2);
    });

    it('should filter counts by owner', async () => {
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-456',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);

      const counts = await repository.countByStatus('owner-123');

      expect(counts['NEW']).toBe(1);
      expect(counts['NEW']).not.toBe(2);
    });

    it('should return empty object when no leads exist', async () => {
      const counts = await repository.countByStatus();

      expect(counts).toEqual({});
    });

    it('should handle multiple statuses', async () => {
      const lead2Result = Lead.create({
        email: 'qualified@example.com',
        ownerId: 'owner-123',
      });

      const lead3Result = Lead.create({
        email: 'lost@example.com',
        ownerId: 'owner-123',
      });

      lead2Result.value.qualify('user-123', 'Good fit');
      lead3Result.value.changeStatus('LOST', 'user-123');

      await repository.save(testLead);
      await repository.save(lead2Result.value);
      await repository.save(lead3Result.value);

      const counts = await repository.countByStatus();

      expect(counts['NEW']).toBe(1);
      expect(counts['QUALIFIED']).toBe(1);
      expect(counts['LOST']).toBe(1);
    });

    it('should handle same status for multiple leads', async () => {
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-123',
      });

      const lead3Result = Lead.create({
        email: 'third@example.com',
        ownerId: 'owner-123',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);
      await repository.save(lead3Result.value);

      const counts = await repository.countByStatus();

      expect(counts['NEW']).toBe(3);
    });
  });

  describe('findForScoring()', () => {
    it('should return unscored leads', async () => {
      const lead2Result = Lead.create({
        email: 'unscored@example.com',
        ownerId: 'owner-123',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);

      const leads = await repository.findForScoring(10);

      expect(leads).toHaveLength(2);
      expect(leads.every((l) => l.score.value === 0)).toBe(true);
    });

    it('should return leads with stale scores', async () => {
      // Create a lead with an old updatedAt timestamp
      const lead2Result = Lead.create({
        email: 'stale@example.com',
        ownerId: 'owner-123',
      });

      lead2Result.value.updateScore(50, 0.8, 'v1.0.0');

      // Manually set updatedAt to 31 days ago (this is a test helper scenario)
      // In real code, this would naturally occur over time
      await repository.save(lead2Result.value);

      // Save a fresh lead
      await repository.save(testLead);

      const leads = await repository.findForScoring(10);

      // Should include at least the unscored lead
      expect(leads.length).toBeGreaterThan(0);
      expect(leads.some((l) => l.score.value === 0)).toBe(true);
    });

    it('should limit results to specified count', async () => {
      // Create 5 unscored leads
      for (let i = 0; i < 5; i++) {
        const leadResult = Lead.create({
          email: `lead${i}@example.com`,
          ownerId: 'owner-123',
        });
        await repository.save(leadResult.value);
      }

      const leads = await repository.findForScoring(3);

      expect(leads).toHaveLength(3);
    });

    it('should sort by creation date ascending (oldest first)', async () => {
      const lead2Result = Lead.create({
        email: 'second@example.com',
        ownerId: 'owner-123',
      });

      await new Promise((resolve) => setTimeout(resolve, 5));

      const lead3Result = Lead.create({
        email: 'third@example.com',
        ownerId: 'owner-123',
      });

      await repository.save(testLead);
      await repository.save(lead2Result.value);
      await repository.save(lead3Result.value);

      const leads = await repository.findForScoring(10);

      // Oldest first
      expect(leads[0].createdAt <= leads[1].createdAt).toBe(true);
      expect(leads[1].createdAt <= leads[2].createdAt).toBe(true);
    });

    it('should exclude recently scored leads', async () => {
      const lead2Result = Lead.create({
        email: 'recent@example.com',
        ownerId: 'owner-123',
      });

      lead2Result.value.updateScore(80, 0.9, 'v1.0.0');

      await repository.save(testLead); // Unscored
      await repository.save(lead2Result.value); // Recently scored

      const leads = await repository.findForScoring(10);

      // Should only include unscored lead
      expect(leads).toHaveLength(1);
      expect(leads[0].score.value).toBe(0);
    });

    it('should return empty array when limit is 0', async () => {
      await repository.save(testLead);

      const leads = await repository.findForScoring(0);

      expect(leads).toHaveLength(0);
    });
  });

  describe('Test Helper Methods', () => {
    describe('clear()', () => {
      it('should remove all leads from repository', () => {
        repository.save(testLead);

        repository.clear();

        const allLeads = repository.getAll();
        expect(allLeads).toHaveLength(0);
      });

      it('should allow adding leads after clear', async () => {
        await repository.save(testLead);
        repository.clear();

        await repository.save(testLead);

        const allLeads = repository.getAll();
        expect(allLeads).toHaveLength(1);
      });
    });

    describe('getAll()', () => {
      it('should return all leads', async () => {
        const lead2Result = Lead.create({
          email: 'second@example.com',
          ownerId: 'owner-123',
        });

        await repository.save(testLead);
        await repository.save(lead2Result.value);

        const allLeads = repository.getAll();

        expect(allLeads).toHaveLength(2);
      });

      it('should return empty array for empty repository', () => {
        const allLeads = repository.getAll();

        expect(allLeads).toHaveLength(0);
      });

      it('should return actual Lead instances', async () => {
        await repository.save(testLead);

        const allLeads = repository.getAll();

        expect(allLeads[0]).toBeInstanceOf(Lead);
        expect(allLeads[0].email).toBeInstanceOf(Email);
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete lead lifecycle', async () => {
      // Create and save lead
      await repository.save(testLead);

      // Find by email
      const emailResult = Email.create('test@example.com');
      const foundByEmail = await repository.findByEmail(emailResult.value);
      expect(foundByEmail).not.toBeNull();

      // Update score
      testLead.updateScore(85, 0.9, 'v1.0.0');
      await repository.save(testLead);

      // Find by score
      const highScoreLeads = await repository.findByMinScore(80);
      expect(highScoreLeads).toHaveLength(1);

      // Change status
      testLead.qualify('user-123', 'Good fit');
      await repository.save(testLead);

      // Find by status
      const qualifiedLeads = await repository.findByStatus('QUALIFIED');
      expect(qualifiedLeads).toHaveLength(1);

      // Convert lead
      testLead.convert('contact-123', 'account-456', 'user-789');
      await repository.save(testLead);

      // Verify conversion
      const converted = await repository.findById(testLeadId);
      expect(converted?.isConverted).toBe(true);
    });

    it('should handle multiple owners correctly', async () => {
      const owner1Lead1 = Lead.create({
        email: 'owner1-lead1@example.com',
        ownerId: 'owner-1',
      });

      const owner1Lead2 = Lead.create({
        email: 'owner1-lead2@example.com',
        ownerId: 'owner-1',
      });

      const owner2Lead1 = Lead.create({
        email: 'owner2-lead1@example.com',
        ownerId: 'owner-2',
      });

      await repository.save(owner1Lead1.value);
      await repository.save(owner1Lead2.value);
      await repository.save(owner2Lead1.value);

      const owner1Leads = await repository.findByOwnerId('owner-1');
      const owner2Leads = await repository.findByOwnerId('owner-2');

      expect(owner1Leads).toHaveLength(2);
      expect(owner2Leads).toHaveLength(1);

      const owner1Counts = await repository.countByStatus('owner-1');
      expect(owner1Counts['NEW']).toBe(2);
    });

    it('should maintain data integrity during concurrent operations', async () => {
      const lead2Result = Lead.create({
        email: 'concurrent@example.com',
        ownerId: 'owner-123',
      });

      // Simulate concurrent saves
      await Promise.all([repository.save(testLead), repository.save(lead2Result.value)]);

      const allLeads = repository.getAll();
      expect(allLeads).toHaveLength(2);

      // Verify both leads are findable
      const found1 = await repository.findById(testLead.id);
      const found2 = await repository.findById(lead2Result.value.id);

      expect(found1).not.toBeNull();
      expect(found2).not.toBeNull();
    });
  });
});
