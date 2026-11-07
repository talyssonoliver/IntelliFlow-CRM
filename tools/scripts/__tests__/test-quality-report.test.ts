/**
 * test-quality-report (#1216 item 5): how ESLint results become the per-rule counts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { createLinter, summarise, topFrom, writeReport } from '../test-quality-report.mjs';

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

describe('topFrom', () => {
  it.each([
    [['node', 'r.mjs'], 20],
    [['node', 'r.mjs', '--top', '5'], 5],
    [['node', 'r.mjs', '--top', 'x'], 20],
    [['node', 'r.mjs', '--top', '0'], 20],
    [['node', 'r.mjs', '--top'], 20],
  ])('reads %j as %d', (argv, top) => {
    expect(topFrom(argv)).toBe(top);
  });
});

describe('writeReport', () => {
  it('writes the summary JSON with its time and returns the printed lines', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-report-'));
    const out = path.join(dir, 'nested', 'test-quality.json');
    try {
      const lines = writeReport([result('a/x.test.ts', ['test-quality/expect-expect'])], {
        out,
        top: 1,
        now: new Date('2026-11-07T12:00:00Z'),
      });
      const written = JSON.parse(fs.readFileSync(out, 'utf8'));
      expect(written.generatedAt).toBe('2026-11-07T12:00:00.000Z');
      expect(written.warnings).toBe(1);
      expect(written.topFiles).toEqual([{ file: 'a/x.test.ts', warnings: 1 }]);
      expect(lines[0]).toMatch(/^test-quality: 1 warnings in 1\/1 test files \(expect-expect 1,/);
      expect(lines[1]).toMatch(/^ {2}details: .*nested\/test-quality\.json$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createLinter', () => {
  it('reports the test-quality rules as warnings on TypeScript test code', async () => {
    const [res] = await createLinter().lintText(
      "import { add } from './add';\nit('adds', () => { add(1, 2); });\n",
      { filePath: path.join(ROOT, 'tools/scripts/__tests__/fixture.test.ts') }
    );
    expect(res.messages.map((m: { ruleId: string | null }) => m.ruleId)).toEqual([
      'test-quality/expect-expect',
    ]);
    expect(res.messages[0].severity).toBe(1);
  });
});

describe('writeReport defaults', () => {
  it('uses the top 20 and the current time when only the path is given', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-report-'));
    const out = path.join(dir, 'test-quality.json');
    try {
      const before = Date.now();
      writeReport(
        Array.from({ length: 25 }, (_, i) =>
          result(`f/${String(i).padStart(2, '0')}.test.ts`, ['test-quality/expect-expect'])
        ),
        { out }
      );
      const written = JSON.parse(fs.readFileSync(out, 'utf8'));
      expect(written.topFiles).toHaveLength(20);
      expect(Date.parse(written.generatedAt)).toBeGreaterThanOrEqual(before - 1000);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
