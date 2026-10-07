/**
 * Account Tiers validators (PG-196, ADR-073).
 *
 * Tenants configure revenue tiers seeded from the canonical
 * ENTERPRISE / MID_MARKET / SMB / STARTUP vocabulary. Cross-row rules are
 * checked here (row-indexed messages for the settings form) and again by the
 * domain `validateTierConfig` on the server.
 */
import { z } from 'zod';
import { MAX_TIERS, TIER_KEY_PATTERN, UNKNOWN_TIER_KEY } from '@intelliflow/domain';
import { ACCOUNT_TAG_COLOR_TOKENS } from './account-settings';

/** Tier colours use the same 18-token palette as account tags. */
export const ACCOUNT_TIER_COLOR_TOKENS = ACCOUNT_TAG_COLOR_TOKENS;
export const accountTierColorTokenSchema = z.enum(ACCOUNT_TIER_COLOR_TOKENS);
export type AccountTierColorToken = z.infer<typeof accountTierColorTokenSchema>;

export const MAX_TIER_BENEFITS = 12;
export const MAX_TIER_LABEL_LENGTH = 40;
export const MAX_TIER_BENEFIT_LENGTH = 80;
/** Largest value a Decimal(15,2) column can hold. */
export const MAX_TIER_MIN_REVENUE = 9_999_999_999_999.99;

const KEY_MAX_LENGTH = 40;

/**
 * Control (Cc) and format (Cf) characters — C0/C1 controls, DEL, zero-width
 * characters, bidi marks/overrides/isolates, BOM — plus the Unicode line and
 * paragraph separators have no place in a tier name or benefit: they render
 * invisibly and let two labels look identical.
 */
const FORBIDDEN_TEXT_CHARACTERS = /[\p{Cc}\p{Cf}\u2028\u2029]/u;

function hasForbiddenCharacter(value: string): boolean {
  return FORBIDDEN_TEXT_CHARACTERS.test(value);
}

const safeText = (max: number, what: string) =>
  z
    .string()
    .trim()
    .min(1, `${what} is required`)
    .max(max, `${what} must be at most ${max} characters`)
    .refine((v) => !hasForbiddenCharacter(v), `${what} contains characters that are not allowed`);

function hasAtMostTwoDecimals(value: number): boolean {
  const cents = value * 100;
  return Math.abs(Math.round(cents) - cents) < 1e-6;
}

/** Tier key of a stored tier (`UNKNOWN` is reserved for "no revenue, no default tier"). */
export const accountTierKeySchema = z
  .string()
  .regex(TIER_KEY_PATTERN, 'Tier keys are UPPER_SNAKE, at most 40 characters')
  .refine((k) => k !== UNKNOWN_TIER_KEY, `"${UNKNOWN_TIER_KEY}" is a reserved tier key`);

/** Tier key accepted by the account list filter (`UNKNOWN` selects accounts with no revenue). */
export const accountTierFilterKeySchema = z
  .string()
  .regex(TIER_KEY_PATTERN, 'Tier keys are UPPER_SNAKE, at most 40 characters');

export const accountTierDefinitionInputSchema = z.object({
  /** Omitted for a tier added in this edit; the server generates it from the label. */
  key: accountTierKeySchema.optional(),
  label: safeText(MAX_TIER_LABEL_LENGTH, 'Tier name'),
  minRevenue: z
    .number()
    .finite()
    .min(0, 'Minimum revenue cannot be negative')
    .max(MAX_TIER_MIN_REVENUE, 'Minimum revenue is too large')
    .refine(hasAtMostTwoDecimals, 'Minimum revenue can have at most two decimal places'),
  colorToken: accountTierColorTokenSchema,
  benefits: z
    .array(safeText(MAX_TIER_BENEFIT_LENGTH, 'Benefit'))
    .max(MAX_TIER_BENEFITS, `A tier can list at most ${MAX_TIER_BENEFITS} benefits`),
});
export type AccountTierDefinitionInput = z.infer<typeof accountTierDefinitionInputSchema>;

type TierRow = AccountTierDefinitionInput;
type Issue = { message: string; path: (string | number)[] };

/** Report the second occurrence of each repeated value as "rows N and M". */
function duplicateIssues(
  tiers: readonly TierRow[],
  valueOf: (t: TierRow) => string | undefined,
  describe: (first: number, second: number, value: string) => string,
  field: keyof TierRow
): Issue[] {
  const seen = new Map<string, number>();
  const issues: Issue[] = [];
  tiers.forEach((t, index) => {
    const value = valueOf(t);
    if (value === undefined) return;
    const first = seen.get(value);
    if (first === undefined) {
      seen.set(value, index);
    } else {
      issues.push({
        message: describe(first + 1, index + 1, value),
        path: ['tiers', index, field],
      });
    }
  });
  return issues;
}

function benefitIssues(tiers: readonly TierRow[]): Issue[] {
  const issues: Issue[] = [];
  tiers.forEach((t, index) => {
    const seen = new Set<string>();
    for (const benefit of t.benefits) {
      const normalised = benefit.toLowerCase();
      if (seen.has(normalised)) {
        issues.push({
          message: `Row ${index + 1} lists the benefit "${normalised}" twice`,
          path: ['tiers', index, 'benefits'],
        });
        return;
      }
      seen.add(normalised);
    }
  });
  return issues;
}

export const updateAccountTiersSchema = z
  .object({
    tiers: z
      .array(accountTierDefinitionInputSchema)
      .min(1, 'Keep at least one tier')
      .max(MAX_TIERS, `At most ${MAX_TIERS} tiers`),
    defaultTierKey: accountTierKeySchema.nullable(),
    notifyOwnerOnUpgrade: z.boolean(),
    notifyOwnerOnDowngrade: z.boolean(),
    /** `updatedAt` of the configuration this edit started from; null when editing defaults. */
    expectedUpdatedAt: z.iso.datetime().nullable(),
  })
  .superRefine((data, ctx) => {
    const issues: Issue[] = [
      ...duplicateIssues(
        data.tiers,
        (t) => t.label.toLowerCase(),
        (a, b, v) => `Tier names must be unique: rows ${a} and ${b} are both "${v}"`,
        'label'
      ),
      ...duplicateIssues(
        data.tiers,
        (t) => t.key,
        (a, b, v) => `Tier keys must be unique: rows ${a} and ${b} are both "${v}"`,
        'key'
      ),
      ...duplicateIssues(
        data.tiers,
        (t) => String(t.minRevenue),
        (a, b, v) =>
          `Two tiers cannot share a minimum revenue: rows ${a} and ${b} both start at ${v}`,
        'minRevenue'
      ),
      ...benefitIssues(data.tiers),
    ];
    if (!data.tiers.some((t) => t.minRevenue === 0)) {
      issues.push({
        message: 'One tier must start at 0 so every account has a tier',
        path: ['tiers'],
      });
    }
    if (data.defaultTierKey !== null && !data.tiers.some((t) => t.key === data.defaultTierKey)) {
      issues.push({
        message: 'The default tier must be one of the tiers',
        path: ['defaultTierKey'],
      });
    }
    for (const issue of issues) {
      ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }
  });
export type UpdateAccountTiersInput = z.infer<typeof updateAccountTiersSchema>;

// ─── Keys, slugs and legacy values ──────────────────────────────────────────

/** `MID_MARKET` → `mid-market` (URL form used by `/accounts?tier=`). */
export function tierKeyToSlug(key: string): string {
  return key.toLowerCase().replaceAll('_', '-');
}

/** `mid-market` → `MID_MARKET`; null when the slug cannot be a tier key. */
export function tierSlugToKey(slug: string): string | null {
  const key = slug.trim().toUpperCase().replaceAll('-', '_');
  return TIER_KEY_PATTERN.test(key) ? key : null;
}

/** Strip leading and trailing underscores (loop, not a backtracking regex). */
function trimUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '_') start += 1;
  while (end > start && value[end - 1] === '_') end -= 1;
  return value.slice(start, end);
}

/** Normalise a free-form tier value (legacy hierarchy settings stored `mid-market`). */
export function normalizeLegacyTierValue(value: string): string {
  return trimUnderscores(
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
  );
}

/** Generate an immutable key for a new tier from its label, unique among `existingKeys`. */
export function generateTierKey(label: string, existingKeys: readonly string[]): string {
  const ascii = label.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  let base = normalizeLegacyTierValue(ascii);
  if (base.length === 0) base = 'TIER';
  if (!/^[A-Z]/.test(base)) base = `TIER_${base}`;
  base = trimUnderscores(base.slice(0, KEY_MAX_LENGTH - 4));

  const taken = new Set([...existingKeys, UNKNOWN_TIER_KEY]);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}
