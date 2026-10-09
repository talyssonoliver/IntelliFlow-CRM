import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THRESHOLDS, getCoverageForPath, main, validateCoverage } from '../validate-coverage';

const file = (total: number, covered: number) => ({ lines: { total, covered, pct: 0 } });

let root: string;
let log: ReturnType<typeof vi.spyOn>;
let err: ReturnType<typeof vi.spyOn>;

const writeSummary = (summary: Record<string, unknown>) => {
  fs.mkdirSync(path.join(root, 'artifacts', 'coverage'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'artifacts', 'coverage', 'coverage-summary.json'),
    JSON.stringify(summary)
  );
};

const summaryWith = (overall: number, extra: Record<string, unknown> = {}) => ({
  total: { lines: { total: 100, covered: overall, pct: overall } },
  ...extra,
});

const printed = () => log.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate2-'));
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('getCoverageForPath', () => {
  const summary = {
    total: file(1000, 1000),
    'packages/domain/a.ts': file(10, 10),
    'packages/domain/b.ts': file(10, 5),
    'packages/application/c.ts': file(0, 0),
  } as never;

  it('sums the lines of every matching file and ignores the total entry', () => {
    expect(getCoverageForPath(summary, 'packages/domain')).toBe(75);
  });

  it('is null when nothing matches or the matches have no lines', () => {
    expect(getCoverageForPath(summary, 'packages/nothing')).toBeNull();
    expect(getCoverageForPath(summary, 'packages/application')).toBeNull();
  });
});

describe('validateCoverage', () => {
  it('fails with exit code 1 when the report is missing', () => {
    const result = validateCoverage('T2', root);
    expect(result).toMatchObject({
      passed: false,
      exitCode: 1,
      actual: { overall: 0, domain: null, application: null },
      gaps: { overall: THRESHOLDS.T2.overall, domain: null, application: null },
    });
    expect(printed()).toContain('Coverage report not found');
  });

  it('passes when every layer meets its target', () => {
    writeSummary(
      summaryWith(92, {
        'packages/domain/a.ts': file(10, 10),
        'packages/application/b.ts': file(10, 10),
      })
    );
    const result = validateCoverage('T2', root);
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.gaps).toEqual({ overall: 0, domain: 0, application: 0 });
    expect(printed()).toContain('T2 coverage threshold met');
  });

  it('uses the stricter overall target for T3', () => {
    writeSummary(summaryWith(85));
    expect(validateCoverage('T2', root).passed).toBe(true);
    const t3 = validateCoverage('T3', root);
    expect(t3.passed).toBe(false);
    expect(t3.gaps.overall).toBe(5);
    expect(printed()).toContain('Gap: Need +5.00% overall coverage');
  });

  it('prints No data for layers absent from the report and does not fail on them', () => {
    writeSummary(summaryWith(95));
    const result = validateCoverage('T2', root);
    expect(result.passed).toBe(true);
    expect(result.actual).toMatchObject({ domain: null, application: null });
    expect(printed().match(/No data/g)).toHaveLength(2);
  });

  it('fails when a present layer is below its target even if overall is fine', () => {
    writeSummary(
      summaryWith(99, {
        'packages/domain/a.ts': file(10, 9),
        'packages/application/b.ts': file(10, 10),
      })
    );
    const result = validateCoverage('T2', root);
    expect(result.passed).toBe(false);
    expect(result.gaps.domain).toBeCloseTo(5);
    expect(result.gaps.application).toBe(0);
    expect(printed()).toContain('✗ NOT MET');
    expect(printed()).not.toContain('Gap: Need');
  });
});

describe('main', () => {
  const saved = () =>
    JSON.parse(
      fs.readFileSync(
        path.join(root, 'artifacts', 'gate-2', 'coverage-validation-T2.json'),
        'utf-8'
      )
    );

  it('defaults to T2, writes the result file and returns 0 on pass', () => {
    writeSummary(summaryWith(90));
    expect(main([], root)).toBe(0);
    expect(saved()).toMatchObject({ tranche: 'T2', passed: true });
    expect(printed()).toContain('Result saved to: artifacts/gate-2/coverage-validation-T2.json');
  });

  it('returns 1 when the tranche fails and still writes the file', () => {
    writeSummary(summaryWith(10));
    expect(main(['T2'], root)).toBe(1);
    expect(saved().passed).toBe(false);
  });

  it('accepts T3', () => {
    writeSummary(summaryWith(95));
    expect(main(['T3'], root)).toBe(0);
    expect(
      fs.existsSync(path.join(root, 'artifacts', 'gate-2', 'coverage-validation-T3.json'))
    ).toBe(true);
  });

  it.each(['T4', '../../x', 't2', 'T2/../..'])(
    'refuses the tranche %s without writing anything',
    (bad) => {
      expect(main([bad], root)).toBe(1);
      expect(err).toHaveBeenCalledWith('Usage: npx tsx validate-coverage.ts [T2|T3]');
      expect(fs.existsSync(path.join(root, 'artifacts', 'gate-2'))).toBe(false);
    }
  );

  it('defaults to process.argv and cwd', () => {
    const original = process.argv;
    process.argv = ['node', 'x', 'T9'];
    try {
      expect(main()).toBe(1);
    } finally {
      process.argv = original;
    }
  });
});
