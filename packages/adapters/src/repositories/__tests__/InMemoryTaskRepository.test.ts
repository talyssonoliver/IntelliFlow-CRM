import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTaskRepository } from '../InMemoryTaskRepository';
import { Task, TaskId } from '@intelliflow/domain';

let counter = 0;
function uuid(n?: number): string {
  const i = n ?? counter++;
  return `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
}

function makeTask(
  ov: Partial<{
    id: string;
    title: string;
    status: string;
    priority: string;
    ownerId: string;
    leadId: string;
    contactId: string;
    opportunityId: string;
    dueDate: Date;
    createdAt: Date;
  }> = {}
): Task {
  const id = TaskId.create(ov.id ?? uuid()).value as TaskId;
  return Task.reconstitute(id, {
    title: ov.title ?? 'Test',
    status: (ov.status ?? 'PENDING') as any,
    priority: (ov.priority ?? 'MEDIUM') as any,
    ownerId: ov.ownerId ?? 'owner-1',
    tenantId: 't-1',
    leadId: ov.leadId,
    contactId: ov.contactId,
    opportunityId: ov.opportunityId,
    dueDate: ov.dueDate,
    createdAt: ov.createdAt ?? new Date('2025-01-01'),
    updatedAt: new Date(),
  } as any);
}

const ID1 = uuid(100);
const ID2 = uuid(101);
const ID3 = uuid(102);
const ID4 = uuid(103);

describe('InMemoryTaskRepository', () => {
  let repo: InMemoryTaskRepository;
  beforeEach(() => {
    repo = new InMemoryTaskRepository();
    counter = 200;
  });

  describe('save/findById', () => {
    it('saves and retrieves', async () => {
      const t = makeTask({ id: ID1 });
      await repo.save(t);
      expect(await repo.findById(TaskId.create(ID1).value as TaskId)).toBe(t);
    });
    it('returns null when not found', async () => {
      expect(await repo.findById(TaskId.create(uuid(999)).value as TaskId)).toBeNull();
    });
    it('overwrites on save', async () => {
      await repo.save(makeTask({ id: ID2, title: 'Old' }));
      await repo.save(makeTask({ id: ID2, title: 'New' }));
      expect((await repo.findById(TaskId.create(ID2).value as TaskId))?.title).toBe('New');
    });
  });

  describe('findByOwnerId', () => {
    it('sorted desc', async () => {
      await repo.save(makeTask({ ownerId: 'a', createdAt: new Date('2025-01-01') }));
      await repo.save(makeTask({ ownerId: 'a', createdAt: new Date('2025-06-01') }));
      const r = await repo.findByOwnerId('a');
      expect(r).toHaveLength(2);
      expect(r[0].createdAt.getTime()).toBeGreaterThanOrEqual(r[1].createdAt.getTime());
    });
    it('empty for unknown', async () => {
      expect(await repo.findByOwnerId('x')).toEqual([]);
    });
  });

  describe('findByStatus', () => {
    it('filters', async () => {
      await repo.save(makeTask({ status: 'PENDING' }));
      await repo.save(makeTask({ status: 'COMPLETED' }));
      expect(await repo.findByStatus('PENDING' as any)).toHaveLength(1);
    });
    it('with ownerId', async () => {
      await repo.save(makeTask({ status: 'PENDING', ownerId: 'a' }));
      await repo.save(makeTask({ status: 'PENDING', ownerId: 'b' }));
      expect(await repo.findByStatus('PENDING' as any, 'a')).toHaveLength(1);
    });
  });

  describe('findByPriority', () => {
    it('excludes completed/cancelled', async () => {
      await repo.save(makeTask({ priority: 'HIGH' }));
      await repo.save(makeTask({ priority: 'HIGH', status: 'COMPLETED' }));
      await repo.save(makeTask({ priority: 'HIGH', status: 'CANCELLED' }));
      expect(await repo.findByPriority('HIGH' as any)).toHaveLength(1);
    });
    it('sorts dueDate asc, nulls last', async () => {
      await repo.save(makeTask({ priority: 'MEDIUM', dueDate: new Date('2025-12-01') }));
      await repo.save(makeTask({ priority: 'MEDIUM' }));
      await repo.save(makeTask({ priority: 'MEDIUM', dueDate: new Date('2025-06-01') }));
      const r = await repo.findByPriority('MEDIUM' as any);
      expect(r).toHaveLength(3);
      expect(r[0].dueDate?.getTime()).toBeLessThanOrEqual(r[1].dueDate?.getTime() ?? Infinity);
    });
  });

  describe('entity queries', () => {
    it('findByLeadId', async () => {
      await repo.save(makeTask({ leadId: 'lead-1' }));
      await repo.save(makeTask({ leadId: 'lead-2' }));
      expect(await repo.findByLeadId('lead-1')).toHaveLength(1);
    });
    it('findByContactId', async () => {
      await repo.save(makeTask({ contactId: 'c-1' }));
      expect(await repo.findByContactId('c-1')).toHaveLength(1);
      expect(await repo.findByContactId('c-none')).toHaveLength(0);
    });
    it('findByOpportunityId', async () => {
      await repo.save(makeTask({ opportunityId: 'o-1' }));
      expect(await repo.findByOpportunityId('o-1')).toHaveLength(1);
    });
  });

  describe('findOverdue', () => {
    it('active past-due', async () => {
      await repo.save(makeTask({ dueDate: new Date('2020-01-01') }));
      await repo.save(makeTask({ dueDate: new Date('2020-01-01'), status: 'COMPLETED' }));
      await repo.save(makeTask({ dueDate: new Date('2099-01-01') }));
      expect(await repo.findOverdue()).toHaveLength(1);
    });
  });

  describe('findDueSoon', () => {
    it('active due within 24h', async () => {
      const soon = new Date(Date.now() + 12 * 3600000);
      await repo.save(makeTask({ dueDate: soon }));
      await repo.save(makeTask({ dueDate: new Date('2099-01-01') }));
      const r = await repo.findDueSoon();
      expect(r).toHaveLength(1);
    });
    it('filters by ownerId', async () => {
      const soon = new Date(Date.now() + 12 * 3600000);
      await repo.save(makeTask({ dueDate: soon, ownerId: 'a' }));
      await repo.save(makeTask({ dueDate: soon, ownerId: 'b' }));
      expect(await repo.findDueSoon('a')).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('removes task', async () => {
      await repo.save(makeTask({ id: ID3 }));
      await repo.delete(TaskId.create(ID3).value as TaskId);
      expect(await repo.findById(TaskId.create(ID3).value as TaskId)).toBeNull();
    });
  });

  describe('countByStatus', () => {
    it('returns record of counts', async () => {
      await repo.save(makeTask({ status: 'PENDING' }));
      await repo.save(makeTask({ status: 'PENDING' }));
      await repo.save(makeTask({ status: 'COMPLETED' }));
      const counts = await repo.countByStatus();
      expect(counts['PENDING']).toBe(2);
      expect(counts['COMPLETED']).toBe(1);
    });
    it('filters by ownerId', async () => {
      await repo.save(makeTask({ status: 'PENDING', ownerId: 'a' }));
      await repo.save(makeTask({ status: 'PENDING', ownerId: 'b' }));
      const counts = await repo.countByStatus('a');
      expect(counts['PENDING']).toBe(1);
    });
  });

  describe('clear/getAll', () => {
    it('clear empties', async () => {
      await repo.save(makeTask());
      await repo.clear();
      expect(await repo.getAll()).toEqual([]);
    });
    it('getAll', async () => {
      await repo.save(makeTask({ id: ID4 }));
      expect(await repo.getAll()).toHaveLength(1);
    });
  });
});
