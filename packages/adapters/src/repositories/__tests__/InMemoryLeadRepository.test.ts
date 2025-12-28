/**
 * InMemoryLeadRepository Integration Tests
 *
 * Tests the in-memory implementation of the LeadRepository interface.
 * These tests verify repository operations work correctly with domain entities.
 *
 * Coverage target: >90% for repository layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryLeadRepository } from '../InMemoryLeadRepository';
import { Lead, Email, LeadId } from '@intelliflow/domain';

describe('InMemoryLeadRepository', () => {
  let repository: InMemoryLeadRepository;

  beforeEach(() => {
    repository = new InMemoryLeadRepository();
    repository.clear();
  });

  const createTestLead = (email: string, ownerId: string = 'owner-123') => {
    return Lead.create({
      email,
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Inc',
      source: 'WEBSITE',
      ownerId,
    });
  };

  describe('save()', () => {
    it('should save a new lead', async () => {
      const leadResult = createTestLead('john@example.com');
      const lead = leadResult.value;

      await repository.save(lead);

      const retrieved = await repository.findById(lead.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.email.value).toBe('john@example.com');
    });

    it('should update an existing lead', async () => {
      const leadResult = createTestLead('john@example.com');
      const lead = leadResult.value;

      await repository.save(lead);

      // Update the lead
      lead.updateContactInfo({ firstName: 'Jane' });
      await repository.save(lead);

      const retrieved = await repository.findById(lead.id);
      expect(retrieved?.firstName).toBe('Jane');
    });

    it('should persist multiple leads', async () => {
      const lead1 = createTestLead('lead1@example.com').value;
      const lead2 = createTestLead('lead2@example.com').value;
      const lead3 = createTestLead('lead3@example.com').value;

      await repository.save(lead1);
      await repository.save(lead2);
      await repository.save(lead3);

      const all = repository.getAll();
      expect(all).toHaveLength(3);
    });
  });

  describe('findById()', () => {
    it('should find a lead by ID', async () => {
      const leadResult = createTestLead('john@example.com');
      const lead = leadResult.value;
      await repository.save(lead);

      const found = await repository.findById(lead.id);

      expect(found).not.toBeNull();
      expect(found?.id.equals(lead.id)).toBe(true);
      expect(found?.email.value).toBe('john@example.com');
    });

    it('should return null for non-existent ID', async () => {
      const nonExistentId = LeadId.generate();
      const found = await repository.findById(nonExistentId);

      expect(found).toBeNull();
    });
  });

  describe('findByEmail()', () => {
    it('should find a lead by email', async () => {
      const leadResult = createTestLead('unique@example.com');
      const lead = leadResult.value;
      await repository.save(lead);

      const email = Email.create('unique@example.com').value;
      const found = await repository.findByEmail(email);

      expect(found).not.toBeNull();
      expect(found?.email.value).toBe('unique@example.com');
    });

    it('should return null for non-existent email', async () => {
      const email = Email.create('nonexistent@example.com').value;
      const found = await repository.findByEmail(email);

      expect(found).toBeNull();
    });

    it('should find lead case-insensitively', async () => {
      const leadResult = createTestLead('Test@Example.COM');
      const lead = leadResult.value;
      await repository.save(lead);

      // Email.create normalizes to lowercase
      const email = Email.create('test@example.com').value;
      const found = await repository.findByEmail(email);

      expect(found).not.toBeNull();
    });
  });

  describe('findByOwnerId()', () => {
    it('should find all leads for an owner', async () => {
      const lead1 = createTestLead('lead1@example.com', 'owner-1').value;
      const lead2 = createTestLead('lead2@example.com', 'owner-1').value;
      const lead3 = createTestLead('lead3@example.com', 'owner-2').value;

      await repository.save(lead1);
      await repository.save(lead2);
      await repository.save(lead3);

      const owner1Leads = await repository.findByOwnerId('owner-1');
      const owner2Leads = await repository.findByOwnerId('owner-2');

      expect(owner1Leads).toHaveLength(2);
      expect(owner2Leads).toHaveLength(1);
    });

    it('should return empty array for owner with no leads', async () => {
      const leads = await repository.findByOwnerId('nonexistent-owner');
      expect(leads).toHaveLength(0);
    });

    it('should return leads sorted by createdAt descending', async () => {
      const lead1 = createTestLead('lead1@example.com', 'owner-1').value;
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      const lead2 = createTestLead('lead2@example.com', 'owner-1').value;

      await repository.save(lead1);
      await repository.save(lead2);

      const leads = await repository.findByOwnerId('owner-1');

      // Most recent first
      expect(leads[0].email.value).toBe('lead2@example.com');
      expect(leads[1].email.value).toBe('lead1@example.com');
    });
  });

  describe('findByStatus()', () => {
    it('should find leads by status', async () => {
      const lead1 = createTestLead('lead1@example.com').value;
      const lead2 = createTestLead('lead2@example.com').value;

      lead2.changeStatus('CONTACTED', 'user-123');

      await repository.save(lead1);
      await repository.save(lead2);

      const newLeads = await repository.findByStatus('NEW');
      const contactedLeads = await repository.findByStatus('CONTACTED');

      expect(newLeads).toHaveLength(1);
      expect(contactedLeads).toHaveLength(1);
    });

    it('should filter by owner when provided', async () => {
      const lead1 = createTestLead('lead1@example.com', 'owner-1').value;
      const lead2 = createTestLead('lead2@example.com', 'owner-2').value;

      await repository.save(lead1);
      await repository.save(lead2);

      const owner1NewLeads = await repository.findByStatus('NEW', 'owner-1');
      const allNewLeads = await repository.findByStatus('NEW');

      expect(owner1NewLeads).toHaveLength(1);
      expect(allNewLeads).toHaveLength(2);
    });
  });

  describe('findByMinScore()', () => {
    it('should find leads with score at or above minimum', async () => {
      const lead1 = createTestLead('lead1@example.com').value;
      const lead2 = createTestLead('lead2@example.com').value;
      const lead3 = createTestLead('lead3@example.com').value;

      lead1.updateScore(85, 0.9, 'test-v1');
      lead2.updateScore(50, 0.8, 'test-v1');
      lead3.updateScore(30, 0.7, 'test-v1');

      await repository.save(lead1);
      await repository.save(lead2);
      await repository.save(lead3);

      const hotLeads = await repository.findByMinScore(80);
      const warmLeads = await repository.findByMinScore(50);
      const allLeads = await repository.findByMinScore(0);

      expect(hotLeads).toHaveLength(1);
      expect(warmLeads).toHaveLength(2);
      expect(allLeads).toHaveLength(3);
    });

    it('should return leads sorted by score descending', async () => {
      const lead1 = createTestLead('lead1@example.com').value;
      const lead2 = createTestLead('lead2@example.com').value;
      const lead3 = createTestLead('lead3@example.com').value;

      lead1.updateScore(60, 0.9, 'test-v1');
      lead2.updateScore(90, 0.8, 'test-v1');
      lead3.updateScore(75, 0.7, 'test-v1');

      await repository.save(lead1);
      await repository.save(lead2);
      await repository.save(lead3);

      const leads = await repository.findByMinScore(50);

      expect(leads[0].score.value).toBe(90);
      expect(leads[1].score.value).toBe(75);
      expect(leads[2].score.value).toBe(60);
    });

    it('should filter by owner when provided', async () => {
      const lead1 = createTestLead('lead1@example.com', 'owner-1').value;
      const lead2 = createTestLead('lead2@example.com', 'owner-2').value;

      lead1.updateScore(85, 0.9, 'test-v1');
      lead2.updateScore(85, 0.9, 'test-v1');

      await repository.save(lead1);
      await repository.save(lead2);

      const owner1HotLeads = await repository.findByMinScore(80, 'owner-1');
      const allHotLeads = await repository.findByMinScore(80);

      expect(owner1HotLeads).toHaveLength(1);
      expect(allHotLeads).toHaveLength(2);
    });
  });

  describe('delete()', () => {
    it('should delete a lead by ID', async () => {
      const lead = createTestLead('john@example.com').value;
      await repository.save(lead);

      expect(await repository.findById(lead.id)).not.toBeNull();

      await repository.delete(lead.id);

      expect(await repository.findById(lead.id)).toBeNull();
    });

    it('should not throw when deleting non-existent lead', async () => {
      const nonExistentId = LeadId.generate();

      await expect(repository.delete(nonExistentId)).resolves.not.toThrow();
    });
  });

  describe('existsByEmail()', () => {
    it('should return true for existing email', async () => {
      const lead = createTestLead('existing@example.com').value;
      await repository.save(lead);

      const email = Email.create('existing@example.com').value;
      const exists = await repository.existsByEmail(email);

      expect(exists).toBe(true);
    });

    it('should return false for non-existing email', async () => {
      const email = Email.create('nonexistent@example.com').value;
      const exists = await repository.existsByEmail(email);

      expect(exists).toBe(false);
    });
  });

  describe('countByStatus()', () => {
    it('should count leads by status', async () => {
      const lead1 = createTestLead('lead1@example.com').value;
      const lead2 = createTestLead('lead2@example.com').value;
      const lead3 = createTestLead('lead3@example.com').value;
      const lead4 = createTestLead('lead4@example.com').value;

      lead2.changeStatus('CONTACTED', 'user-123');
      lead3.changeStatus('CONTACTED', 'user-123');
      lead4.qualify('user-123', 'Good fit');

      await repository.save(lead1);
      await repository.save(lead2);
      await repository.save(lead3);
      await repository.save(lead4);

      const counts = await repository.countByStatus();

      expect(counts['NEW']).toBe(1);
      expect(counts['CONTACTED']).toBe(2);
      expect(counts['QUALIFIED']).toBe(1);
    });

    it('should filter by owner when provided', async () => {
      const lead1 = createTestLead('lead1@example.com', 'owner-1').value;
      const lead2 = createTestLead('lead2@example.com', 'owner-2').value;

      await repository.save(lead1);
      await repository.save(lead2);

      const owner1Counts = await repository.countByStatus('owner-1');
      const allCounts = await repository.countByStatus();

      expect(owner1Counts['NEW']).toBe(1);
      expect(allCounts['NEW']).toBe(2);
    });

    it('should return empty object when no leads', async () => {
      const counts = await repository.countByStatus();
      expect(Object.keys(counts)).toHaveLength(0);
    });
  });

  describe('findForScoring()', () => {
    it('should find leads with zero score', async () => {
      const lead1 = createTestLead('lead1@example.com').value;
      const lead2 = createTestLead('lead2@example.com').value;

      lead2.updateScore(50, 0.8, 'test-v1');

      await repository.save(lead1);
      await repository.save(lead2);

      const leadsForScoring = await repository.findForScoring(10);

      expect(leadsForScoring).toHaveLength(1);
      expect(leadsForScoring[0].score.value).toBe(0);
    });

    it('should limit results', async () => {
      for (let i = 0; i < 10; i++) {
        const lead = createTestLead(`lead${i}@example.com`).value;
        await repository.save(lead);
      }

      const leads = await repository.findForScoring(5);

      expect(leads).toHaveLength(5);
    });

    it('should sort by createdAt ascending', async () => {
      const lead1 = createTestLead('older@example.com').value;
      await new Promise((resolve) => setTimeout(resolve, 10));
      const lead2 = createTestLead('newer@example.com').value;

      await repository.save(lead1);
      await repository.save(lead2);

      const leads = await repository.findForScoring(10);

      // Oldest first
      expect(leads[0].email.value).toBe('older@example.com');
      expect(leads[1].email.value).toBe('newer@example.com');
    });
  });

  describe('Test Helper Methods', () => {
    it('clear() should remove all leads', async () => {
      await repository.save(createTestLead('lead1@example.com').value);
      await repository.save(createTestLead('lead2@example.com').value);

      expect(repository.getAll()).toHaveLength(2);

      repository.clear();

      expect(repository.getAll()).toHaveLength(0);
    });

    it('getAll() should return all leads', async () => {
      const lead1 = createTestLead('lead1@example.com').value;
      const lead2 = createTestLead('lead2@example.com').value;

      await repository.save(lead1);
      await repository.save(lead2);

      const all = repository.getAll();

      expect(all).toHaveLength(2);
      expect(all.map((l) => l.email.value)).toContain('lead1@example.com');
      expect(all.map((l) => l.email.value)).toContain('lead2@example.com');
    });
  });
});
