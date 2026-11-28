/**
 * Did the integration suite actually run? (issue #1600)
 *
 * Under an unsupported Node major (the PC's default was Node 25; the repo pins 24) the
 * integration setup could not import the workspace TypeScript and SKIPPED every test.
 * vitest then exited 0 having executed nothing, and local pre-ship showed
 * `integration-tests` green. Two guards close that:
 *
 *   1. preflight: refuse to run the step on a Node major that is not the pinned one.
 *   2. verification: after the step, fail it when the run executed 0 tests while
 *      integration test files exist.
 *
 * Both fail the step with "integration tests did not run". They are FAILs, not skips, so
 * PRESHIP_ALLOW_MISSING=1 does not excuse them. Pure functions; the caller supplies I/O.
 */

import fs from 'node:fs';
import path from 'node:path';

export const NOT_RUN = 'integration tests did not run';

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

function firstInt(text) {
  const m = /(\d+)/.exec(String(text ?? ''));
  return m ? Number(m[1]) : null;
}

/** Node major the repo pins: .nvmrc wins; else the lower bound of engines.node. */
export function pinnedNodeMajor(repoRoot) {
  try {
    const major = firstInt(fs.readFileSync(path.join(repoRoot, '.nvmrc'), 'utf8'));
    if (major !== null) return { major, exact: true, source: '.nvmrc' };
  } catch {
    // fall through to engines
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const major = firstInt(pkg?.engines?.node);
    if (major !== null) return { major, exact: false, source: 'package.json engines.node' };
  } catch {
    // unreadable: no pin known
  }
  return null;
}

/** Message when this Node is not the pinned one, else null. */
export function nodeMismatch(nodeVersion, pin) {
  if (!pin) return null;
  const actual = firstInt(nodeVersion);
  const wrong = pin.exact ? actual !== pin.major : actual < pin.major;
  if (!wrong) return null;
  return (
    `${NOT_RUN}: running Node ${nodeVersion}, but this repo requires Node ${pin.major} ` +
    `(${pin.source}). Under another Node major the integration setup cannot load and ` +
    `would skip silently. Switch to Node ${pin.major} and re-run.`
  );
}

/**
 * Tests that really executed, from a vitest default-reporter log: passed + failed.
 * Skipped, todo and a missing summary line count as not executed.
 */
export function countExecutedTests(logText) {
  const clean = String(logText ?? '').replace(ANSI, '');
  const line = clean.split(/\r?\n/).find((l) => /^\s*Tests\s+\d/.test(l));
  if (!line) return 0;
  const count = (word) => {
    const m = new RegExp(`(\\d+)\\s+${word}\\b`).exec(line);
    return m ? Number(m[1]) : 0;
  };
  return count('passed') + count('failed');
}

/** Integration test files under tests/integration. */
export function listIntegrationTestFiles(repoRoot) {
  const root = path.join(repoRoot, 'tests', 'integration');
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.test\.tsx?$/.test(e.name)) found.push(full);
    }
  };
  walk(root);
  return found;
}

/** Message when the run executed 0 tests although suites exist, else null. */
export function zeroExecuted({ logText, fileCount }) {
  if (fileCount === 0) return null;
  if (countExecutedTests(logText) > 0) return null;
  return (
    `${NOT_RUN}: the run executed 0 tests while ${fileCount} integration test file(s) exist. ` +
    'The setup skipped or failed to load (check the log for "Unknown file extension" or ' +
    'a Node version message). A green exit here verified nothing.'
  );
}
