/**
 * Contact type helpers — PG-205 (ADR-080).
 *
 * Shared by the contactTypes router and contact.create/update:
 * - lazy, per-tenant seeding of the six system types (CONTACT_TYPES) on first
 *   use, serialised by a tenant advisory lock — the migration seeds nothing,
 *   so a tenant's rows are only ever written for that tenant;
 * - tenant-scoped type lookup by key and default-tag resolution;
 * - the admin assert for every write.
 *
 * `prismaWithTenant` does not inject `tenantId` (RLS is not FORCEd), so every
 * query here passes it explicitly.
 */

import { TRPCError } from '@trpc/server';
import { tenantUserWhere } from '@intelliflow/db';
import {
  CONTACT_TYPES,
  CONTACT_TYPE_REQUIRED_FIELD_KEYS,
  isContactTypeAdminRole,
  missingTypeRequiredFields,
  resolveContactCreateDefaults,
  type ContactStatus,
  type ContactTypeDefaultsSource,
  type ContactTypeRequiredFieldKey,
  type ResolvedContactCreateDefaults,
} from '@intelliflow/domain';
import type { TenantAwareContext } from '../../security/tenant-context';
import { getAuditLogger } from '../../security/audit-logger';

type ResolverCtx = Pick<TenantAwareContext, 'tenant' | 'prismaWithTenant'>;
type ResolverTx = Parameters<Parameters<ResolverCtx['prismaWithTenant']['$transaction']>[0]>[0];

export const INVALID_CONTACT_TYPE = 'Invalid contact type';

/** The six system types every tenant starts with (owner ruling 2026-10-17). */
export const SYSTEM_CONTACT_TYPE_SEED: ReadonlyArray<{
  key: (typeof CONTACT_TYPES)[number];
  name: string;
  colorToken: string;
  sortOrder: number;
}> = [
  { key: 'customer', name: 'Customer', colorToken: 'green', sortOrder: 0 },
  { key: 'prospect', name: 'Prospect', colorToken: 'blue', sortOrder: 1 },
  { key: 'partner', name: 'Partner', colorToken: 'violet', sortOrder: 2 },
  { key: 'vendor', name: 'Vendor', colorToken: 'amber', sortOrder: 3 },
  { key: 'investor', name: 'Investor', colorToken: 'teal', sortOrder: 4 },
  { key: 'other', name: 'Other', colorToken: 'slate', sortOrder: 5 },
];

function prismaCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  return (err as { code?: string }).code;
}

/**
 * Serialise every contact-type write of one tenant (seed, cap check, key
 * generation): transaction-scoped advisory lock, released at commit/rollback.
 * The key is built here and bound as one parameter.
 */
export async function lockTenantContactTypes(tx: ResolverTx, tenantId: string): Promise<void> {
  const lockKey = 'contact_types:' + tenantId;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

async function seedMissingSystemTypes(tx: ResolverTx, tenantId: string): Promise<void> {
  const existing = await tx.contactType.findMany({
    where: { tenantId, key: { in: [...CONTACT_TYPES] } },
    select: { key: true },
  });
  const present = new Set(existing.map((row) => row.key));
  const missing = SYSTEM_CONTACT_TYPE_SEED.filter((seed) => !present.has(seed.key));
  if (missing.length === 0) return;
  await tx.contactType.createMany({
    data: missing.map((seed) => ({
      tenantId,
      key: seed.key,
      name: seed.name,
      colorToken: seed.colorToken,
      sortOrder: seed.sortOrder,
      isSystem: true,
      isActive: true,
      isDefault: false,
    })),
  });
}

/**
 * Make sure the caller's tenant has its six system types. Fast path: one
 * count. A failure other than a lost race propagates, so the caller aborts
 * instead of acting on a half-seeded tenant.
 */
export async function ensureSystemContactTypes(ctx: ResolverCtx): Promise<void> {
  const tenantId = ctx.tenant.tenantId;
  const systemCount = await ctx.prismaWithTenant.contactType.count({
    where: { tenantId, isSystem: true },
  });
  if (systemCount >= CONTACT_TYPES.length) return;
  try {
    await ctx.prismaWithTenant.$transaction(async (tx) => {
      await lockTenantContactTypes(tx, tenantId);
      await seedMissingSystemTypes(tx, tenantId);
    });
  } catch (err) {
    // Another request seeded the same rows first (unique (tenantId, key)).
    if (prismaCode(err) === 'P2002') return;
    throw err;
  }
}

export interface ContactTypeForContact {
  id: string;
  key: string;
  isActive: boolean;
  defaultStatus: string | null;
  defaultDepartment: string | null;
  defaultOwner: string;
  requiredFields: string[];
}

/** The caller's tenant type with this key (`activeOnly`: inactive types are not found). */
export async function loadContactTypeByKey(
  ctx: ResolverCtx,
  key: string,
  opts: { activeOnly: boolean }
): Promise<ContactTypeForContact | null> {
  return ctx.prismaWithTenant.contactType.findFirst({
    where: { tenantId: ctx.tenant.tenantId, key, ...(opts.activeOnly ? { isActive: true } : {}) },
    select: {
      id: true,
      key: true,
      isActive: true,
      defaultStatus: true,
      defaultDepartment: true,
      defaultOwner: true,
      requiredFields: true,
    },
  });
}

/** Current names of the type's default tags that are still active in the same tenant. */
export async function resolveDefaultTagNames(
  ctx: ResolverCtx,
  contactTypeId: string
): Promise<string[]> {
  const tenantId = ctx.tenant.tenantId;
  const rows = await ctx.prismaWithTenant.contactTypeDefaultTag.findMany({
    where: { tenantId, contactTypeId, contactTag: { tenantId, isActive: true } },
    select: { contactTag: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => row.contactTag.name);
}

type AdminAssertCtx = Pick<TenantAwareContext, 'user' | 'tenant' | 'prisma'>;

/** FORBIDDEN unless the caller is a contact-type admin (fails closed); denials are audited. */
export function assertContactTypeAdmin(ctx: AdminAssertCtx, action: string, id = '-'): void {
  if (isContactTypeAdminRole(ctx.user?.role)) return;
  getAuditLogger(ctx.prisma)
    .logPermissionDenied(
      'contact_type',
      id,
      `contactTypes.${action} requires an admin role`,
      ctx.tenant.tenantId,
      {
        actorId: ctx.tenant.userId,
      }
    )
    .catch((err: unknown) => console.error('[contact-types] Audit log failed:', err));
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Only administrators and managers can change contact types.',
  });
}

// ─── contact.create / contact.update ────────────────────────────────────────

function invalidType(): TRPCError {
  // One message for unknown, foreign and inactive keys: no existence oracle.
  return new TRPCError({ code: 'BAD_REQUEST', message: INVALID_CONTACT_TYPE });
}

function missingForType(fields: readonly string[]): TRPCError {
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: `Required field(s) missing for this contact type: ${fields.join(', ')}.`,
  });
}

function toDefaultsSource(type: ContactTypeForContact): ContactTypeDefaultsSource {
  return {
    defaultStatus: type.defaultStatus as ContactStatus | null,
    defaultDepartment: type.defaultDepartment,
    defaultOwner: type.defaultOwner === 'ACCOUNT_OWNER' ? 'ACCOUNT_OWNER' : 'CREATOR',
  };
}

/**
 * The linked account as the ACCOUNT_OWNER rule needs it: looked up inside the
 * caller's tenant, owner accepted only while a live member of that tenant.
 */
async function resolveLinkedAccount(
  ctx: ResolverCtx,
  accountId: string | undefined
): Promise<{ linked: boolean; ownerId: string | null; ownerValid: boolean }> {
  if (!accountId) return { linked: false, ownerId: null, ownerValid: false };
  const tenantId = ctx.tenant.tenantId;
  const account = await ctx.prismaWithTenant.account.findFirst({
    where: { id: accountId, tenantId },
    select: { ownerId: true },
  });
  if (!account) return { linked: false, ownerId: null, ownerValid: false };
  if (!account.ownerId) return { linked: true, ownerId: null, ownerValid: false };
  const owner = await ctx.prismaWithTenant.user.findFirst({
    where: { id: account.ownerId, ...tenantUserWhere(tenantId) },
    select: { id: true },
  });
  return { linked: true, ownerId: account.ownerId, ownerValid: owner !== null };
}

export interface ContactCreateTypeInput {
  contactType?: string;
  status?: ContactStatus;
  department?: string | null;
  tags?: string[];
  accountId?: string;
}

export interface ContactCreateTypeResolution {
  type: ContactTypeForContact | null;
  defaults: ResolvedContactCreateDefaults;
}

/**
 * Resolve the chosen type for a new contact and the values it fills in
 * (explicit input first, then the type). Throws BAD_REQUEST for a key that is
 * not an active type of the caller's tenant. Without a type nothing is read.
 */
export async function resolveContactTypeForCreate(
  ctx: ResolverCtx,
  input: ContactCreateTypeInput
): Promise<ContactCreateTypeResolution> {
  const creatorId = ctx.tenant.userId;
  const baseInput = { status: input.status, department: input.department, tags: input.tags };
  if (input.contactType === undefined) {
    return {
      type: null,
      defaults: resolveContactCreateDefaults({
        input: baseInput,
        type: null,
        creatorId,
        account: { linked: false, ownerId: null, ownerValid: false },
        defaultTagNames: [],
      }),
    };
  }

  await ensureSystemContactTypes(ctx);
  const type = await loadContactTypeByKey(ctx, input.contactType, { activeOnly: true });
  if (!type) throw invalidType();

  const source = toDefaultsSource(type);
  const [account, defaultTagNames] = await Promise.all([
    source.defaultOwner === 'ACCOUNT_OWNER'
      ? resolveLinkedAccount(ctx, input.accountId)
      : Promise.resolve({ linked: false, ownerId: null, ownerValid: false }),
    resolveDefaultTagNames(ctx, type.id),
  ]);

  return {
    type,
    defaults: resolveContactCreateDefaults({
      input: baseInput,
      type: source,
      creatorId,
      account,
      defaultTagNames,
    }),
  };
}

/** The type's required fields, checked on the values the contact will be created with. */
export function assertTypeRequiredOnCreate(
  type: ContactTypeForContact | null,
  values: Partial<Record<ContactTypeRequiredFieldKey, string | null | undefined>>
): void {
  if (!type) return;
  const missing = missingTypeRequiredFields(type.requiredFields, values);
  if (missing.length > 0) throw missingForType(missing);
}

export type ContactTypeFieldValues = Partial<
  Record<ContactTypeRequiredFieldKey, string | null | undefined>
>;

/**
 * contact.update rules (ADR-080):
 * - a changed key must be an active type of the caller's tenant, and the new
 *   type's required fields are checked on the stored row merged with the input;
 * - an unchanged key is accepted even if its type is now inactive, and its
 *   required fields keep the explicit-clear rule (a field sent blank fails);
 * - defaults are never re-applied on update.
 */
export async function assertContactTypeOnUpdate(
  ctx: ResolverCtx,
  storedKey: string | null | undefined,
  nextKey: string | undefined,
  stored: ContactTypeFieldValues,
  changes: ContactTypeFieldValues
): Promise<void> {
  const changed = nextKey !== undefined && nextKey !== storedKey;
  if (changed) {
    await ensureSystemContactTypes(ctx);
    const type = await loadContactTypeByKey(ctx, nextKey, { activeOnly: true });
    if (!type) throw invalidType();
    const merged: ContactTypeFieldValues = { ...stored };
    for (const key of CONTACT_TYPE_REQUIRED_FIELD_KEYS) {
      if (changes[key] !== undefined) merged[key] = changes[key];
    }
    const missing = missingTypeRequiredFields(type.requiredFields, merged);
    if (missing.length > 0) throw missingForType(missing);
    return;
  }

  const effectiveKey = nextKey ?? storedKey;
  if (!effectiveKey) return;
  const type = await loadContactTypeByKey(ctx, effectiveKey, { activeOnly: false });
  if (!type) return; // legacy key with no type row: no type rules to apply
  const cleared = CONTACT_TYPE_REQUIRED_FIELD_KEYS.filter(
    (key) => changes[key] !== undefined && type.requiredFields.includes(key)
  );
  const missing = missingTypeRequiredFields(
    cleared,
    Object.fromEntries(cleared.map((key) => [key, changes[key]]))
  );
  if (missing.length > 0) throw missingForType(missing);
}

/** Max ContactTag spellings of "vip" folded into the VIP segment filter. */
const VIP_SPELLING_LIMIT = 20;

/**
 * Spellings of the `vip` tag to match for the sidebar VIP segment (owner ruling 5):
 * the tenant's ContactTag names equal to "vip" ignoring case, plus "vip" itself.
 * `Contact.tags` is a plain text array, so a free-text spelling with no ContactTag
 * row (e.g. "vIp") is not matched — documented in the findings.
 */
export async function resolveVipTagSpellings(ctx: ResolverCtx): Promise<string[]> {
  const rows = await ctx.prismaWithTenant.contactTag.findMany({
    where: { tenantId: ctx.tenant.tenantId, name: { equals: 'vip', mode: 'insensitive' } },
    select: { name: true },
    take: VIP_SPELLING_LIMIT,
  });
  return [...new Set(['vip', ...rows.map((row) => row.name)])];
}
