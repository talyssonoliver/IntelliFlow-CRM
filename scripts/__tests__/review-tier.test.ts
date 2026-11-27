/**
 * Tests for scripts/lib/review-tier.mjs: how big a review a diff gets, decided in code.
 * No model is called anywhere here.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_MODELS,
  LIGHT_MAX_LINES,
  RISKY_LINES,
  classifyDiff,
  classifyFile,
  isCommentOnlyDiff,
  modelForTier,
  parseModelCache,
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
    ['scripts/pre-ship.mjs', 'tooling'],
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
