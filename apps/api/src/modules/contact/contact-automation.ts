/**
 * Contact Automation Enforcement - PG-182
 *
 * Loads a tenant's `ContactAutomationSetting` row and exposes helpers that
 * apply the hygiene and guard toggles to contact create/update/delete flows.
 *
 * Policy rows are owned by the contact-settings router; this module is the
 * runtime consumer that turns those preferences into actual behavior.
 */

import type { ContactAutomationSetting } from '@intelliflow/db';
import { TRPCError } from '@trpc/server';

export interface ContactAutomationFlags {
  autoMergeOnExactEmail: boolean;
  notifyOnDuplicate: boolean;
  restrictTagCreationToAdmins: boolean;
  normalizePhoneNumbers: boolean;
  autoCapitalizeNames: boolean;
  preventDeleteWithOpenDeals: boolean;
  notifyOnOwnerChange: boolean;
  aiDuplicateDetection: boolean;
  aiEnrichment: boolean;
  aiTagSuggestions: boolean;
  aiInsightGeneration: boolean;
  aiAutoReplyDrafting: boolean;
}

const AUTOMATION_FACTORY_DEFAULTS: ContactAutomationFlags = {
  autoMergeOnExactEmail: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizePhoneNumbers: true,
  autoCapitalizeNames: true,
  preventDeleteWithOpenDeals: true,
  notifyOnOwnerChange: false,
  aiDuplicateDetection: false,
  aiEnrichment: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
  aiAutoReplyDrafting: false,
};

interface HasTenantContext {
  tenant: { tenantId: string };
  prismaWithTenant: {
    contactAutomationSetting: {
      findUnique(args: {
        where: { tenantId: string };
      }): Promise<ContactAutomationSetting | null>;
    };
    contactRequiredField: {
      findMany(args: {
        where: { tenantId: string; isRequired: true };
      }): Promise<Array<{ fieldKey: string }>>;
    };
  };
}

/**
 * Load the tenant's automation row, falling back to factory defaults when
 * no row has been seeded yet (new tenant before they opened the settings
 * page). This is read-only — it never writes so it's safe to call in
 * create/update/delete hot paths.
 */
export async function loadContactAutomation(
  ctx: HasTenantContext
): Promise<ContactAutomationFlags> {
  const row = await ctx.prismaWithTenant.contactAutomationSetting.findUnique({
    where: { tenantId: ctx.tenant.tenantId },
  });

  if (!row) return { ...AUTOMATION_FACTORY_DEFAULTS };

  return {
    autoMergeOnExactEmail: row.autoMergeOnExactEmail,
    notifyOnDuplicate: row.notifyOnDuplicate,
    restrictTagCreationToAdmins: row.restrictTagCreationToAdmins,
    normalizePhoneNumbers: row.normalizePhoneNumbers,
    autoCapitalizeNames: row.autoCapitalizeNames,
    preventDeleteWithOpenDeals: row.preventDeleteWithOpenDeals,
    notifyOnOwnerChange: row.notifyOnOwnerChange,
    aiDuplicateDetection: row.aiDuplicateDetection,
    aiEnrichment: row.aiEnrichment,
    aiTagSuggestions: row.aiTagSuggestions,
    aiInsightGeneration: row.aiInsightGeneration,
    aiAutoReplyDrafting: row.aiAutoReplyDrafting,
  };
}

// ─── Hygiene transforms ─────────────────────────────────────────────────────

/**
 * Normalize a phone number string toward E.164 when the tenant has the
 * "normalize phone numbers" toggle enabled. This is deliberately a
 * conservative implementation — it keeps a leading `+`, strips everything
 * that isn't a digit, and rejects empty results. Sophisticated parsing
 * (region inference, libphonenumber) is a separate follow-up.
 */
export function normalizePhone(
  raw: string | null | undefined,
  flags: Pick<ContactAutomationFlags, 'normalizePhoneNumbers'>
): string | null {
  if (!raw) return raw ?? null;
  if (!flags.normalizePhoneNumbers) return raw;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D+/g, '');
  if (!digits) return trimmed; // give up rather than silently wipe

  return hadPlus ? `+${digits}` : digits;
}

/**
 * Title-case a person-name-ish string on word boundaries when the tenant has
 * the "auto-capitalize names" toggle enabled. Preserves interior punctuation
 * so names like "O'Neil" or "Jean-Luc" keep their shape.
 */
export function capitalizeName(
  raw: string | null | undefined,
  flags: Pick<ContactAutomationFlags, 'autoCapitalizeNames'>
): string | null | undefined {
  if (raw == null) return raw;
  if (!flags.autoCapitalizeNames) return raw;

  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  // Split on whitespace, keep internal word characters as-is aside from the
  // first alpha character of each whitespace-separated token.
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

interface ActiveDealCount {
  activeOpportunities: number;
}

/**
 * Throw PRECONDITION_FAILED if the tenant has `preventDeleteWithOpenDeals`
 * enabled and the contact has ≥1 active opportunity. "Active" = not in
 * WON or LOST stage. Caller provides the pre-computed count (so we do not
 * duplicate the Prisma query inside this helper).
 */
export function assertCanDeleteContact(
  counts: ActiveDealCount,
  flags: Pick<ContactAutomationFlags, 'preventDeleteWithOpenDeals'>
): void {
  if (!flags.preventDeleteWithOpenDeals) return;
  if (counts.activeOpportunities === 0) return;

  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `Contact has ${counts.activeOpportunities} active opportunity(ies). Disable "Prevent delete with open deals" in Contact Settings or close/reassign the deals first.`,
  });
}

// ─── Required-fields enforcement ────────────────────────────────────────────

export type ContactFieldKey =
  | 'email'
  | 'phone'
  | 'company'
  | 'jobTitle'
  | 'ownerId';

/** Snapshot of a Contact create/update payload restricted to fields that can
 *  be marked required in the settings page. */
export interface ContactRequiredFieldPayload {
  email?: string | null | undefined;
  phone?: string | null | undefined;
  company?: string | null | undefined;
  jobTitle?: string | null | undefined;
  ownerId?: string | null | undefined;
}

/**
 * Load the tenant's list of required contact fields. Returns only the
 * fieldKeys that are actively required; missing rows mean "not required".
 */
export async function loadRequiredContactFields(
  ctx: HasTenantContext
): Promise<Set<ContactFieldKey>> {
  const rows = await ctx.prismaWithTenant.contactRequiredField.findMany({
    where: { tenantId: ctx.tenant.tenantId, isRequired: true },
  });
  const known: ContactFieldKey[] = ['email', 'phone', 'company', 'jobTitle', 'ownerId'];
  const whitelist = new Set<ContactFieldKey>(known);
  return new Set(
    rows
      .map((r) => r.fieldKey as ContactFieldKey)
      .filter((k): k is ContactFieldKey => whitelist.has(k))
  );
}

function isMissing(value: string | null | undefined): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '');
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
export function assertRequiredContactFields(
  payload: ContactRequiredFieldPayload,
  required: Set<ContactFieldKey>,
  mode: 'create' | 'update'
): void {
  const missing: ContactFieldKey[] = [];
  for (const field of required) {
    const value = payload[field];
    if (mode === 'create') {
      if (isMissing(value)) missing.push(field);
      continue;
    }
    // update-mode: only flag when the caller is EXPLICITLY clearing the
    // field (sending '', null). Skipping the field entirely — or sending
    // `undefined` — means "don't touch it" and must never throw.
    const hasOwn = Object.prototype.hasOwnProperty.call(payload, field);
    if (!hasOwn) continue;
    if (value === undefined) continue;
    if (isMissing(value)) missing.push(field);
  }

  if (missing.length === 0) return;
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `Required field(s) missing per tenant policy: ${missing.join(', ')}. Update the contact, or relax the policy in Contact Settings → Required Fields.`,
  });
}

// ─── Admin-only tag creation ────────────────────────────────────────────────

interface UserRoleContext {
  user?: { role?: string | null } | null;
}

/**
 * Enforce the `restrictTagCreationToAdmins` toggle on the
 * contactSettings.tags.create procedure.
 */
export function assertCanCreateTag(
  ctx: UserRoleContext,
  flags: Pick<ContactAutomationFlags, 'restrictTagCreationToAdmins'>
): void {
  if (!flags.restrictTagCreationToAdmins) return;
  const role = ctx.user?.role ?? '';
  if (role === 'ADMIN' || role === 'OWNER') return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      'Tag creation is restricted to workspace admins. Ask an admin to create the tag or disable "Restrict tag creation to admins" in Contact Settings.',
  });
}
