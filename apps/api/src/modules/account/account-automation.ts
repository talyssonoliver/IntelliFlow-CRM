/**
 * Account Automation Enforcement - PG-183
 *
 * Loads a tenant's `AccountAutomationSetting` row and exposes helpers that
 * apply the hygiene and guard toggles to account create/update/delete flows.
 *
 * Mirrors the PG-182 `contact-automation.ts` pattern. Policy rows are owned
 * by the account-settings router; this module is the runtime consumer that
 * turns those preferences into actual behavior.
 */

import type { AccountAutomationSetting } from '@intelliflow/db';
import { TRPCError } from '@trpc/server';

export interface AccountAutomationFlags {
  autoAssignOwner: boolean;
  autoLinkContactsByDomain: boolean;
  preventDeleteWithOpenOpportunities: boolean;
  notifyOnOwnerChange: boolean;
  normalizeWebsiteDomain: boolean;
  autoCapitalizeAccountNames: boolean;
  notifyOnDuplicate: boolean;
  restrictTagCreationToAdmins: boolean;
  aiIndustryInference: boolean;
  aiEnrichment: boolean;
  aiTagSuggestions: boolean;
  aiInsightGeneration: boolean;
  aiAccountScoring: boolean;
}

const AUTOMATION_FACTORY_DEFAULTS: AccountAutomationFlags = {
  autoAssignOwner: false,
  autoLinkContactsByDomain: true,
  preventDeleteWithOpenOpportunities: true,
  notifyOnOwnerChange: false,
  normalizeWebsiteDomain: true,
  autoCapitalizeAccountNames: true,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  // AI — opt-in stance, mirrors PG-182 + 20260414140000_account_settings_hardening
  aiIndustryInference: false,
  aiEnrichment: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
  aiAccountScoring: false,
};

interface HasTenantContext {
  tenant: { tenantId: string };
  prismaWithTenant: {
    accountAutomationSetting: {
      findUnique(args: { where: { tenantId: string } }): Promise<AccountAutomationSetting | null>;
    };
    accountRequiredField: {
      findMany(args: {
        where: { tenantId: string; isRequired: true };
      }): Promise<Array<{ fieldKey: string }>>;
    };
  };
}

/**
 * Load the tenant's automation row, falling back to factory defaults when
 * no row has been seeded yet. Read-only; safe to call in every create/
 * update/delete hot path.
 */
export async function loadAccountAutomation(
  ctx: HasTenantContext
): Promise<AccountAutomationFlags> {
  const row = await ctx.prismaWithTenant.accountAutomationSetting.findUnique({
    where: { tenantId: ctx.tenant.tenantId },
  });

  if (!row) return { ...AUTOMATION_FACTORY_DEFAULTS };

  return {
    autoAssignOwner: row.autoAssignOwner,
    autoLinkContactsByDomain: row.autoLinkContactsByDomain,
    preventDeleteWithOpenOpportunities: row.preventDeleteWithOpenOpportunities,
    notifyOnOwnerChange: row.notifyOnOwnerChange,
    normalizeWebsiteDomain: row.normalizeWebsiteDomain,
    autoCapitalizeAccountNames: row.autoCapitalizeAccountNames,
    notifyOnDuplicate: row.notifyOnDuplicate,
    restrictTagCreationToAdmins: row.restrictTagCreationToAdmins,
    aiIndustryInference: row.aiIndustryInference,
    aiEnrichment: row.aiEnrichment,
    aiTagSuggestions: row.aiTagSuggestions,
    aiInsightGeneration: row.aiInsightGeneration,
    aiAccountScoring: row.aiAccountScoring,
  };
}

// ─── Hygiene transforms ─────────────────────────────────────────────────────

/**
 * Normalize a website to its bare domain form when
 * `normalizeWebsiteDomain` is on. Strips scheme, leading `www.`, trailing
 * slashes, and lowercases the host. Paths are preserved so campaign
 * landing URLs don't lose their slug.
 */
export function normalizeWebsite(
  raw: string | null | undefined,
  flags: Pick<AccountAutomationFlags, 'normalizeWebsiteDomain'>
): string | null | undefined {
  if (raw == null) return raw;
  if (!flags.normalizeWebsiteDomain) return raw;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Drop the scheme if present (http/https/anything://)
  const schemeless = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  // Remove leading www.
  const noWww = schemeless.replace(/^www\./i, '');
  // Split host vs path, lowercase host, then rejoin
  const slashIdx = noWww.indexOf('/');
  const host = slashIdx === -1 ? noWww : noWww.slice(0, slashIdx);
  const path = slashIdx === -1 ? '' : noWww.slice(slashIdx);
  // Drop a single trailing slash on "host only"
  const cleanedPath = path === '/' ? '' : path.replace(/\/+$/, '');
  return host.toLowerCase() + cleanedPath;
}

/**
 * Title-case an account name on word boundaries when the tenant has
 * `autoCapitalizeAccountNames` on. Preserves interior punctuation so
 * company names like "L'Oréal" or "Procter & Gamble" keep their shape.
 */
export function capitalizeAccountName(
  raw: string | null | undefined,
  flags: Pick<AccountAutomationFlags, 'autoCapitalizeAccountNames'>
): string | null | undefined {
  if (raw == null) return raw;
  if (!flags.autoCapitalizeAccountNames) return raw;

  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  return trimmed
    .split(/(\s+)/)
    .map((chunk) => {
      if (!chunk || /^\s+$/.test(chunk)) return chunk;
      return chunk
        .split(/(['-])/)
        .map((sub) =>
          sub.length > 0 && /[a-zA-Z]/.test(sub[0])
            ? sub[0].toUpperCase() + sub.slice(1).toLowerCase()
            : sub
        )
        .join('');
    })
    .join('');
}

// ─── Delete-guard ───────────────────────────────────────────────────────────

interface ActiveOpportunityCount {
  activeOpportunities: number;
}

/**
 * Throw PRECONDITION_FAILED if `preventDeleteWithOpenOpportunities` is on
 * and the account still has ≥1 active opportunity (i.e. not closed-won/
 * closed-lost). Caller supplies the pre-computed count so this helper stays
 * side-effect free.
 */
export function assertCanDeleteAccount(
  counts: ActiveOpportunityCount,
  flags: Pick<AccountAutomationFlags, 'preventDeleteWithOpenOpportunities'>
): void {
  if (!flags.preventDeleteWithOpenOpportunities) return;
  if (counts.activeOpportunities === 0) return;

  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `Account has ${counts.activeOpportunities} open opportunities. Disable "Prevent delete with open opportunities" in Account Settings or close/reassign them first.`,
  });
}

// ─── Required-fields enforcement ────────────────────────────────────────────

export type AccountFieldKey = 'name' | 'industry' | 'website' | 'ownerId' | 'employees' | 'revenue';

const KNOWN_ACCOUNT_FIELD_KEYS: readonly AccountFieldKey[] = [
  'name',
  'industry',
  'website',
  'ownerId',
  'employees',
  'revenue',
] as const;

/** Snapshot of an Account create/update payload restricted to fields that
 * can be marked required in the settings page. */
export interface AccountRequiredFieldPayload {
  name?: string | null | undefined;
  industry?: string | null | undefined;
  website?: string | null | undefined;
  ownerId?: string | null | undefined;
  employees?: number | null | undefined;
  revenue?: number | string | null | undefined;
}

/**
 * Load the tenant's list of required account fields. Returns only the
 * fieldKeys marked required; missing rows mean "not required".
 */
export async function loadRequiredAccountFields(
  ctx: HasTenantContext
): Promise<Set<AccountFieldKey>> {
  const rows =
    (await ctx.prismaWithTenant.accountRequiredField.findMany({
      where: { tenantId: ctx.tenant.tenantId, isRequired: true },
    })) ?? [];
  const whitelist = new Set<AccountFieldKey>(KNOWN_ACCOUNT_FIELD_KEYS);
  return new Set(
    rows
      .map((r) => r.fieldKey as AccountFieldKey)
      .filter((k): k is AccountFieldKey => whitelist.has(k))
  );
}

function isMissing(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/**
 * Assert that every required field on the tenant's policy is present and
 * non-empty in the payload. Throws a single BAD_REQUEST with the list of
 * missing fields so the UI can render all of them at once.
 *
 * For UPDATE calls, pass only the fields the user is actually changing —
 * this helper only flags fields that appear in the payload but are blank;
 * it never flags fields the user chose not to touch.
 */
export function assertRequiredAccountFields(
  payload: AccountRequiredFieldPayload,
  required: Set<AccountFieldKey>,
  mode: 'create' | 'update'
): void {
  const missing: AccountFieldKey[] = [];
  for (const field of required) {
    const value = payload[field];
    if (mode === 'create') {
      if (isMissing(value)) missing.push(field);
      continue;
    }
    const hasOwn = Object.prototype.hasOwnProperty.call(payload, field);
    if (!hasOwn) continue;
    if (value === undefined) continue;
    if (isMissing(value)) missing.push(field);
  }

  if (missing.length === 0) return;
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `Required field(s) missing per tenant policy: ${missing.join(', ')}. Supply the values, or relax the policy in Account Settings → Required Fields.`,
  });
}

// ─── Admin-only tag creation ────────────────────────────────────────────────

interface UserRoleContext {
  user?: { role?: string | null } | null;
}

/**
 * Enforce the `restrictTagCreationToAdmins` toggle on the
 * accountSettings.tags.create procedure.
 */
export function assertCanCreateTag(
  ctx: UserRoleContext,
  flags: Pick<AccountAutomationFlags, 'restrictTagCreationToAdmins'>
): void {
  if (!flags.restrictTagCreationToAdmins) return;
  const role = ctx.user?.role ?? '';
  if (role === 'ADMIN' || role === 'OWNER') return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      'Tag creation is restricted to workspace admins. Ask an admin or disable "Restrict tag creation to admins" in Account Settings.',
  });
}

// ─── Owner-change notification helper ───────────────────────────────────────

export interface OwnerChangeNotification {
  tenantId: string;
  accountId: string;
  accountName: string;
  previousOwnerId: string;
  nextOwnerId: string;
  actingUserId: string;
}

type NotificationCreator = (args: {
  userId: string;
  tenantId: string;
  type: 'account_reassigned';
  title: string;
  body: string;
  priority?: 'high' | 'normal' | 'low';
  entityType?: string;
  entityId?: string;
  entityName?: string;
  actionUrl?: string;
}) => Promise<unknown>;

/**
 * Emit "account_reassigned" notifications to both the previous and the
 * next owner when the `notifyOnOwnerChange` flag is on. Callers pass in the
 * bound notification-creator so this module stays free of an import-time
 * dependency on the notifications router.
 */
export async function notifyAccountReassignment(
  args: OwnerChangeNotification,
  flags: Pick<AccountAutomationFlags, 'notifyOnOwnerChange'>,
  createNotification: NotificationCreator
): Promise<void> {
  if (!flags.notifyOnOwnerChange) return;
  if (args.previousOwnerId === args.nextOwnerId) return;

  const commonPayload = {
    tenantId: args.tenantId,
    type: 'account_reassigned' as const,
    entityType: 'account',
    entityId: args.accountId,
    entityName: args.accountName,
    actionUrl: `/accounts/${args.accountId}`,
    priority: 'normal' as const,
  };

  await Promise.all([
    createNotification({
      ...commonPayload,
      userId: args.previousOwnerId,
      title: `Account reassigned: ${args.accountName}`,
      body: `You are no longer the owner of ${args.accountName}. Hand over outstanding items to the new owner.`,
    }),
    createNotification({
      ...commonPayload,
      userId: args.nextOwnerId,
      title: `You now own: ${args.accountName}`,
      body: `An account was assigned to you. Review recent activity before reaching out.`,
    }),
  ]);
}
