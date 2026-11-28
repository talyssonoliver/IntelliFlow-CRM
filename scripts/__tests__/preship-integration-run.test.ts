/**
 * Issue #1600: the integration suite must FAIL LOUDLY, not skip, when it cannot load
 * (Node 25 -> "Unknown file extension .ts"), and pre-ship must fail the integration step
 * when it executed 0 tests while suites exist, or ran on the wrong Node major.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  NOT_RUN,
  countExecutedTests,
  listIntegrationTestFiles,
  majorSatisfies,
  nodeMismatch,
  pinnedNodeMajor,
  zeroExecuted,
} from '../lib/preship-integration-run.mjs';
import {
  integrationSetupFailure,
  nodeMajorOf,
  requiredNodeMajor,
} from '../../tests/integration/node-guard';

function tmpRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preship-integ-'));
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return dir;
}

const LOAD_ERROR = 'Unknown file extension ".ts" for C:\\repo\\packages\\db\\src\\index.ts';

describe('setup load failure (simulated) names the Node version and the required one', () => {
  it('says the tests did not run, never "skipped", and tells the user which Node to use', () => {
    const msg = integrationSetupFailure(
      `Failed to load database client: ${LOAD_ERROR}`,
      'v25.2.1',
      24
    );
    expect(msg).toContain(NOT_RUN);
    expect(msg).toContain('v25.2.1');
    expect(msg).toContain('requires Node 24');
    expect(msg).toContain('Switch to Node 24');
    expect(msg).toContain('Unknown file extension');
    expect(msg.toLowerCase()).not.toContain('integration tests skipped');
  });

  it('on the pinned Node it still fails, and does not tell the user to switch', () => {
    const msg = integrationSetupFailure('database setup failed: ECONNREFUSED', 'v24.1.0', 24);
    expect(msg).toContain(NOT_RUN);
    expect(msg).toContain('matches the pinned Node 24');
    expect(msg).not.toContain('Switch to Node');
  });

  it('copes with an unreadable .nvmrc', () => {
    const msg = integrationSetupFailure('x', 'v25.0.0', null);
    expect(msg).toContain('v25.0.0');
    expect(msg).toContain('could not be read');
  });

  it('reads the pinned major from .nvmrc and the major from a version string', () => {
    const repo = tmpRepo({ '.nvmrc': '24\n' });
    expect(requiredNodeMajor(repo)).toBe(24);
    expect(requiredNodeMajor(path.join(repo, 'nope'))).toBeNull();
    expect(nodeMajorOf('v25.2.1')).toBe(25);
  });
});

describe('pinnedNodeMajor / nodeMismatch (pre-ship preflight)', () => {
  it('prefers .nvmrc and treats it as exact', () => {
    const repo = tmpRepo({
      '.nvmrc': 'v24\n',
      'package.json': JSON.stringify({ engines: { node: '>=20.0.0' } }),
    });
    const pin = pinnedNodeMajor(repo);
    expect(pin).toMatchObject({ label: '24', source: '.nvmrc' });
    expect(nodeMismatch('v24.3.0', pin)).toBeNull();
    const msg = nodeMismatch('v25.2.1', pin);
    expect(msg).toContain(NOT_RUN);
    expect(msg).toContain('Node v25.2.1');
    expect(msg).toContain('requires Node 24');
  });

  it('falls back to the engines range: "24.x" refuses Node 25 (the repo pin)', () => {
    const repo = tmpRepo({ 'package.json': JSON.stringify({ engines: { node: '24.x' } }) });
    const pin = pinnedNodeMajor(repo);
    expect(pin).toMatchObject({ label: '24.x', source: 'package.json engines.node' });
    expect(nodeMismatch('v24.21.0', pin)).toBeNull();
    const msg = nodeMismatch('v25.2.1', pin);
    expect(msg).toContain(NOT_RUN);
    expect(msg).toContain('requires Node 24.x');
  });

  it('a lower-bound engines range only refuses a Node below it', () => {
    const repo = tmpRepo({ 'package.json': JSON.stringify({ engines: { node: '>=20.0.0' } }) });
    const pin = pinnedNodeMajor(repo);
    expect(nodeMismatch('v25.2.1', pin)).toBeNull();
    expect(nodeMismatch('v18.19.0', pin)).toContain(NOT_RUN);
  });

  it('does not enforce an engines range it cannot read', () => {
    const repo = tmpRepo({ 'package.json': JSON.stringify({ engines: { node: 'lts/*' } }) });
    expect(pinnedNodeMajor(repo)).toBeNull();
  });

  it('has nothing to enforce when no pin can be read', () => {
    expect(pinnedNodeMajor(tmpRepo({}))).toBeNull();
    expect(nodeMismatch('v25.2.1', null)).toBeNull();
  });
});

describe('majorSatisfies', () => {
  it.each([
    ['24.x', 24, true],
    ['24.x', 25, false],
    ['^22 || ^24', 24, true],
    ['^22 || ^24', 23, false],
    ['>=20 <25', 24, true],
    ['>=20 <25', 25, false],
    ['>20', 20, false],
    ['<=22', 22, true],
    ['v24.1.0', 24, true],
  ])('%s vs Node %i -> %s', (range, major, expected) => {
    expect(majorSatisfies(range, major)).toBe(expected);
  });

  it('returns null for a range it cannot read', () => {
    expect(majorSatisfies('lts/*', 24)).toBeNull();
    expect(majorSatisfies('18 - 20', 19)).toBeNull();
    expect(majorSatisfies('', 24)).toBeNull();
  });
});

describe('countExecutedTests / zeroExecuted (the 0-executed case)', () => {
  const ran = ' Test Files  2 passed (2)\n      Tests  7 passed | 2 skipped (9)\n';
  const allSkipped = ' Test Files  3 skipped (3)\n      Tests  12 skipped (12)\n';
  const failedRun = ' Test Files  1 failed (1)\n      Tests  1 failed | 4 passed (5)\n';

  it('counts passed + failed as executed and ignores skipped and todo', () => {
    expect(countExecutedTests(ran)).toBe(7);
    expect(countExecutedTests(failedRun)).toBe(5);
    expect(countExecutedTests(allSkipped)).toBe(0);
    expect(countExecutedTests('      Tests  3 todo (3)\n')).toBe(0);
  });

  it('strips ANSI colour codes from the reporter', () => {
    const coloured =
      '\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[32m4 passed\u001b[39m\u001b[22m (4)\n';
    expect(countExecutedTests(coloured)).toBe(4);
  });

  it('counts a log with no summary line (setup crashed, vitest never reported) as 0', () => {
    expect(countExecutedTests('Error: Unknown file extension ".ts"\n')).toBe(0);
    expect(countExecutedTests('')).toBe(0);
    expect(countExecutedTests(undefined)).toBe(0);
  });

  it('fails a run that executed 0 tests while integration files exist', () => {
    const msg = zeroExecuted({ logText: allSkipped, fileCount: 12 });
    expect(msg).toContain(NOT_RUN);
    expect(msg).toContain('executed 0 tests');
    expect(msg).toContain('12 integration test file(s)');
  });

  it('passes a run that executed tests, and a repo with no integration files', () => {
    expect(zeroExecuted({ logText: ran, fileCount: 12 })).toBeNull();
    expect(zeroExecuted({ logText: allSkipped, fileCount: 0 })).toBeNull();
  });
});

describe('listIntegrationTestFiles', () => {
  it('finds nested .test.ts/.test.tsx under tests/integration and ignores other files', () => {
    const repo = tmpRepo({
      'tests/integration/a.test.ts': '',
      'tests/integration/sub/b.test.tsx': '',
      'tests/integration/setup.ts': '',
      'tests/integration/node_modules/x.test.ts': '',
      'tests/unit/c.test.ts': '',
    });
    expect(listIntegrationTestFiles(repo)).toHaveLength(2);
    expect(listIntegrationTestFiles(tmpRepo({}))).toEqual([]);
  });
});

describe('pre-ship wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'pre-ship.mjs'), 'utf8');
  const step = src.slice(src.indexOf("id: 'integration-tests'"), src.indexOf("id: 'coverage'"));

  it('attaches both guards to the integration-tests step', () => {
    expect(step).toContain('preflight:');
    expect(step).toContain('verify:');
    expect(step).toContain('nodeMismatch(process.version');
    expect(step).toContain('zeroExecuted(');
  });

  it('turns a refusal or a failed verification into a FAIL, not a skip', () => {
    expect(src).toMatch(/const refusal = step\.preflight \? step\.preflight\(\) : null;/);
    expect(src).toMatch(/verdict: 'FAIL',[\s\S]{0,200}failure_reason: refusal/);
    expect(src).toMatch(/const failed = r\.status !== 0 \|\| failure_reason !== undefined;/);
  });
});
