/**
 * Lead Router Integration Tests
 *
 * Tests using real seeded database instead of mocks
 * Run with: pnpm test lead.router.integration
 *
 * NOTE: This file uses lazy imports to gracefully handle missing @prisma/client.
 * Tests are skipped with clear alerts if infrastructure is unavailable.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  createIntegrationTestContext,
  SEED_IDS,
  getSeedData,
  verifySeedData,
  testPrisma,
  isInfrastructureAvailable,
  infrastructureUnavailableReason,
} from '../../../test/integration-setup';

// Import leadRouter directly - Vitest handles ESM imports properly
import { leadRouter } from '../lead.router';

// Run integration tests only when infrastructure is available
const describeIntegration = isInfrastructureAvailable ? describe : describe.skip;

// Log skip reason if not available
if (!isInfrastructureAvailable && infrastructureUnavailableReason) {
  console.log(`⏭️  Skipping Lead Router Integration Tests: ${infrastructureUnavailableReason}`);
}

describeIntegration('Lead Router - Integration Tests', () => {
  beforeAll(async () => {
    await verifySeedData();
  });

  describe('getById', () => {
    it('should return a seeded lead with all relations', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);

      const result = await caller.getById({ id: SEED_IDS.leads.sarahMiller });

      // Verify it returns the actual seeded lead
      expect(result.id).toBe(SEED_IDS.leads.sarahMiller);
      expect(result.email).toBe('sarah@techcorp.com');
      expect(result.firstName).toBe('Sarah');
      expect(result.lastName).toBe('Miller');
      expect(result.company).toBe('TechCorp');
      expect(result.tenantId).toBeDefined(); // Has tenantId from seed
    });

    it('should throw NOT_FOUND for non-existent lead', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);

      // Use a valid UUID format that doesn't exist in the database
      const nonExistentUuid = '00000000-0000-4000-8000-000000999999';
      await expect(
        caller.getById({ id: nonExistentUuid })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('list', () => {
    it('should return all seeded leads with pagination', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);

      const result = await caller.list({ page: 1, limit: 10 });

      // Should return actual seeded leads
      expect(result.leads.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);

      // Verify leads have tenantId
      for (const lead of result.leads) {
        expect(lead.tenantId).toBeDefined();
      }

      // Verify we get actual seed data
      const sarahMillerLead = result.leads.find(
        (l: { id: string }) => l.id === SEED_IDS.leads.sarahMiller
      );
      expect(sarahMillerLead).toBeDefined();
      expect(sarahMillerLead?.email).toBe('sarah@techcorp.com');
    });

    it('should filter leads by status', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);

      const result = await caller.list({ status: ['QUALIFIED'] });

      // Verify all returned leads have QUALIFIED status
      for (const lead of result.leads) {
        expect(lead.status).toBe('QUALIFIED');
      }
    });

    it('should filter leads by score range', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);

      const result = await caller.list({ minScore: 80, maxScore: 100 });

      // Verify all returned leads have score in range
      for (const lead of result.leads) {
        expect(lead.score).toBeGreaterThanOrEqual(80);
        expect(lead.score).toBeLessThanOrEqual(100);
      }
    });

    it('should search leads by text', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);

      const result = await caller.list({ search: 'TechCorp' });

      // Should find Sarah Miller who works at TechCorp Industries
      const sarahMillerLead = result.leads.find(
        (l: { id: string }) => l.id === SEED_IDS.leads.sarahMiller
      );
      expect(sarahMillerLead).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a new lead in the database', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);

      const input = {
        email: 'integration-test@example.com',
        firstName: 'Integration',
        lastName: 'Test',
        company: 'Test Company',
        phone: '+1234567890',
        source: 'WEBSITE' as const,
      };

      const result = await caller.create(input);

      // Verify lead was created
      expect(result.id).toBeDefined();
      expect(result.email).toBe(input.email);
      expect(result.firstName).toBe(input.firstName);
      expect(result.tenantId).toBeDefined();

      // Verify it exists in database
      const dbLead = await testPrisma.lead.findUnique({
        where: { id: result.id },
      });
      expect(dbLead).toBeDefined();
      expect(dbLead?.email).toBe(input.email);

      // Cleanup: delete test lead
      await testPrisma.lead.delete({ where: { id: result.id } });
    });

    it('should throw for duplicate email', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);

      // Try to create lead with Sarah Miller's email (already exists in seed)
      const input = {
        email: 'sarah@techcorp.com',
        firstName: 'Duplicate',
        lastName: 'Lead',
        company: 'Test Company',
        phone: '+1234567890',
        source: 'WEBSITE' as const,
      };

      await expect(caller.create(input)).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update a seeded lead', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);

      // Get original lead
      const originalLead = await getSeedData.lead(SEED_IDS.leads.davidChen);
      const originalCompany = originalLead.company;

      // Update the lead
      const updatedCompany = 'Updated Test Company';
      const result = await caller.update({
        id: SEED_IDS.leads.davidChen,
        company: updatedCompany,
      });

      expect(result.company).toBe(updatedCompany);

      // Verify in database
      const dbLead = await testPrisma.lead.findUnique({
        where: { id: SEED_IDS.leads.davidChen },
      });
      expect(dbLead?.company).toBe(updatedCompany);

      // Restore original value
      await testPrisma.lead.update({
        where: { id: SEED_IDS.leads.davidChen },
        data: { company: originalCompany },
      });
    });
  });

  describe('delete', () => {
    it('should soft delete a lead', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);
      const tenantId = (await ctx.prisma.tenant.findUnique({ where: { slug: 'default' } }))!.id;

      // Use unique email and UUID (API expects UUID format, not CUID)
      const uniqueEmail = `delete-test-${Date.now()}@example.com`;
      const testLeadId = randomUUID();

      // Create a test lead first with explicit UUID
      const testLead = await testPrisma.lead.create({
        data: {
          id: testLeadId,
          email: uniqueEmail,
          firstName: 'Delete',
          lastName: 'Test',
          company: 'Test Company',
          phone: '+1234567890',
          source: 'WEBSITE',
          status: 'NEW',
          score: 0,
          ownerId: SEED_IDS.users.sarahJohnson,
          tenantId,
        },
      });

      await caller.delete({ id: testLead.id });

      const dbLead = await testPrisma.lead.findUnique({
        where: { id: testLead.id },
      });
      expect(dbLead).toBeNull();
    });
  });

  describe('stats', () => {
    it('should return real statistics from seeded data', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);

      const stats = await caller.stats();

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byStatus).toBeDefined();
      expect(stats.averageScore).toBeGreaterThanOrEqual(0);
      expect(stats.averageScore).toBeLessThanOrEqual(100);
    });
  });

  describe('qualify', () => {
    it('should qualify a seeded lead', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = leadRouter.createCaller(ctx);
      const tenantId = (await ctx.prisma.tenant.findUnique({ where: { slug: 'default' } }))!.id;

      // Use unique email and UUID (API expects UUID format, not CUID)
      const uniqueEmail = `qualify-test-${Date.now()}@example.com`;
      const testLeadId = randomUUID();

      // Always create a test lead with a score above the qualification threshold (>= 50)
      const testLead = await testPrisma.lead.create({
        data: {
          id: testLeadId,
          email: uniqueEmail,
          firstName: 'Qualify',
          lastName: 'Test',
          company: 'Test Company',
          phone: '+1234567890',
          source: 'WEBSITE',
          status: 'NEW',
          score: 75, // Above threshold of 50
          ownerId: SEED_IDS.users.sarahJohnson,
          tenantId,
        },
      });

      try {
        const result = await caller.qualify({
          leadId: testLead.id,
          reason: 'Test qualification for integration test'
        });
        expect(result.status).toBe('QUALIFIED');
      } finally {
        // Cleanup
        await testPrisma.lead.delete({ where: { id: testLead.id } });
      }
    });
  });
});
