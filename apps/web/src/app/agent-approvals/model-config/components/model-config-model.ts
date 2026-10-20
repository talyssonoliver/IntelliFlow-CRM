/**
 * Model Configuration page model (PG-199, ADR-082): pure helpers between the
 * `modelConfig.get` response, the editable drafts and the `update` /
 * `resetToDefaults` payloads. Downgrades use the same domain rule as the server,
 * so the page asks before the server would refuse.
 */
import {
  LLM_PURPOSES,
  findDowngrades,
  type LLMPurpose,
  type MODEL_CONFIG_LIMITS,
  type ModelDowngrade,
  type PurposeModelPick,
} from '@intelliflow/domain';
import type {
  ModelConfigExpected,
  PurposeConfigInput,
  ResetModelConfigInput,
  UpdateModelConfigInput,
} from '@intelliflow/validators';

// ─── Response shapes (mirror `modelConfig.get`) ──────────────────────────────

export interface CatalogModel {
  id: string;
  kind: 'chat' | 'embedding';
  purposes: string[];
  /** Input + output micro-USD per 1k tokens (the ranking price). */
  price: number;
  priceMicroUsdPer1k: { input: number; output: number };
  onOpenRouter: boolean;
  dimensions: number | null;
  deprecated: boolean;
}

export interface PurposeRow {
  purpose: LLMPurpose;
  modelId: string | null;
  fallbackModelIds: string[];
  temperature: number | null;
  maxTokens: number | null;
  monthlyCostCeilingCents: number | null;
  /** The row's optimistic-concurrency token; null when the tenant has no row. */
  updatedAt: string | null;
  defaultModelIds: string[];
  /** Month-to-date spend in cents; null when it could not be read. */
  spentCents: number | null;
  blocked: boolean;
  retired: boolean;
  locked: boolean;
  /** rag only: the embedding model the worker reports running; null when not reported. */
  activeModel: { id: string; dimensions: number | null } | null;
}

export type ModelConfigLimits = typeof MODEL_CONFIG_LIMITS;

export interface ModelConfigData {
  purposes: PurposeRow[];
  catalog: CatalogModel[];
  limits: ModelConfigLimits;
  period: string;
  canManage: boolean;
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

export interface PurposeDraft {
  purpose: LLMPurpose;
  modelId: string | null;
  fallbackModelIds: string[];
  temperature: number | null;
  /** Text as typed; "" means the caller default. */
  maxTokens: string;
  /** Dollars as typed; "" means no ceiling, "0" blocks the purpose. */
  ceilingUsd: string;
}

/** Field → message; fallback entries are keyed `fallbackModelIds.<index>`. */
export type DraftErrors = Partial<Record<string, string>>;
export type PurposeErrors = Partial<Record<LLMPurpose, DraftErrors>>;

export const PURPOSE_META: Record<
  LLMPurpose,
  { title: string; description: string; icon: string; iconBg: string; iconFg: string }
> = {
  scoring: {
    title: 'Scoring',
    description: 'Lead scoring and churn risk.',
    icon: 'speed',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconFg: 'text-blue-600 dark:text-blue-400',
  },
  qualification: {
    title: 'Qualification',
    description: 'Lead qualification and case insights.',
    icon: 'checklist',
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    iconFg: 'text-violet-600 dark:text-violet-400',
  },
  email: {
    title: 'Email',
    description: 'Reply drafts and AI email auto-responses.',
    icon: 'mail',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconFg: 'text-amber-700 dark:text-amber-400',
  },
  reasoning: {
    title: 'Reasoning',
    description: 'Insights, next best actions and conversation summaries.',
    icon: 'psychology',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconFg: 'text-emerald-600 dark:text-emerald-400',
  },
  structured: {
    title: 'Structured',
    description: 'Ticket routing, sentiment and other structured answers.',
    icon: 'data_object',
    iconBg: 'bg-sky-100 dark:bg-sky-900/30',
    iconFg: 'text-sky-600 dark:text-sky-400',
  },
  rag: {
    title: 'Rag',
    description: 'Embeddings for search and retrieval.',
    icon: 'hub',
    iconBg: 'bg-rose-100 dark:bg-rose-900/30',
    iconFg: 'text-rose-600 dark:text-rose-400',
  },
};

export function centsToUsdText(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2);
}

export function toDraft(row: PurposeRow): PurposeDraft {
  return {
    purpose: row.purpose,
    modelId: row.modelId,
    fallbackModelIds: [...row.fallbackModelIds],
    temperature: row.temperature,
    maxTokens: row.maxTokens === null ? '' : String(row.maxTokens),
    ceilingUsd: centsToUsdText(row.monthlyCostCeilingCents),
  };
}

const USD_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const INT_PATTERN = /^\d+$/;
export const CEILING_FORMAT_ERROR = 'Use dollars with at most two decimals, e.g. 25 or 12.50.';

export type UsdParse = { ok: true; cents: number | null } | { ok: false; error: string };

export function parseUsdToCents(text: string, maxCents: number = 2_000_000): UsdParse {
  const value = text.trim();
  if (value === '') return { ok: true, cents: null };
  if (!USD_PATTERN.test(value)) return { ok: false, error: CEILING_FORMAT_ERROR };
  const cents = Math.round(Number(value) * 100);
  if (cents > maxCents) {
    return { ok: false, error: `The ceiling can be at most ${formatUsd(maxCents)} a month.` };
  }
  return { ok: true, cents };
}

export function formatUsd(cents: number): string {
  return `$${(Math.round(cents) / 100).toFixed(2)}`;
}

/** micro-USD per 1k tokens → dollars per million tokens. */
export function formatModelPrice(microUsdPer1k: number): string {
  if (microUsdPer1k === 0) return 'Free';
  return `$${(microUsdPer1k / 1000).toFixed(2)} / 1M tokens`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** 'YYYY-MM' → 'October 2026 (UTC)'. */
export function formatPeriod(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]} (UTC)` : `${period} (UTC)`;
}

/** Models routed for a purpose, cheapest first (ties by id). */
export function modelOptionsFor(purpose: LLMPurpose, catalog: CatalogModel[]): CatalogModel[] {
  return catalog
    .filter((model) => model.purposes.includes(purpose))
    .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
}

export function validateDraft(draft: PurposeDraft, limits: ModelConfigLimits): DraftErrors {
  const errors: DraftErrors = {};
  const tokens = draft.maxTokens.trim();
  if (tokens !== '') {
    const value = Number(tokens);
    if (!INT_PATTERN.test(tokens) || value < limits.maxTokensMin || value > limits.maxTokensMax) {
      errors.maxTokens = `Use a whole number from ${limits.maxTokensMin} to ${limits.maxTokensMax}, or leave empty for the default.`;
    }
  }
  const ceiling = parseUsdToCents(draft.ceilingUsd, limits.ceilingCentsMax);
  if (!ceiling.ok) errors.ceilingUsd = ceiling.error;
  return errors;
}

/** The API input for a draft that passed `validateDraft`. Never carries `tier`. */
export function draftToInput(draft: PurposeDraft): PurposeConfigInput {
  const tokens = draft.maxTokens.trim();
  const ceiling = parseUsdToCents(draft.ceilingUsd);
  return {
    purpose: draft.purpose,
    modelId: draft.modelId,
    fallbackModelIds: [...draft.fallbackModelIds],
    temperature: draft.temperature,
    maxTokens: tokens === '' ? null : Number(tokens),
    monthlyCostCeilingCents: ceiling.ok ? ceiling.cents : null,
  };
}

/** Compared as typed, so an invalid edit still counts as a change (and is validated). */
function isChanged(row: PurposeRow | undefined, draft: PurposeDraft): boolean {
  if (!row) return true;
  return JSON.stringify(toDraft(row)) !== JSON.stringify(draft);
}

/** Drafts whose saved values differ from the rows they were loaded from. */
export function changedDrafts(rows: PurposeRow[], drafts: PurposeDraft[]): PurposeDraft[] {
  const byPurpose = new Map(rows.map((row) => [row.purpose, row]));
  return drafts.filter((draft) => isChanged(byPurpose.get(draft.purpose), draft));
}

export function buildUpdatePayload(
  rows: PurposeRow[],
  drafts: PurposeDraft[],
  acknowledgeDowngrade: boolean
): UpdateModelConfigInput {
  const byPurpose = new Map(rows.map((row) => [row.purpose, row]));
  const changed = changedDrafts(rows, drafts);
  const expected: ModelConfigExpected = {};
  for (const draft of changed)
    expected[draft.purpose] = byPurpose.get(draft.purpose)?.updatedAt ?? null;
  return {
    purposes: changed.map(draftToInput),
    expected,
    ...(acknowledgeDowngrade ? { acknowledgeDowngrade: true as const } : {}),
  };
}

function pickOf(source: { modelId: string | null; fallbackModelIds: string[] }): PurposeModelPick {
  return { modelId: source.modelId, fallbackModelIds: source.fallbackModelIds };
}

export function draftDowngrades(rows: PurposeRow[], drafts: PurposeDraft[]): ModelDowngrade[] {
  const byPurpose = new Map(rows.map((row) => [row.purpose, row]));
  return changedDrafts(rows, drafts).flatMap((draft) => {
    const row = byPurpose.get(draft.purpose);
    return row ? findDowngrades(draft.purpose, pickOf(row), pickOf(draft)) : [];
  });
}

const NO_PICK: PurposeModelPick = { modelId: null, fallbackModelIds: [] };

/** Every pick a reset makes cheaper (what the reset confirm must name). */
export function resetDowngrades(rows: PurposeRow[]): ModelDowngrade[] {
  return rows.flatMap((row) => findDowngrades(row.purpose, pickOf(row), NO_PICK));
}

export function buildResetPayload(
  rows: PurposeRow[],
  acknowledgeDowngrade: boolean
): ResetModelConfigInput {
  const byPurpose = new Map(rows.map((row) => [row.purpose, row]));
  const expected: ModelConfigExpected = {};
  for (const purpose of LLM_PURPOSES) expected[purpose] = byPurpose.get(purpose)?.updatedAt ?? null;
  return {
    expected,
    ...(acknowledgeDowngrade ? { acknowledgeDowngrade: true as const } : {}),
  };
}

function priceLabel(price: number | undefined): string {
  return price === undefined ? 'unknown price' : formatModelPrice(price);
}

export function describeDowngrade(d: ModelDowngrade): string {
  const title = PURPOSE_META[d.purpose].title;
  const slot = d.slot === 'primary' ? 'primary' : `fallback ${d.slot + 1}`;
  const emptyName = d.slot === 'primary' ? 'Default' : 'none';
  const from = `${d.from ?? emptyName} (${priceLabel(d.fromPrice)})`;
  const to = `${d.to ?? 'Default'} (${priceLabel(d.toPrice)})`;
  return `${title} ${slot}: ${from} → ${to}`;
}

interface ServerIssue {
  path: (string | number)[];
  message: string;
}

function isIssue(value: unknown): value is ServerIssue {
  if (!value || typeof value !== 'object') return false;
  const issue = value as Partial<ServerIssue>;
  return Array.isArray(issue.path) && typeof issue.message === 'string';
}

/**
 * tRPC input errors carry the zod issues as JSON in `message`. Issues under
 * `purposes.<i>.<field>` are mapped to the purpose that was sent at index i.
 */
export function mapServerIssues(message: string, sent: LLMPurpose[]): PurposeErrors {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return {};
  }
  if (!Array.isArray(parsed)) return {};
  const errors: PurposeErrors = {};
  for (const issue of parsed.filter(isIssue)) {
    const [root, index, ...field] = issue.path;
    const purpose = typeof index === 'number' ? sent[index] : undefined;
    if (root !== 'purposes' || !purpose || field.length === 0) continue;
    errors[purpose] = { ...errors[purpose], [field.join('.')]: issue.message };
  }
  return errors;
}

/** True when month-to-date spend already reaches the drafted ceiling. */
export function isBelowSpend(draft: PurposeDraft, spentCents: number | null): boolean {
  if (spentCents === null) return false;
  const ceiling = parseUsdToCents(draft.ceilingUsd);
  return ceiling.ok && ceiling.cents !== null && spentCents >= ceiling.cents;
}
