/**
 * check-test-variant-names (#1216 item 5): which file names are coverage variants.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  VARIANT_TEST_FILE,
  baseFrom,
  gitLines,
  newFiles,
  run,
  variantTestFiles,
} from '../check-test-variant-names.mjs';

describe('gitLines', () => {
  it('runs git with the arguments and keeps the non-empty trimmed lines', () => {
    const calls: unknown[][] = [];
    const exec = (...args: unknown[]) => {
      calls.push(args);
      return ' a.ts \n\n  b.ts\r\n';
    };
    expect(gitLines(['diff', '--name-only'], exec)).toEqual(['a.ts', 'b.ts']);
    expect(calls).toEqual([['git', ['diff', '--name-only'], { encoding: 'utf8' }]]);
  });
});

describe('newFiles', () => {
  it('joins the branch diff from base and the staged additions, without duplicates', () => {
    const asked: string[][] = [];
    const git = (args: string[]) => {
      asked.push(args);
      return args.includes('--cached') ? ['b.ts', 'c.ts'] : ['a.ts', 'b.ts'];
    };
    expect(newFiles('origin/main', git)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(asked[0]).toContain('origin/main...HEAD');
    expect(asked[1]).toContain('--cached');
  });
});

describe('baseFrom', () => {
  it.each([
    [['node', 'x.mjs'], 'origin/main'],
    [['node', 'x.mjs', '--base', 'HEAD~2'], 'HEAD~2'],
    [['node', 'x.mjs', '--base'], 'origin/main'],
  ])('reads %j as %s', (argv, base) => {
    expect(baseFrom(argv)).toBe(base);
  });
});

describe('run', () => {
  const capture = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, log: (l: string) => out.push(l), error: (l: string) => err.push(l) };
  };

  it('passes when no new file is a variant test file', () => {
    const c = capture();
    const code = run(['node', 'x.mjs'], { ...c, git: () => ['a/x.test.ts', 'docs/y.md'] });
    expect(code).toBe(0);
    expect(c.out).toEqual(['test-variant-names: no new variant test files']);
    expect(c.err).toEqual([]);
  });

  it('fails and names each new variant test file', () => {
    const c = capture();
    const git = (args: string[]) => (args.includes('--cached') ? [] : ['a/y.b2.test.ts']);
    expect(run(['node', 'x.mjs', '--base', 'main'], { ...c, git })).toBe(1);
    expect(c.err).toContain('  a/y.b2.test.ts');
    expect(c.err[0]).toMatch(/not accepted/);
  });
});

describe('variantTestFiles', () => {
  it.each([
    'apps/web/src/a/__tests__/form.supplementary.test.tsx',
    'apps/api/src/m/__tests__/lead.router.supplementary2.test.ts',
    'apps/api/src/m/__tests__/lead.router.additional.test.ts',
    'apps/api/src/m/__tests__/lead.router.b11.test.ts',
    'apps/api/src/m/__tests__/lead.service.batch10.test.ts',
    'apps/api/src/m/__tests__/x.batch10r.test.ts',
    'apps/api/src/m/__tests__/home.router.coverage.test.ts',
    'apps\\web\\src\\x\\__tests__\\y.additional.spec.tsx',
  ])('refuses %s', (file) => {
    expect(variantTestFiles([file])).toEqual([file]);
  });

  it.each([
    'apps/api/src/m/__tests__/lead.router.test.ts',
    'tools/scripts/__tests__/check-diff-coverage.test.ts',
    'apps/web/src/lib/coverage.test.ts',
    'apps/api/src/m/batch-import.test.ts',
    'apps/api/src/m/additional-fields.test.ts',
    'apps/api/src/m/lead.router.supplementary.ts',
    'docs/notes.supplementary.md',
  ])('accepts %s', (file) => {
    expect(variantTestFiles([file])).toEqual([]);
  });

  it('keeps only the offending paths, in order', () => {
    expect(
      variantTestFiles(['a/x.test.ts', 'a/y.b2.test.ts', 'b/z.test.ts', 'b/w.additional.test.ts'])
    ).toEqual(['a/y.b2.test.ts', 'b/w.additional.test.ts']);
  });

  it('is case-insensitive about the suffix', () => {
    expect(VARIANT_TEST_FILE.test('Form.Supplementary.test.tsx')).toBe(true);
  });
});

describe('defaults', () => {
  it('reads the real git: an empty diff against HEAD itself', () => {
    expect(gitLines(['rev-parse', '--is-inside-work-tree'])).toEqual(['true']);
    expect(newFiles('HEAD').every((f: string) => typeof f === 'string')).toBe(true);
  });

  it('prints to the console when no writers are given', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(run(['node', 'x.mjs'], { git: () => [] })).toBe(0);
      expect(run(['node', 'x.mjs'], { git: () => ['a.b3.test.ts'] })).toBe(1);
      expect(log).toHaveBeenCalledWith('test-variant-names: no new variant test files');
      expect(error).toHaveBeenCalledWith('  a.b3.test.ts');
      // With no options it asks the real git: comparing HEAD with itself adds nothing.
      expect(run(['node', 'x.mjs', '--base', 'HEAD'])).toBe(0);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});
