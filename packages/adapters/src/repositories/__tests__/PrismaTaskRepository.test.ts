/**
 * PrismaTaskRepository — findByIds unit tests (NP-022)
 *
 * Uses a mock Prisma client to verify that findByIds issues exactly
 * one query, deduplicates ids, and preserves input order.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaTaskRepository } from '../PrismaTaskRepository';

// Minimal Prisma record shape for Task
function makeRecord(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    dueDate: null,
    priority: 'NORMAL',
    status: 'PENDING',
    leadId: null,
    contactId: null,
    opportunityId: null,
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    completedAt: null,
    ...extra,
  };
}

const ID_A = 'a0000000-0000-4000-8000-000000000001';
const ID_B = 'b0000000-0000-4000-8000-000000000002';
const ID_C = 'c0000000-0000-4000-8000-000000000003';

describe('PrismaTaskRepository.findByIds (NP-022)', () => {
  let prisma: Record<string, any>;
  let repo: PrismaTaskRepository;

  beforeEach(() => {
    prisma = {
      task: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        groupBy: vi.fn(),
      },
    };
    repo = new PrismaTaskRepository(prisma as any);
  });

  it('returns empty array immediately for empty ids — no DB call', async () => {
    const result = await repo.findByIds([]);

    expect(result).toEqual([]);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('issues exactly ONE findMany call for N ids', async () => {
    prisma.task.findMany.mockResolvedValue([makeRecord(ID_A), makeRecord(ID_B), makeRecord(ID_C)]);

    await repo.findByIds([ID_A, ID_B, ID_C]);

    expect(prisma.task.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: { id: { in: [ID_A, ID_B, ID_C] } },
    });
  });

  it('deduplicates ids before the query', async () => {
    prisma.task.findMany.mockResolvedValue([makeRecord(ID_A)]);

    await repo.findByIds([ID_A, ID_A, ID_A]);

    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: { id: { in: [ID_A] } },
    });
  });

  it('preserves original input order in results', async () => {
    // DB returns in reverse order (C, B, A)
    prisma.task.findMany.mockResolvedValue([makeRecord(ID_C), makeRecord(ID_B), makeRecord(ID_A)]);

    const result = await repo.findByIds([ID_A, ID_B, ID_C]);

    expect(result.map((t) => t.id.value)).toEqual([ID_A, ID_B, ID_C]);
  });

  it('omits ids not found in the result', async () => {
    const MISSING = 'd0000000-0000-4000-8000-000000000099';
    prisma.task.findMany.mockResolvedValue([makeRecord(ID_A), makeRecord(ID_C)]);

    const result = await repo.findByIds([ID_A, MISSING, ID_C]);

    expect(result.map((t) => t.id.value)).toEqual([ID_A, ID_C]);
    expect(result).toHaveLength(2);
  });

  it('reconstitutes Task domain objects correctly', async () => {
    prisma.task.findMany.mockResolvedValue([
      makeRecord(ID_A, {
        title: 'My Task',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        description: 'desc',
      }),
    ]);

    const result = await repo.findByIds([ID_A]);

    expect(result).toHaveLength(1);
    expect(result[0].id.value).toBe(ID_A);
    expect(result[0].title).toBe('My Task');
    expect(result[0].status).toBe('IN_PROGRESS');
    expect(result[0].priority).toBe('HIGH');
    expect(result[0].description).toBe('desc');
  });
});

// PG-208: the assignee is persisted and loaded on every path (round-robin assigns at create).
describe('PrismaTaskRepository assigneeId persistence (PG-208)', () => {
  let prisma: Record<string, any>;
  let repo: PrismaTaskRepository;
  const assigned = () => makeRecord(ID_A, { assigneeId: 'assignee-9', priority: 'MEDIUM' });

  beforeEach(() => {
    prisma = {
      task: {
        findMany: vi.fn().mockResolvedValue([assigned()]),
        findUnique: vi.fn().mockResolvedValue(assigned()),
        upsert: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        groupBy: vi.fn(),
      },
    };
    repo = new PrismaTaskRepository(prisma as any);
  });

  it('writes assigneeId on create and update', async () => {
    const task = await repo.findById({ value: ID_A } as any);
    await repo.save(task!);
    const args = prisma.task.upsert.mock.calls[0][0];
    expect(args.create.assigneeId).toBe('assignee-9');
    expect(args.update.assigneeId).toBe('assignee-9');
  });

  it('writes null for an unassigned task', async () => {
    prisma.task.findUnique.mockResolvedValue(
      makeRecord(ID_A, { assigneeId: null, priority: 'LOW' })
    );
    const task = await repo.findById({ value: ID_A } as any);
    await repo.save(task!);
    expect(prisma.task.upsert.mock.calls[0][0].create.assigneeId).toBeNull();
  });

  it.each([
    ['findById', (r: PrismaTaskRepository) => r.findById({ value: ID_A } as any).then((t) => [t!])],
    ['findByIds', (r: PrismaTaskRepository) => r.findByIds([ID_A])],
    ['findByOwnerId', (r: PrismaTaskRepository) => r.findByOwnerId('owner-1')],
    ['findByLeadId', (r: PrismaTaskRepository) => r.findByLeadId('lead-1')],
    ['findByContactId', (r: PrismaTaskRepository) => r.findByContactId('contact-1')],
    ['findByOpportunityId', (r: PrismaTaskRepository) => r.findByOpportunityId('opp-1')],
    ['findByStatus', (r: PrismaTaskRepository) => r.findByStatus('PENDING')],
    ['findOverdue', (r: PrismaTaskRepository) => r.findOverdue()],
    ['findDueToday', (r: PrismaTaskRepository) => r.findDueToday()],
    ['findByPriority', (r: PrismaTaskRepository) => r.findByPriority('MEDIUM')],
    ['findDueSoon', (r: PrismaTaskRepository) => r.findDueSoon()],
  ])('%s loads assigneeId', async (_name, load) => {
    const tasks = await load(repo);
    expect(tasks[0].assigneeId).toBe('assignee-9');
  });

  it('keeps the assignee through a load-then-save cycle (bulkComplete path)', async () => {
    const [task] = await repo.findByIds([ID_A]);
    await repo.save(task);
    expect(prisma.task.upsert.mock.calls[0][0].update.assigneeId).toBe('assignee-9');
  });
});
