import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@intelliflow/db';
import { PrismaPublicFeedbackRepository } from '../PrismaPublicFeedbackRepository';

describe('PrismaPublicFeedbackRepository', () => {
  function makeMockPrisma(stub: unknown): PrismaClient {
    return {
      publicFeedback: {
        create: vi.fn().mockResolvedValue(stub),
      },
    } as unknown as PrismaClient;
  }

  it('calls prisma.publicFeedback.create with the expected fields', async () => {
    const stub = {
      id: 'cuid-1',
      rating: 4,
      comment: 'Great',
      email: null,
      source: '/features',
      userAgent: null,
      ipHash: 'h',
      createdAt: new Date('2026-04-24T10:00:00Z'),
    };
    const prisma = makeMockPrisma(stub);
    const repo = new PrismaPublicFeedbackRepository(prisma);

    const result = await repo.create({
      rating: 4,
      comment: 'Great',
      email: null,
      source: '/features',
      userAgent: null,
      ipHash: 'h',
    });

    expect(result).toEqual(stub);
    const create = (prisma as unknown as {
      publicFeedback: { create: ReturnType<typeof vi.fn> };
    }).publicFeedback.create;
    expect(create).toHaveBeenCalledWith({
      data: {
        rating: 4,
        comment: 'Great',
        email: null,
        source: '/features',
        userAgent: null,
        ipHash: 'h',
      },
    });
  });

  it('coerces undefined optionals to null', async () => {
    const stub = {
      id: 'cuid-2',
      rating: 3,
      comment: null,
      email: null,
      source: '/',
      userAgent: null,
      ipHash: 'h',
      createdAt: new Date(),
    };
    const prisma = makeMockPrisma(stub);
    const repo = new PrismaPublicFeedbackRepository(prisma);

    await repo.create({
      rating: 3,
      source: '/',
      ipHash: 'h',
    });

    const create = (prisma as unknown as {
      publicFeedback: { create: ReturnType<typeof vi.fn> };
    }).publicFeedback.create;
    expect(create).toHaveBeenCalledWith({
      data: {
        rating: 3,
        comment: null,
        email: null,
        source: '/',
        userAgent: null,
        ipHash: 'h',
      },
    });
  });

  it('bubbles Prisma errors unchanged', async () => {
    const error = new Error('unique constraint');
    const prisma = {
      publicFeedback: {
        create: vi.fn().mockRejectedValue(error),
      },
    } as unknown as PrismaClient;
    const repo = new PrismaPublicFeedbackRepository(prisma);
    await expect(
      repo.create({ rating: 3, source: '/', ipHash: 'h' }),
    ).rejects.toThrow('unique constraint');
  });
});
