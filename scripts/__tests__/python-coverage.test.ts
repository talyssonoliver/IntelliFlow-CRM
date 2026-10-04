/**
 * scripts/lib/python-coverage.mjs — runs the Python tooling suites under
 * coverage.py and writes the Cobertura report Sonar and the diff gate read (#755).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  COVERAGE_DATA,
  PYTHON_REPORT,
  PYTHON_SUITES,
  REQUIRED_MODULES,
  buildSteps,
  pickPython,
  rebaseCobertura,
  runPythonCoverage,
} from '../lib/python-coverage.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('buildSteps', () => {
  const steps = buildSteps({ python: 'py', env: { PATH: 'p' }, pathSep: ';' });

  it('runs every suite, then writes the Cobertura report', () => {
    expect(steps.map((s) => s.label)).toEqual([
      ...PYTHON_SUITES.map((s) => `pytest ${s.name}`),
      'coverage xml',
    ]);
    expect(steps.at(-1)!.args).toEqual(['-m', 'coverage', 'xml', '-o', PYTHON_REPORT]);
  });

  it('appends every suite after the first to one data file', () => {
    expect(steps[0].args).not.toContain('--cov-append');
    expect(steps[1].args).toContain('--cov-append');
    for (const s of steps) expect(s.env.COVERAGE_FILE).toBe(COVERAGE_DATA);
  });

  it('puts tools/plan on PYTHONPATH for its suite only, keeping an existing one', () => {
    expect(steps[0].env.PYTHONPATH).toBeUndefined();
    expect(steps[1].env.PYTHONPATH).toBe('tools/plan');
    const withPath = buildSteps({ python: 'py', env: { PYTHONPATH: 'x' }, pathSep: ':' });
    expect(withPath[1].env.PYTHONPATH).toBe('tools/plan:x');
  });

  it('keeps the suites in step with the root .coveragerc sources', () => {
    const rc = fs.readFileSync(path.join(REPO_ROOT, '.coveragerc'), 'utf8');
    for (const s of PYTHON_SUITES) expect(fs.existsSync(path.join(REPO_ROOT, s.tests))).toBe(true);
    expect(rc).toMatch(/tools\/audit/);
    expect(rc).toMatch(/tools\/plan\/src/);
  });
});

/** A fake process runner: interpreters present and the modules each lacks. */
function fakeRun(present: Record<string, string[]>, failArgs?: string) {
  const calls: { cmd: string; args: string[] }[] = [];
  const run = (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    if (!(cmd in present)) return { status: 1 };
    if (args[0] === '-c') {
      const mod = args[1].replace('import ', '');
      return { status: present[cmd].includes(mod) ? 1 : 0 };
    }
    if (failArgs && args.includes(failArgs)) return { status: 2 };
    return { status: 0 };
  };
  return { run, calls };
}

describe('pickPython', () => {
  it('skips an interpreter that exists but lacks the modules', () => {
    const { run } = fakeRun({ python3: ['pytest_cov'], python: [] });
    expect(pickPython({ run, env: {} })).toEqual({ cmd: 'python' });
  });

  it('honours PYTHON', () => {
    const { run, calls } = fakeRun({ '/opt/py': [] });
    expect(pickPython({ run, env: { PYTHON: '/opt/py' } })).toEqual({ cmd: '/opt/py' });
    expect(calls.every((c) => c.cmd === '/opt/py')).toBe(true);
  });

  it('names what each interpreter is missing', () => {
    const { run } = fakeRun({ python3: ['click'], python: ['yaml', 'click'] });
    expect(pickPython({ run, env: {} }).error).toMatch(
      /python3 \(missing click\); python \(missing yaml, click\)/
    );
  });

  it('reports when no interpreter exists at all', () => {
    const { run } = fakeRun({});
    expect(pickPython({ run, env: {} }).error).toMatch(/no python3\/python on PATH/);
  });

  it('checks every module the suites import', () => {
    expect(REQUIRED_MODULES).toEqual(['pytest', 'pytest_cov', 'coverage', 'yaml', 'click']);
  });
});

describe('rebaseCobertura', () => {
  const xml = [
    '<coverage>',
    '\t<sources>',
    '\t\t<source>tools/audit</source>',
    '\t\t<source>tools/plan/src\\</source>',
    '\t</sources>',
    '<class filename="affected.py"/>',
    '<class filename="domain\\task.py"/>',
    '</coverage>',
  ].join('\n');
  const files = new Set(['tools/audit/affected.py', 'tools/plan/src/domain/task.py']);

  it('rewrites each filename under the one source that holds it and collapses <sources>', () => {
    const r = rebaseCobertura(xml, (p: string) => files.has(p));
    expect(r.unresolved).toEqual([]);
    expect(r.xml).toContain('filename="tools/audit/affected.py"');
    expect(r.xml).toContain('filename="tools/plan/src/domain/task.py"');
    expect(r.xml).toContain('<source>.</source>');
    expect(r.xml).not.toContain('<source>tools/audit</source>');
  });

  it('reports a filename no source holds', () => {
    const r = rebaseCobertura(xml, (p: string) => p === 'tools/audit/affected.py');
    expect(r.unresolved).toEqual(['domain/task.py']);
  });

  it('refuses to guess when two sources hold the same relative path', () => {
    const r = rebaseCobertura(
      '<sources><source>a</source><source>b</source></sources><class filename="x.py"/>',
      () => true
    );
    expect(r.unresolved).toEqual(['x.py (ambiguous: a/x.py, b/x.py)']);
  });

  it('leaves an already repo-relative report (source ".") as it is', () => {
    const r = rebaseCobertura(
      '<sources><source>.</source></sources><class filename="tools/a.py"/>',
      (p: string) => p === 'tools/a.py'
    );
    expect(r.unresolved).toEqual([]);
    expect(r.xml).toContain('filename="tools/a.py"');
  });
});

function runWith({
  present = { python: [] } as Record<string, string[]>,
  failArgs = undefined as string | undefined,
  report = '<sources><source>tools/audit</source></sources><class filename="a.py"/>',
  existing = new Set(['tools/audit/a.py']),
} = {}) {
  const { run, calls } = fakeRun(present, failArgs);
  const out: string[] = [];
  const err: string[] = [];
  const removed: string[] = [];
  const written: Record<string, string> = {};
  const code = runPythonCoverage({
    run,
    env: {},
    pathSep: ':',
    removeFile: (p: string) => removed.push(p),
    readFile: () => report,
    writeFile: (p: string, t: string) => {
      written[p] = t;
    },
    exists: (p: string) => existing.has(p),
    log: (m: string) => out.push(m),
    error: (m: string) => err.push(m),
  });
  return { code, calls, removed, written, out: out.join('\n'), err: err.join('\n') };
}

describe('runPythonCoverage', () => {
  it('clears stale data, runs every step and writes a repo-relative report', () => {
    const r = runWith();
    expect(r.code).toBe(0);
    expect(r.removed).toEqual([COVERAGE_DATA]);
    expect(r.calls.filter((c) => c.args[0] === '-m').map((c) => c.args[2])).toEqual([
      ...PYTHON_SUITES.map((s) => s.tests),
      'xml',
    ]);
    expect(r.written[PYTHON_REPORT]).toContain('filename="tools/audit/a.py"');
    expect(r.out).toMatch(/✅ Python coverage written/);
  });

  it('fails without running anything when no interpreter has the modules', () => {
    const r = runWith({ present: { python: ['pytest'] } });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/missing pytest/);
    expect(r.removed).toEqual([]);
  });

  it('stops at the first failing suite', () => {
    const r = runWith({ failArgs: 'tools/plan/tests' });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/pytest tools\/plan failed \(exit 2\)/);
    expect(r.written).toEqual({});
  });

  it('fails when the report names a file it cannot place', () => {
    const r = runWith({ existing: new Set() });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/cannot place 1 report path/);
    expect(r.written).toEqual({});
  });
});
