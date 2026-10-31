import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

const logAction = vi.fn();
const logPermissionDenied = vi.fn();
vi.mock('../../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction, logPermissionDenied }),
}));

import { assertTaskAutomationAdmin, logTaskAutomationAudit } from '../task-automation-admin';

function ctx(role: string | undefined) {
  return {
    user: role ? { role } : undefined,
    tenant: { tenantId: 'tenant-1', userId: 'user-1' },
    prisma: {},
    prismaWithTenant: {},
  } as never;
}

describe('assertTaskAutomationAdmin (PG-208)', () => {
  beforeEach(() => {
    logAction.mockReset().mockResolvedValue('a');
    logPermissionDenied.mockReset().mockResolvedValue('d');
  });

  it.each(['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'])('lets %s manage rules', (role) => {
    expect(() => assertTaskAutomationAdmin(ctx(role))).not.toThrow();
    expect(logPermissionDenied).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'OWNER', 'SUPER_ADMIN'])('lets %s manage webhooks', (role) => {
    expect(() => assertTaskAutomationAdmin(ctx(role), 'webhooks')).not.toThrow();
  });

  it('keeps MANAGER off webhooks and logs the denial', () => {
    expect(() => assertTaskAutomationAdmin(ctx('MANAGER'), 'webhooks', 'rule-1')).toThrow(
      TRPCError
    );
    expect(logPermissionDenied).toHaveBeenCalledWith(
      'task',
      'rule-1',
      'task_automation:webhooks',
      'tenant-1',
      {
        actorId: 'user-1',
      }
    );
  });

  it.each([['USER'], [undefined]])('refuses %s with FORBIDDEN and logs it', (role) => {
    let caught: unknown;
    try {
      assertTaskAutomationAdmin(ctx(role));
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: 'FORBIDDEN' });
    expect(logPermissionDenied).toHaveBeenCalledWith(
      'task',
      'task_automation',
      'task_automation:write',
      'tenant-1',
      { actorId: 'user-1' }
    );
  });

  it('swallows audit failures', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logPermissionDenied.mockRejectedValueOnce(new Error('db down'));
    expect(() => assertTaskAutomationAdmin(ctx('USER'))).toThrow(TRPCError);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('logTaskAutomationAudit', () => {
  it('records the operation and safe fields only', () => {
    logAction.mockReset().mockResolvedValue('a');
    logTaskAutomationAudit(ctx('ADMIN'), 'UPDATE', 'rule-1', 'rules.setActive', { isActive: true });
    expect(logAction).toHaveBeenCalledWith('UPDATE', 'task', 'rule-1', 'tenant-1', {
      actorId: 'user-1',
      actionReason: 'task_automation.rules.setActive',
      afterState: { isActive: true },
    });
  });
});
