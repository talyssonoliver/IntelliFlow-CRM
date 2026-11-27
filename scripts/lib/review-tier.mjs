/**
 * How big a semantic review a diff deserves (owner ruling 2026-11-26: "ship this on codex and
 * Claude only when necessary"). Pure rules, no process state, so each one is unit-tested.
 *
 *   skip    docs, tests, generated files and comment-only edits: NO model is called. The gate
 *           records "skipped: <reason>" in its output, findings.json and the metrics file; a skip
 *           is visible, never a silent pass.
 *   light   a small diff with no risky path: Codex on a cheaper model and a lower effort.
 *   strong  a large diff or a risky one: Codex on the strong model.
 *
 * Risky = a path touching auth, tenancy / RLS, money / billing, migrations, secrets / crypto or the
 * prisma schema, or a diff over RISKY_LINES changed lines. Only a risky diff may ever be reviewed
 * by Claude (see review-policy.mjs).
 *
 * The model slugs are the ones the ChatGPT plan lists in ~/.codex/models_cache.json (checked
 * 2026-11-27); they are passed as `-m` / `-c model_reasoning_effort=` flags per run and the user's
 * global config is never edited. CODEX_REVIEW_{LIGHT,STRONG}_{MODEL,EFFORT} override them.
 */

/** Changed lines (added + deleted, reviewable files) up to which a diff is "small". */
export const LIGHT_MAX_LINES = 150;
/** Changed lines above which a diff is risky whatever it touches. */
export const RISKY_LINES = 400;

export const DEFAULT_MODELS = Object.freeze({
  light: Object.freeze({ model: 'gpt-6-luna', effort: 'medium' }),
  strong: Object.freeze({ model: 'gpt-6.2-sol', effort: 'high' }),
});

const normalize = (file) => file.replace(/\\/g, '/');

const DOC_RE = /(^docs\/|\.(md|mdx|txt|rst)$|(^|\/)(LICENSE|CHANGELOG)[^/]*$)/i;
const TEST_RE =
  /((^|\/)(__tests__|__mocks__|__fixtures__|e2e|tests?|fixtures)\/|\.(test|spec|stories)\.[cm]?[jt]sx?$)/;
const GENERATED_RE =
  /(pnpm-lock\.yaml$|package-lock\.json$|\.lock$|\.snap$|\.generated\.|__generated__|\.min\.(js|css)$|^artifacts\/|(^|\/)(dist|coverage|\.next)\/|^apps\/project-tracker\/docs\/metrics\/|(^|\/)Sprint_plan[^/]*\.(csv|json)$|^\.specify\/)/;
const TOOLING_RE = /^(scripts|tools|infra|\.github|\.husky|\.claude)\//;

/** 'docs' | 'test' | 'generated' | 'tooling' | 'code' for one changed path. */
export function classifyFile(file) {
  const f = normalize(file);
  if (GENERATED_RE.test(f)) return 'generated';
  if (DOC_RE.test(f)) return 'docs';
  if (TEST_RE.test(f)) return 'test';
  if (TOOLING_RE.test(f)) return 'tooling';
  return 'code';
}

/** Risky path rules: the area a path belongs to, or null. Order is only for the label. */
const RISK_RULES = [
  ['prisma-schema', /(^|\/)schema\.prisma$|(^|\/)prisma\/schema\//],
  ['migration', /(^|\/)migrations?\/|\.sql$/],
  [
    'auth',
    /auth(?!or)|(^|[/._-])(session|jwt|oauth|rbac|permissions?|login|middleware|proxy)([/._-]|$)/i,
  ],
  ['tenancy', /tenan(t|cy)|(^|[/._-])rls([/._-]|$)|row-?level|policies/i],
  [
    'money',
    /billing|payment|stripe|invoice|subscription|pricing|ledger|accounting|checkout|refund|payout|credit-?note|(^|[/._-])money([/._-]|$)/i,
  ],
  [
    'secrets',
    /secret|crypto|encrypt|decrypt|(^|[/._-])kms([/._-]|$)|vault|credential|byok|api-?key|signing/i,
  ],
];

/** The risk area of one path ('auth', 'migration', ...), or null. Test/docs/generated are never risky. */
export function riskArea(file) {
  const f = normalize(file);
  const kind = classifyFile(f);
  if (kind === 'docs' || kind === 'test' || kind === 'generated') return null;
  // Migrations and the prisma schema are risky wherever they live; tooling paths are not reviewed.
  for (const [area, re] of RISK_RULES) {
    if ((area === 'migration' || area === 'prisma-schema') && re.test(f)) return area;
  }
  if (kind === 'tooling') return null;
  for (const [area, re] of RISK_RULES) {
    if (area !== 'migration' && area !== 'prisma-schema' && re.test(f)) return area;
  }
  return null;
}

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|\*\/|#)/;

/**
 * True when every added or removed line in the diff text is blank or a comment, so no behaviour
 * changed. `@@`, `+++`, `---` and context lines are ignored.
 */
export function isCommentOnlyDiff(diffText) {
  let changed = 0;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (!line.startsWith('+') && !line.startsWith('-')) continue;
    const body = line.slice(1);
    changed += 1;
    if (body.trim() !== '' && !COMMENT_LINE.test(body)) return false;
  }
  return changed > 0;
}

/**
 * Sizes the review.
 * @param {{file: string, added: number, deleted: number}[]} stats every changed file (git numstat)
 * @param {{file: string, text: string}[]} [sections] the scoped diff sections, for the
 *   comment-only rule; omit to skip that rule
 * @param {{scoped?: string[], lightMaxLines?: number, riskyLines?: number}} [options]
 *   `scoped`: the files the gate reviews (sonar scope). Default: every code file.
 * @returns {{tier: 'skip'|'light'|'strong', reason: string, risky: boolean, riskyAreas: string[],
 *   riskyFiles: string[], lines: number, files: number, kinds: Record<string, number>}}
 */
export function classifyDiff(stats, sections = [], options = {}) {
  const lightMax = options.lightMaxLines ?? LIGHT_MAX_LINES;
  const riskyLines = options.riskyLines ?? RISKY_LINES;
  const scoped = options.scoped ? new Set(options.scoped) : null;
  const kinds = {};
  const codeFiles = [];
  let lines = 0;
  for (const s of stats) {
    const kind = classifyFile(s.file);
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    const reviewable = kind === 'code' && (!scoped || scoped.has(s.file));
    if (reviewable) {
      codeFiles.push(s.file);
      lines += (s.added || 0) + (s.deleted || 0);
    }
  }
  const riskyFiles = [];
  const areas = new Set();
  for (const s of stats) {
    const area = riskArea(s.file);
    if (area) {
      riskyFiles.push(s.file);
      areas.add(area);
    }
  }
  const base = {
    lines,
    files: stats.length,
    kinds,
    riskyFiles,
    riskyAreas: [...areas],
  };
  if (stats.length === 0) {
    return { ...base, tier: 'skip', risky: false, reason: 'no changed files' };
  }
  if (codeFiles.length === 0 && riskyFiles.length === 0) {
    const parts = Object.entries(kinds)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ');
    return {
      ...base,
      tier: 'skip',
      risky: false,
      reason: `only docs, tests, generated or tooling files changed (${parts})`,
    };
  }
  const codeSections = sections.filter((s) => codeFiles.includes(s.file));
  if (
    riskyFiles.length === 0 &&
    codeSections.length === codeFiles.length &&
    codeSections.length > 0 &&
    codeSections.every((s) => isCommentOnlyDiff(s.text))
  ) {
    return {
      ...base,
      tier: 'skip',
      risky: false,
      reason: `comment or whitespace-only change (${lines} line(s) in ${codeFiles.length} file(s))`,
    };
  }
  if (riskyFiles.length > 0) {
    return {
      ...base,
      tier: 'strong',
      risky: true,
      reason: `risky path (${[...areas].join(', ')}): ${riskyFiles.slice(0, 3).join(', ')}`,
    };
  }
  if (lines > riskyLines) {
    return {
      ...base,
      tier: 'strong',
      risky: true,
      reason: `diff over ${riskyLines} lines (${lines})`,
    };
  }
  if (lines > lightMax) {
    return {
      ...base,
      tier: 'strong',
      risky: false,
      reason: `large diff (${lines} lines, over ${lightMax})`,
    };
  }
  return {
    ...base,
    tier: 'light',
    risky: false,
    reason: `small diff (${lines} lines in ${codeFiles.length} file(s), no risky path)`,
  };
}

/**
 * The Codex model and effort for a tier, from the defaults and CODEX_REVIEW_* overrides. When the
 * plan's model list is known (slugs from models_cache.json) and the chosen model is not on it, the
 * model is left unset so codex uses the user's own configured one, and `note` says so.
 */
export function modelForTier(tier, env = process.env, available = null) {
  if (tier === 'skip') return { model: null, effort: null, note: 'no model' };
  const key = tier === 'light' ? 'LIGHT' : 'STRONG';
  const def = DEFAULT_MODELS[tier];
  const model = env[`CODEX_REVIEW_${key}_MODEL`] || def.model;
  const effort = env[`CODEX_REVIEW_${key}_EFFORT`] || def.effort;
  if (available && available.length > 0 && !available.includes(model)) {
    return {
      model: null,
      effort,
      note: `${model} is not on the plan; using the codex config model`,
    };
  }
  return { model, effort, note: '' };
}

/** Model slugs from the text of ~/.codex/models_cache.json, or null when unreadable. */
export function parseModelCache(text) {
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : parsed.models;
    if (!Array.isArray(list)) return null;
    const slugs = list.map((m) => m.slug || m.id).filter(Boolean);
    return slugs.length > 0 ? slugs : null;
  } catch {
    return null;
  }
}

/** Parses `git diff --numstat` output into { file, added, deleted }[]. Binary files count 0. */
export function parseNumstat(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [a, d, ...rest] = line.split('\t');
      return {
        file: rest.join('\t').trim(),
        added: Number.parseInt(a, 10) || 0,
        deleted: Number.parseInt(d, 10) || 0,
      };
    })
    .filter((s) => s.file);
}
