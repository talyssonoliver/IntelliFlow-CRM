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
