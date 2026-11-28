/**
 * Node-version diagnostics for the integration setup.
 *
 * Under an unsupported Node major (the PC's default was Node 25 while the repo pins 24),
 * `require('@intelliflow/db')` fails with 'Unknown file extension ".ts"'. The setup used to
 * swallow that and skip every integration test, so a local run looked green while running
 * nothing (issue #1600). These helpers turn that into a loud, self-explaining error.
 *
 * @module tests/integration/node-guard
 */

import fs from 'node:fs';
import path from 'node:path';

/** The Node major the repo pins (.nvmrc), or null when it cannot be read. */
export function requiredNodeMajor(repoRoot: string): number | null {
  try {
    const text = fs.readFileSync(path.join(repoRoot, '.nvmrc'), 'utf8');
    const match = /(\d+)/.exec(text);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/** Major of a `process.version` string such as "v25.2.1". */
export function nodeMajorOf(version: string): number {
  return Number(/(\d+)/.exec(version)?.[1] ?? Number.NaN);
}

/** One-line statement of the running and the required Node, for error messages. */
export function nodeVersionClause(nodeVersion: string, requiredMajor: number | null): string {
  if (requiredMajor === null) {
    return `running Node ${nodeVersion} (the pinned version could not be read from .nvmrc)`;
  }
  if (nodeMajorOf(nodeVersion) === requiredMajor) {
    return `running Node ${nodeVersion} (matches the pinned Node ${requiredMajor})`;
  }
  return `running Node ${nodeVersion} but this repo requires Node ${requiredMajor} (.nvmrc)`;
}

/**
 * The message thrown when the setup cannot load or cannot connect. Always names the
 * Node version and the required one, and always says the tests did not run.
 */
export function integrationSetupFailure(
  cause: string,
  nodeVersion: string,
  requiredMajor: number | null
): string {
  return (
    `integration tests did not run: ${cause}. ` +
    `You are ${nodeVersionClause(nodeVersion, requiredMajor)}. ` +
    (requiredMajor !== null && nodeMajorOf(nodeVersion) !== requiredMajor
      ? `Switch to Node ${requiredMajor} and re-run. `
      : '') +
    'This is a failure, not a skip: nothing was verified.'
  );
}
