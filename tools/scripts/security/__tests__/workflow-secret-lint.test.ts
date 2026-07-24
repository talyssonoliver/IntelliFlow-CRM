/**
 * Unit tests for tools/scripts/security/workflow-secret-lint.mjs
 *
 * Harness hardening — Gap #1. Verifies the workflow-YAML secret linter enforces
 * the "no hardcoded credential literal in a workflow" policy that closes the
 * gitleaks↔GitGuardian gap (#622/#625/#627).
 *
 * Spawn-based (not import-based): the root vitest project's default transform
 * pipeline does not handle a static `.mjs` import (see vitest.config.ts note near
 * the pg195 subset test), so we exercise the CLI as a subprocess — the same
 * proven pattern used by scripts/__tests__/check-diff-coverage.test.ts.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT = path.resolve(__dirname, '..', 'workflow-secret-lint.mjs');

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-secret-lint-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let counter = 0;
/** Write a temp workflow file and lint it; returns exit status + parsed findings. */
function lint(content: string) {
  const file = path.join(tmpDir, `wf-${counter++}.yml`);
  fs.writeFileSync(file, content, 'utf8');
  const r = spawnSync(process.execPath, [SCRIPT, '--json', file], {
    encoding: 'utf8',
    shell: false,
    maxBuffer: 8 * 1024 * 1024,
  });
  const parsed = JSON.parse(r.stdout || '{"findings":[],"errors":[]}');
  return { status: r.status, findings: parsed.findings as Array<{ key: string; line: number }> };
}

describe('workflow-secret-lint', () => {
  it('FAILS on a bare POSTGRES_PASSWORD literal', () => {
    const { status, findings } = lint(
      ['name: x', 'jobs:', '  a:', '    env:', '      POSTGRES_PASSWORD: postgres', ''].join('\n')
    );
    expect(status).toBe(1);
    expect(findings).toHaveLength(1);
    expect(findings[0].key).toBe('POSTGRES_PASSWORD');
  });

  it('FAILS on a bare DATABASE_URL credential literal', () => {
    const { status, findings } = lint(
      [
        'env:',
        '  DATABASE_URL: postgresql://postgres:postgres@localhost:5432/intelliflow_test',
        '',
      ].join('\n')
    );
    expect(status).toBe(1);
    expect(findings).toHaveLength(1);
    expect(findings[0].key).toBe('DATABASE_URL');
  });

  it('PASSES a ${{ secrets.* }} reference', () => {
    const { status, findings } = lint(
      [
        'env:',
        '  DATABASE_URL: ${{ secrets.DATABASE_URL }}',
        '  POSTGRES_PASSWORD: ${{ secrets.PG }}',
        '',
      ].join('\n')
    );
    expect(status).toBe(0);
    expect(findings).toHaveLength(0);
  });

  it('PASSES a ${{ secrets.* || fallback }} expression', () => {
    const { status } = lint(
      [
        'env:',
        "  DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub' }}",
        '',
      ].join('\n')
    );
    expect(status).toBe(0);
  });

  it('PASSES a literal exempted by an inline # secret-lint-allow: <reason> marker', () => {
    const { status, findings } = lint(
      [
        'env:',
        '  POSTGRES_PASSWORD: postgres # secret-lint-allow: ephemeral CI service-container credential',
        '',
      ].join('\n')
    );
    expect(status).toBe(0);
    expect(findings).toHaveLength(0);
  });

  it('PASSES a # gitleaks:allow marked literal (lockstep with the gitleaks rule)', () => {
    const { status } = lint(
      ['env:', '  POSTGRES_PASSWORD: postgres # gitleaks:allow', ''].join('\n')
    );
    expect(status).toBe(0);
  });

  it('still FAILS when the allow marker has an empty reason', () => {
    const { status, findings } = lint(
      ['env:', '  POSTGRES_PASSWORD: postgres # secret-lint-allow:', ''].join('\n')
    );
    expect(status).toBe(1);
    expect(findings).toHaveLength(1);
  });

  it('PASSES a workflow with no sensitive env at all', () => {
    const { status, findings } = lint(
      ['name: build', 'on: push', 'jobs:', '  a:', '    steps:', '      - run: echo hi', ''].join(
        '\n'
      )
    );
    expect(status).toBe(0);
    expect(findings).toHaveLength(0);
  });

  it('PASSES an unrecognized key (POSTGRES_USER is not a credential)', () => {
    const { status, findings } = lint(['env:', '  POSTGRES_USER: postgres', ''].join('\n'));
    expect(status).toBe(0);
    expect(findings).toHaveLength(0);
  });

  it('PASSES a self-evident placeholder credential (stub:stub)', () => {
    const { status } = lint(
      ['env:', '  DATABASE_URL: postgresql://stub:stub@localhost:5432/stub', ''].join('\n')
    );
    expect(status).toBe(0);
  });

  it('PASSES a password: ${{ secrets.* }} key outside an env block', () => {
    const { status } = lint(
      [
        'jobs:',
        '  a:',
        '    steps:',
        '      - with:',
        '          password: ${{ secrets.GITHUB_TOKEN }}',
        '',
      ].join('\n')
    );
    expect(status).toBe(0);
  });

  it('FAILS a bare password: literal outside an env block', () => {
    const { status, findings } = lint(
      ['jobs:', '  a:', '    steps:', '      - with:', '          password: hunter2', ''].join('\n')
    );
    expect(status).toBe(1);
    expect(findings[0].key.toLowerCase()).toBe('password');
  });
});
