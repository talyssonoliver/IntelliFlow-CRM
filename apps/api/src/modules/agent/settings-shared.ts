/**
 * Shared helpers for AI & Agents settings routers (PG-198 approval policies;
 * PG-199 model configuration follows in this folder).
 */

import { TRPCError } from '@trpc/server';

/** Roles that may change AI & Agents settings (same set as ACCOUNT_OWNER_ADMIN_ROLES). */
export const AGENT_SETTINGS_ADMIN_ROLES = ['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'] as const;

const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(AGENT_SETTINGS_ADMIN_ROLES);

export function isAgentSettingsAdmin(role: string | null | undefined): boolean {
  return ADMIN_ROLE_SET.has(role ?? '');
}

export function assertAgentSettingsAdmin(
  ctx: { user?: { role?: string | null } | null },
  what = 'AI settings'
): void {
  if (isAgentSettingsAdmin(ctx.user?.role)) return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `Only admins and managers can change ${what}.`,
  });
}

export function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { code?: string }).code === 'P2002';
}

/** Prisma P2002 → CONFLICT with an actionable message; anything else is rethrown as-is. */
export function rethrowConflict(err: unknown, message: string): never {
  if (isUniqueConstraintError(err)) {
    throw new TRPCError({ code: 'CONFLICT', message });
  }
  throw err;
}
