/**
 * Document Policy Enforcement - PG-186
 *
 * Server-side enforcement of the Document Settings page's configurable
 * policies. The settings UI persists admin preferences; this module is
 * the runtime consumer that rejects uploads/creates that violate them.
 *
 * Policies enforced:
 *   - `documentGeneralConfig.allowedMimeTypes`  — MIME allowlist
 *   - `documentGeneralConfig.maxUploadSizeMb`   — per-file size ceiling
 *   - `documentRequiredField[]` where `isRequired`  — metadata completeness
 *   - `documentGeneralConfig.enableAntivirusScan` + `blockOnScanFailure`
 *     — only partially enforced here (returns a flag that callers can
 *     pass to the scanner; the scanner integration itself ships with the
 *     antivirus worker).
 *
 * Mirrors the `document-automation.ts` pattern: a single loader returns a
 * resolved policy snapshot, plus assertion helpers that callers invoke in
 * create/upload hot paths.
 */

import { TRPCError } from '@trpc/server';

// ─── Policy snapshot ─────────────────────────────────────────────────────────

export interface DocumentGeneralPolicy {
  allowedMimeTypes: string[];
  maxUploadSizeMb: number;
  enableAntivirusScan: boolean;
  quarantineOnDetect: boolean;
  blockOnScanFailure: boolean;
  defaultRetentionDays: number;
}

export interface DocumentRequiredFieldPolicy {
  fieldKey: string;
  isRequired: boolean;
}

export interface DocumentPolicySnapshot {
  general: DocumentGeneralPolicy;
  requiredFields: DocumentRequiredFieldPolicy[];
}

// Defaults mirror DEFAULT_GENERAL in document-settings.router.ts. When no
// tenant row exists yet (fresh workspace), these apply — and since
// allowedMimeTypes is empty, MIME enforcement becomes a pass-through
// allow-all until an admin configures the policy. This is intentional:
// shipping a page that silently rejects every upload on day one would be
// worse than shipping one that lets everything through and invites
// configuration.
export const POLICY_FACTORY_DEFAULTS: DocumentGeneralPolicy = {
  allowedMimeTypes: [],
  maxUploadSizeMb: 50,
  enableAntivirusScan: true,
  quarantineOnDetect: true,
  blockOnScanFailure: true,
  defaultRetentionDays: 365,
};

// ─── Loader ──────────────────────────────────────────────────────────────────

interface PolicyLoaderContext {
  tenant: { tenantId: string };
  prismaWithTenant: {
    documentGeneralConfig: {
      findUnique(args: { where: { tenantId: string } }): Promise<
        | (DocumentGeneralPolicy & {
            id: string;
            tenantId: string;
            createdAt: Date;
            updatedAt: Date;
          })
        | null
      >;
    };
    documentRequiredField: {
      findMany(args: {
        where: { tenantId: string };
      }): Promise<Array<DocumentRequiredFieldPolicy & { id: string; tenantId: string }>>;
    };
  };
}

export async function loadDocumentPolicies(
  ctx: PolicyLoaderContext
): Promise<DocumentPolicySnapshot> {
  const tenantId = ctx.tenant.tenantId;
  const [general, required] = await Promise.all([
    ctx.prismaWithTenant.documentGeneralConfig.findUnique({ where: { tenantId } }),
    ctx.prismaWithTenant.documentRequiredField.findMany({ where: { tenantId } }),
  ]);

  return {
    general: general
      ? {
          allowedMimeTypes: general.allowedMimeTypes,
          maxUploadSizeMb: general.maxUploadSizeMb,
          enableAntivirusScan: general.enableAntivirusScan,
          quarantineOnDetect: general.quarantineOnDetect,
          blockOnScanFailure: general.blockOnScanFailure,
          defaultRetentionDays: general.defaultRetentionDays,
        }
      : { ...POLICY_FACTORY_DEFAULTS },
    // Deep-mock test doubles can resolve `findMany` to `undefined`; guard
    // so the loader stays safe against partially-stubbed test contexts.
    requiredFields: (required ?? []).map((r) => ({
      fieldKey: r.fieldKey,
      isRequired: r.isRequired,
    })),
  };
}

// ─── MIME + size guard ───────────────────────────────────────────────────────

export function assertMimeAllowed(
  mimeType: string,
  policy: Pick<DocumentGeneralPolicy, 'allowedMimeTypes'>
): void {
  // Empty allowlist == not yet configured. Pass through rather than reject
  // every upload on a fresh tenant.
  if (policy.allowedMimeTypes.length === 0) return;
  if (policy.allowedMimeTypes.includes(mimeType)) return;

  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `MIME type "${mimeType}" is not in the tenant's allowed list. Update Document Settings → File Types to permit it.`,
  });
}

export function assertSizeAllowed(
  sizeBytes: number,
  policy: Pick<DocumentGeneralPolicy, 'maxUploadSizeMb'>
): void {
  const maxBytes = policy.maxUploadSizeMb * 1024 * 1024;
  if (sizeBytes <= maxBytes) return;

  throw new TRPCError({
    code: 'PAYLOAD_TOO_LARGE',
    message: `File size ${Math.round(sizeBytes / 1024 / 1024)} MB exceeds tenant limit ${policy.maxUploadSizeMb} MB. Update Document Settings → Size Limits to raise it.`,
  });
}

// ─── Required metadata guard ─────────────────────────────────────────────────

/**
 * Known metadata fields users can mark required in the settings UI. Keep
 * in sync with `DOCUMENT_REQUIRED_FIELD_KEYS` on the validator side.
 * `documentType` and `classification` are Zod-required on the input
 * schema already — listing them here lets an admin re-assert the
 * requirement against payloads that sneak through with empty strings.
 */
export type RequiredFieldLookup = Partial<{
  title: string | undefined;
  description: string | undefined;
  documentType: string | undefined;
  documentTypeLabel: string | undefined;
  classification: string | undefined;
  tags: readonly string[] | undefined;
  relatedCaseId: string | undefined;
  relatedContactId: string | undefined;
}>;

function valueIsPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function assertRequiredFieldsPresent(
  payload: RequiredFieldLookup,
  policy: Pick<DocumentPolicySnapshot, 'requiredFields'>
): void {
  const missing: string[] = [];
  for (const rule of policy.requiredFields) {
    if (!rule.isRequired) continue;
    if (!valueIsPresent(payload[rule.fieldKey as keyof RequiredFieldLookup])) {
      missing.push(rule.fieldKey);
    }
  }
  if (missing.length === 0) return;

  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `Missing required document fields: ${missing.join(', ')}. Update the payload or relax the requirement in Document Settings → Required Fields.`,
  });
}

// ─── Aggregate entrypoint for create/upload hot paths ────────────────────────

export async function enforceDocumentPolicies(
  ctx: PolicyLoaderContext,
  payload: RequiredFieldLookup & { mimeType: string; sizeBytes: number }
): Promise<DocumentPolicySnapshot> {
  const snapshot = await loadDocumentPolicies(ctx);
  assertMimeAllowed(payload.mimeType, snapshot.general);
  assertSizeAllowed(payload.sizeBytes, snapshot.general);
  assertRequiredFieldsPresent(payload, snapshot);
  return snapshot;
}
