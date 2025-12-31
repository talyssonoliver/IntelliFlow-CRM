/**
 * Lead Contract Integration Tests
 *
 * Tests that verify the lead contract/schema using real seeded database
 * These tests ensure the actual database schema matches expected types
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { testPrisma, SEED_IDS, getSeedData, verifySeedData } from '../../test/integration-setup';
import type { Lead } from '@prisma/client';

describe('Lead Contract - Integration Tests', () => {
  beforeAll(async () => {
    await verifySeedData();
  });

  describe('Schema Validation', () => {
    it('should have all required fields including tenantId', async () => {
      const lead = await getSeedData.lead(SEED_IDS.leads.sarahMiller);

      // Verify all required fields exist
      expect(lead.id).toBeDefined();
      expect(lead.email).toBeDefined();
      expect(lead.tenantId).toBeDefined(); // ✅ tenantId from seed data
      expect(lead.firstName).toBeDefined();
      expect(lead.lastName).toBeDefined();
      expect(lead.company).toBeDefined();
      expect(lead.status).toBeDefined();
      expect(lead.score).toBeDefined();
      expect(lead.ownerId).toBeDefined();
      expect(lead.createdAt).toBeInstanceOf(Date);
      expect(lead.updatedAt).toBeInstanceOf(Date);
    });

    it('should have correct data types', async () => {
      const lead = await getSeedData.lead(SEED_IDS.leads.davidChen);

      expect(typeof lead.id).toBe('string');
      expect(typeof lead.email).toBe('string');
      expect(typeof lead.tenantId).toBe('string');
      expect(typeof lead.score).toBe('number');
      expect(lead.createdAt).toBeInstanceOf(Date);
      expect(lead.updatedAt).toBeInstanceOf(Date);
    });

    it('should have valid enum values', async () => {
      const lead = await getSeedData.lead(SEED_IDS.leads.sarahMiller);

      const validStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'];
      expect(validStatuses).toContain(lead.status);

      const validSources = ['WEBSITE', 'REFERRAL', 'EVENT', 'COLD_CALL', 'LINKEDIN', 'OTHER'];
      expect(validSources).toContain(lead.source);
    });
  });

  describe('Relationships', () => {
    it('should load owner relation', async () => {
      const lead = await testPrisma.lead.findUnique({
        where: { id: SEED_IDS.leads.sarahMiller },
        include: { owner: true },
      });

      expect(lead).toBeDefined();
      expect(lead!.owner).toBeDefined();
      expect(lead!.owner.id).toBe(lead!.ownerId);
      expect(lead!.owner.tenantId).toBe(lead!.tenantId); // Same tenant
    });

    it('should load contact relation when converted', async () => {
      // Find a converted lead
      const convertedLeads = await testPrisma.lead.findMany({
        where: { status: 'CONVERTED' },
        include: { contact: true },
        take: 1,
      });

      if (convertedLeads.length > 0) {
        const lead = convertedLeads[0];
        expect(lead.contact).toBeDefined();
        expect(lead.contact!.leadId).toBe(lead.id);
        expect(lead.contact!.tenantId).toBe(lead.tenantId); // Same tenant
      }
    });
  });

  describe('Tenant Isolation', () => {
    it('should only return leads for the default tenant', async () => {
      const defaultTenant = await testPrisma.tenant.findUnique({
        where: { slug: 'default' },
      });

      const leads = await testPrisma.lead.findMany({
        take: 10,
      });

      // All leads should belong to default tenant
      leads.forEach((lead) => {
        expect(lead.tenantId).toBe(defaultTenant!.id);
      });
    });
  });

  describe('Validation', () => {
    it('should enforce unique email per tenant', async () => {
      const tenant = await testPrisma.tenant.findUnique({
        where: { slug: 'default' },
      });

      // Try to create duplicate email
      await expect(
        testPrisma.lead.create({
          data: {
            email: 'sarah.miller@techcorp.example.com', // Exists in seed
            firstName: 'Duplicate',
            lastName: 'Lead',
            company: 'Test',
            phone: '+1234567890',
            source: 'WEBSITE',
            status: 'NEW',
            score: 0,
            ownerId: SEED_IDS.users.sarahJohnson,
            tenantId: tenant!.id,
          },
        })
      ).rejects.toThrow(/unique/i);
    });

    it('should enforce required fields', async () => {
      const tenant = await testPrisma.tenant.findUnique({
        where: { slug: 'default' },
      });

      // Try to create without required field
      await expect(
        testPrisma.lead.create({
          data: {
            // Missing email
            firstName: 'Test',
            lastName: 'Lead',
            company: 'Test',
            phone: '+1234567890',
            source: 'WEBSITE',
            status: 'NEW',
            score: 0,
            ownerId: SEED_IDS.users.sarahJohnson,
            tenantId: tenant!.id,
          } as any,
        })
      ).rejects.toThrow();
    });
  });

  describe('Score Validation', () => {
    it('should have score between 0 and 100', async () => {
      const leads = await testPrisma.lead.findMany({
        take: 20,
      });

      leads.forEach((lead) => {
        expect(lead.score).toBeGreaterThanOrEqual(0);
        expect(lead.score).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Timestamps', () => {
    it('should have createdAt before or equal to updatedAt', async () => {
      const leads = await testPrisma.lead.findMany({
        take: 20,
      });

      leads.forEach((lead) => {
        expect(lead.createdAt.getTime()).toBeLessThanOrEqual(lead.updatedAt.getTime());
      });
    });

    it('should update updatedAt on modification', async () => {
      const lead = await getSeedData.lead(SEED_IDS.leads.amandaSmith);
      const originalUpdatedAt = lead.updatedAt;

      // Wait a moment then update
      await new Promise((resolve) => setTimeout(resolve, 10));

      await testPrisma.lead.update({
        where: { id: lead.id },
        data: { score: lead.score + 1 },
      });

      const updatedLead = await testPrisma.lead.findUnique({
        where: { id: lead.id },
      });

      expect(updatedLead!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());

      // Restore original score
      await testPrisma.lead.update({
        where: { id: lead.id },
        data: { score: lead.score },
      });
    });
  });
});
