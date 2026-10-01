/**
 * subscription.toggleModule is a platform-operator action (ADR-070): a tenant's own
 * ADMIN must not be able to grant the tenant modules it has not paid for.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createAdminContext, createTestContext } from '../../../test/setup';
import { moduleAccessRouter } from '../subscription.router';

const OPS = 'ops@leangency.test';

function ctxFor(base: ReturnType<typeof createTestContext>, moduleAccess: unknown) {
  (base.container.get as any).mockImplementation((n: string) =>
    n === 'moduleAccess' ? moduleAccess : undefined
  );
  return base;
}

function port() {
  return {
    enableModule: vi.fn().mockResolvedValue({}),
    disableModule: vi.fn().mockResolvedValue({}),
    getEnabledModules: vi.fn().mockResolvedValue(['CORE_CRM', 'LEGAL']),
    getTenantPlan: vi.fn().mockResolvedValue('STARTER'),
  };
}

const operator = (tenantId: string, emailVerified = true) => ({
  userId: 'u',
  email: OPS,
  role: 'USER',
  tenantId,
  emailVerified,
});

beforeEach(() => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
});
afterEach(() => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
});

describe('moduleAccess.toggleModule', () => {
  it('rejects a tenant ADMIN who is not a platform operator (allowlist unset)', async () => {
    const m = port();
    const caller = (moduleAccessRouter as any).createCaller(ctxFor(createAdminContext(), m));

    await expect(caller.toggleModule({ moduleId: 'LEGAL', enabled: true })).rejects.toSatisfy(
      (e: unknown) => e instanceof TRPCError && e.code === 'FORBIDDEN'
    );
    expect(m.enableModule).not.toHaveBeenCalled();
  });

  it('rejects an allow-listed address whose email is not verified', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = OPS;
    const m = port();
    const ctx = createAdminContext({ user: operator('t', false) });
    const caller = (moduleAccessRouter as any).createCaller(ctxFor(ctx, m));

    await expect(caller.toggleModule({ moduleId: 'LEGAL', enabled: true })).rejects.toThrow(
      /Platform administrator/
    );
  });

  it('lets a verified platform operator enable a module for their own tenant', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = OPS;
    const m = port();
    const ctx = createAdminContext({ user: operator('own-tenant') });
    const caller = (moduleAccessRouter as any).createCaller(ctxFor(ctx, m));

    const out = await caller.toggleModule({ moduleId: 'LEGAL', enabled: true });

    expect(m.enableModule).toHaveBeenCalledWith('own-tenant', 'LEGAL');
    expect(out).toEqual({ modules: ['CORE_CRM', 'LEGAL'], plan: 'STARTER' });
  });

  it('lets an operator target another tenant and disable a module', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = OPS;
    const m = port();
    const ctx = createAdminContext({ user: operator('own-tenant') });
    const caller = (moduleAccessRouter as any).createCaller(ctxFor(ctx, m));

    await caller.toggleModule({ moduleId: 'LEGAL', enabled: false, tenantId: 'client-tenant' });

    expect(m.disableModule).toHaveBeenCalledWith('client-tenant', 'LEGAL');
  });

  it('never toggles CORE_CRM, and fails when the module service is not wired', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = OPS;
    const user = operator('t');
    const wired = (moduleAccessRouter as any).createCaller(
      ctxFor(createAdminContext({ user }), port())
    );
    await expect(wired.toggleModule({ moduleId: 'CORE_CRM', enabled: false })).rejects.toSatisfy(
      (e: unknown) => e instanceof TRPCError && e.code === 'BAD_REQUEST'
    );

    const unwired = (moduleAccessRouter as any).createCaller(
      ctxFor(createAdminContext({ user }), undefined)
    );
    await expect(unwired.toggleModule({ moduleId: 'LEGAL', enabled: true })).rejects.toSatisfy(
      (e: unknown) => e instanceof TRPCError && e.code === 'INTERNAL_SERVER_ERROR'
    );
  });
});
