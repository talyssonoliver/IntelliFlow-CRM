/**
 * test-quality-report (#1216 item 5): how ESLint results become the per-rule counts.
 */
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { summarise } from '../test-quality-report.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const result = (file: string, ruleIds: Array<string | null>) => ({
  filePath: path.join(ROOT, file),
  messages: ruleIds.map((ruleId) => ({ ruleId })),
});

describe('summarise', () => {
  it('counts test-quality warnings per rule and ignores other rules', () => {
    const summary = summarise([
      result('a/x.test.ts', [
        'test-quality/expect-expect',
        'test-quality/expect-expect',
        'no-console',
      ]),
      result('a/y.test.ts', ['test-quality/no-literal-expect', null]),
      result('a/z.test.ts', []),
    ]);

    expect(summary.filesChecked).toBe(3);
    expect(summary.filesWithWarnings).toBe(2);
    expect(summary.warnings).toBe(3);
    expect(summary.perRule['expect-expect']).toBe(2);
    expect(summary.perRule['no-literal-expect']).toBe(1);
    expect(summary.perRule['no-lone-to-be-defined']).toBe(0);
  });

  it('lists the noisiest files first, with repo-relative forward-slash paths, up to top', () => {
    const summary = summarise(
      [
        result('b/one.test.ts', ['test-quality/no-identical-title']),
        result('a/three.test.ts', Array(3).fill('test-quality/no-conditional-expect')),
        result('c/two.test.ts', Array(2).fill('test-quality/expect-expect')),
      ],
      2
    );

    expect(summary.topFiles).toEqual([
      { file: 'a/three.test.ts', warnings: 3 },
      { file: 'c/two.test.ts', warnings: 2 },
    ]);
  });

  it('breaks ties by file name', () => {
    const summary = summarise([
      result('b/x.test.ts', ['test-quality/expect-expect']),
      result('a/x.test.ts', ['test-quality/expect-expect']),
    ]);

    expect(summary.topFiles.map((f: { file: string }) => f.file)).toEqual([
      'a/x.test.ts',
      'b/x.test.ts',
    ]);
  });
});
