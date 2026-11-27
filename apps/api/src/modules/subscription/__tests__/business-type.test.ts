/**
 * Owner ruling 23/11/2026: vertical modules follow the tenant's business type.
 * Covers: the moduleAccess router (query + admin-only setter), the server gate refusing a
 * module that is not part of the workspace, and global search skipping tickets.
 */
import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createTestContext, createAdminContext } from '../../../test/setup';
import { moduleAccessRouter } from '../subscription.router';
import { casesRouter } from '../../legal/cases.router';
import { ticketRouter } from '../../ticket/ticket.router';
import { filterToEnabledModules } from '../../misc/global-search.router';
import { isModuleEnabledForTenant } from '../../../shared/module-enabled';
import { MODULE_NOT_IN_WORKSPACE_MESSAGE } from '@intelliflow/domain';

function withPort(ctx: ReturnType<typeof createTestContext>, port: unknown) {
  (ctx.container.get as any).mockImplementation((n: string) =>
    n === 'moduleAccess' ? port : undefined
  );
  return ctx;
}

function port(businessType: string | null = null) {
  return {
    getEnabledModules: vi.fn().mockResolvedValue(['CORE_CRM', 'AI_INTELLIGENCE', 'ANALYTICS']),
    getTenantPlan: vi.fn().mockResolvedValue('PROFESSIONAL'),
    getBusinessType: vi.fn().mockResolvedValue(businessType),
    setBusinessType: vi.fn().mockResolvedValue([]),
    isModuleEnabled: vi.fn().mockResolvedValue(true),
  };
}

describe('moduleAccess.getEnabledModules business type', () => {
  it('asks a workspace admin to choose when no business type is set', async () => {
    const caller = (moduleAccessRouter as any).createCaller(
      withPort(createAdminContext(), port(null))
    );
    const result = await caller.getEnabledModules();
    expect(result.businessType).toBeNull();
    expect(result.needsBusinessType).toBe(true);
  });

  it('does not ask a non-admin member (only the admin can act on it)', async () => {
    const caller = (moduleAccessRouter as any).createCaller(
      withPort(createTestContext(), port(null))
    );
    const result = await caller.getEnabledModules();
    expect(result.needsBusinessType).toBe(false);
  });

  it('does not ask once a business type is set', async () => {
    const caller = (moduleAccessRouter as any).createCaller(
      withPort(createAdminContext(), port('LAW_FIRM'))
    );
    const result = await caller.getEnabledModules();
    expect(result.businessType).toBe('LAW_FIRM');
    expect(result.needsBusinessType).toBe(false);
  });
});

describe('moduleAccess.setBusinessType', () => {
  it('lets a workspace admin set it and returns the refreshed modules', async () => {
    const p = port(null);
    const ctx = withPort(createAdminContext(), p);
    const caller = (moduleAccessRouter as any).createCaller(ctx);

    const result = await caller.setBusinessType({ businessType: 'TRADES_HOME_SERVICES' });

    expect(p.setBusinessType).toHaveBeenCalledWith(ctx.user!.tenantId, 'TRADES_HOME_SERVICES');
    expect(result.businessType).toBe('TRADES_HOME_SERVICES');
    expect(result.needsBusinessType).toBe(false);
    expect(result.modules).toEqual(['CORE_CRM', 'AI_INTELLIGENCE', 'ANALYTICS']);
  });

  it('refuses a non-admin member', async () => {
    const p = port(null);
    const caller = (moduleAccessRouter as any).createCaller(withPort(createTestContext(), p));

    await expect(caller.setBusinessType({ businessType: 'AGENCY' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(p.setBusinessType).not.toHaveBeenCalled();
  });

  it('rejects a value outside the enum', async () => {
    const caller = (moduleAccessRouter as any).createCaller(
      withPort(createAdminContext(), port(null))
    );
    await expect(caller.setBusinessType({ businessType: 'PLUMBER' })).rejects.toBeInstanceOf(
      TRPCError
    );
  });
});

describe('server gate refuses a module that is not part of the workspace', () => {
  function denying(moduleId: string) {
    const ctx = createAdminContext();
    (ctx.container.get as any).mockImplementation((n: string) =>
      n === 'moduleAccess'
        ? { isModuleEnabled: async (_t: string, m: string) => m !== moduleId }
        : undefined
    );
    return ctx;
  }

  it('Cases (LEGAL) are FORBIDDEN with the workspace message', async () => {
    const caller = (casesRouter as any).createCaller(denying('LEGAL'));
    await expect(caller.list({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MODULE_NOT_IN_WORKSPACE_MESSAGE,
    });
  });

  it('Tickets (SUPPORT) are FORBIDDEN with the workspace message', async () => {
    const caller = (ticketRouter as any).createCaller(denying('SUPPORT'));
    await expect(caller.list({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: "Not part of your workspace's modules",
    });
  });
});

describe('global search follows the resolver', () => {
  const all = ['LEAD', 'CONTACT', 'ACCOUNT', 'DEAL', 'TICKET', 'TASK'] as const;

  const ctxWith = (isModuleEnabled: (t: string, m: string) => unknown) => ({
    container: { get: () => ({ isModuleEnabled }) } as any,
  });

  it('leaves tickets out when SUPPORT is not enabled', async () => {
    const types = await filterToEnabledModules(
      ctxWith(async () => false),
      't1',
      all
    );
    expect(types).not.toContain('TICKET');
    expect(types).toEqual(['LEAD', 'CONTACT', 'ACCOUNT', 'DEAL', 'TASK']);
  });

  it('keeps tickets when SUPPORT is enabled', async () => {
    const types = await filterToEnabledModules(
      ctxWith(async () => true),
      't1',
      all
    );
    expect(types).toContain('TICKET');
  });

  it('fails closed when the entitlement lookup throws, still searching core types', async () => {
    const types = await filterToEnabledModules(
      ctxWith(async () => {
        throw new Error('db down');
      }),
      't1',
      all
    );
    expect(types).not.toContain('TICKET');
    expect(types).toContain('LEAD');
  });

  it('fails closed when there is no entitlement service', async () => {
    const types = await filterToEnabledModules(
      { container: { get: () => undefined } as any },
      't1',
      all
    );
    expect(types).not.toContain('TICKET');
  });
});

describe('isModuleEnabledForTenant (contact tickets tab, RAG ticket search)', () => {
  const ctx = (impl: unknown) => ({ container: { get: () => impl } as any });

  it('is true when the resolver says the module is enabled', async () => {
    expect(
      await isModuleEnabledForTenant(ctx({ isModuleEnabled: async () => true }), 't1', 'SUPPORT')
    ).toBe(true);
  });

  it('is false when the module is not part of the workspace', async () => {
    expect(
      await isModuleEnabledForTenant(ctx({ isModuleEnabled: async () => false }), 't1', 'SUPPORT')
    ).toBe(false);
  });

  it('fails closed on a thrown lookup or a missing service', async () => {
    expect(
      await isModuleEnabledForTenant(
        ctx({
          isModuleEnabled: async () => {
            throw new Error('down');
          },
        }),
        't1',
        'SUPPORT'
      )
    ).toBe(false);
    expect(await isModuleEnabledForTenant(ctx(undefined), 't1', 'SUPPORT')).toBe(false);
  });
});
