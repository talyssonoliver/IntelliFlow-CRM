import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  moveTaskContextPackFiles,
  readOldContextAck,
  removeDeprecatedDir,
} from '../migrate-attestations';

// The per-item helpers were extracted from migrateAttestations(),
// moveContextPacks() and cleanupOldDirectories() to meet the sonar
// complexity rule (inherited from #1018, fixed in the ENV-008-AI merge).
// These tests pin their behaviour against throwaway directories; the CLI
// itself only runs when the file is executed directly.

let sandbox: string;
let lines: string[];

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'migrate-attestations-'));
  lines = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(sandbox, { recursive: true, force: true });
});

describe('removeDeprecatedDir', () => {
  it('removes an existing directory and says so', () => {
    const dir = join(sandbox, 'context');
    mkdirSync(join(dir, 'TASK-1'), { recursive: true });
    removeDeprecatedDir(dir, 'context', 'artifacts/context/');
    expect(existsSync(dir)).toBe(false);
    expect(lines).toEqual([`Removed: ${dir}`]);
  });

  it('reports a directory that is already gone', () => {
    removeDeprecatedDir(join(sandbox, 'missing'), 'attestations', 'artifacts/attestations/');
    expect(lines).toEqual(['artifacts/attestations/ already removed']);
  });
});

describe('moveTaskContextPackFiles', () => {
  it('copies both context pack files and counts them', () => {
    const source = join(sandbox, 'src');
    const target = join(sandbox, 'dst');
    mkdirSync(source);
    mkdirSync(target);
    writeFileSync(join(source, 'context_pack.md'), '# pack');
    writeFileSync(join(source, 'context_pack.manifest.json'), '{}');
    expect(moveTaskContextPackFiles('TASK-1', source, target)).toEqual({ moved: 2, skipped: 0 });
    expect(readFileSync(join(target, 'context_pack.md'), 'utf8')).toBe('# pack');
    expect(lines.every((l) => l.startsWith('  Moved TASK-1/'))).toBe(true);
  });

  it('skips a file already in the target and ignores a missing source file', () => {
    const source = join(sandbox, 'src');
    const target = join(sandbox, 'dst');
    mkdirSync(source);
    mkdirSync(target);
    writeFileSync(join(source, 'context_pack.md'), 'new');
    writeFileSync(join(target, 'context_pack.md'), 'old');
    expect(moveTaskContextPackFiles('TASK-2', source, target)).toEqual({ moved: 0, skipped: 1 });
    expect(readFileSync(join(target, 'context_pack.md'), 'utf8')).toBe('old');
    expect(lines).toEqual(['  Skipped TASK-2/context_pack.md: already exists in target']);
  });
});

describe('readOldContextAck', () => {
  it('returns undefined when the deprecated context folder has no ack for the task', () => {
    expect(readOldContextAck('NO-SUCH-TASK-ENV008')).toBeUndefined();
  });
});

describe('CLI entry', () => {
  it('runs main() only when executed directly, and a dry run changes nothing', () => {
    const script = join(__dirname, '..', 'migrate-attestations.ts');
    const res = spawnSync(process.execPath, ['--import', 'tsx', script, '--dry-run'], {
      encoding: 'utf8',
      cwd: join(__dirname, '..', '..', '..'),
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Mode: DRY RUN (no changes will be made)');
    expect(res.stdout).toContain('Migration complete!');
  });

  it('does not run main() on import', () => {
    expect(lines.some((l) => String(l).includes('Attestation Migration Script'))).toBe(false);
  });
});
