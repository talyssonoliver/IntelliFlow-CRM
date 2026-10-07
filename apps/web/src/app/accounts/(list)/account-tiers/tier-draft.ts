/**
 * Account Tiers form model (PG-196).
 *
 * Pure functions between the server view (`accountTiers.get`), the editable
 * draft the page holds, and the `accountTiers.update` payload. Validation runs
 * the same `updateAccountTiersSchema` the server uses, so the inline errors
 * and the server's answer never disagree.
 */
import {
  ACCOUNT_TIER_COLOR_TOKENS,
  updateAccountTiersSchema,
  type AccountTierColorToken,
  type UpdateAccountTiersInput,
} from '@intelliflow/validators';

/** Shape of `accountTiers.get` this page relies on. */
export interface AccountTiersViewLike {
  tiers: ReadonlyArray<{
    key: string;
    label: string;
    minRevenue: number;
    colorToken: string;
    benefits: readonly string[];
  }>;
  defaultTierKey: string | null;
  notifyOwnerOnUpgrade: boolean;
  notifyOwnerOnDowngrade: boolean;
  updatedAt: string | null;
}

export interface TierDraft {
  /** Client-side row id (stable across edits). */
  id: string;
  /** Immutable key of a saved tier; absent for a tier added in this edit. */
  key?: string;
  label: string;
  /** Raw text of the minimum revenue input. */
  minRevenue: string;
  colorToken: AccountTierColorToken;
  benefitIds: string[];
}

export interface BenefitRow {
  id: string;
  name: string;
}

export interface TiersDraft {
  tiers: TierDraft[];
  benefits: BenefitRow[];
  defaultTierKey: string | null;
  notifyOwnerOnUpgrade: boolean;
  notifyOwnerOnDowngrade: boolean;
}

export interface DraftValidation {
  valid: boolean;
  /** Messages per tier row id. */
  tierErrors: Record<string, string[]>;
  /** Messages per benefit row id. */
  benefitErrors: Record<string, string[]>;
  /** Messages about the whole set (no tier at 0, default tier…). */
  formErrors: string[];
}

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

function asColorToken(token: string): AccountTierColorToken {
  return (ACCOUNT_TIER_COLOR_TOKENS as readonly string[]).includes(token)
    ? (token as AccountTierColorToken)
    : 'slate';
}

/** Editable draft from the server view (tiers highest first). */
export function draftFromView(view: AccountTiersViewLike): TiersDraft {
  const benefits: BenefitRow[] = [];
  const idByName = new Map<string, string>();
  for (const tier of view.tiers) {
    for (const name of tier.benefits) {
      if (!idByName.has(name)) {
        const id = nextId('benefit');
        idByName.set(name, id);
        benefits.push({ id, name });
      }
    }
  }
  return {
    tiers: view.tiers.map((t) => ({
      id: nextId('tier'),
      key: t.key,
      label: t.label,
      minRevenue: String(t.minRevenue),
      colorToken: asColorToken(t.colorToken),
      benefitIds: t.benefits.map((name) => idByName.get(name) as string),
    })),
    benefits,
    defaultTierKey: view.defaultTierKey,
    notifyOwnerOnUpgrade: view.notifyOwnerOnUpgrade,
    notifyOwnerOnDowngrade: view.notifyOwnerOnDowngrade,
  };
}

/** Parse the minimum revenue input ("1,000,000" and "1000000.5" are accepted). */
export function parseRevenueInput(text: string): number {
  const cleaned = text.replaceAll(',', '').trim();
  return cleaned === '' ? Number.NaN : Number(cleaned);
}

/** `accountTiers.update` payload for a draft. */
export function draftToPayload(
  draft: TiersDraft,
  expectedUpdatedAt: string | null
): UpdateAccountTiersInput {
  const nameById = new Map(draft.benefits.map((b) => [b.id, b.name.trim()]));
  return {
    tiers: draft.tiers.map((t) => ({
      ...(t.key ? { key: t.key } : {}),
      label: t.label.trim(),
      minRevenue: parseRevenueInput(t.minRevenue),
      colorToken: t.colorToken,
      benefits: draft.benefits
        .filter((b) => t.benefitIds.includes(b.id))
        .map((b) => nameById.get(b.id) ?? ''),
    })),
    defaultTierKey: draft.defaultTierKey,
    notifyOwnerOnUpgrade: draft.notifyOwnerOnUpgrade,
    notifyOwnerOnDowngrade: draft.notifyOwnerOnDowngrade,
    expectedUpdatedAt,
  };
}

/** Comparable form of a draft, for the Save button's dirty check. */
export function draftSignature(draft: TiersDraft): string {
  return JSON.stringify(draftToPayload(draft, null));
}

function push(map: Record<string, string[]>, id: string, message: string) {
  const messages = (map[id] ??= []);
  if (!messages.includes(message)) messages.push(message);
}

/** Validate a draft with the server's schema; errors keyed by row. */
export function validateDraft(draft: TiersDraft): DraftValidation {
  const result = updateAccountTiersSchema.safeParse(draftToPayload(draft, null));
  const empty: DraftValidation = { valid: true, tierErrors: {}, benefitErrors: {}, formErrors: [] };
  if (result.success) return empty;

  const out: DraftValidation = { ...empty, valid: false };
  for (const issue of result.error.issues) {
    const [root, index, field, benefitIndex] = issue.path;
    const tier = root === 'tiers' && typeof index === 'number' ? draft.tiers[index] : undefined;
    if (tier && field === 'benefits' && typeof benefitIndex === 'number') {
      const benefitId = draft.benefits.filter((b) => tier.benefitIds.includes(b.id))[benefitIndex]
        ?.id;
      if (benefitId) push(out.benefitErrors, benefitId, issue.message);
      else push(out.tierErrors, tier.id, issue.message);
    } else if (tier) {
      push(out.tierErrors, tier.id, issue.message);
    } else {
      out.formErrors.push(issue.message);
    }
  }
  return out;
}

/** A new tier row: first palette colour not yet used, empty minimum. */
export function newTierDraft(draft: TiersDraft): TierDraft {
  const used = new Set(draft.tiers.map((t) => t.colorToken));
  const colorToken = ACCOUNT_TIER_COLOR_TOKENS.find((c) => !used.has(c)) ?? 'slate';
  return {
    id: nextId('tier'),
    label: `Tier ${draft.tiers.length + 1}`,
    minRevenue: '',
    colorToken,
    benefitIds: [],
  };
}

export function newBenefitRow(): BenefitRow {
  return { id: nextId('benefit'), name: '' };
}
