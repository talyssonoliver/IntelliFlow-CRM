import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// flip-task-status.mjs is a top-level script (no exports): importing it runs it
// against process.cwd() and process.argv, so each test points both at a temp dir.
const SCRIPT = '../flip-task-status.mjs';
const CSV_DIR = ['apps', 'project-tracker', 'docs', 'metrics', '_global'];

class ExitSignal extends Error {
  constructor(public code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

describe('flip-task-status.mjs', () => {
  const origCwd = process.cwd();
  const origArgv = process.argv;
  let dir: string;
  let stderr: string[];
  let stdout: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flip-task-'));
    stderr = [];
    stdout = [];
    process.chdir(dir);
    vi.resetModules();
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitSignal(code);
    }) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(((s: string) => {
      stderr.push(String(s));
      return true;
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => {
      stdout.push(String(s));
      return true;
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.argv = origArgv;
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('exits 1 with a "not found" message when Sprint_plan.csv does not exist', async () => {
    process.argv = ['node', 'flip-task-status.mjs', 'T-1=Done'];
    await expect(import(SCRIPT)).rejects.toMatchObject({ code: 1 });
    expect(stderr.join('')).toContain('Sprint_plan.csv not found');
    // The read attempt itself reports why (no separate existsSync pre-check).
    expect(stderr.join('')).toContain('ENOENT');
  });

  it('flips the status of an existing row and verifies the write', async () => {
    const csvDir = join(dir, ...CSV_DIR);
    mkdirSync(csvDir, { recursive: true });
    const csv = join(csvDir, 'Sprint_plan.csv');
    writeFileSync(
      csv,
      'Task ID,Description,Status,Owner\nT-1,A unique description for task one that is long enough,Planned,me\n',
      'utf8'
    );
    process.argv = ['node', 'flip-task-status.mjs', 't-1=Done'];
    await import(SCRIPT);
    expect(readFileSync(csv, 'utf8')).toContain('long enough,Done,me');
    expect(stdout.join('')).toContain('flip-task-status: OK (verified)');
  });
});
