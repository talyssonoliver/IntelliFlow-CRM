/**
 * Ceremony Tier manual-override config loader tests — issue #579.
 *
 * @module tools/scripts/lib/ceremony-tier-config.test
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadTierOverrides, TASK_TIERS_CONFIG_PATH } from './ceremony-tier-config';

const tempDirs: string[] = [];

function makeRepoRoot(yamlContent: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'ceremony-tier-config-test-'));
  tempDirs.push(dir);
  if (yamlContent !== null) {
    mkdirSync(join(dir, '.specify', 'memory'), { recursive: true });
    writeFileSync(join(dir, TASK_TIERS_CONFIG_PATH), yamlContent, 'utf8');
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('loadTierOverrides', () => {
  it('returns an empty map when the config file does not exist', () => {
    const repoRoot = makeRepoRoot(null);
    expect(loadTierOverrides(repoRoot).size).toBe(0);
  });

  it('returns an empty map when the file has no overrides key', () => {
    const repoRoot = makeRepoRoot('# nothing here\n');
    expect(loadTierOverrides(repoRoot).size).toBe(0);
  });

  it('parses light/full/auto overrides, normalizing task id case and whitespace', () => {
    const repoRoot = makeRepoRoot(
      ['overrides:', '  pg-999: light', '  "PG-1000": FULL', '  IFC-500: auto'].join('\n')
    );

    const overrides = loadTierOverrides(repoRoot);

    expect(overrides.get('PG-999')).toBe('light');
    expect(overrides.get('PG-1000')).toBe('full');
    expect(overrides.get('IFC-500')).toBe('auto');
    expect(overrides.size).toBe(3);
  });

  it('drops entries with an unrecognized override value instead of throwing', () => {
    const repoRoot = makeRepoRoot(['overrides:', '  PG-999: maybe', '  PG-1000: light'].join('\n'));

    const overrides = loadTierOverrides(repoRoot);

    expect(overrides.has('PG-999')).toBe(false);
    expect(overrides.get('PG-1000')).toBe('light');
  });

  it('ignores a malformed (non-mapping) overrides key rather than throwing', () => {
    const repoRoot = makeRepoRoot('overrides: "not a map"\n');
    expect(() => loadTierOverrides(repoRoot)).not.toThrow();
  });
});

describe('ceremony-tier audit report', () => {
  it('is git-ignored so its generated_at timestamp never churns the tree', () => {
    const repoRoot = join(__dirname, '..', '..', '..');
    const res = spawnSync(
      'git',
      ['check-ignore', '-q', 'artifacts/reports/ceremony-tier-audit.json'],
      {
        cwd: repoRoot,
      }
    );
    expect(res.status).toBe(0);
  });
});
