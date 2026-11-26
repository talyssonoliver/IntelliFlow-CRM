/**
 * AI Provider Key Router - PG-199 BYOK ("Your own AI key" on the Model Config page).
 *
 * A workspace admin stores their own provider key; the ai-worker then runs that workspace's
 * chat calls on it. The key is written only as a plain string through the field-encryption
 * client after `requireEncryptionKey()` (nothing is written without it), checked once with a
 * cheap read-only provider call before it is stored, and NEVER returned, logged or audited:
 * clients see only provider, last 4 characters, status, fallback switch and dates, and the
 * audit trail records "set" / "removed" with the provider and last 4. Everything is
 * admin-only and tenant-scoped by an explicit tenantId (`prismaWithTenant` does not inject
 * it). Writes that take a key are rate-limited.
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  aiKeyProviderSchema,
  aiProviderKeySecretSchema,
  keyLast4,
  setAIProviderKeySchema,
  updateAIProviderKeyOptionsSchema,
  type AIKeyProvider,
  type AIKeyStatus,
  type AIProviderKeyDto,
} from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import type { TenantAwareContext } from '../../security/tenant-context';
import { getAuditLogger } from '../../security/audit-logger';
import { createDistributedRateLimitMiddleware } from '../../middleware/rate-limit';
import { requireEncryptionKey } from '../email/encryption-guard';
import { checkProviderKey, type KeyCheckResult } from './ai-provider-key-check';

type KeyCtx = Pick<TenantAwareContext, 'tenant' | 'prismaWithTenant' | 'user' | 'prisma'>;

const SETTINGS_NAME = 'the AI provider key';

/**
 * Who may manage the workspace's own provider key. Narrower than the other AI settings (which
 * managers also edit): the key decides where every prompt of the workspace is sent and who
 * pays for it, so it is admin-only (owner: "Admin-only").
 */
const KEY_ADMIN_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'OWNER', 'SUPER_ADMIN']);

function isKeyAdmin(role: string | null | undefined): boolean {
  return KEY_ADMIN_ROLES.has(role ?? '');
}

function assertKeyAdmin(ctx: { user?: { role?: string | null } | null }): void {
  if (isKeyAdmin(ctx.user?.role)) return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `Only workspace admins can change ${SETTINGS_NAME}.`,
  });
}

/** Never select the key for a read that builds a DTO. */
const KEY_SELECT = {
  provider: true,
  last4: true,
  status: true,
  statusDetail: true,
  allowFallback: true,
  createdAt: true,
  lastUsedAt: true,
} as const;

interface KeyRow {
  provider: string;
  last4: string;
  status: string;
  statusDetail: string | null;
  allowFallback: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}

function toDto(row: KeyRow): AIProviderKeyDto {
  return {
    provider: row.provider as AIKeyProvider,
    last4: row.last4,
    status: row.status as AIKeyStatus,
    statusDetail: row.statusDetail,
    allowFallback: row.allowFallback,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

// ─── Rate limiting for the calls that carry or check a key ───────────────────

const keyLimiter = createDistributedRateLimitMiddleware(
  { limit: 5, windowMs: 60_000, name: 'ai-provider-key-write' },
  { fallback: 'in-memory' }
);

/** 5 key checks or saves per minute per user: each one is a call to a third party. */
const keyWriteProcedure = tenantProcedure.use(async ({ ctx, next }) => keyLimiter({ ctx, next }));

// ─── Audit (provider and last 4 only: never the key) ─────────────────────────

function logKeyAudit(
  ctx: KeyCtx,
  resourceId: string,
  state: {
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    eventType: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
  }
): void {
  const { action, ...rest } = state;
  getAuditLogger(ctx.prisma)
    .logAction(action, 'model_config', resourceId, ctx.tenant.tenantId, {
      actorId: ctx.tenant.userId,
      ...rest,
    })
    .catch((err: unknown) => console.error('[ai-provider-key.router] Audit log failed:', err));
}

function describeStored(row: Pick<KeyRow, 'provider' | 'last4' | 'allowFallback'>) {
  return { provider: row.provider, last4: row.last4, allowFallback: row.allowFallback };
}

function refuse(result: Extract<KeyCheckResult, { ok: false }>): never {
  throw new TRPCError({
    code: result.reason === 'invalid' ? 'BAD_REQUEST' : 'SERVICE_UNAVAILABLE',
    message: result.message,
  });
}

const ACCEPTED = 'The provider accepted this key.';

// ─── Router ──────────────────────────────────────────────────────────────────

export const aiProviderKeyRouter = createTRPCRouter({
  /** The masked key (admins only); everyone else only learns whether they can manage it. */
  get: tenantProcedure.query(async ({ ctx }) => {
    const canManage = isKeyAdmin(ctx.user?.role);
    if (!canManage) return { canManage, key: null as AIProviderKeyDto | null };
    const row = (await ctx.prismaWithTenant.tenantAIProviderKey.findFirst({
      where: { tenantId: ctx.tenant.tenantId },
      select: KEY_SELECT,
    })) as KeyRow | null;
    return { canManage, key: row ? toDto(row) : null };
  }),

  /** Check the key with the provider, then store it encrypted (replaces any existing key). */
  set: keyWriteProcedure.input(setAIProviderKeySchema).mutation(async ({ ctx, input }) => {
    assertKeyAdmin(ctx);
    requireEncryptionKey(process.env, 'AI provider keys');
    const tenantId = ctx.tenant.tenantId;

    const check = await checkProviderKey(input.provider, input.apiKey);
    if (!check.ok) refuse(check);

    const before = (await ctx.prismaWithTenant.tenantAIProviderKey.findFirst({
      where: { tenantId },
      select: KEY_SELECT,
    })) as KeyRow | null;

    const data = {
      provider: input.provider,
      apiKey: input.apiKey,
      last4: keyLast4(input.apiKey),
      status: 'ACTIVE',
      statusDetail: null,
      createdBy: ctx.tenant.userId ?? null,
      lastUsedAt: null,
      // The key's revision: a replacement is a new one, so a status written for the old key by
      // a delayed worker call matches nothing.
      createdAt: new Date(),
    };
    const row = (await ctx.prismaWithTenant.tenantAIProviderKey.upsert({
      where: { tenantId },
      // A first key defaults to no fallback. A replacement without a choice leaves the stored
      // value to the database, so a concurrent setOptions is never overwritten.
      create: { tenantId, ...data, allowFallback: input.allowFallback ?? false },
      update: {
        ...data,
        ...(input.allowFallback === undefined ? {} : { allowFallback: input.allowFallback }),
      },
      select: { id: true, ...KEY_SELECT },
    })) as KeyRow & { id: string };

    logKeyAudit(ctx, row.id, {
      action: before ? 'UPDATE' : 'CREATE',
      eventType: before ? 'AIProviderKeyReplaced' : 'AIProviderKeySet',
      ...(before ? { beforeState: describeStored(before) } : {}),
      afterState: describeStored(row),
    });
    return { key: toDto(row) };
  }),

  /**
   * Check a key without storing it (the typed one), or re-check the stored one and update the
   * stored status to match (a key that works again becomes ACTIVE).
   */
  test: keyWriteProcedure
    .input(
      z
        .object({ provider: aiKeyProviderSchema, apiKey: aiProviderKeySecretSchema })
        .nullish()
        .default(null)
    )
    .mutation(async ({ ctx, input }) => {
      assertKeyAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;

      if (input) {
        const result = await checkProviderKey(input.provider, input.apiKey);
        return { ok: result.ok, message: result.ok ? ACCEPTED : result.message, key: null };
      }

      // Without the encryption key the client returns the stored ciphertext: it would be sent to
      // the provider as the key and a working key would be marked INVALID.
      requireEncryptionKey(process.env, 'AI provider keys');
      const stored = (await ctx.prismaWithTenant.tenantAIProviderKey.findFirst({
        where: { tenantId },
        select: { id: true, updatedAt: true, provider: true, apiKey: true },
      })) as { id: string; updatedAt: Date; provider: string; apiKey: string } | null;
      if (!stored) throw new TRPCError({ code: 'NOT_FOUND', message: 'No key is saved yet.' });

      const result = await checkProviderKey(stored.provider as AIKeyProvider, stored.apiKey);
      // An unreachable provider says nothing about the key: leave its status alone.
      if (!result.ok && result.reason === 'unavailable') {
        return { ok: false, message: result.message, key: null };
      }
      // Only the row that was checked: a key saved or removed while the provider was being
      // asked (up to 8 s) must not take this result.
      const written = await ctx.prismaWithTenant.tenantAIProviderKey.updateMany({
        where: { tenantId, id: stored.id, updatedAt: stored.updatedAt },
        data: result.ok
          ? { status: 'ACTIVE', statusDetail: null }
          : { status: 'INVALID', statusDetail: 'The provider did not accept this key.' },
      });
      if (written.count === 0) {
        return {
          ok: result.ok,
          message: 'The key changed while it was being checked. Test it again.',
          key: null,
        };
      }
      const row = (await ctx.prismaWithTenant.tenantAIProviderKey.findFirst({
        where: { tenantId },
        select: KEY_SELECT,
      })) as KeyRow | null;
      return {
        ok: result.ok,
        message: result.ok ? ACCEPTED : result.message,
        key: row ? toDto(row) : null,
      };
    }),

  /** Change the fallback switch of the stored key. */
  setOptions: tenantProcedure
    .input(updateAIProviderKeyOptionsSchema)
    .mutation(async ({ ctx, input }) => {
      assertKeyAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      const before = (await ctx.prismaWithTenant.tenantAIProviderKey.findFirst({
        where: { tenantId },
        select: { id: true, ...KEY_SELECT },
      })) as (KeyRow & { id: string }) | null;
      if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'No key is saved yet.' });
      const changed = await ctx.prismaWithTenant.tenantAIProviderKey.updateMany({
        where: { tenantId, id: before.id },
        data: { allowFallback: input.allowFallback },
      });
      if (changed.count === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No key is saved yet.' });
      }
      const row = (await ctx.prismaWithTenant.tenantAIProviderKey.findFirst({
        where: { tenantId },
        select: KEY_SELECT,
      })) as KeyRow | null;
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'No key is saved yet.' });
      logKeyAudit(ctx, before.id, {
        action: 'UPDATE',
        eventType: 'AIProviderKeyOptionsChanged',
        beforeState: describeStored(before),
        afterState: describeStored(row),
      });
      return { key: toDto(row) };
    }),

  /** Delete the key: the workspace's AI calls return to the platform providers. */
  remove: tenantProcedure.mutation(async ({ ctx }) => {
    assertKeyAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    const before = (await ctx.prismaWithTenant.tenantAIProviderKey.findFirst({
      where: { tenantId },
      select: { id: true, ...KEY_SELECT },
    })) as (KeyRow & { id: string }) | null;
    if (!before) return { removed: false };
    await ctx.prismaWithTenant.tenantAIProviderKey.deleteMany({ where: { tenantId } });
    logKeyAudit(ctx, before.id, {
      action: 'DELETE',
      eventType: 'AIProviderKeyRemoved',
      beforeState: describeStored(before),
    });
    return { removed: true };
  }),
});
