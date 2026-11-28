/**
 * Tests for scripts/lib/review-tier.mjs: how big a review a diff gets, decided in code.
 * No model is called anywhere here.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_MODELS,
  PREFERRED_MODELS,
  LIGHT_MAX_LINES,
  RISKY_LINES,
  catalogFallbackFor,
  classifyDiff,
  classifyFile,
  isCommentOnlyDiff,
  isReviewGateFile,
  modelForTier,
  parseModelCache,
  parseModelCatalog,
  parseNumstat,
  riskArea,
  sizeRange,
  sizingRanges,
} from '../lib/review-tier.mjs';

const stat = (file: string, added = 5, deleted = 0) => ({ file, added, deleted });

describe('classifyFile', () => {
  it.each([
    ['docs/guide.md', 'docs'],
    ['README.md', 'docs'],
    ['apps/web/src/a.test.ts', 'test'],
    ['apps/api/src/__tests__/a.ts', 'test'],
    ['apps/web/e2e/login.spec.ts', 'test'],
    ['pnpm-lock.yaml', 'generated'],
    ['apps/project-tracker/docs/metrics/_global/Sprint_plan.csv', 'generated'],
    ['artifacts/x/y.json', 'generated'],
    ['scripts/lib/coverage-floor.mjs', 'tooling'],
    ['scripts/pre-ship.mjs', 'code'],
    ['.github/workflows/ci.yml', 'tooling'],
    ['apps/web/src/app/page.tsx', 'code'],
    ['packages/db/prisma/schema.prisma', 'code'],
  ])('%s is %s', (file, kind) => {
    expect(classifyFile(file)).toBe(kind);
  });

  it('accepts Windows separators', () => {
    expect(classifyFile('apps\\web\\src\\a.test.ts')).toBe('test');
  });
});

describe('riskArea', () => {
  it.each([
    ['apps/api/src/modules/auth/auth.router.ts', 'auth'],
    ['apps/web/src/lib/session.ts', 'auth'],
    ['packages/db/src/tenant-context.ts', 'tenancy'],
    ['packages/db/prisma/migrations/2026_x/migration.sql', 'migration'],
    ['packages/db/prisma/schema.prisma', 'prisma-schema'],
    ['apps/api/src/modules/billing/billing.router.ts', 'money'],
    ['apps/api/src/modules/stripe/webhook.ts', 'money'],
    ['packages/platform/src/crypto/encrypt.ts', 'secrets'],
    ['apps/ai-worker/src/byok/provider-key.ts', 'secrets'],
  ])('%s is risky (%s)', (file, area) => {
    expect(riskArea(file)).toBe(area);
  });

  it.each([
    'apps/web/src/components/leads/lead-card.tsx',
    'apps/api/src/modules/author/author.ts',
    'apps/web/src/lib/format-date.ts',
  ])('%s is not risky', (file) => {
    expect(riskArea(file)).toBeNull();
  });

  it('never marks a test, a doc or a generated file as risky', () => {
    expect(riskArea('apps/api/src/modules/auth/__tests__/auth.test.ts')).toBeNull();
    expect(riskArea('docs/billing/overview.md')).toBeNull();
    expect(riskArea('packages/db/src/generated/tenant.generated.ts')).toBeNull();
  });

  it('does not treat tooling paths as risky unless they are migrations', () => {
    expect(riskArea('scripts/secret-scan.mjs')).toBeNull();
    expect(riskArea('infra/db/migrations/001.sql')).toBe('migration');
  });
});

describe('isCommentOnlyDiff', () => {
  const diff = (...body: string[]) => `@@ -1,3 +1,3 @@\n ctx\n${body.join('\n')}\n ctx\n`;

  it('is true when every changed line is a comment or blank', () => {
    expect(isCommentOnlyDiff(diff('-// old', '+// new', '+', '+ * doc'))).toBe(true);
  });

  it('is false when one changed line is code', () => {
    expect(isCommentOnlyDiff(diff('-// old', '+const a = 1;'))).toBe(false);
  });

  it('is false for a diff with no changed lines', () => {
    expect(isCommentOnlyDiff('@@ -1 +1 @@\n ctx\n')).toBe(false);
  });
});

describe('classifyDiff: the sizing rules', () => {
  it('skips docs, tests, generated and tooling only, with the reason', () => {
    const r = classifyDiff([
      stat('docs/a.md'),
      stat('apps/web/src/a.test.ts', 40),
      stat('pnpm-lock.yaml', 900),
      stat('scripts/x.mjs'),
    ]);
    expect(r.tier).toBe('skip');
    expect(r.reason).toMatch(/only docs, tests, generated or tooling/);
    expect(r.reason).toMatch(/1 docs/);
    expect(r.risky).toBe(false);
  });

  it('skips an empty change', () => {
    expect(classifyDiff([]).tier).toBe('skip');
  });

  it('skips a comment-only code change but not one that changes a line of code', () => {
    const file = 'apps/web/src/a.ts';
    const only = [{ file, text: '@@ -1 +1 @@\n-// a\n+// b\n' }];
    expect(classifyDiff([stat(file, 1, 1)], only).tier).toBe('skip');
    expect(classifyDiff([stat(file, 1, 1)], only).reason).toMatch(/comment or whitespace-only/);
    const code = [{ file, text: '@@ -1 +1 @@\n-// a\n+const x = 1;\n' }];
    expect(classifyDiff([stat(file, 1, 1)], code).tier).toBe('light');
  });

  it('gives a small diff with no risky path the light tier', () => {
    const r = classifyDiff([stat('apps/web/src/a.tsx', 40, 10)]);
    expect(r).toMatchObject({ tier: 'light', risky: false, lines: 50 });
  });

  it('counts test lines out of the size', () => {
    const r = classifyDiff([stat('apps/web/src/a.tsx', 10), stat('apps/web/src/a.test.tsx', 900)]);
    expect(r.tier).toBe('light');
    expect(r.lines).toBe(10);
  });

  it('gives a large diff the strong tier without calling it risky', () => {
    const r = classifyDiff([stat('apps/web/src/a.tsx', LIGHT_MAX_LINES + 1)]);
    expect(r).toMatchObject({ tier: 'strong', risky: false });
    expect(r.reason).toMatch(/large diff/);
  });

  it('keeps the light tier at exactly the limit', () => {
    expect(classifyDiff([stat('apps/web/src/a.tsx', LIGHT_MAX_LINES)]).tier).toBe('light');
  });

  it('calls a diff over the risky line count risky, strong', () => {
    const r = classifyDiff([stat('apps/web/src/a.tsx', RISKY_LINES + 1)]);
    expect(r).toMatchObject({ tier: 'strong', risky: true });
    expect(r.reason).toMatch(/over 400 lines/);
  });

  it('calls any risky path risky and strong, however small', () => {
    const r = classifyDiff([stat('apps/api/src/modules/billing/billing.router.ts', 2)]);
    expect(r).toMatchObject({ tier: 'strong', risky: true, riskyAreas: ['money'] });
    expect(r.riskyFiles).toEqual(['apps/api/src/modules/billing/billing.router.ts']);
  });

  it('sees a migration even though the gate never reviews it, and keeps the diff strong', () => {
    const r = classifyDiff(
      [stat('packages/db/prisma/migrations/x/migration.sql', 3), stat('apps/web/src/a.tsx', 3)],
      [],
      { scoped: ['apps/web/src/a.tsx'] }
    );
    expect(r).toMatchObject({ tier: 'strong', risky: true });
    expect(r.riskyAreas).toContain('migration');
  });

  it('a risky path wins over the comment-only rule', () => {
    const file = 'apps/api/src/modules/auth/a.ts';
    const sections = [{ file, text: '@@ -1 +1 @@\n-// a\n+// b\n' }];
    expect(classifyDiff([stat(file, 1, 1)], sections).tier).toBe('strong');
  });

  it('honours the options', () => {
    const r = classifyDiff([stat('apps/web/src/a.tsx', 30)], [], {
      lightMaxLines: 10,
      riskyLines: 20,
    });
    expect(r).toMatchObject({ tier: 'strong', risky: true });
  });

  it('only counts scoped files toward the size when a scope is given', () => {
    const r = classifyDiff([stat('apps/web/src/a.tsx', 10), stat('apps/other/src/b.ts', 900)], [], {
      scoped: ['apps/web/src/a.tsx'],
    });
    expect(r.tier).toBe('light');
  });
});

describe('modelForTier', () => {
  it('uses no model for a skip', () => {
    expect(modelForTier('skip')).toMatchObject({ model: null, effort: null });
  });

  it('picks the light and the strong defaults', () => {
    expect(modelForTier('light', {})).toMatchObject(DEFAULT_MODELS.light);
    expect(modelForTier('strong', {})).toMatchObject(DEFAULT_MODELS.strong);
    expect(DEFAULT_MODELS.light.model).not.toBe(DEFAULT_MODELS.strong.model);
  });

  it('takes an env override', () => {
    const env = { CODEX_REVIEW_LIGHT_MODEL: 'm-x', CODEX_REVIEW_LIGHT_EFFORT: 'low' };
    expect(modelForTier('light', env)).toMatchObject({ model: 'm-x', effort: 'low' });
  });

  it('leaves the model to the codex config when the plan does not list it', () => {
    const r = modelForTier('light', {}, ['some-other-model']);
    expect(r.model).toBeNull();
    expect(r.note).toMatch(/not on the plan/);
    expect(modelForTier('light', {}, [DEFAULT_MODELS.light.model]).model).toBe(
      DEFAULT_MODELS.light.model
    );
  });
});

describe('parseModelCache and parseNumstat', () => {
  it('reads the slugs of a codex models cache', () => {
    expect(parseModelCache(JSON.stringify({ models: [{ slug: 'a' }, { slug: 'b' }] }))).toEqual([
      'a',
      'b',
    ]);
    expect(parseModelCache('not json')).toBeNull();
    expect(parseModelCache('{"models":[]}')).toBeNull();
  });

  it('parses numstat lines, binary files as 0', () => {
    expect(parseNumstat('3\t1\tapps/a.ts\n-\t-\timg.png\n')).toEqual([
      { file: 'apps/a.ts', added: 3, deleted: 1 },
      { file: 'img.png', added: 0, deleted: 0 },
    ]);
  });
});

describe('the dry-run sizing of a revision range', () => {
  const fakeGit = (outputs: Record<string, string>) => (args: string[]) => {
    const key = args.includes('--numstat') ? 'numstat' : 'diff';
    return outputs[key] ?? '';
  };
  const numstat = (added: number, deleted: number, file: string) =>
    `${added}\t${deleted}\t${file}\n`;
  const diffOf = (file: string, ...changed: string[]) =>
    [
      `diff --git a/${file} b/${file}`,
      `--- a/${file}`,
      `+++ b/${file}`,
      '@@ -1 +1 @@',
      ...changed,
      '',
    ].join('\n');

  it('turns --pr=<sha> into the squash commit range', () => {
    expect(sizingRanges(['--pr=abc', 'main...HEAD'])).toEqual(['abc^..abc', 'main...HEAD']);
  });

  it('sizes a docs-only range without asking git for a diff', () => {
    const git = vi.fn(fakeGit({ numstat: numstat(3, 0, 'docs/a.md') }));
    const row = sizeRange('r', git);
    expect(row).toMatchObject({ tier: 'skip', reviewer: 'none', files: 1, kinds: '1 docs' });
    expect(git).toHaveBeenCalledTimes(1);
  });

  it('sizes a small code range to the light model and a risky one to the strong', () => {
    const web = 'apps/web/src/a.ts';
    const api = 'apps/api/src/billing/a.ts';
    const light = sizeRange(
      'r',
      fakeGit({ numstat: numstat(1, 1, web), diff: diffOf(web, '-a', '+const b = 1;') }),
      {}
    );
    expect(light).toMatchObject({
      tier: 'light',
      risky: false,
      reviewer: 'codex gpt-6-luna/medium',
    });
    const risky = sizeRange(
      'r',
      fakeGit({ numstat: numstat(1, 1, api), diff: diffOf(api, '-a', '+const b = 1;') }),
      {}
    );
    expect(risky).toMatchObject({
      tier: 'strong',
      risky: true,
      reviewer: 'codex gpt-6.2-sol/high',
    });
  });

  it('sees a comment-only code range as a skip', () => {
    const web = 'apps/web/src/a.ts';
    const row = sizeRange(
      'r',
      fakeGit({ numstat: numstat(1, 1, web), diff: diffOf(web, '-// a', '+// b') })
    );
    expect(row).toMatchObject({ tier: 'skip' });
  });
});

describe('parseModelCatalog and effort validation', () => {
  it('reads each slug with its supported efforts, null when unreadable', () => {
    const cat = parseModelCatalog(
      JSON.stringify({
        models: [{ slug: 'a', supported_reasoning_levels: [{ effort: 'low' }] }, { slug: 'b' }],
      })
    );
    expect(cat).toEqual([
      { slug: 'a', efforts: ['low'] },
      { slug: 'b', efforts: null },
    ]);
    expect(parseModelCatalog('nope')).toBeNull();
  });

  it('keeps a known model, drops an effort it does not list, skips an unknown slug', () => {
    const cat = [{ slug: 'gpt-6.2-sol', efforts: ['low', 'medium'] }];
    expect(modelForTier('strong', {}, cat)).toMatchObject({ model: 'gpt-6.2-sol', effort: null });
    expect(modelForTier('strong', {}, [{ slug: 'z', efforts: ['high'] }])).toMatchObject({
      model: null,
      effort: 'high',
    });
    expect(modelForTier('strong', {}, [{ slug: 'gpt-6.2-sol', efforts: ['high'] }])).toMatchObject({
      model: 'gpt-6.2-sol',
      effort: 'high',
      note: '',
    });
  });
});

describe('catalog fallback models', () => {
  it('lists the strong and light preferences next to the tier models', () => {
    expect(PREFERRED_MODELS.strong).toEqual(['gpt-6.1-sol', 'gpt-6-sol', 'gpt-5.6-sol']);
    expect(PREFERRED_MODELS.light).toEqual(['gpt-6-luna', 'gpt-5.6-luna']);
  });

  it('takes the first preference the catalog lists, in preference order', () => {
    const catalog = [
      { slug: 'gpt-5.6-sol', efforts: null },
      { slug: 'gpt-6-sol', efforts: null },
    ];
    expect(catalogFallbackFor('strong', catalog, {})).toEqual({
      model: 'gpt-6-sol',
      effort: 'high',
    });
    expect(catalogFallbackFor('light', [{ slug: 'gpt-5.6-luna', efforts: null }], {})).toEqual({
      model: 'gpt-5.6-luna',
      effort: 'medium',
    });
  });

  it('picks an explicit supported effort, never null, and returns null when none is listed', () => {
    const lowOnly = [{ slug: 'gpt-6.1-sol', efforts: ['low'] }];
    expect(catalogFallbackFor('strong', lowOnly, {})).toEqual({
      model: 'gpt-6.1-sol',
      effort: 'low',
    });
    const mid = [{ slug: 'gpt-6.1-sol', efforts: ['low', 'medium'] }];
    expect(catalogFallbackFor('strong', mid, {})?.effort).toBe('medium');
    expect(catalogFallbackFor('strong', [{ slug: 'other', efforts: null }], {})).toBeNull();
    expect(catalogFallbackFor('strong', null, {})).toBeNull();
    expect(catalogFallbackFor('skip', [{ slug: 'gpt-6.1-sol', efforts: null }], {})).toBeNull();
  });

  it('reads the preference list from an env override', () => {
    const env = { CODEX_REVIEW_STRONG_FALLBACKS: 'x-1, x-2' };
    expect(catalogFallbackFor('strong', ['x-2', 'gpt-6.1-sol'], env)?.model).toBe('x-2');
  });
});

describe('the review gate files are always risky', () => {
  const gateFiles = [
    'scripts/codex-review.mjs',
    'scripts/codex-review-metrics.mjs',
    'scripts/lib/review-tier.mjs',
    'scripts/lib/review-policy.mjs',
    'scripts/lib/codex-review-run.mjs',
    'scripts/lib/codex-chunk-review.mjs',
    'scripts/lib/codex-diff.mjs',
    'scripts/lib/codex-fingerprint.mjs',
    'scripts/lib/review-commands.mjs',
    'scripts/lib/review-rounds.mjs',
    'scripts/pre-ship.mjs',
    'scripts/lib/preship-gate.mjs',
    'tools/audit/codex-review-waivers.yaml',
  ];

  it.each(gateFiles)('%s is reviewable code in the review-gate risk area', (file) => {
    expect(isReviewGateFile(file)).toBe(true);
    expect(classifyFile(file)).toBe('code');
    expect(riskArea(file)).toBe('review-gate');
  });

  it.each(gateFiles)('a one-line diff of %s is the strong tier, never skip or light', (file) => {
    const r = classifyDiff([stat(file, 1, 0)], [], { scoped: [file] });
    expect(r).toMatchObject({ tier: 'strong', risky: true, riskyAreas: ['review-gate'] });
  });

  it('a comment-only change to a gate file is still reviewed', () => {
    const file = 'scripts/lib/review-tier.mjs';
    const text = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-// a\n+// b\n`;
    expect(classifyDiff([stat(file, 1, 1)], [{ file, text }], { scoped: [file] }).tier).toBe(
      'strong'
    );
  });

  it('their tests and unrelated scripts keep their kinds', () => {
    expect(riskArea('scripts/__tests__/review-tier.test.ts')).toBeNull();
    expect(classifyFile('scripts/__tests__/review-tier.test.ts')).toBe('test');
    expect(isReviewGateFile('scripts/lib/coverage-floor.mjs')).toBe(false);
    expect(classifyFile('scripts/lib/coverage-floor.mjs')).toBe('tooling');
    expect(isReviewGateFile('docs/codex-review.md')).toBe(false);
    expect(classifyDiff([stat('scripts/lib/coverage-floor.mjs')]).tier).toBe('skip');
  });
});

describe('every module the review gate imports is a gate file', () => {
  it('covers each relative .mjs import of the gate, run and chunk modules', () => {
    const root = path.resolve(__dirname, '..');
    const files = ['codex-review.mjs', 'lib/codex-review-run.mjs', 'lib/codex-chunk-review.mjs'];
    const imported = new Set<string>();
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      for (const m of src.matchAll(/from '(\.{1,2}\/(?:lib\/)?[\w.-]+\.mjs)'/g)) {
        imported.add(path.posix.join(path.posix.dirname(`scripts/${f}`), m[1]));
      }
    }
    expect(imported.size).toBeGreaterThan(8);
    for (const rel of imported) expect(isReviewGateFile(rel), rel).toBe(true);
  });
});
