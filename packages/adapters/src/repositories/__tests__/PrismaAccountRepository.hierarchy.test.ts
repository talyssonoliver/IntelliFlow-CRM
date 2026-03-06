import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaAccountRepository } from '../PrismaAccountRepository';
import { AccountId } from '@intelliflow/domain';

function mockPrisma() {
  return {
    account: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  } as any;
}

const NOW = new Date('2026-01-15T10:00:00Z');

function makePrismaRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test Corp',
    website: null,
    industry: 'Tech',
    employees: 50,
    revenue: null,
    description: null,
    parentAccountId: null,
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const UUID_PARENT = '00000000-0000-4000-8000-000000000010';
const UUID_CHILD1 = '00000000-0000-4000-8000-000000000011';
const UUID_CHILD = '00000000-0000-4000-8000-000000000020';
const UUID_GRANDPARENT = '00000000-0000-4000-8000-000000000030';
const UUID_ROOT = '00000000-0000-4000-8000-000000000040';
const UUID_A = '00000000-0000-4000-8000-00000000000a';
const UUID_B = '00000000-0000-4000-8000-00000000000b';
const UUID_MISSING = '00000000-0000-4000-8000-ffffffffffff';

describe('PrismaAccountRepository hierarchy methods', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let repo: PrismaAccountRepository;

  beforeEach(() => {
    prisma = mockPrisma();
    repo = new PrismaAccountRepository(prisma);
  });

  describe('findWithChildren', () => {
    it('should return null when account not found', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      const id = AccountId.create(UUID_MISSING).value;

      const result = await repo.findWithChildren(id, 3);
      expect(result).toBeNull();
    });

    it('should return hierarchy record with nested children', async () => {
      const record = {
        ...makePrismaRecord({ id: UUID_PARENT }),
        _count: { contacts: 2, opportunities: 1 },
        childAccounts: [
          {
            ...makePrismaRecord({ id: UUID_CHILD1, parentAccountId: UUID_PARENT }),
            _count: { contacts: 1, opportunities: 0 },
            childAccounts: [],
          },
        ],
      };

      prisma.account.findUnique.mockResolvedValue(record);
      const id = AccountId.create(UUID_PARENT).value;

      const result = await repo.findWithChildren(id, 2);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(UUID_PARENT);
      expect(result!.childAccounts).toHaveLength(1);
      expect(result!.childAccounts![0].id).toBe(UUID_CHILD1);
      expect(result!._count).toEqual({ contacts: 2, opportunities: 1 });
    });

    it('should pass include with recursive children to prisma', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      const id = AccountId.create(UUID_PARENT).value;

      await repo.findWithChildren(id, 1);

      expect(prisma.account.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: UUID_PARENT },
          include: expect.objectContaining({
            _count: { select: { contacts: true, opportunities: true } },
            childAccounts: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('findAncestors', () => {
    it('should return empty array when account has no parent', async () => {
      prisma.account.findUnique.mockResolvedValue(makePrismaRecord({ parentAccountId: null }));
      const id = AccountId.create(UUID_ROOT).value;

      const ancestors = await repo.findAncestors(id);
      expect(ancestors).toEqual([]);
    });

    it('should return ancestor chain', async () => {
      const child = makePrismaRecord({ id: UUID_CHILD, parentAccountId: UUID_PARENT });
      const parent = makePrismaRecord({ id: UUID_PARENT, parentAccountId: UUID_GRANDPARENT });
      const grandparent = makePrismaRecord({ id: UUID_GRANDPARENT, parentAccountId: null });

      prisma.account.findUnique
        .mockResolvedValueOnce(child) // lookup child
        .mockResolvedValueOnce(parent) // lookup parent
        .mockResolvedValueOnce(parent) // lookup parent for its parentAccountId
        .mockResolvedValueOnce(grandparent) // lookup grandparent
        .mockResolvedValueOnce(grandparent); // grandparent has no parent

      const id = AccountId.create(UUID_CHILD).value;
      const ancestors = await repo.findAncestors(id);

      expect(ancestors.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect circular references and stop', async () => {
      const a = makePrismaRecord({ id: UUID_A, parentAccountId: UUID_B });
      const b = makePrismaRecord({ id: UUID_B, parentAccountId: UUID_A });

      prisma.account.findUnique
        .mockResolvedValueOnce(a)
        .mockResolvedValueOnce(b)
        .mockResolvedValueOnce(b)
        .mockResolvedValueOnce(a);

      const id = AccountId.create(UUID_A).value;
      const ancestors = await repo.findAncestors(id);

      // Should terminate without infinite loop
      expect(ancestors.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getHierarchyDepth', () => {
    it('should return 0 for root account', async () => {
      prisma.account.findUnique.mockResolvedValue(makePrismaRecord({ parentAccountId: null }));
      const id = AccountId.create(UUID_ROOT).value;

      const depth = await repo.getHierarchyDepth(id);
      expect(depth).toBe(0);
    });

    it('should return count of ancestors', async () => {
      const child = makePrismaRecord({ id: UUID_CHILD, parentAccountId: UUID_PARENT });
      const parent = makePrismaRecord({ id: UUID_PARENT, parentAccountId: null });

      prisma.account.findUnique
        .mockResolvedValueOnce(child)
        .mockResolvedValueOnce(parent)
        .mockResolvedValueOnce(parent);

      const id = AccountId.create(UUID_CHILD).value;
      const depth = await repo.getHierarchyDepth(id);
      expect(depth).toBe(1);
    });
  });
});
