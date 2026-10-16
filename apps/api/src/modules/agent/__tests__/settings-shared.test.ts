/**
 * Shared AI-settings router helpers (PG-198; reused by PG-199 model config).
 */
import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  AGENT_SETTINGS_ADMIN_ROLES,
  assertAgentSettingsAdmin,
  isAgentSettingsAdmin,
  isUniqueConstraintError,
  rethrowConflict,
} from '../settings-shared';

describe('agent settings admin gate', () => {
  it('lists the admin-equivalent roles', () => {
    expect(AGENT_SETTINGS_ADMIN_ROLES).toEqual(['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN']);
  });

  it.each(['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'])('accepts %s', (role) => {
    expect(isAgentSettingsAdmin(role)).toBe(true);
    expect(() => assertAgentSettingsAdmin({ user: { role } })).not.toThrow();
  });

  it.each(['USER', 'SALES_REP', 'admin', '', undefined, null])('rejects %s', (role) => {
    expect(isAgentSettingsAdmin(role)).toBe(false);
    expect(() => assertAgentSettingsAdmin({ user: { role } })).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' })
    );
  });

  it('rejects a missing user and names the settings area', () => {
    expect(() => assertAgentSettingsAdmin({ user: null }, 'approval policies')).toThrow(
      /approval policies/
    );
  });
});

describe('unique-constraint helpers', () => {
  it('recognises Prisma P2002 only', () => {
    expect(isUniqueConstraintError({ code: 'P2002' })).toBe(true);
    expect(isUniqueConstraintError({ code: 'P2025' })).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError('P2002')).toBe(false);
  });

  it('maps P2002 to CONFLICT with the given message', () => {
    expect(() => rethrowConflict({ code: 'P2002' }, 'Name taken')).toThrow(
      expect.objectContaining({ code: 'CONFLICT', message: 'Name taken' })
    );
  });

  it('rethrows any other error unchanged', () => {
    const original = new Error('boom');
    expect(() => rethrowConflict(original, 'Name taken')).toThrow(original);
    const trpc = new TRPCError({ code: 'NOT_FOUND' });
    expect(() => rethrowConflict(trpc, 'x')).toThrow(trpc);
  });
});
