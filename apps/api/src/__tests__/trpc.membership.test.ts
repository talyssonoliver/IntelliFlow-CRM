/**
 * trpc.ts under ADR-071: authError / PIN_PENDING handling in isAuthed, the home-only registry,
 * the machine-readable `reason` in the error formatter, and platform-admin scoping.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  adminProcedure,
  createTRPCRouter,
  pendingSessionProcedure,
  platformAdminProcedure,
  protectedProcedure,
  tenantProcedure,
} from '../trpc';
import * as trpcModule from '../trpc';
import * as homeOnlyModule from '../security/home-only';
import { membershipError, reasonFromCause } from '../security/membership';

const baseUser = {
  userId: 'u1',
  email: 'op@example.com',
  role: 'ADMIN',
  tenantId: 't-home',
  emailVerified: true,
};

const visiting = {
  ...baseUser,
  tenantId: 't-client',
  homeTenantId: 't-home',
  membershipRole: 'ADMIN' as const,
};
const pinned = { ...visiting, pinned: true };

const router = createTRPCRouter({
  billing: createTRPCRouter({ getPlanState: protectedProcedure.query(() => 'plan') }),
  user: createTRPCRouter({
    updateProfile: protectedProcedure.mutation(() => 'updated'),
    claimLoginGrant: pendingSessionProcedure.mutation(({ ctx }) => ctx.user.tenantId),
  }),
  lead: createTRPCRouter({
    list: protectedProcedure.query(({ ctx }) => ctx.user.tenantId),
  }),
  admin: createTRPCRouter({ only: adminProcedure.query(({ ctx }) => ctx.user?.role) }),
  operator: createTRPCRouter({ only: platformAdminProcedure.query(() => 'operator') }),
  tenantScoped: createTRPCRouter({ who: tenantProcedure.query(({ ctx }) => ctx.tenant.tenantId) }),
});

const caller = (ctx: Record<string, unknown>) => router.createCaller(ctx as never);

async function rejection(promise: Promise<unknown>): Promise<TRPCError> {
  try {
    await promise;
  } catch (error) {
    return error as TRPCError;
  }
  throw new Error('expected a rejection');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAuthed: why there is no user', () => {
  it('is UNAUTHORIZED for an anonymous request', async () => {
    const error = await rejection(caller({ user: null }).lead.list());
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('rethrows the resolution error (unknown tenant header) instead of UNAUTHORIZED', async () => {
    const authError = membershipError('FORBIDDEN', 'NOT_A_MEMBER', 'not yours');
    const error = await rejection(caller({ user: null, authError }).lead.list());
    expect(error).toBe(authError);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('keeps an UNAUTHORIZED pinned-session error as UNAUTHORIZED', async () => {
    const authError = new TRPCError({ code: 'UNAUTHORIZED', message: 'ended' });
    const error = await rejection(caller({ user: null, authError }).lead.list());
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.message).toBe('ended');
  });

  it('answers an unclaimed staff-link session with FORBIDDEN PIN_PENDING on every procedure', async () => {
    const pendingUser = { ...baseUser, pinPending: true };
    for (const call of [
      () => caller({ user: null, pendingUser }).lead.list(),
      () => caller({ user: null, pendingUser }).billing.getPlanState(),
      () => caller({ user: null, pendingUser }).tenantScoped.who(),
      () => caller({ user: null, pendingUser }).admin.only(),
    ]) {
      const error = await rejection(call());
      expect(error.code).toBe('FORBIDDEN');
      expect(reasonFromCause(error.cause)).toBe('PIN_PENDING');
    }
  });
});

describe('pendingSessionProcedure', () => {
  it('promotes the pending user so user.claimLoginGrant can bind the session', async () => {
    const pendingUser = { ...baseUser, tenantId: 't-home', pinPending: true, sessionId: 's1' };
    await expect(caller({ user: null, pendingUser }).user.claimLoginGrant()).resolves.toBe(
      't-home'
    );
  });

  it('still works for an ordinary signed-in session', async () => {
    await expect(caller({ user: baseUser }).user.claimLoginGrant()).resolves.toBe('t-home');
  });

  it('is UNAUTHORIZED with no session at all', async () => {
    const error = await rejection(caller({ user: null }).user.claimLoginGrant());
    expect(error.code).toBe('UNAUTHORIZED');
  });
});

describe('home-only guard in isAuthed', () => {
  it('lets a user at home reach billing and profile', async () => {
    const atHome = { ...baseUser, homeTenantId: 't-home' };
    await expect(caller({ user: atHome }).billing.getPlanState()).resolves.toBe('plan');
    await expect(caller({ user: atHome }).user.updateProfile()).resolves.toBe('updated');
  });

  it('refuses a PINNED session billing and profile with HOME_ONLY', async () => {
    for (const call of [
      () => caller({ user: pinned }).billing.getPlanState(),
      () => caller({ user: pinned }).user.updateProfile(),
    ]) {
      const error = await rejection(call());
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toMatch(/^HOME_ONLY:/);
      expect(reasonFromCause(error.cause)).toBe('HOME_ONLY');
    }
  });

  it('refuses a member acting outside home billing and profile (P), but not CRM work', async () => {
    const billing = await rejection(caller({ user: visiting }).billing.getPlanState());
    expect(reasonFromCause(billing.cause)).toBe('HOME_ONLY');
    const profile = await rejection(caller({ user: visiting }).user.updateProfile());
    expect(reasonFromCause(profile.cause)).toBe('HOME_ONLY');

    await expect(caller({ user: visiting }).lead.list()).resolves.toBe('t-client');
    await expect(caller({ user: pinned }).lead.list()).resolves.toBe('t-client');
  });

  it('has exactly one home-only mechanism: the path registry applied in isAuthed', async () => {
    // A `homeOnly` middleware used to be exported beside the registry. Nothing attached it, so
    // it passed every gate while protecting nothing. The registry is the only enforcement.
    expect(trpcModule).not.toHaveProperty('homeOnly');
    expect(homeOnlyModule).not.toHaveProperty('explicitHomeOnlyViolation');
  });
});

describe('tenant scoping uses the ACTIVE tenant', () => {
  it('binds ctx.tenant to the active tenant, not the home tenant', async () => {
    await expect(caller({ user: visiting }).tenantScoped.who()).resolves.toBe('t-client');
    await expect(caller({ user: pinned }).tenantScoped.who()).resolves.toBe('t-client');
    await expect(caller({ user: baseUser }).tenantScoped.who()).resolves.toBe('t-home');
  });

  it('uses the membership role for admin checks inside the visited tenant', async () => {
    await expect(caller({ user: { ...visiting, role: 'ADMIN' } }).admin.only()).resolves.toBe(
      'ADMIN'
    );
    const error = await rejection(caller({ user: { ...visiting, role: 'USER' } }).admin.only());
    expect(error.code).toBe('FORBIDDEN');
  });
});

describe('platform admin is scoped to the operator own workspace', () => {
  it('allows the verified operator at home', async () => {
    vi.stubEnv('PLATFORM_ADMIN_EMAILS', 'op@example.com');
    await expect(caller({ user: baseUser }).operator.only()).resolves.toBe('operator');
  });

  it('refuses the same operator while acting in another tenant, or pinned', async () => {
    vi.stubEnv('PLATFORM_ADMIN_EMAILS', 'op@example.com');
    for (const user of [visiting, pinned]) {
      const error = await rejection(caller({ user }).operator.only());
      expect(error.code).toBe('FORBIDDEN');
    }
  });
});

describe('errorFormatter exposes the machine reason', () => {
  const formatter = (
    router as unknown as {
      _def: {
        _config: {
          errorFormatter: (opts: Record<string, unknown>) => { data: Record<string, unknown> };
        };
      };
    }
  )._def._config.errorFormatter;

  const shapeFor = (error: TRPCError) =>
    formatter({
      error,
      type: 'query',
      path: 'x',
      input: undefined,
      ctx: undefined,
      shape: { message: error.message, code: -32003, data: { code: error.code } },
    });

  it('copies cause.reason to data.reason', () => {
    const shape = shapeFor(membershipError('FORBIDDEN', 'ASSERTION_INVALID', 'bad'));
    expect(shape.data.reason).toBe('ASSERTION_INVALID');
  });

  it('is null when there is no reason', () => {
    const shape = shapeFor(new TRPCError({ code: 'FORBIDDEN', message: 'plain' }));
    expect(shape.data.reason).toBeNull();
  });
});
