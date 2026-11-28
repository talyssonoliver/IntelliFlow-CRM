/**
 * Survey routers (MVP-012): the staff `send` / settings calls and the public answer router.
 * Invented names only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { feedbackSurveyRouter } from '../feedbackSurvey.router';
import {
  publicSurveyRouter,
  surveyLookupLimiter,
  surveySubmitLimiter,
} from '../publicSurvey.router';
import { hashSurveyToken } from '../survey-token';

const TENANT = '00000000-0000-4000-8000-000000000001';
const TOKEN = 'k'.repeat(43);

function staffCtx(overrides: Record<string, unknown> = {}) {
  const prismaWithTenant = {
    contact: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.id === 'c1' && where.tenantId === TENANT
          ? {
              id: 'c1',
              email: 'mara@example.invalid',
              firstName: 'Mara',
              lastName: 'Quill',
              accountId: null,
            }
          : null
      ),
    },
    tenant: { findUnique: vi.fn(async () => ({ name: 'Harbour Mill Co' })) },
    feedbackSurvey: {
      create: vi.fn(async () => ({ id: 's1' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    processingRestriction: { findFirst: vi.fn(async () => null) },
    feedbackSurveySetting: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
  };
  return {
    // The tenant middleware derives prismaWithTenant from prisma, so the stand-in goes here.
    prisma: prismaWithTenant,
    prismaWithTenant,
    user: {
      userId: 'u1',
      email: 'a@example.invalid',
      role: 'ADMIN',
      tenantId: TENANT,
      emailVerified: true,
    },
    tenant: {
      tenantId: TENANT,
      tenantType: 'user',
      userId: 'u1',
      role: 'ADMIN',
      canAccessAllTenantData: false,
    },
    adapters: { notificationService: { sendEmail: vi.fn(async () => ({ isFailure: false })) } },
    services: {},
    ...overrides,
  } as any;
}

describe('feedbackSurvey.send', () => {
  it('emails the contact and reports delivery', async () => {
    const ctx = staffCtx();
    const caller = feedbackSurveyRouter.createCaller(ctx);
    const result = await caller.send({ contactId: 'c1', surveyType: 'CSAT' });
    expect(result).toEqual({ surveyId: 's1', delivered: true });
    expect(ctx.adapters.notificationService.sendEmail).toHaveBeenCalledOnce();
    const created = ctx.prismaWithTenant.feedbackSurvey.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      tenantId: TENANT,
      type: 'CSAT',
      trigger: 'MANUAL',
      sentById: 'u1',
    });
  });

  it('a contact outside the tenant is NOT_FOUND', async () => {
    const caller = feedbackSurveyRouter.createCaller(staffCtx());
    await expect(caller.send({ contactId: 'c-other', surveyType: 'NPS' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('refuses CES (not a sendable type) and body tenant ids', async () => {
    const caller = feedbackSurveyRouter.createCaller(staffCtx());
    await expect(caller.send({ contactId: 'c1', surveyType: 'CES' } as any)).rejects.toThrow();
    await expect(
      caller.send({ contactId: 'c1', surveyType: 'NPS', tenantId: 'x' } as any)
    ).rejects.toThrow();
  });

  it('says so when email sending is not set up', async () => {
    const caller = feedbackSurveyRouter.createCaller(staffCtx({ adapters: {} }));
    await expect(caller.send({ contactId: 'c1', surveyType: 'NPS' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });
});

describe('feedbackSurvey settings', () => {
  it('defaults both switches ON when the tenant has no row', async () => {
    const caller = feedbackSurveyRouter.createCaller(staffCtx());
    expect(await caller.getSettings()).toEqual({
      autoSendOnDealWon: true,
      autoSendOnTicketResolved: true,
    });
  });

  it('saves the switches for the session tenant', async () => {
    const ctx = staffCtx();
    const caller = feedbackSurveyRouter.createCaller(ctx);
    await caller.updateSettings({ autoSendOnDealWon: false, autoSendOnTicketResolved: true });
    expect(ctx.prismaWithTenant.feedbackSurveySetting.upsert).toHaveBeenCalledWith({
      where: { tenantId: TENANT },
      create: { tenantId: TENANT, autoSendOnDealWon: false, autoSendOnTicketResolved: true },
      update: { autoSendOnDealWon: false, autoSendOnTicketResolved: true },
    });
  });
});

describe('publicSurvey router', () => {
  const row = {
    id: 's1',
    tenantId: TENANT,
    type: 'NPS',
    status: 'SENT',
    tokenExpiresAt: new Date(Date.now() + 86_400_000),
    tokenUsedAt: null,
  };

  function publicCtx(found: unknown = row) {
    const prisma = {
      tenant: { findUnique: vi.fn(async () => ({ name: 'Harbour Mill Co' })) },
      feedbackSurvey: {
        findUnique: vi.fn(async ({ where }: any) =>
          found && where.tokenHash === hashSurveyToken(TOKEN) ? found : null
        ),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    return {
      ctx: {
        prisma,
        req: new Request('http://x', { headers: { 'x-forwarded-for': '9.9.9.9' } }),
      } as any,
      prisma,
    };
  }

  beforeEach(() => {
    surveyLookupLimiter.reset();
    surveySubmitLimiter.reset();
  });

  it('get returns the company name and nothing else about the tenant', async () => {
    const { ctx } = publicCtx();
    const result = await publicSurveyRouter.createCaller(ctx).get({ token: TOKEN });
    expect(result).toEqual({ status: 'ok', surveyType: 'NPS', companyName: 'Harbour Mill Co' });
  });

  it('get for an unknown token says invalid', async () => {
    const { ctx } = publicCtx(null);
    expect(await publicSurveyRouter.createCaller(ctx).get({ token: TOKEN })).toEqual({
      status: 'invalid',
    });
  });

  it('rejects malformed tokens and extra fields before any database read', async () => {
    const { ctx, prisma } = publicCtx();
    const caller = publicSurveyRouter.createCaller(ctx);
    await expect(caller.get({ token: 'short' })).rejects.toThrow();
    await expect(caller.submit({ token: TOKEN, score: 5, tenantId: 'x' } as any)).rejects.toThrow();
    await expect(caller.submit({ token: TOKEN, score: 11 })).rejects.toThrow();
    expect(prisma.feedbackSurvey.findUnique).not.toHaveBeenCalled();
  });

  it('submit stores the answer', async () => {
    const { ctx, prisma } = publicCtx();
    const result = await publicSurveyRouter
      .createCaller(ctx)
      .submit({ token: TOKEN, score: 10, comment: 'Lovely' });
    expect(result).toEqual({ status: 'ok' });
    expect((prisma.feedbackSurvey.updateMany.mock.calls as any)[0][0].data).toMatchObject({
      score: 10,
      comment: 'Lovely',
      status: 'RESPONDED',
    });
  });

  it('throttles a second submit from the same address', async () => {
    const { ctx } = publicCtx();
    const caller = publicSurveyRouter.createCaller(ctx);
    await caller.submit({ token: TOKEN, score: 10 });
    await expect(caller.submit({ token: TOKEN, score: 10 })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });
});
