import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { PublicFeedbackService } from '../public-feedback.service';
import type {
  CreatePublicFeedbackInput,
  PublicFeedbackRecord,
  PublicFeedbackRepositoryPort,
} from '@intelliflow/application';

function makeRepo(): PublicFeedbackRepositoryPort & {
  create: ReturnType<typeof vi.fn>;
} {
  return { create: vi.fn() as never };
}

const baseRecord: PublicFeedbackRecord = {
  id: 'feedback-1',
  rating: 4,
  comment: null,
  email: null,
  source: '/features',
  userAgent: null,
  ipHash: 'h',
  createdAt: new Date('2026-04-24T10:00:00Z'),
};

describe('PublicFeedbackService', () => {
  it('delegates to repository.create and returns { success, id }', async () => {
    const repo = makeRepo();
    repo.create.mockResolvedValue(baseRecord);
    const svc = new PublicFeedbackService(repo);
    const result = await svc.submit(
      {
        rating: 4,
        source: '/features',
      },
      'hashed-ip'
    );
    expect(result).toEqual({ success: true, id: 'feedback-1' });
    expect(repo.create).toHaveBeenCalledWith({
      rating: 4,
      comment: null,
      email: null,
      source: '/features',
      userAgent: null,
      ipHash: 'hashed-ip',
    });
  });

  it('persists optional fields when provided', async () => {
    const repo = makeRepo();
    repo.create.mockResolvedValue(baseRecord);
    const svc = new PublicFeedbackService(repo);
    await svc.submit(
      {
        rating: 5,
        source: '/features',
        comment: 'Great',
        email: 'user@example.com',
        userAgent: 'Mozilla/5.0',
      },
      'h'
    );
    const call = repo.create.mock.calls[0][0] as CreatePublicFeedbackInput;
    expect(call.comment).toBe('Great');
    expect(call.email).toBe('user@example.com');
    expect(call.userAgent).toBe('Mozilla/5.0');
  });

  it('strips __honeypot before persistence', async () => {
    const repo = makeRepo();
    repo.create.mockResolvedValue(baseRecord);
    const svc = new PublicFeedbackService(repo);
    await svc.submit(
      {
        rating: 3,
        source: '/features',
        __honeypot: '',
      } as never,
      'h'
    );
    const call = repo.create.mock.calls[0][0] as Record<string, unknown>;
    expect(call.__honeypot).toBeUndefined();
  });

  it('wraps non-TRPC repository errors as INTERNAL_SERVER_ERROR', async () => {
    const repo = makeRepo();
    repo.create.mockRejectedValue(new Error('db down'));
    const svc = new PublicFeedbackService(repo);
    try {
      await svc.submit({ rating: 3, source: '/x' }, 'h');
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
    }
  });

  it('re-throws TRPCError unchanged', async () => {
    const repo = makeRepo();
    repo.create.mockRejectedValue(new TRPCError({ code: 'BAD_REQUEST', message: 'nope' }));
    const svc = new PublicFeedbackService(repo);
    try {
      await svc.submit({ rating: 3, source: '/x' }, 'h');
      expect.fail('should throw');
    } catch (err) {
      expect((err as TRPCError).code).toBe('BAD_REQUEST');
    }
  });
});
