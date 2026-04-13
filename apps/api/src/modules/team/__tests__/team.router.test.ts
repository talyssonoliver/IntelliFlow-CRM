/**
 * Team Router Tests
 *
 * Task: IFC-031 FU-005 — extend EntitySearchField with team kind
 */

import { describe, it, expect } from 'vitest';
import { teamRouter } from '../team.router';
import { prismaMock, createTestContext, createPublicContext } from '../../../test/setup';

describe('Team Router', () => {
  const ctx = createTestContext();
  const caller = teamRouter.createCaller(ctx);

  describe('list', () => {
    it('returns teams matching search', async () => {
      prismaMock.team.findMany.mockResolvedValue([
        { id: 't1', name: 'Customer Success', description: null },
        { id: 't2', name: 'Customer Support', description: 'Tier 1' },
      ] as any);

      const result = await caller.list({ search: 'customer', limit: 5 });

      expect(result.teams).toHaveLength(2);
      expect(result.teams[0]).toMatchObject({ id: 't1', name: 'Customer Success' });
    });

    it('returns empty list when no teams match', async () => {
      prismaMock.team.findMany.mockResolvedValue([] as any);

      const result = await caller.list({ search: 'nope', limit: 5 });

      expect(result.teams).toHaveLength(0);
    });

    it('respects the limit parameter', async () => {
      prismaMock.team.findMany.mockResolvedValue([
        { id: 't1', name: 'Alpha', description: null },
      ] as any);

      await caller.list({ limit: 3 });

      expect(prismaMock.team.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    });

    it('throws UNAUTHORIZED without auth context', async () => {
      const publicCtx = createPublicContext();
      const publicCaller = teamRouter.createCaller(publicCtx);

      await expect(publicCaller.list({ limit: 5 })).rejects.toThrow();
    });
  });
});
