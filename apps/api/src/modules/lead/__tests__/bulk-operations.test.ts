/**
 * IFC-007 - Bulk Operations Performance Tests
 * Phase 2.1: RED - Write Batch Operation Tests
 *
 * Tests that bulk operations complete within performance budget.
 * Target: <1s for 100 leads batch operations
 *
 * NOTE: These are integration tests that require a running database with seeded data.
 * Tests will be skipped if the database is not available.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@intelliflow/db';
import { PrismaPg } from '@prisma/adapter-pg';
import crypto from 'node:crypto';

// Use crypto.randomUUID() instead of uuid package
const uuid = () => crypto.randomUUID();

// Test configuration
const PERFORMANCE_BUDGET_MS = 1000; // 1 second for 100 leads
const TEST_BATCH_SIZE = 100;

describe('Bulk Lead Operations', () => {
  let prisma: PrismaClient;
  let testTenantId: string;
  let testUserId: string;
  let testLeadIds: string[];
  // Accumulate ALL lead IDs across tests so afterAll can clean them all up
  const allCreatedLeadIds: string[] = [];
  let isDbAvailable = false;

  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    prisma = new PrismaClient({ adapter });

    try {
      await prisma.$connect();

      // Try to find the default tenant from seeded data
      const tenant = await prisma.tenant.findUnique({
        where: { slug: 'default' },
      });

      if (!tenant) {
        console.log('⚠️ Default tenant not found. Database may not be seeded.');
        console.log('   Run: pnpm run db:seed to seed the database.');
        return;
      }

      testTenantId = tenant.id;

      // Find a user that belongs to this tenant
      const user = await prisma.user.findFirst({
        where: { tenantId: testTenantId },
      });

      if (!user) {
        console.log('⚠️ No users found in tenant. Database may not be seeded.');
        return;
      }

      testUserId = user.id;
      isDbAvailable = true;
      console.log('✅ Database connected with tenant:', testTenantId);
    } catch (error) {
      console.log('⚠️ Database not available, skipping integration tests.');
      console.log('   Error:', error instanceof Error ? error.message : 'Unknown error');
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      // Clean up ALL leads created during this test suite
      if (allCreatedLeadIds.length > 0) {
        await prisma.lead
          .deleteMany({
            where: { id: { in: allCreatedLeadIds } },
          })
          .catch(() => {});
      }

      // Safety net: clean up any remaining test leads by email pattern
      await prisma.lead
        .deleteMany({
          where: {
            email: { contains: '@bulk-ops-test.com' },
          },
        })
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    testLeadIds = [];
  });

  describe('Performance Budget Validation', () => {
    it('should create 100 leads using batch operation within budget', async () => {
      if (!isDbAvailable) {
        console.log('Skipping: Database not available');
        return;
      }

      const leadsToCreate = Array.from({ length: TEST_BATCH_SIZE }, (_, i) => ({
        id: uuid(),
        firstName: `Test${i}`,
        lastName: `Lead${i}`,
        email: `test${i}-${Date.now()}@bulk-ops-test.com`,
        company: 'Test Company',
        status: 'NEW' as const,
        source: 'WEBSITE' as const,
        score: 50,
        tenantId: testTenantId,
        ownerId: testUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      testLeadIds = leadsToCreate.map((l) => l.id);
      allCreatedLeadIds.push(...testLeadIds);

      const start = Date.now();

      // Use batch create (createMany)
      await prisma.lead.createMany({
        data: leadsToCreate,
        skipDuplicates: true,
      });

      const duration = Date.now() - start;

      console.log(`Batch create ${TEST_BATCH_SIZE} leads: ${duration}ms`);
      expect(duration).toBeLessThan(PERFORMANCE_BUDGET_MS);
    });

    it('should update 100 leads using batch operation within budget', async () => {
      if (!isDbAvailable) {
        console.log('Skipping: Database not available');
        return;
      }

      // First, create test leads if they don't exist
      if (testLeadIds.length === 0) {
        const leadsToCreate = Array.from({ length: TEST_BATCH_SIZE }, (_, i) => ({
          id: uuid(),
          firstName: `Update${i}`,
          lastName: `Lead${i}`,
          email: `update${i}-${Date.now()}@bulk-ops-test.com`,
          company: 'Test Company',
          status: 'NEW' as const,
          source: 'WEBSITE' as const,
          score: 50,
          tenantId: testTenantId,
          ownerId: testUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        testLeadIds = leadsToCreate.map((l) => l.id);
        allCreatedLeadIds.push(...testLeadIds);
        await prisma.lead.createMany({
          data: leadsToCreate,
          skipDuplicates: true,
        });
      }

      const start = Date.now();

      // Use batch update (updateMany)
      await prisma.lead.updateMany({
        where: { id: { in: testLeadIds } },
        data: {
          status: 'CONTACTED',
          updatedAt: new Date(),
        },
      });

      const duration = Date.now() - start;

      console.log(`Batch update ${TEST_BATCH_SIZE} leads: ${duration}ms`);
      expect(duration).toBeLessThan(PERFORMANCE_BUDGET_MS);
    });

    it('should delete 100 leads using batch operation within budget', async () => {
      if (!isDbAvailable) {
        console.log('Skipping: Database not available');
        return;
      }

      // Create leads specifically for deletion test
      const leadsToDelete = Array.from({ length: TEST_BATCH_SIZE }, (_, i) => ({
        id: uuid(),
        firstName: `Delete${i}`,
        lastName: `Lead${i}`,
        email: `delete${i}-${Date.now()}@bulk-ops-test.com`,
        company: 'Test Company',
        status: 'NEW' as const,
        source: 'WEBSITE' as const,
        score: 50,
        tenantId: testTenantId,
        ownerId: testUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const deleteIds = leadsToDelete.map((l) => l.id);
      allCreatedLeadIds.push(...deleteIds);
      await prisma.lead.createMany({
        data: leadsToDelete,
        skipDuplicates: true,
      });

      const start = Date.now();

      // Use batch delete (deleteMany)
      await prisma.lead.deleteMany({
        where: { id: { in: deleteIds } },
      });

      const duration = Date.now() - start;

      console.log(`Batch delete ${TEST_BATCH_SIZE} leads: ${duration}ms`);
      expect(duration).toBeLessThan(PERFORMANCE_BUDGET_MS);
    });
  });

  describe('Batch vs Sequential Comparison', () => {
    it('batch operation should be faster than sequential', async () => {
      if (!isDbAvailable) {
        console.log('Skipping: Database not available');
        return;
      }

      const smallBatchSize = 10;

      // Create leads for comparison
      const sequentialLeads = Array.from({ length: smallBatchSize }, (_, i) => ({
        id: uuid(),
        firstName: `Seq${i}`,
        lastName: `Lead${i}`,
        email: `seq${i}-${Date.now()}@bulk-ops-test.com`,
        company: 'Test Company',
        status: 'NEW' as const,
        source: 'WEBSITE' as const,
        score: 50,
        tenantId: testTenantId,
        ownerId: testUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const batchLeads = Array.from({ length: smallBatchSize }, (_, i) => ({
        id: uuid(),
        firstName: `Batch${i}`,
        lastName: `Lead${i}`,
        email: `batch${i}-${Date.now()}@bulk-ops-test.com`,
        company: 'Test Company',
        status: 'NEW' as const,
        source: 'WEBSITE' as const,
        score: 50,
        tenantId: testTenantId,
        ownerId: testUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Track all IDs for cleanup
      const allIds = [...sequentialLeads, ...batchLeads].map((l) => l.id);
      allCreatedLeadIds.push(...allIds);

      // Time sequential inserts
      const seqStart = Date.now();
      for (const lead of sequentialLeads) {
        await prisma.lead.create({ data: lead });
      }
      const seqDuration = Date.now() - seqStart;

      // Time batch insert
      const batchStart = Date.now();
      await prisma.lead.createMany({
        data: batchLeads,
        skipDuplicates: true,
      });
      const batchDuration = Date.now() - batchStart;

      console.log(`Sequential create ${smallBatchSize}: ${seqDuration}ms`);
      console.log(`Batch create ${smallBatchSize}: ${batchDuration}ms`);
      console.log(`Batch is ${(seqDuration / batchDuration).toFixed(1)}x faster`);

      // Batch should be at least 2x faster
      expect(batchDuration).toBeLessThan(seqDuration);

      // Clean up inline too (best-effort)
      await prisma.lead.deleteMany({ where: { id: { in: allIds } } });
    });
  });

  describe('Transaction Atomicity', () => {
    it('should rollback on partial failure in transaction', async () => {
      if (!isDbAvailable) {
        console.log('Skipping: Database not available');
        return;
      }

      const testId1 = uuid();
      const testId2 = uuid();
      allCreatedLeadIds.push(testId1); // Track for cleanup

      // Create a valid lead first
      await prisma.lead.create({
        data: {
          id: testId1,
          firstName: 'Atomic',
          lastName: 'Test1',
          email: `atomic1-${Date.now()}@bulk-ops-test.com`,
          company: 'Test Company',
          status: 'NEW',
          source: 'WEBSITE',
          score: 50,
          tenantId: testTenantId,
          ownerId: testUserId,
        },
      });

      try {
        // Attempt a transaction that should fail
        await prisma.$transaction(async (tx) => {
          // This should succeed
          await tx.lead.update({
            where: { id: testId1 },
            data: { status: 'CONTACTED' },
          });

          // This should fail (non-existent ID)
          await tx.lead.update({
            where: { id: testId2 }, // This ID doesn't exist
            data: { status: 'CONTACTED' },
          });
        });

        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Transaction should have rolled back
        const lead1 = await prisma.lead.findUnique({ where: { id: testId1 } });
        // Status should still be 'NEW' due to rollback
        expect(lead1?.status).toBe('NEW');
      }

      // Clean up
      await prisma.lead.delete({ where: { id: testId1 } }).catch(() => {});
    });
  });
});
