/**
 * The waiver anchor rules of the semantic review gate (#980).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activeWaivers,
  checkWaivers,
  classifyWaivers,
  isSubstantialLine,
  lineHash,
  normalizeFilePath,
  normalizeLine,
  parseLineSpec,
  parseWaivers,
  readTrackedFiles,
  sourceFingerprint,
  waivedFindingLines,
} from '../lib/codex-fingerprint.mjs';

const FILE = 'src/Example.ts';
const hashOf = (line: string) => lineHash(normalizeFilePath(FILE), normalizeLine(line));

const source = (...lines: string[]) => lines.join('\n');

describe('isSubstantialLine', () => {
  it.each(['}', '*/', '/**', '});', ']);', '}))', 'id,', 'try {', '*'])('rejects %s', (line) => {
    expect(isSubstantialLine(line)).toBe(false);
  });

  it.each(['return;', 'data: {', 'const total = 1;'])('accepts %s', (line) => {
    expect(isSubstantialLine(line)).toBe(true);
  });
});

describe('parseLineSpec', () => {
  it.each([
    [7, { start: 7, end: 7 }],
    ['7', { start: 7, end: 7 }],
    ['7-9', { start: 7, end: 9 }],
    ['7 – 9', { start: 7, end: 9 }],
  ])('reads %s', (spec, expected) => {
    expect(parseLineSpec(spec)).toEqual(expected);
  });

  it.each(['', 'abc', 0, -3])('has no line for %s', (spec) => {
    expect(parseLineSpec(spec)).toBeNull();
  });
});

describe('sourceFingerprint', () => {
  it('never anchors on a trivial line, even when its hash is the smallest', () => {
    const closers = ['}', '*/', '});', ']);', '/**', ')', '];', '},', '{'];
    const trivial = closers.reduce((a, b) => (hashOf(a) < hashOf(b) ? a : b));
    const code = 'const flagged = compute();';
    const text = source(trivial, code, trivial);

    expect(sourceFingerprint(FILE, 2, text)).toBe(hashOf(code));
  });

  it('never anchors on a line repeated elsewhere in the file', () => {
    const repeated = 'throw new TRPCError({';
    const unique = 'const flagged = compute();';
    const text = source(repeated, unique, 'gap1', 'gap2', 'gap3', 'gap4', repeated);

    expect(sourceFingerprint(FILE, 2, text)).not.toBe(hashOf(repeated));
  });

  it('gives findings beside two different closing braces different fingerprints', () => {
    const text = source(
      'function first() {',
      '  return one();',
      '}',
      '',
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      'const d = 4;',
      'const e = 5;',
      '',
      'function second() {',
      '  return two();',
      '}'
    );

    expect(sourceFingerprint(FILE, 2, text)).not.toBe(sourceFingerprint(FILE, 12, text));
  });

  it('keeps the fingerprint when the reported line drifts around an anchor', () => {
    const lines = ['alpha();', 'bravo();', 'charlie();', 'delta();', 'echo();', 'foxtrot();'];
    const smallest = lines.reduce((a, b) => (hashOf(a) < hashOf(b) ? a : b));
    const text = source(...lines);
    const at = lines.indexOf(smallest) + 1;

    expect(sourceFingerprint(FILE, at, text)).toBe(hashOf(smallest));
    expect(sourceFingerprint(FILE, Math.min(at + 1, lines.length), text)).toBe(hashOf(smallest));
  });

  it('still produces the old hash for a unique anchor, so existing waivers keep matching', () => {
    const code = 'const flagged = compute();';
    const expected = lineHash('src/example.ts', code);

    expect(sourceFingerprint('src\\Example.ts', 1, code)).toBe(expected);
  });

  it('changes when the anchored code changes', () => {
    const before = source('{', 'const flagged = compute();', '}');
    const after = source('{', 'const flagged = computeSafely();', '}');

    expect(sourceFingerprint(FILE, 2, before)).not.toBe(sourceFingerprint(FILE, 2, after));
  });

  describe('with no eligible line in the window', () => {
    const text = source('}', '});', '}', '', '', '', '', '', '}', '});', '}', ')', '}');

    it('hashes the window instead of a line, so it cannot equal any line waiver', () => {
      const fp = sourceFingerprint(FILE, 2, text);

      expect(fp).not.toBeNull();
      expect(['}', '});', ')'].map(hashOf)).not.toContain(fp);
    });

    it('re-blocks on a line shift instead of matching', () => {
      expect(sourceFingerprint(FILE, 2, text)).not.toBe(sourceFingerprint(FILE, 11, text));
    });
  });

  it('covers every line of a reported range plus the drift', () => {
    const text = source('one();', 'two();', 'three();', 'four();', 'five();', 'six();', 'seven();');
    const hashes = text.split('\n').map(hashOf).sort();

    expect(sourceFingerprint(FILE, '3-5', text)).toBe(hashes[0]);
  });

  it.each([
    ['a blank window', source('', '', '', '', ''), 3],
    ['a line past the end', source('one();'), 50],
    ['no line number', source('one();'), 'n/a'],
  ])('returns null for %s, which sends the caller to the prose fallback', (_n, text, line) => {
    expect(sourceFingerprint(FILE, line, text)).toBeNull();
  });
});

describe('parseWaivers', () => {
  const fpA = 'a'.repeat(64);
  const fpB = 'b'.repeat(64);

  it('reads folded and plain reasons, and the expiry', () => {
    const raw = [
      'waivers:',
      `  - fingerprint: '${fpA}'`,
      '    reason: >-',
      '      First line of the reason',
      '      and the second.',
      '    author: someone',
      "    date: '2026-01-01'",
      "    expires: '2026-02-03'",
      `  - fingerprint: ${fpB}`,
      '    reason: "A plain reason"',
      '    author: someone',
    ].join('\n');

    expect(parseWaivers(raw)).toEqual([
      {
        fingerprint: fpA,
        expires: '2026-02-03',
        reason: 'First line of the reason and the second.',
      },
      { fingerprint: fpB, expires: null, reason: 'A plain reason' },
    ]);
  });

  it('ignores the commented example in the file header', () => {
    expect(parseWaivers(`#   - fingerprint: "${fpA}"\nwaivers:\n`)).toEqual([]);
  });

  it('does not read a date or a fingerprint quoted inside a reason as a field', () => {
    const raw = [
      `  - fingerprint: ${fpA}`,
      '    reason: >-',
      `      Same as fingerprint: ${fpB}, expires: 2020-01-01 was discussed.`,
      '    author: someone',
    ].join('\n');

    const [waiver, ...rest] = parseWaivers(raw);

    expect(rest).toEqual([]);
    expect(waiver?.expires).toBeNull();
  });

  it('handles CRLF line endings', () => {
    const raw = `  - fingerprint: ${fpA}\r\n    expires: '2026-02-03'\r\n`;

    expect(parseWaivers(raw)[0]?.expires).toBe('2026-02-03');
  });
});

describe('classifyWaivers', () => {
  const TODAY = '2026-06-01';
  const text = source('const unique = 1;', '}', '}', 'throw new Thing({', 'throw new Thing({');
  const files = [{ path: FILE, text }];
  const status = (line: string, expires: string | null = null) =>
    classifyWaivers([{ fingerprint: hashOf(line), expires, reason: 'r' }], files, TODAY)[0]?.status;

  it('accepts a unique line with content', () => {
    expect(status('const unique = 1;')).toBe('ok');
  });

  it('flags a trivial line', () => {
    expect(status('}')).toBe('ineligible');
  });

  it('flags a repeated line, even one with content', () => {
    expect(status('throw new Thing({')).toBe('ineligible');
  });

  it('reports the anchor it found', () => {
    const [row] = classifyWaivers(
      [{ fingerprint: hashOf('}'), expires: null, reason: 'r' }],
      files,
      TODAY
    );

    expect(row?.anchor).toEqual({ file: FILE, line: '}', count: 2 });
  });

  it('calls an expired waiver expired, whatever it anchors on', () => {
    expect(status('}', '2026-05-31')).toBe('expired');
  });

  it('keeps a waiver that expires today', () => {
    expect(status('const unique = 1;', TODAY)).toBe('ok');
  });

  it('calls a waiver with no matching line unanchored', () => {
    expect(status('const gone = 1;')).toBe('unanchored');
  });

  it('does not match the same text in another file', () => {
    const other = [{ path: 'src/Other.ts', text: 'const unique = 1;' }];

    expect(
      classifyWaivers(
        [{ fingerprint: hashOf('const unique = 1;'), expires: null, reason: 'r' }],
        other,
        TODAY
      )[0]?.status
    ).toBe('unanchored');
  });
});

describe('checkWaivers', () => {
  const TODAY = '2026-06-01';
  const files = [{ path: FILE, text: source('const unique = 1;', '}', '}') }];
  const entry = (line: string, expires = '') =>
    [`  - fingerprint: ${hashOf(line)}`, '    reason: r', expires && `    expires: ${expires}`]
      .filter(Boolean)
      .join('\n');

  it('passes a waiver on a unique line', () => {
    const { ok, lines } = checkWaivers(entry('const unique = 1;'), files, TODAY);

    expect(ok).toBe(true);
    expect(lines[0]).toContain('ok 1');
  });

  it('fails on a trivial anchor and says what to do', () => {
    const { ok, lines } = checkWaivers(entry('}'), files, TODAY);

    expect(ok).toBe(false);
    expect(lines.join('\n')).toMatch(/INELIGIBLE .* remove it/);
  });

  it('does not fail on an expired or unanchored waiver, so a date cannot turn a push red', () => {
    const raw = [entry('}', '2026-05-01'), entry('const gone = 1;')].join('\n');

    const { ok, lines } = checkWaivers(raw, files, TODAY);

    expect(ok).toBe(true);
    expect(lines[0]).toContain('unanchored 1');
    expect(lines[0]).toContain('expired 1');
  });

  it('passes an empty file', () => {
    expect(checkWaivers('', files, TODAY).ok).toBe(true);
  });
});

describe('activeWaivers', () => {
  const FP = 'a'.repeat(64);
  const OTHER = 'b'.repeat(64);
  const raw = [
    `  - fingerprint: ${FP}`,
    '    reason: still true',
    '    expires: 2026-12-31',
    `  - fingerprint: ${OTHER}`,
    '    reason: went stale',
    '    expires: 2026-01-01',
  ].join('\n');

  it('keeps a live waiver with its reason, and warns about and drops an expired one', () => {
    const warnings: string[] = [];

    const active = activeWaivers(raw, '2026-06-01', (message: string) => warnings.push(message));

    expect([...active.keys()]).toEqual([FP]);
    expect(active.get(FP)?.reason).toBe('still true');
    expect(warnings.join('')).toContain(`${OTHER.slice(0, 12)}... expired 2026-01-01`);
  });

  it('is empty for an empty file', () => {
    expect(activeWaivers('', '2026-06-01', () => undefined).size).toBe(0);
  });
});

describe('waivedFindingLines', () => {
  it('puts the waiver reason beside the claim, so a mismatch can be seen', () => {
    const finding = {
      severity: 'high',
      file: FILE,
      line: 7,
      rule: 'some-rule',
      fingerprint: 'c'.repeat(64),
      issue: 'the claim',
    };

    expect(waivedFindingLines(finding, { reason: 'why it is safe' })).toEqual([
      `  [HIGH] ${FILE}:7 — some-rule (fp: ${'c'.repeat(12)}...)`,
      '    Issue  : the claim',
      '    Waiver : why it is safe',
    ]);
  });
});

describe('codex-review --check-waivers', () => {
  const argv = process.argv;

  // The script exits when done, so the stub ends the import at that point.
  const runCli = async () => {
    vi.resetModules();
    process.argv = ['node', 'codex-review.mjs', '--check-waivers'];
    const chdir = vi.spyOn(process, 'chdir').mockImplementation(() => undefined);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
    try {
      const failure = await import('../codex-review.mjs').then(
        () => null,
        (error: Error) => error
      );
      return { failure, output: stdout.mock.calls.map(([text]) => String(text)).join('') };
    } finally {
      exit.mockRestore();
      stdout.mockRestore();
      chdir.mockRestore();
      process.argv = argv;
    }
  };

  afterEach(() => {
    vi.doUnmock('../lib/codex-fingerprint.mjs');
  });

  it('checks the committed waivers without calling a reviewer, and exits 0', async () => {
    const { failure, output } = await runCli();

    expect(failure?.message).toBe('exit 0');
    expect(output).toMatch(/\[codex-review\] waivers: \d+ \(ok \d+, ineligible 0,/);
  });

  it('exits 1 when a waiver is on a bad anchor', async () => {
    vi.doMock('../lib/codex-fingerprint.mjs', async (importOriginal) => ({
      ...(await importOriginal<Record<string, unknown>>()),
      checkWaivers: () => ({ ok: false, lines: ['  INELIGIBLE example'] }),
    }));

    const { failure, output } = await runCli();

    expect(failure?.message).toBe('exit 1');
    expect(output).toContain('INELIGIBLE example');
  });
});

describe('the committed waiver file', () => {
  it('has no waiver anchored on a trivial or repeated line', () => {
    const root = path.resolve(__dirname, '../..');
    const raw = fs.readFileSync(path.join(root, 'tools/audit/codex-review-waivers.yaml'), 'utf8');
    const waivers = parseWaivers(raw);
    const files = readTrackedFiles(root);

    const today = new Date().toISOString().slice(0, 10);
    const bad = classifyWaivers(waivers, files, today).filter((r) => r.status === 'ineligible');

    expect(bad.map((r) => `${r.waiver.fingerprint.slice(0, 12)} ${r.anchor?.file}`)).toEqual([]);
  });
});
