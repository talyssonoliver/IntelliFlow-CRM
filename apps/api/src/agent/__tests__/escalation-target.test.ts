/**
 * PG-198: an agent-action escalation target must hold the approve AND reject permissions
 * (real rbac.hasPermission against a fake permission store; a per-user deny wins).
 */
import { describe, it, expect, vi } from 'vitest';
import { canDecideAgentActions } from '../escalation-target';

const TENANT = 'tenant-esc';

function prismaWith(opts: { override?: { granted: boolean } | null; roleGrants?: boolean[] }) {
  return {
    userPermission: { findFirst: vi.fn().mockResolvedValue(opts.override ?? null) },
    userRoleAssignment: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          (opts.roleGrants ?? []).map((granted) => ({ role: { permissions: [{ granted }] } }))
        ),
    },
  };
}

describe('canDecideAgentActions', () => {
  it('lets an ADMIN decide without reading permissions', async () => {
    const prisma = prismaWith({});
    await expect(
      canDecideAgentActions(prisma as never, TENANT, {
        id: 'u-admin',
        email: 'a@example.invalid',
        role: 'ADMIN',
      })
    ).resolves.toBe(true);
    expect(prisma.userPermission.findFirst).not.toHaveBeenCalled();
  });

  it('refuses a manager with an explicit per-user deny', async () => {
    await expect(
      canDecideAgentActions(prismaWith({ override: { granted: false } }) as never, TENANT, {
        id: 'u-denied',
        email: 'd@example.invalid',
        role: 'MANAGER',
      })
    ).resolves.toBe(false);
  });

  it('accepts a manager whose role grants both approve and reject', async () => {
    await expect(
      canDecideAgentActions(prismaWith({ roleGrants: [true] }) as never, TENANT, {
        id: 'u-granted',
        email: 'g@example.invalid',
        role: 'MANAGER',
      })
    ).resolves.toBe(true);
  });

  it('refuses a user with no grant at all', async () => {
    await expect(
      canDecideAgentActions(prismaWith({}) as never, TENANT, {
        id: 'u-none',
        email: 'n@example.invalid',
        role: 'USER',
      })
    ).resolves.toBe(false);
  });
});
