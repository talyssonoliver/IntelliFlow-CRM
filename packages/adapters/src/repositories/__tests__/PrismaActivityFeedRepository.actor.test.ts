import { describe, it, expect, vi } from 'vitest';
import { PrismaActivityFeedRepository } from '../PrismaActivityFeedRepository';

/**
 * A stage move records who moved the deal (userId only). The feed names that person instead of
 * showing every move as "System" (MVP-012 #31).
 */
function stageMove(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ae-1',
    type: 'STAGE_CHANGE',
    title: 'Stage changed: Proposal to Negotiation',
    description: null,
    timestamp: new Date('2026-01-13T08:00:00Z'),
    stageFrom: 'PROPOSAL',
    stageTo: 'NEGOTIATION',
    agentName: null,
    confidenceScore: null,
    opportunityId: 'opp-1',
    opportunity: { id: 'opp-1', name: 'Big Deal' },
    userId: 'user-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function setup(rows: unknown[], users: unknown) {
  const none = () => ({ findMany: vi.fn().mockResolvedValue([]) });
  const prisma = {
    leadActivity: none(),
    contactActivity: none(),
    ticketActivity: none(),
    emailRecord: none(),
    callRecord: none(),
    chatMessage: none(),
    activityEvent: { findMany: vi.fn().mockResolvedValue(rows) },
    user: { findMany: users },
  } as any;
  return { prisma, repo: new PrismaActivityFeedRepository(prisma) };
}

async function actorsOf(repo: PrismaActivityFeedRepository) {
  const items = await repo.searchFeed('tenant-1', 'stage', 20, null, {});
  return items.filter((i) => i.source === 'OPPORTUNITY_EVENT').map((i) => i.actor);
}

describe('PrismaActivityFeedRepository opportunity event actor', () => {
  it('names the person who moved the deal', async () => {
    const users = vi.fn().mockResolvedValue([{ id: 'user-1', name: 'Talysson Oliveira' }]);
    const { repo } = setup([stageMove()], users);
    expect(await actorsOf(repo)).toEqual([{ id: 'user-1', name: 'Talysson Oliveira' }]);
    expect(users).toHaveBeenCalledWith({
      where: { id: { in: ['user-1'] } },
      select: { id: true, name: true },
    });
  });

  it('keeps an agent name and does not look it up', async () => {
    const users = vi.fn().mockResolvedValue([]);
    const { repo } = setup([stageMove({ agentName: 'Qualifier agent' })], users);
    expect(await actorsOf(repo)).toEqual([{ id: 'user-1', name: 'Qualifier agent' }]);
    expect(users).not.toHaveBeenCalled();
  });

  it('looks each person up once for many events', async () => {
    const users = vi.fn().mockResolvedValue([{ id: 'user-1', name: 'Talysson Oliveira' }]);
    const { repo } = setup([stageMove(), stageMove({ id: 'ae-2' })], users);
    await actorsOf(repo);
    expect(users.mock.calls[0][0].where.id.in).toEqual(['user-1']);
  });

  it('still lists the entry as System when the lookup fails or the user has no name', async () => {
    const failing = setup([stageMove()], vi.fn().mockRejectedValue(new Error('db down')));
    expect(await actorsOf(failing.repo)).toEqual([{ id: 'user-1', name: 'System' }]);
    const unnamed = setup([stageMove()], vi.fn().mockResolvedValue([{ id: 'user-1', name: null }]));
    expect(await actorsOf(unnamed.repo)).toEqual([{ id: 'user-1', name: 'System' }]);
  });
});
