/**
 * IFC-310 — Pure duplicate-rule evaluator.
 *
 * Zero I/O. Zero Prisma. Zero network. Used by both
 * ContactDuplicateDetectionService and AccountDuplicateDetectionService.
 */

export type RuleField =
  | 'email'
  | 'phone'
  | 'name_company'
  | 'name'
  | 'website'
  | 'name_address';

export type MatchStrategy = 'exact' | 'normalized' | 'fuzzy';

export interface EvaluableRule {
  field: RuleField;
  matchStrategy: MatchStrategy;
  threshold: number;
  isActive: boolean;
  sortOrder: number;
}

export interface DuplicateMatch<T extends { id: string }> {
  candidate: T;
  ruleField: RuleField;
  matchStrategy: MatchStrategy;
  score: number;
}

type FieldKey =
  | 'email'
  | 'phone'
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'company'
  | 'website'
  | 'addressLine1'
  | 'city';

function readString(
  row: Record<string, unknown> | undefined | null,
  key: FieldKey,
): string {
  if (!row) return '';
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

function trimLower(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeString(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(value: string): string {
  return value.replace(/\D+/g, '');
}

function normalizeWebsite(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

export function extractFieldValue(
  row: Record<string, unknown> | undefined | null,
  field: RuleField,
  strategy: MatchStrategy,
): string {
  switch (field) {
    case 'email': {
      const raw = readString(row, 'email');
      return strategy === 'exact' ? trimLower(raw) : normalizeString(raw);
    }
    case 'phone': {
      const raw = readString(row, 'phone');
      return strategy === 'exact' ? trimLower(raw) : normalizePhone(raw);
    }
    case 'name': {
      const first = readString(row, 'firstName');
      const last = readString(row, 'lastName');
      const combined = `${first} ${last}`.trim() || readString(row, 'name');
      return strategy === 'exact' ? trimLower(combined) : normalizeString(combined);
    }
    case 'name_company': {
      const first = readString(row, 'firstName');
      const last = readString(row, 'lastName');
      const personName =
        `${first} ${last}`.trim() || readString(row, 'name');
      const company = readString(row, 'company');
      const combined = `${personName}|${company}`;
      return strategy === 'exact' ? trimLower(combined) : normalizeString(combined);
    }
    case 'website': {
      const raw = readString(row, 'website');
      return strategy === 'exact' ? trimLower(raw) : normalizeWebsite(raw);
    }
    case 'name_address': {
      const name = readString(row, 'name');
      const addr = readString(row, 'addressLine1');
      const city = readString(row, 'city');
      const combined = `${name}|${addr}|${city}`;
      return strategy === 'exact' ? trimLower(combined) : normalizeString(combined);
    }
    default:
      return '';
  }
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const cols = b.length + 1;
  let prev = new Array<number>(cols);
  let curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[cols - 1];
}

function similarityPercent(a: string, b: string): number {
  if (!a && !b) return 0;
  if (a === b) return 100;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  const dist = levenshtein(a, b);
  const pct = Math.round(((longest - dist) / longest) * 100);
  return Math.max(0, Math.min(100, pct));
}

function scoreForStrategy(
  strategy: MatchStrategy,
  input: string,
  candidate: string,
): number {
  if (!input || !candidate) return 0;
  switch (strategy) {
    case 'exact':
      return input === candidate ? 100 : 0;
    case 'normalized':
      return input === candidate ? 100 : 0;
    case 'fuzzy':
      return similarityPercent(input, candidate);
    default:
      return 0;
  }
}

const DEFAULT_FUZZY_FLOOR = 60;

export function evaluateDuplicateRules<
  T extends { id: string } & Record<string, unknown>,
>(
  input: Partial<T>,
  existing: readonly T[],
  rules: readonly EvaluableRule[],
): DuplicateMatch<T>[] {
  if (!Array.isArray(rules) || rules.length === 0) return [];
  if (!Array.isArray(existing) || existing.length === 0) return [];

  const active = rules.filter((r) => r && r.isActive);
  if (active.length === 0) return [];

  const sorted = [...active].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );

  const matches: DuplicateMatch<T>[] = [];
  const seen = new Map<string, DuplicateMatch<T>>();

  for (const rule of sorted) {
    const threshold = Math.max(
      0,
      Math.min(100, Number.isFinite(rule.threshold) ? rule.threshold : 100),
    );
    const inputValue = extractFieldValue(
      input as Record<string, unknown>,
      rule.field,
      rule.matchStrategy,
    );
    if (!inputValue) continue;

    const floor =
      rule.matchStrategy === 'fuzzy'
        ? Math.max(DEFAULT_FUZZY_FLOOR, threshold)
        : threshold || 100;

    for (const candidate of existing) {
      if (!candidate || !candidate.id) continue;
      if (
        (input as Partial<{ id: string }>).id &&
        (input as { id: string }).id === candidate.id
      ) {
        continue;
      }
      const candidateValue = extractFieldValue(
        candidate,
        rule.field,
        rule.matchStrategy,
      );
      const score = scoreForStrategy(
        rule.matchStrategy,
        inputValue,
        candidateValue,
      );
      if (score < floor) continue;

      const existingMatch = seen.get(candidate.id);
      const match: DuplicateMatch<T> = {
        candidate,
        ruleField: rule.field,
        matchStrategy: rule.matchStrategy,
        score,
      };
      if (!existingMatch || existingMatch.score < score) {
        seen.set(candidate.id, match);
      }
    }
  }

  for (const match of seen.values()) matches.push(match);
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.ruleField.localeCompare(b.ruleField);
  });
  return matches;
}
