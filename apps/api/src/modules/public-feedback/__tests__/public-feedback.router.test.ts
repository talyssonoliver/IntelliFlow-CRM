/**
 * Public Feedback Router Tests — PG-126
 *
 * Covers anonymous visitor feedback submission via `publicFeedback.submit`:
 *  - Happy path with minimal + full input
 *  - Honeypot trip → BAD_REQUEST
 *  - Bad input (rating out of bounds) → BAD_REQUEST via zod
 *  - Rate limit via injected PublicRateLimiter → TOO_MANY_REQUESTS
 *  - IP extraction from x-forwarded-for / x-real-ip / fallback
 *  - Service receives hashed IP, not raw IP
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  publicFeedbackRouter,
  extractClientIp,
} from '../public-feedback.router';
import {
  publicFeedbackLimiter,
  PublicRateLimiter,
} from '../../../security/public-rate-limiter';
import type { BaseContext } from '../../../context';

interface MockPublicFeedbackService {
  submit: ReturnType<typeof vi.fn>;
}

function makeMockService(): MockPublicFeedbackService {
  return { submit: vi.fn().mockResolvedValue({ success: true, id: 'feedback-1' }) };
}

function makeCtx(
  service: MockPublicFeedbackService,
  req?: Request
): BaseContext {
  return {
    prisma: {} as never,
    container: {} as never,
    services: { publicFeedback: service } as never,
    security: {} as never,
    adapters: {} as never,
    user: undefined,
    req,
    res: undefined,
  };
}

beforeEach(() => {
  publicFeedbackLimiter.reset();
  vi.restoreAllMocks();
});

describe('extractClientIp', () => {
  it('returns first IP from x-forwarded-for', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
    });
    expect(extractClientIp(req)).toBe('1.1.1.1');
  });

  it('falls back to x-real-ip when no forwarded header', () => {
    const req = new Request('http://x', {
      headers: { 'x-real-ip': '3.3.3.3' },
    });
    expect(extractClientIp(req)).toBe('3.3.3.3');
  });

  it('returns unknown when no headers and no req', () => {
    expect(extractClientIp(undefined)).toBe('unknown');
    const req = new Request('http://x');
    expect(extractClientIp(req)).toBe('unknown');
  });
});

describe('publicFeedbackRouter.submit', () => {
  it('persists minimal input via the service and returns { success, id }', async () => {
    const service = makeMockService();
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '9.9.9.9' },
    });
    const caller = publicFeedbackRouter.createCaller(makeCtx(service, req));

    const result = await caller.submit({
      rating: 4,
      source: '/features',
    });

    expect(result).toEqual({ success: true, id: 'feedback-1' });
    expect(service.submit).toHaveBeenCalledTimes(1);
    const [payload, ipHash] = service.submit.mock.calls[0];
    expect(payload.rating).toBe(4);
    expect(payload.source).toBe('/features');
    expect((payload as Record<string, unknown>).__honeypot).toBeUndefined();
    // Service receives hashed IP, not raw IP
    expect(ipHash).not.toBe('9.9.9.9');
    expect(ipHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts optional comment, email, userAgent', async () => {
    const service = makeMockService();
    const caller = publicFeedbackRouter.createCaller(makeCtx(service));
    await caller.submit({
      rating: 5,
      source: '/features',
      comment: 'Looks good',
      email: 'visitor@example.com',
      userAgent: 'Mozilla/5.0',
    });
    const [payload] = service.submit.mock.calls[0];
    expect(payload.comment).toBe('Looks good');
    expect(payload.email).toBe('visitor@example.com');
    expect(payload.userAgent).toBe('Mozilla/5.0');
  });

  it('rejects rating > 5 with BAD_REQUEST', async () => {
    const service = makeMockService();
    const caller = publicFeedbackRouter.createCaller(makeCtx(service));
    try {
      await caller.submit({ rating: 6, source: '/x' } as never);
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('BAD_REQUEST');
    }
    expect(service.submit).not.toHaveBeenCalled();
  });

  it('rejects invalid email with BAD_REQUEST', async () => {
    const service = makeMockService();
    const caller = publicFeedbackRouter.createCaller(makeCtx(service));
    await expect(
      caller.submit({
        rating: 3,
        source: '/x',
        email: 'not-an-email',
      })
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it('rejects non-empty honeypot with BAD_REQUEST', async () => {
    const service = makeMockService();
    const caller = publicFeedbackRouter.createCaller(makeCtx(service));
    try {
      await caller.submit({
        rating: 3,
        source: '/x',
        __honeypot: 'spam',
      } as never);
      expect.fail('should throw');
    } catch (err) {
      expect((err as TRPCError).code).toBe('BAD_REQUEST');
    }
    expect(service.submit).not.toHaveBeenCalled();
  });

  it('accepts empty honeypot (legitimate submission)', async () => {
    const service = makeMockService();
    const caller = publicFeedbackRouter.createCaller(makeCtx(service));
    await caller.submit({
      rating: 3,
      source: '/x',
      __honeypot: '',
    });
    expect(service.submit).toHaveBeenCalled();
  });

  it('throws TOO_MANY_REQUESTS on second submit within 10 min window', async () => {
    const service = makeMockService();
    const caller = publicFeedbackRouter.createCaller(makeCtx(service));
    await caller.submit({ rating: 3, source: '/x' });
    try {
      await caller.submit({ rating: 4, source: '/x' });
      expect.fail('should throw');
    } catch (err) {
      expect((err as TRPCError).code).toBe('TOO_MANY_REQUESTS');
    }
  });

  it('different IPs are rate-limited independently', async () => {
    const service = makeMockService();
    const reqA = new Request('http://x', {
      headers: { 'x-forwarded-for': '1.1.1.1' },
    });
    const reqB = new Request('http://x', {
      headers: { 'x-forwarded-for': '2.2.2.2' },
    });
    const callerA = publicFeedbackRouter.createCaller(makeCtx(service, reqA));
    const callerB = publicFeedbackRouter.createCaller(makeCtx(service, reqB));
    await callerA.submit({ rating: 3, source: '/x' });
    await expect(
      callerB.submit({ rating: 4, source: '/x' })
    ).resolves.toBeDefined();
  });

  it('throws INTERNAL_SERVER_ERROR when service is missing', async () => {
    const caller = publicFeedbackRouter.createCaller({
      prisma: {} as never,
      container: {} as never,
      services: {} as never,
      security: {} as never,
      adapters: {} as never,
      user: undefined,
    });
    try {
      await caller.submit({ rating: 3, source: '/x' });
      expect.fail('should throw');
    } catch (err) {
      expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
    }
  });

  it('hashes IP with sha256 (no raw IP passed to service)', async () => {
    const service = makeMockService();
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '10.20.30.40' },
    });
    const caller = publicFeedbackRouter.createCaller(makeCtx(service, req));
    await caller.submit({ rating: 3, source: '/x' });
    const [, ipHash] = service.submit.mock.calls[0];
    expect(ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(ipHash).not.toContain('10.20.30.40');
    // Hash is deterministic with the configured salt
    const salt = process.env.PUBLIC_FEEDBACK_IP_SALT ?? 'pg-126-default-salt';
    expect(ipHash).toBe(PublicRateLimiter.hashIp('10.20.30.40', salt));
  });
});
