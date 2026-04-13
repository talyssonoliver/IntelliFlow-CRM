/**
 * Workflow CRUD Procedures Tests — IFC-031
 *
 * Tests for workflow.create, workflow.update, workflow.delete,
 * workflow.setActive, workflow.list, workflow.getById.
 *
 * All tests go through the tRPC caller using mocked Prisma.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { workflowRouter } from '../workflow.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tenantId = TEST_UUIDS.tenant;
const userId = TEST_UUIDS.user1;
const workflowId1 = TEST_UUIDS.task1;
const workflowId2 = TEST_UUIDS.task2;

// Valid topology: start → action → end with connecting edges
const validSteps = [
  { id: 1, type: 'start', config: {} },
  { id: 2, type: 'action', config: { actionType: 'send_notification' } },
  { id: 3, type: 'end', config: {} },
];

const validEdges = [
  { id: 'e1', source: 'node-1', target: 'node-2' },
  { id: 'e2', source: 'node-2', target: 'node-3' },
];

const baseWorkflow = {
  id: workflowId1,
  name: 'Lead Escalation',
  description: 'Escalate stale leads',
  category: 'lead',
  triggerType: 'event',
  triggerConfig: { eventName: 'lead.stale' },
  steps: { nodes: validSteps, edges: validEdges }, // envelope format (IFC-031)
  isActive: true,
  version: 1,
  createdBy: userId,
  createdAt: new Date('2026-04-01T00:00:00Z'),
  updatedAt: new Date('2026-04-01T00:00:00Z'),
  deletedAt: null,
  tenantId,
};

const createInput = {
  name: 'Lead Escalation',
  description: 'Escalate stale leads',
  category: 'lead',
  triggerType: 'event',
  triggerConfig: { eventName: 'lead.stale' },
  steps: validSteps,
  edges: validEdges,
};

describe('Workflow CRUD Procedures', () => {
  let ctx: ReturnType<typeof createTestContext>;
  let caller: ReturnType<typeof workflowRouter.createCaller>;

  beforeEach(() => {
    ctx = createTestContext();
    caller = workflowRouter.createCaller(ctx);
    // Set up tenant-scoped Prisma mock
    (prismaMock as any).$extends = vi.fn().mockReturnValue(prismaMock);
    (prismaMock as any).$executeRawUnsafe = vi.fn().mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // workflow.create
  // -------------------------------------------------------------------------

  describe('workflow.create', () => {
    it('creates a workflow with tenantId from context', async () => {
      (prismaMock.workflowDefinition.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseWorkflow
      );

      const result = await caller.create(createInput);

      expect(result).toBeDefined();
      expect(result.id).toBe(workflowId1);
      expect(result.name).toBe('Lead Escalation');
      expect(result.tenantId).toBe(tenantId);
    });

    it('throws CONFLICT when workflow name already exists in same tenant', async () => {
      const prismaError = { code: 'P2002', message: 'Unique constraint failed' };
      (prismaMock.workflowDefinition.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        prismaError
      );

      await expect(caller.create(createInput)).rejects.toMatchObject(
        expect.objectContaining({ code: 'CONFLICT' })
      );
    });

    it('allows same name reuse after soft-delete (AC-007)', async () => {
      // Step 1: Soft-delete the existing "Lead Escalation" workflow.
      // findFirst returns the existing row so the delete proceeds.
      (prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseWorkflow
      );
      const softDeleted = { ...baseWorkflow, deletedAt: new Date('2026-04-02T00:00:00Z') };
      (prismaMock.workflowDefinition.update as ReturnType<typeof vi.fn>).mockResolvedValue(
        softDeleted
      );

      const deleteResult = await caller.delete({ id: workflowId1 });
      expect(deleteResult.deletedAt).not.toBeNull();

      // Step 2: Create a NEW workflow with the SAME name "Lead Escalation".
      // The DB's partial unique index (WHERE deletedAt IS NULL) excludes the
      // soft-deleted row, so Prisma does NOT throw P2002.
      (prismaMock.workflowDefinition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...baseWorkflow,
        id: workflowId2, // new record
        deletedAt: null, // active
        version: 1,
      });

      const createResult = await caller.create(createInput);
      expect(createResult.id).toBe(workflowId2);
      expect(createResult.name).toBe('Lead Escalation'); // same name as deleted workflow
      expect(createResult.deletedAt).toBeNull(); // new record is active
    });

    it('rejects steps array with invalid type (Zod validation)', async () => {
      await expect(
        caller.create({
          ...createInput,
          steps: [] as unknown as typeof createInput.steps, // min(1) violated
        })
      ).rejects.toThrow();
    });

    it('throws BAD_REQUEST (not INTERNAL_SERVER_ERROR) for topology validation failures', async () => {
      await expect(
        caller.create({
          ...createInput,
          steps: [{ id: 1, type: 'action', config: {} }], // no start/end nodes
          edges: [],
        })
      ).rejects.toMatchObject(expect.objectContaining({ code: 'BAD_REQUEST' }));
    });

    it('rejects disconnected subgraph (not just isolated nodes)', async () => {
      await expect(
        caller.create({
          ...createInput,
          steps: [
            { id: 1, type: 'start', config: {} },
            { id: 2, type: 'action', config: {} },
            { id: 3, type: 'action', config: {} }, // disconnected from start
            { id: 4, type: 'end', config: {} },
          ],
          edges: [
            { id: 'e1', source: 'node-1', target: 'node-2' },
            { id: 'e2', source: 'node-2', target: 'node-4' },
            // node-3 has an edge to node-4 but is NOT reachable from start
            { id: 'e3', source: 'node-3', target: 'node-4' },
          ],
        })
      ).rejects.toMatchObject(expect.objectContaining({ code: 'BAD_REQUEST' }));
    });
  });

  // -------------------------------------------------------------------------
  // workflow.update
  // -------------------------------------------------------------------------

  describe('workflow.update', () => {
    it('updates workflow and increments version', async () => {
      (prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseWorkflow
      );
      const updated = { ...baseWorkflow, name: 'Renamed', version: 2 };
      (prismaMock.workflowDefinition.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const result = await caller.update({ id: workflowId1, name: 'Renamed' });

      expect(result.version).toBe(2);
      expect(result.name).toBe('Renamed');
    });

    it('throws NOT_FOUND when workflow does not exist in tenant', async () => {
      (prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(caller.update({ id: TEST_UUIDS.nonExistent, name: 'X' })).rejects.toMatchObject(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('throws NOT_FOUND when workflow belongs to different tenant (cross-tenant isolation)', async () => {
      // The findFirst uses WHERE tenantId = ctx.tenant.tenantId, so returns null for other tenants
      (prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(caller.update({ id: workflowId1, name: 'Hijacked' })).rejects.toMatchObject(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('validates topology when only edges are updated (no steps)', async () => {
      (prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseWorkflow
      );

      // Send a cycle-forming edge set without changing steps — should still validate
      await expect(
        caller.update({
          id: workflowId1,
          edges: [
            { id: 'e1', source: 'node-1', target: 'node-2' },
            { id: 'e2', source: 'node-2', target: 'node-1' }, // creates a cycle
          ],
        })
      ).rejects.toMatchObject(expect.objectContaining({ code: 'BAD_REQUEST' }));
    });
  });

  // -------------------------------------------------------------------------
  // workflow.delete
  // -------------------------------------------------------------------------

  describe('workflow.delete', () => {
    it('soft-deletes by setting deletedAt (does not remove from DB)', async () => {
      (prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseWorkflow
      );
      const deleted = { ...baseWorkflow, deletedAt: new Date() };
      (prismaMock.workflowDefinition.update as ReturnType<typeof vi.fn>).mockResolvedValue(deleted);

      const result = await caller.delete({ id: workflowId1 });

      expect(result.deletedAt).toBeDefined();
      expect(result.deletedAt).not.toBeNull();
      expect(result.id).toBe(workflowId1);
    });

    it('throws NOT_FOUND for missing or already-deleted workflow', async () => {
      (prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(caller.delete({ id: TEST_UUIDS.nonExistent })).rejects.toMatchObject(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // workflow.setActive
  // -------------------------------------------------------------------------

  describe('workflow.setActive', () => {
    it('toggles isActive flag', async () => {
      (prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseWorkflow
      );
      const deactivated = { ...baseWorkflow, isActive: false };
      (prismaMock.workflowDefinition.update as ReturnType<typeof vi.fn>).mockResolvedValue(
        deactivated
      );

      const result = await caller.setActive({ id: workflowId1, isActive: false });

      expect(result.isActive).toBe(false);
    });

    it('throws NOT_FOUND for deleted workflow', async () => {
      (prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        caller.setActive({ id: TEST_UUIDS.nonExistent, isActive: true })
      ).rejects.toMatchObject(expect.objectContaining({ code: 'NOT_FOUND' }));
    });
  });

  // -------------------------------------------------------------------------
  // workflow.list
  // -------------------------------------------------------------------------

  describe('workflow.list', () => {
    it('returns paginated results with cursor', async () => {
      const workflows = [
        baseWorkflow,
        { ...baseWorkflow, id: workflowId2, name: 'Ticket Routing' },
      ];
      (prismaMock.workflowDefinition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        workflows
      );

      const result = await caller.list({ limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].name).toBe('Lead Escalation');
    });

    it('excludes records where deletedAt IS NOT NULL', async () => {
      // Only non-deleted workflows returned (mock returns filtered set)
      const activeOnly = [baseWorkflow];
      (prismaMock.workflowDefinition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        activeOnly
      );

      const result = await caller.list({});

      // Verify that findMany was called with deletedAt: null in where clause
      expect(prismaMock.workflowDefinition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        })
      );
      expect(result.items).toHaveLength(1);
    });

    it('tenant A cannot see tenant B workflows (tenant isolation)', async () => {
      (prismaMock.workflowDefinition.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        baseWorkflow,
      ]);

      await caller.list({});

      // Verify tenantId is passed in where clause
      expect(prismaMock.workflowDefinition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // workflow.getById
  // -------------------------------------------------------------------------

  describe('workflow.getById', () => {
    it('returns workflow data for tenant-owned record', async () => {
      (prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseWorkflow
      );

      const result = await caller.getById({ id: workflowId1 });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(workflowId1);
      expect(result!.name).toBe('Lead Escalation');
    });

    it('returns null for soft-deleted workflows (deletedAt IS NOT NULL)', async () => {
      // findFirst with deletedAt: null returns null when record is deleted
      (prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await caller.getById({ id: workflowId1 });

      expect(result).toBeNull();
    });
  });
});
