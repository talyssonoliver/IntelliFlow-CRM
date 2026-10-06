/**
 * Tests for scripts/preship-attest.mjs — the final-SHA pre-ship attestation
 * tool (ENG-OPS-003.Gap14, issue #644).
 *
 * Two layers:
 *   1. `assessState()` imported directly — every laundering vector, pure, fast.
 *   2. CLI end-to-end against a REAL git repo + a `git init --bare` remote in
 *      os.tmpdir(). No test ever touches the real `origin` or the real
 *      artifacts/preship/last-run.json: the remote is injected via --remote and
 *      the state path via --state.
 *
 * Every child `git`/`node` call scrubs GIT_* (cleanEnv) — mandatory here because
 * this script is invoked FROM .husky/pre-push, which is precisely the context
 * that exports GIT_DIR/GIT_WORK_TREE pointing at the real repo.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  assessState,
  branchPatchId,
  carriedAttestation,
  carriedLine,
  mainChangesInScope,
  dirtyPaths,
  noAttestationLines,
  patchFields,
  publishedLine,
  patchIdentity,
  PATCH_REF_PREFIX,
  PAYLOAD_VERSION,
  publishRefspecs,
  readAttestation,
} from '../preship-attest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const ATTEST = path.join(REPO_ROOT, 'scripts/preship-attest.mjs');
const PRESHIP = path.join(REPO_ROOT, 'scripts/pre-ship.mjs');

const HEAD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const PRESHIP_HASH = crypto.createHash('sha256').update(fs.readFileSync(PRESHIP)).digest('hex');

/** A state object that SHOULD attest: full standard run, everything passed. */
function goodState(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    git_head: HEAD,
    verdict: 'PASS',
    mode: 'standard',
    allow_missing: false,
    only: null,
    expected_step_ids: ['lint', 'typecheck', 'build'],
    steps: [
      { id: 'lint', verdict: 'PASS', required: true },
      { id: 'typecheck', verdict: 'CACHED_PASS', required: true },
      { id: 'build', verdict: 'PASS', required: true },
    ],
    ...over,
  };
}

const assess = (state: unknown, head = HEAD, hash = PRESHIP_HASH) => assessState(state, head, hash);

// ─── assessState: the honest re-derivation ────────────────────────────────

describe('assessState — accepts an honest full run', () => {
  it('accepts a full standard run at the current HEAD', () => {
    const r = assess(goodState());
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('accepts CACHED_PASS as an honest pass', () => {
    const r = assess(
      goodState({
        steps: [
          { id: 'lint', verdict: 'CACHED_PASS', required: true },
          { id: 'typecheck', verdict: 'CACHED_PASS', required: true },
          { id: 'build', verdict: 'CACHED_PASS', required: true },
        ],
      })
    );
    expect(r.ok).toBe(true);
  });

  it('accepts a NON-required step that was skipped for an unmet precondition', () => {
    // e.g. actionlint / terraform-fmt not installed — an honest optional skip.
    const r = assess(
      goodState({
        expected_step_ids: ['lint', 'typecheck', 'build', 'actionlint'],
        steps: [
          { id: 'lint', verdict: 'PASS', required: true },
          { id: 'typecheck', verdict: 'PASS', required: true },
          { id: 'build', verdict: 'PASS', required: true },
          { id: 'actionlint', verdict: 'SKIPPED_PRECONDITION', required: false },
        ],
      })
    );
    expect(r.ok).toBe(true);
  });

  it('accepts a NON-required step recorded as FAIL (advisory, mirrors pre-ship)', () => {
    // audit / docs-audit / osv-scan are `required: false` in pre-ship.mjs because
    // they mirror CI's continue-on-error security scans. Refusing to attest on
    // them made every owner PR unmergeable while any HIGH advisory was open.
    const r = assess(
      goodState({
        expected_step_ids: ['lint', 'typecheck', 'build', 'audit'],
        steps: [
          { id: 'lint', verdict: 'PASS', required: true },
          { id: 'typecheck', verdict: 'PASS', required: true },
          { id: 'build', verdict: 'PASS', required: true },
          { id: 'audit', verdict: 'FAIL', required: false },
        ],
      })
    );
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('records advisory non-passes in the payload instead of dropping them', () => {
    const { payload } = assess(
      goodState({
        expected_step_ids: ['lint', 'typecheck', 'build', 'audit', 'osv-scan'],
        steps: [
          { id: 'lint', verdict: 'PASS', required: true },
          { id: 'typecheck', verdict: 'PASS', required: true },
          { id: 'build', verdict: 'PASS', required: true },
          { id: 'audit', verdict: 'FAIL', required: false },
          { id: 'osv-scan', verdict: 'FAIL', required: false },
        ],
      })
    );
    expect(payload?.advisory_not_passed).toEqual(['audit:FAIL', 'osv-scan:FAIL']);
  });

  it('leaves advisory_not_passed empty when every step genuinely passed', () => {
    const { payload } = assess(goodState());
    expect(payload?.advisory_not_passed).toEqual([]);
  });

  it('records the test scope the run used, so a related-only run never reads as full', () => {
    const { payload } = assess(
      goodState({ test_scope: { scope: 'related', reason: '2 files', files: ['a.ts', 'b.ts'] } })
    );
    expect(payload?.test_scope).toBe('related');
  });

  it('reads a state file from before test scoping as a full-suite run', () => {
    const { payload } = assess(goodState());
    expect(payload?.test_scope).toBe('full');
  });

  it('still refuses a REQUIRED step recorded as FAIL alongside an advisory one', () => {
    // The exemption must key on required-ness only — never widen to all FAILs.
    const r = assess(
      goodState({
        expected_step_ids: ['lint', 'typecheck', 'build', 'audit'],
        steps: [
          { id: 'lint', verdict: 'PASS', required: true },
          { id: 'typecheck', verdict: 'PASS', required: true },
          { id: 'build', verdict: 'FAIL', required: true },
          { id: 'audit', verdict: 'FAIL', required: false },
        ],
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/build/);
    expect(r.reasons.join(' ')).not.toMatch(/audit/);
  });

  it('builds a payload pinning sha, mode and the pre-ship hash', () => {
    const { payload } = assess(goodState());
    expect(payload).toMatchObject({
      v: PAYLOAD_VERSION,
      sha: HEAD,
      mode: 'standard',
      allow_missing: false,
      only: null,
      steps_ok: 3,
      steps_expected: 3,
      preship_sha256: PRESHIP_HASH,
    });
  });

  it('accepts --full mode', () => {
    const r = assess(goodState({ mode: 'full' }));
    expect(r.ok).toBe(true);
    expect(r.payload?.mode).toBe('full');
  });
});

describe('assessState — refuses malformed input', () => {
  it('refuses a null/absent state', () => {
    const r = assess(null);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/state/i);
  });

  it('refuses a non-object state', () => {
    expect(assess('nope').ok).toBe(false);
  });

  it('refuses a state with no steps array', () => {
    const r = assess(goodState({ steps: undefined }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/steps/i);
  });

  it('refuses a state with no expected_step_ids (pre-Gap14 state file)', () => {
    const r = assess(goodState({ expected_step_ids: undefined }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/expected_step_ids|older|re-run/i);
  });
});

describe('assessState — refuses a gate that did not pass', () => {
  it('refuses verdict FAIL', () => {
    const r = assess(goodState({ verdict: 'FAIL' }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/FAIL/);
  });

  it('refuses a stale state from a different HEAD', () => {
    const r = assess(goodState({ git_head: OTHER }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/HEAD|stale/i);
  });

  it('refuses a required step recorded as FAIL even when the top-level verdict says PASS', () => {
    // Defence in depth: a hand-edited top-level verdict must not launder a FAIL.
    const r = assess(
      goodState({
        steps: [
          { id: 'lint', verdict: 'PASS', required: true },
          { id: 'typecheck', verdict: 'FAIL', required: true },
          { id: 'build', verdict: 'PASS', required: true },
        ],
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/typecheck/);
  });

  it('refuses a NOT_RUN step left behind by an aborted run', () => {
    const r = assess(
      goodState({
        steps: [
          { id: 'lint', verdict: 'PASS', required: true },
          { id: 'typecheck', verdict: 'FAIL', required: true },
          { id: 'build', verdict: 'NOT_RUN' },
        ],
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/build/);
  });

  it('refuses when an expected step is missing from steps[] entirely', () => {
    const r = assess(
      goodState({
        steps: [
          { id: 'lint', verdict: 'PASS', required: true },
          { id: 'typecheck', verdict: 'PASS', required: true },
        ],
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/build/);
  });
});

describe('assessState — refuses laundering a degraded run', () => {
  // pre-ship.mjs:746-748 — --only marks unselected steps SKIPPED_NOT_SELECTED,
  // and sliceVerdict (:836-840) ignores that value, so `--only=lint` yields a
  // top-level verdict of PASS indistinguishable from a full green run.
  it('refuses an --only subset run (flag)', () => {
    const r = assess(goodState({ only: ['lint'] }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/--only|subset/i);
  });

  it('refuses an --only subset run (SKIPPED_NOT_SELECTED present, flag scrubbed)', () => {
    const r = assess(
      goodState({
        steps: [
          { id: 'lint', verdict: 'PASS', required: true },
          { id: 'typecheck', verdict: 'SKIPPED_NOT_SELECTED' },
          { id: 'build', verdict: 'SKIPPED_NOT_SELECTED' },
        ],
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/typecheck|build/);
  });

  // pre-ship.mjs:872,935 — PRESHIP_ALLOW_MISSING=1 drops required
  // SKIPPED_PRECONDITION steps from the `missing` count, so the top-level
  // verdict reads PASS while a required guard never ran.
  it('refuses a PRESHIP_ALLOW_MISSING run (flag)', () => {
    const r = assess(goodState({ allow_missing: true }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/allow_missing|PRESHIP_ALLOW_MISSING/i);
  });

  it('refuses a required step skipped for an unmet precondition (flag scrubbed)', () => {
    const r = assess(
      goodState({
        steps: [
          { id: 'lint', verdict: 'PASS', required: true },
          { id: 'typecheck', verdict: 'PASS', required: true },
          { id: 'build', verdict: 'SKIPPED_PRECONDITION', required: true },
        ],
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/build/);
  });

  it('never matches the display-only MISSING verdict', () => {
    // pre-ship.mjs:907-909 — MISSING is a console label; on disk the record is
    // SKIPPED_PRECONDITION + required:true. A tool testing for 'MISSING' would
    // silently never fire. This asserts the on-disk signal is what is checked.
    const src = fs.readFileSync(ATTEST, 'utf8');
    expect(src).not.toMatch(/===\s*'MISSING'|===\s*"MISSING"/);
  });
});

describe('dirtyPaths — what counts as a dirty tree', () => {
  it('treats an unmodified tree as attestable', () => {
    expect(dirtyPaths('')).toEqual([]);
  });

  it('IGNORES the gate’s own tracked output under artifacts/', () => {
    // Regression: running pre-ship rewrites these TRACKED files every time, so
    // treating them as dirty made --publish unusable after any genuine run.
    // Found by dogfooding this tool on its own PR.
    const porcelain = [
      ' M artifacts/coverage/coverage-final.json',
      ' M artifacts/coverage/coverage-summary.json',
      ' M artifacts/coverage/lcov.info',
      ' M artifacts/reports/a11y-route-reconcile.json',
    ].join('\n');
    expect(dirtyPaths(porcelain)).toEqual([]);
  });

  it('still refuses modified source', () => {
    const porcelain = [
      ' M artifacts/coverage/lcov.info',
      ' M scripts/pre-ship.mjs',
      '?? scripts/sneaky.mjs',
    ].join('\n');
    expect(dirtyPaths(porcelain)).toEqual(['scripts/pre-ship.mjs', 'scripts/sneaky.mjs']);
  });

  it('reports the destination path of a rename', () => {
    expect(dirtyPaths('R  scripts/old.mjs -> scripts/new.mjs')).toEqual(['scripts/new.mjs']);
  });

  it('does not treat a path merely CONTAINING artifacts/ as generated', () => {
    expect(dirtyPaths(' M apps/web/src/artifacts/thing.ts')).toEqual([
      'apps/web/src/artifacts/thing.ts',
    ]);
  });
});

describe('assessState — documented boundary of the honesty gate', () => {
  it('ACCEPTS a consistently-forged state (spec §2: forgeable by design)', () => {
    // steps[] and expected_step_ids trimmed together to hide a dropped FAIL.
    // The re-derivation cannot detect this — recorded here so the guarantee's
    // real limit is explicit in code rather than implied away.
    const r = assess(
      goodState({
        expected_step_ids: ['lint'],
        steps: [{ id: 'lint', verdict: 'PASS', required: true }],
      })
    );
    expect(r.ok).toBe(true);
  });
});

// ─── CLI end-to-end against a real bare-repo remote ───────────────────────

// Each case here builds a throwaway git workspace (init + commit + tag + a bare
// remote) and then shells out to the CLI — ~29 git subprocesses per test. Under
// the full 20-way parallel suite on Windows that routinely exceeds the global 5s
// default, which made this file flake in pre-ship with a different test timing
// out on each run while passing 42/42 in isolation. The work is genuinely
// subprocess-bound, so it needs a subprocess-shaped budget, not a faster test.
describe('preship-attest CLI', { timeout: 60_000 }, () => {
  const tmpDirs: string[] = [];
  afterAll(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });

  const cleanEnv = (): NodeJS.ProcessEnv => {
    const e: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    return e;
  };

  // NOTE: no `shell: true` here. git.exe resolves on PATH without a shell, and
  // routing through cmd.exe would mangle the `"` and `{` in the JSON payloads
  // these fixtures pass as `-m` arguments.
  const git = (cwd: string, args: string[]) =>
    spawnSync('git', args, { cwd, env: cleanEnv(), encoding: 'utf8' });

  /** A work repo with one commit, plus a bare repo standing in for `origin`. */
  function makeWorkspace(): { work: string; bare: string; sha: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preship-attest-'));
    tmpDirs.push(root);
    const work = path.join(root, 'work');
    const bare = path.join(root, 'origin.git');
    fs.mkdirSync(work, { recursive: true });
    git(root, ['init', '--bare', '-q', bare]);
    git(work, ['init', '-q']);
    git(work, ['config', 'user.email', 'test@example.com']);
    git(work, ['config', 'user.name', 'test']);
    fs.writeFileSync(path.join(work, 'README.md'), '# fixture\n');
    git(work, ['add', '-A']);
    git(work, ['commit', '-q', '-m', 'seed']);
    const sha = git(work, ['rev-parse', 'HEAD']).stdout.trim();
    return { work, bare, sha };
  }

  /**
   * The state file is written OUTSIDE the work tree — mirroring reality, where
   * artifacts/preship/ is gitignored. Inside it, the untracked file would make
   * `git status --porcelain` non-empty and trip the dirty-tree refusal.
   */
  function writeState(work: string, state: unknown): string {
    const p = path.join(path.dirname(work), 'state.json');
    fs.writeFileSync(p, typeof state === 'string' ? state : JSON.stringify(state, null, 2));
    return p;
  }

  // Fixture repos contain no scripts/pre-ship.mjs, so every invocation is
  // pointed at the real gate script for the version pin. Cases that need a
  // MISMATCH pass their own --preship-file (last flag wins).
  const run = (cwd: string, args: string[]) =>
    spawnSync('node', [ATTEST, ...args, `--preship-file=${PRESHIP}`], {
      cwd,
      env: cleanEnv(),
      encoding: 'utf8',
    });

  it('--help exits 0 and documents both modes', () => {
    const { work } = makeWorkspace();
    const r = run(work, ['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/--publish/);
    expect(r.stdout).toMatch(/--verify/);
  });

  it('exits non-zero on an unknown mode', () => {
    const { work } = makeWorkspace();
    const r = run(work, ['--frobnicate']);
    expect(r.status).not.toBe(0);
  });

  it('--publish fails with a readable message when the state file is missing', () => {
    const { work, bare } = makeWorkspace();
    const r = run(work, ['--publish', `--remote=${bare}`, '--state=does-not-exist.json']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/pnpm run pre-ship/);
  });

  it('--publish fails on malformed JSON without dumping a stack trace', () => {
    const { work, bare } = makeWorkspace();
    const state = writeState(work, '{not json');
    const r = run(work, ['--publish', `--remote=${bare}`, `--state=${state}`]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/pnpm run pre-ship/);
    expect(r.stderr).not.toMatch(/at Object\.<anonymous>/);
  });

  it('--publish refuses a state from a different HEAD', () => {
    const { work, bare } = makeWorkspace();
    const state = writeState(work, goodState());
    const r = run(work, ['--publish', `--remote=${bare}`, `--state=${state}`]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/HEAD|stale/i);
  });

  it('--publish refuses when the working tree is dirty', () => {
    const { work, bare, sha } = makeWorkspace();
    const state = writeState(work, goodState({ git_head: sha }));
    fs.writeFileSync(path.join(work, 'README.md'), '# fixture edited\n');
    const r = run(work, ['--publish', `--remote=${bare}`, `--state=${state}`]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/dirty|uncommitted/i);
  });

  it('--publish creates refs/preship/<sha> as a tag object targeting <sha>', () => {
    const { work, bare, sha } = makeWorkspace();
    const state = writeState(work, goodState({ git_head: sha }));
    const r = run(work, ['--publish', `--remote=${bare}`, `--state=${state}`]);
    expect(r.stderr + r.stdout).toBeTruthy();
    expect(r.status).toBe(0);

    const ls = git(work, ['ls-remote', bare, `refs/preship/${sha}`]);
    expect(ls.stdout.trim()).not.toBe('');
    const tagObj = ls.stdout.trim().split(/\s+/)[0];
    // The published object is an annotated tag, NOT the commit itself...
    expect(tagObj).not.toBe(sha);
    // ...and it targets the attested commit.
    const cat = git(work, ['cat-file', '-p', tagObj]);
    expect(cat.stdout).toMatch(new RegExp(`object ${sha}`));
    expect(cat.stdout).toMatch(/"v":\s*1/);
  });

  it('--publish is idempotent — re-publishing the same SHA still exits 0', () => {
    const { work, bare, sha } = makeWorkspace();
    const state = writeState(work, goodState({ git_head: sha }));
    expect(run(work, ['--publish', `--remote=${bare}`, `--state=${state}`]).status).toBe(0);
    expect(run(work, ['--publish', `--remote=${bare}`, `--state=${state}`]).status).toBe(0);
  });

  it('--verify exits 0 for a published SHA', () => {
    const { work, bare, sha } = makeWorkspace();
    const state = writeState(work, goodState({ git_head: sha }));
    run(work, ['--publish', `--remote=${bare}`, `--state=${state}`]);
    const r = run(work, ['--verify', `--sha=${sha}`, `--remote=${bare}`]);
    expect(r.status).toBe(0);
  });

  it('--verify fails with remediation text when nothing is published', () => {
    const { work, bare, sha } = makeWorkspace();
    const r = run(work, ['--verify', `--sha=${sha}`, `--remote=${bare}`]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/pnpm preship:attest/);
  });

  it('--verify fails for a DIFFERENT sha than the one published (no prefix match)', () => {
    const { work, bare, sha } = makeWorkspace();
    const state = writeState(work, goodState({ git_head: sha }));
    run(work, ['--publish', `--remote=${bare}`, `--state=${state}`]);
    const r = run(work, ['--verify', `--sha=${OTHER}`, `--remote=${bare}`]);
    expect(r.status).not.toBe(0);
  });

  it('--verify rejects an attestation whose tag targets a different commit', () => {
    const { work, bare, sha } = makeWorkspace();
    // Forge: a well-formed payload for `sha`, but the tag object points at a
    // second, unattested commit.
    fs.writeFileSync(path.join(work, 'README.md'), '# second\n');
    git(work, ['add', '-A']);
    git(work, ['commit', '-q', '-m', 'second']);
    const other = git(work, ['rev-parse', 'HEAD']).stdout.trim();
    const payload = JSON.stringify({
      v: 1,
      sha,
      mode: 'standard',
      allow_missing: false,
      only: null,
      steps_ok: 3,
      steps_expected: 3,
      preship_sha256: PRESHIP_HASH,
    });
    git(work, ['tag', '-a', '-m', payload, 'forged', other]);
    const obj = git(work, ['rev-parse', 'forged']).stdout.trim();
    git(work, ['push', '-q', bare, `${obj}:refs/preship/${sha}`]);

    const r = run(work, ['--verify', `--sha=${sha}`, `--remote=${bare}`]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/target|points/i);
  });

  it('--verify rejects a malformed payload', () => {
    const { work, bare, sha } = makeWorkspace();
    git(work, ['tag', '-a', '-m', 'not json at all', 'bad', sha]);
    const obj = git(work, ['rev-parse', 'bad']).stdout.trim();
    git(work, ['push', '-q', bare, `${obj}:refs/preship/${sha}`]);
    const r = run(work, ['--verify', `--sha=${sha}`, `--remote=${bare}`]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/payload/i);
  });

  it('--verify rejects a payload recording a degraded run', () => {
    const { work, bare, sha } = makeWorkspace();
    const payload = JSON.stringify({
      v: 1,
      sha,
      mode: 'standard',
      allow_missing: true, // ← degraded
      only: null,
      steps_ok: 3,
      steps_expected: 3,
      preship_sha256: PRESHIP_HASH,
    });
    git(work, ['tag', '-a', '-m', payload, 'degraded', sha]);
    const obj = git(work, ['rev-parse', 'degraded']).stdout.trim();
    git(work, ['push', '-q', bare, `${obj}:refs/preship/${sha}`]);
    const r = run(work, ['--verify', `--sha=${sha}`, `--remote=${bare}`]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/allow_missing/i);
  });

  it('--verify rejects a payload whose preship_sha256 does not match the checkout', () => {
    const { work, bare, sha } = makeWorkspace();
    const payload = JSON.stringify({
      v: 1,
      sha,
      mode: 'standard',
      allow_missing: false,
      only: null,
      steps_ok: 3,
      steps_expected: 3,
      preship_sha256: 'f'.repeat(64), // ← not the pre-ship.mjs being verified
    });
    git(work, ['tag', '-a', '-m', payload, 'wronghash', sha]);
    const obj = git(work, ['rev-parse', 'wronghash']).stdout.trim();
    git(work, ['push', '-q', bare, `${obj}:refs/preship/${sha}`]);
    // --preship-file points at the real gate script, whose hash differs.
    const r = run(work, [
      '--verify',
      `--sha=${sha}`,
      `--remote=${bare}`,
      `--preship-file=${PRESHIP}`,
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/preship_sha256|pre-ship\.mjs/i);
  });

  it('--verify rejects a malformed --sha argument as a usage error', () => {
    const { work, bare } = makeWorkspace();
    const r = run(work, ['--verify', '--sha=nothex', `--remote=${bare}`]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/sha/i);
  });
});

// ─── The real pre-ship.mjs write path (AC-1) ──────────────────────────────

// Same subprocess-bound shape as the CLI block above — real git workspaces plus
// a spawned pre-ship run.
describe('pre-ship.mjs persists run provenance (AC-1)', { timeout: 60_000 }, () => {
  const tmpDirs: string[] = [];
  afterAll(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });

  const cleanEnv = (): NodeJS.ProcessEnv => {
    const e: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    return e;
  };

  it('writes mode/allow_missing/only/expected_step_ids into last-run.json', () => {
    // Copy the REAL gate into a throwaway repo and run it with an --only id
    // that matches no step. runStep short-circuits on the --only filter BEFORE
    // any skip_if probe (pre-ship.mjs:746-748), so nothing is spawned and no
    // Docker probe runs — fast, hermetic, and it exercises the real write path
    // instead of a hand-built object.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preship-state-'));
    tmpDirs.push(dir);
    const git = (args: string[]) =>
      spawnSync('git', args, { cwd: dir, env: cleanEnv(), encoding: 'utf8' });
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'test']);
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.copyFileSync(PRESHIP, path.join(dir, 'scripts/pre-ship.mjs'));
    fs.mkdirSync(path.join(dir, 'scripts/lib'), { recursive: true });
    for (const lib of [
      'preship-test-scope.mjs',
      'preship-report.mjs',
      'test-slot.mjs',
      'preship-integration-infra.mjs',
      'preship-cache.mjs',
    ]) {
      fs.copyFileSync(path.join(REPO_ROOT, 'scripts/lib', lib), path.join(dir, 'scripts/lib', lib));
    }
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'seed']);

    // The leading `--` is what `pnpm run pre-ship -- <flags>` forwards; the gate
    // must treat it as the end-of-options separator, not reject it (exit 2).
    const r = spawnSync('node', ['scripts/pre-ship.mjs', '--', '--only=__no_such_step__'], {
      cwd: dir,
      env: cleanEnv(),
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);

    const state = JSON.parse(
      fs.readFileSync(path.join(dir, 'artifacts/preship/last-run.json'), 'utf8')
    );
    expect(state.mode).toBe('standard');
    expect(state.allow_missing).toBe(false);
    expect(state.only).toEqual(['__no_such_step__']);
    expect(Array.isArray(state.expected_step_ids)).toBe(true);
    expect(state.expected_step_ids.length).toBeGreaterThan(10);
    // The full-only cross-browser matrix is excluded outside --full.
    expect(state.expected_step_ids).not.toContain('e2e-full-matrix');
    expect(state.expected_step_ids).toContain('build');
    // No origin/main in the throwaway repo, so the scope cannot narrow: full.
    expect(state.test_scope.scope).toBe('full');

    // ...and that state must NOT be attestable: it is an --only subset run.
    const verdict = assessState(state, state.git_head, PRESHIP_HASH);
    expect(verdict.ok).toBe(false);
  });
});

// ─── Branch-diff carry-forward (a clean rebase keeps the attestation) ──────

// Branch protection is strict, so every merge to main forces every open PR onto
// a new head SHA. These cases pin that a CLEAN rebase reuses the attestation of
// the same diff, and that anything else (a changed diff, whitespace included, a
// different gate version, a forged record) still demands a fresh gate run.
describe('branch-diff carry-forward', { timeout: 60_000 }, () => {
  const tmpDirs: string[] = [];
  afterAll(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });

  const cleanEnv = (): NodeJS.ProcessEnv => {
    const e: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    return e;
  };

  /** The tool's git(), bound to a fixture repo instead of the process cwd. */
  const gitIn =
    (cwd: string) =>
    (args: string[], opts: Record<string, unknown> = {}) =>
      spawnSync('git', args, {
        cwd,
        env: cleanEnv(),
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        ...opts,
      });
  type Git = ReturnType<typeof gitIn>;
  type Refused = { ok: false; reasons: string[] };

  /** The PR's own change lives in workspace package `a`. */
  const FEATURE = 'packages/a/feature.txt';

  function put(work: string, rel: string, content: string | Buffer) {
    fs.mkdirSync(path.dirname(path.join(work, rel)), { recursive: true });
    fs.writeFileSync(path.join(work, rel), content);
  }

  /**
   * A three-package workspace on main (`c` depends on `a`; `b` is unrelated),
   * a feature branch with one commit in `a`, and a bare remote.
   */
  function makeBranchRepo() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preship-carry-'));
    tmpDirs.push(root);
    const work = path.join(root, 'work');
    const bare = path.join(root, 'origin.git');
    fs.mkdirSync(work, { recursive: true });
    const g = gitIn(work);
    gitIn(root)(['init', '--bare', '-q', bare]);
    g(['init', '-q', '-b', 'main']);
    g(['config', 'user.email', 'test@example.com']);
    g(['config', 'user.name', 'test']);
    put(work, 'README.md', '# fixture\n');
    put(work, 'packages/a/package.json', JSON.stringify({ name: 'a' }));
    put(work, 'packages/b/package.json', JSON.stringify({ name: 'b' }));
    put(
      work,
      'packages/c/package.json',
      JSON.stringify({ name: 'c', dependencies: { a: 'workspace:*' } })
    );
    g(['add', '.']);
    g(['commit', '-q', '-m', 'seed']);
    g(['checkout', '-q', '-b', 'feature']);
    put(work, FEATURE, 'one\n');
    g(['add', FEATURE]);
    g(['commit', '-q', '-m', 'feature']);
    const sha = g(['rev-parse', 'HEAD']).stdout.trim();
    return { work, bare, sha, g };
  }

  /**
   * Move main on by changing `file` and rebase feature onto it. The default,
   * a file in the unrelated package `b`, is a clean update outside the PR's scope.
   */
  function advanceMainAndRebase(g: Git, work: string, file = 'packages/b/other.txt'): string {
    g(['checkout', '-q', 'main']);
    put(work, file, `main moved ${Date.now()}\n`);
    g(['add', file]);
    g(['commit', '-q', '-m', 'main moves']);
    g(['checkout', '-q', 'feature']);
    g(['rebase', '-q', 'main']);
    return g(['rev-parse', 'HEAD']).stdout.trim();
  }

  /** Re-commit the feature file with new content (a different branch diff). */
  function rewriteFeature(g: Git, work: string, content: string | Buffer): string {
    put(work, FEATURE, content);
    g(['add', FEATURE]);
    g(['commit', '-q', '--amend', '-m', 'feature']);
    return g(['rev-parse', 'HEAD']).stdout.trim();
  }

  const cli = (work: string, args: string[]) =>
    spawnSync('node', [ATTEST, ...args, '--base=main', `--preship-file=${PRESHIP}`], {
      cwd: work,
      env: cleanEnv(),
      encoding: 'utf8',
    });

  /** Publish an attestation for HEAD through the real CLI, as the pre-push hook does. */
  function publish(work: string, bare: string, sha: string) {
    const state = path.join(path.dirname(work), 'state.json');
    fs.writeFileSync(state, JSON.stringify(goodState({ git_head: sha })));
    return cli(work, ['--publish', `--remote=${bare}`, `--state=${state}`]);
  }

  /** A hand-built tag object pushed to `ref`, for forged-record cases. */
  function pushTag(
    g: Git,
    bare: string,
    name: string,
    target: string,
    payload: object,
    ref: string
  ) {
    g(['tag', '-a', '-m', JSON.stringify(payload), name, target]);
    const obj = g(['rev-parse', name]).stdout.trim();
    g(['push', '-q', bare, `${obj}:${ref}`]);
    return obj;
  }

  const fullPayload = (sha: string, patchId: string) => ({
    v: 1,
    sha,
    mode: 'standard',
    allow_missing: false,
    only: null,
    steps_ok: 3,
    steps_expected: 3,
    preship_sha256: PRESHIP_HASH,
    patch_id: patchId,
  });

  const flagsFor = (bare: string) => ({ remote: bare, base: 'main' });

  it('branchPatchId is the same across a clean rebase and changes with the diff', () => {
    const { work, sha, g } = makeBranchRepo();
    const before = branchPatchId(sha, 'main', g);
    expect(before?.patchId).toMatch(/^[0-9a-f]{40}$/);

    const rebased = advanceMainAndRebase(g, work);
    expect(rebased).not.toBe(sha);
    const after = branchPatchId(rebased, 'main', g);
    expect(after?.patchId).toBe(before?.patchId);
    // The merge-base moved with main; the identity did not.
    expect(after?.base).not.toBe(before?.base);

    const changed = rewriteFeature(g, work, 'two\n');
    expect(branchPatchId(changed, 'main', g)?.patchId).not.toBe(before?.patchId);
  });

  it('branchPatchId treats a whitespace-only change as a different diff', () => {
    const { work, sha, g } = makeBranchRepo();
    const plain = branchPatchId(sha, 'main', g)?.patchId;
    const spaced = rewriteFeature(g, work, 'one \n');
    expect(branchPatchId(spaced, 'main', g)?.patchId).not.toBe(plain);
  });

  it('branchPatchId returns null without a merge-base or without a diff', () => {
    const { sha, g } = makeBranchRepo();
    expect(branchPatchId(sha, 'no-such-ref', g)).toBeNull();
    const mainTip = g(['rev-parse', 'main']).stdout.trim();
    expect(branchPatchId(mainTip, 'main', g)).toBeNull();
  });

  it('publishRefspecs adds the branch-diff ref only when the patch-id is known', () => {
    const obj = 'c'.repeat(40);
    const pid = 'd'.repeat(40);
    expect(publishRefspecs(obj, HEAD, null)).toEqual([`${obj}:refs/preship/${HEAD}`]);
    expect(publishRefspecs(obj, HEAD, { patchId: pid, base: OTHER })).toEqual([
      `${obj}:refs/preship/${HEAD}`,
      `${obj}:${PATCH_REF_PREFIX}${pid}/${HEAD}`,
    ]);
  });

  it('patchIdentity refreshes the base only when it is a branch of the publishing remote', () => {
    const calls: string[][] = [];
    const warnings: string[] = [];
    const stub = (args: string[]) => {
      calls.push(args);
      return { status: 1, stdout: '', stderr: 'offline' };
    };
    const warn = (m: string) => warnings.push(m);
    expect(patchIdentity(HEAD, { remote: 'origin', base: 'origin/main' }, stub, warn)).toBeNull();
    expect(calls[0]).toEqual(['fetch', '--quiet', 'origin', 'main']);
    // Neither a failed refresh nor a missing patch-id is silent.
    expect(warnings.join('')).toMatch(/could not refresh origin\/main \(offline\)/);
    expect(warnings.join('')).toMatch(/will not carry across a rebase/);

    calls.length = 0;
    patchIdentity(HEAD, { remote: 'upstream-path', base: 'main' }, stub, warn);
    expect(calls.some((c) => c[0] === 'fetch')).toBe(false);
  });

  it('patchIdentity fetches the base from a real remote and returns the patch-id silently', () => {
    const { work, bare, sha, g } = makeBranchRepo();
    g(['remote', 'add', 'origin', bare]);
    g(['push', '-q', 'origin', 'main']);
    const warnings: string[] = [];
    const patch = patchIdentity(sha, { remote: 'origin', base: 'origin/main' }, g, (m: string) =>
      warnings.push(m)
    );
    expect(patch?.patchId).toBe(branchPatchId(sha, 'main', g)?.patchId);
    expect(warnings).toEqual([]);
    expect(work).toBeTruthy();
  });

  it('fails safe on every git error path and uses the real git by default', () => {
    type R = { status: number | null; stdout: string | Buffer; stderr?: string };
    const scripted =
      (answers: Record<string, R>) =>
      (args: string[]): R => {
        const key = args.find((a) => answers[a]) ?? '';
        return answers[key] ?? { status: 1, stdout: '' };
      };
    const ok = (stdout: string | Buffer): R => ({ status: 0, stdout });

    // patch-id fails, or prints something that is not a patch-id: no identity.
    const base = { 'merge-base': ok(`${OTHER}\n`), 'diff-tree': ok(Buffer.from('diff')) };
    expect(branchPatchId(HEAD, 'main', scripted({ ...base }))).toBeNull();
    expect(
      branchPatchId(HEAD, 'main', scripted({ ...base, 'patch-id': ok('nonsense') }))
    ).toBeNull();

    // A fetch failure with no stderr still warns.
    const warnings: string[] = [];
    const noStderr = () => ({ status: 128, stdout: '' });
    patchIdentity(HEAD, { remote: 'origin', base: 'origin/main' }, noStderr, (m: string) =>
      warnings.push(m)
    );
    expect(warnings[0]).toMatch(/could not refresh origin\/main \(\)/);

    // ls-remote failing means nothing to carry; a nameless object type and a
    // tag with no target line are reported, not trusted.
    const lsFails = carriedAttestation(
      { remote: 'r', base: 'main' },
      HEAD,
      null,
      scripted({ ...base, 'patch-id': ok(`${'d'.repeat(40)} ${HEAD}`) })
    ) as Refused;
    expect(lsFails.reasons[0]).toMatch(/no earlier head/);
    const read = readAttestation('r', 'refs/x', 'obj', scripted({ fetch: ok('') }));
    expect(read.error).toMatch(/unknown object, not a tag/);
    const untargeted = readAttestation(
      'r',
      'refs/x',
      'obj',
      scripted({ fetch: ok(''), '-t': ok('tag\n'), '-p': ok('tag x\n\n{}') })
    );
    expect(untargeted).toEqual({ target: null, payload: {} });

    // Defaults: the module's own git, run here against a ref that cannot exist.
    const quiet = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(patchIdentity(HEAD, { remote: 'nowhere', base: 'no-such-ref' })).toBeNull();
      expect(quiet).toHaveBeenCalled();
    } finally {
      quiet.mockRestore();
    }
    const flags = { remote: 'nowhere', base: 'no-such-ref' };
    expect(carriedAttestation(flags, HEAD, null).ok).toBe(false);
    expect(readAttestation('nowhere', 'refs/none', HEAD).error).toMatch(/could not fetch/);
  });

  it('patchFields and the CLI messages say what was recorded and carried', () => {
    const pid = 'd'.repeat(40);
    expect(patchFields(null)).toEqual({});
    expect(patchFields({ patchId: pid, base: OTHER })).toEqual({
      patch_id: pid,
      patch_base: OTHER,
    });

    const payload = { mode: 'standard', steps_ok: 3, steps_expected: 3 };
    expect(publishedLine(HEAD, payload, null)).toBe(
      `pre-ship attestation published for ${HEAD.slice(0, 9)} (standard, 3/3 steps).\n`
    );
    expect(publishedLine(HEAD, payload, { patchId: pid, base: OTHER })).toContain(
      `branch patch-id ${pid.slice(0, 12)}).`
    );

    const line = carriedLine(
      HEAD,
      { from: OTHER, payload: { ...payload, patch_id: pid, attested_at: '2026-10-05T19:00:00Z' } },
      'origin/main'
    );
    expect(line).toContain(`carried from ${OTHER.slice(0, 9)}`);
    expect(line).toContain(`same branch diff against origin/main (patch-id ${pid.slice(0, 12)})`);

    const refused = noAttestationLines(HEAD, ['no earlier head has the same branch diff']).join(
      '\n'
    );
    expect(refused).toMatch(new RegExp(`NO PRE-SHIP ATTESTATION for ${HEAD}`));
    expect(refused).toMatch(/ {4}- no earlier head has the same branch diff/);
    expect(refused).toMatch(/pnpm preship:attest/);
  });

  it('branchPatchId keeps non-UTF-8 bytes distinct (no lossy decoding of the diff)', () => {
    const { work, sha, g } = makeBranchRepo();
    // Latin-1 e-acute vs e-grave: both decode to U+FFFD if read as UTF-8.
    const latin = (byte: number) => Buffer.from([0x63, 0x61, 0x66, byte, 0x0a]);
    fs.writeFileSync(path.join(work, 'feature.txt'), latin(0xe9));
    g(['add', 'feature.txt']);
    g(['commit', '-q', '--amend', '-m', 'feature']);
    const acute = branchPatchId(g(['rev-parse', 'HEAD']).stdout.trim(), 'main', g)?.patchId;
    fs.writeFileSync(path.join(work, 'feature.txt'), latin(0xe8));
    g(['add', 'feature.txt']);
    g(['commit', '-q', '--amend', '-m', 'feature']);
    const grave = branchPatchId(g(['rev-parse', 'HEAD']).stdout.trim(), 'main', g)?.patchId;
    expect(acute).toMatch(/^[0-9a-f]{40}$/);
    expect(grave).not.toBe(acute);
    expect(sha).toBeTruthy();
  });

  it('branchPatchId ignores personal diff config, so a laptop and CI agree', () => {
    const { sha, g } = makeBranchRepo();
    const plain = branchPatchId(sha, 'main', g)?.patchId;
    for (const [key, value] of [
      ['diff.noprefix', 'true'],
      ['diff.srcPrefix', 'SRC/'],
      ['diff.context', '1'],
      ['diff.interHunkContext', '20'],
      ['core.quotePath', 'false'],
    ]) {
      g(['config', key, value]);
      expect(branchPatchId(sha, 'main', g)?.patchId, key).toBe(plain);
      g(['config', '--unset', key]);
    }
  });

  it('publish records the patch-id and a second ref keyed by it', () => {
    const { work, bare, sha, g } = makeBranchRepo();
    const r = publish(work, bare, sha);
    expect(r.status).toBe(0);
    const pid = branchPatchId(sha, 'main', g)!.patchId;
    expect(r.stdout).toContain(pid.slice(0, 12));

    const ls = g(['ls-remote', bare, `${PATCH_REF_PREFIX}${pid}/*`]).stdout.trim();
    expect(ls).toContain(`${PATCH_REF_PREFIX}${pid}/${sha}`);
    const read = readAttestation(bare, `refs/preship/${sha}`, ls.split(/\s+/)[0], g);
    expect(read.target).toBe(sha);
    expect(read.payload.patch_id).toBe(pid);
  });

  it('carries the attestation to a clean rebase onto a newer main', () => {
    const { work, bare, sha, g } = makeBranchRepo();
    expect(publish(work, bare, sha).status).toBe(0);
    const rebased = advanceMainAndRebase(g, work);

    expect(carriedAttestation(flagsFor(bare), rebased, PRESHIP_HASH, g)).toMatchObject({
      ok: true,
      from: sha,
    });

    // The CLI the CI job runs agrees, and says where the record came from.
    const r = cli(work, ['--verify', `--sha=${rebased}`, `--remote=${bare}`]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`carried from ${sha.slice(0, 9)}`);
  });

  it('does not carry it when the rebase changed the diff', () => {
    const { work, bare, sha, g } = makeBranchRepo();
    expect(publish(work, bare, sha).status).toBe(0);
    advanceMainAndRebase(g, work);
    const changed = rewriteFeature(g, work, 'one, resolved differently\n');

    const carried = carriedAttestation(flagsFor(bare), changed, PRESHIP_HASH, g) as Refused;
    expect(carried.ok).toBe(false);
    expect(carried.reasons.join('\n')).toMatch(/no earlier head/);

    const r = cli(work, ['--verify', `--sha=${changed}`, `--remote=${bare}`]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/No earlier attestation could be carried/);
  });

  // A clean rebase is not proof of compatibility: the carry also needs main's
  // intervening changes to stay outside the PR's affected scope.
  it.each([
    ['an unrelated package', 'packages/b/other.txt', true],
    ['docs only', 'docs/notes.md', true],
    ['the same package as the PR', 'packages/a/other.ts', false],
    ['a package that depends on the PR’s package', 'packages/c/index.ts', false],
    ['the lockfile', 'pnpm-lock.yaml', false],
    ['a repo-root source file', 'scripts/tool.mjs', true],
  ])('main changing %s: carried = %s', (_label, file, carried) => {
    const { work, bare, sha, g } = makeBranchRepo();
    expect(publish(work, bare, sha).status).toBe(0);
    const rebased = advanceMainAndRebase(g, work, file);
    const result = carriedAttestation(flagsFor(bare), rebased, PRESHIP_HASH, g);
    expect(result.ok).toBe(carried);
    if (!carried) {
      const why = (result as Refused).reasons.join('\n');
      expect(why).toMatch(/main changed 1 file\(s\) in this PR's affected scope/);
      expect(why).toContain(file);
    }
  });

  it('main changing a package the PR’s package depends on blocks the carry', () => {
    const { work, bare, g } = makeBranchRepo();
    // Make `a` depend on `b` on main first, and re-base the feature on that.
    g(['checkout', '-q', 'main']);
    put(
      work,
      'packages/a/package.json',
      JSON.stringify({ name: 'a', dependencies: { b: 'workspace:*' } })
    );
    g(['add', 'packages/a/package.json']);
    g(['commit', '-q', '-m', 'a depends on b']);
    g(['checkout', '-q', 'feature']);
    g(['rebase', '-q', 'main']);
    const sha = g(['rev-parse', 'HEAD']).stdout.trim();
    expect(publish(work, bare, sha).status).toBe(0);

    const rebased = advanceMainAndRebase(g, work, 'packages/b/lib.ts');
    const result = carriedAttestation(flagsFor(bare), rebased, PRESHIP_HASH, g) as Refused;
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toContain('packages/b/lib.ts (in b, within the PR');
  });

  it('a PR that touches the repo root is blocked by main touching the root too', () => {
    const { work, bare, g } = makeBranchRepo();
    put(work, 'scripts/mine.mjs', 'export {};\n');
    g(['add', 'scripts/mine.mjs']);
    g(['commit', '-q', '-m', 'root change']);
    const sha = g(['rev-parse', 'HEAD']).stdout.trim();
    expect(publish(work, bare, sha).status).toBe(0);
    const rebased = advanceMainAndRebase(g, work, 'scripts/tool.mjs');
    const result = carriedAttestation(flagsFor(bare), rebased, PRESHIP_HASH, g) as Refused;
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/repo-root file, and the PR touches the root too/);
  });

  it('mainChangesInScope blocks without an attested base and is empty when main did not move', () => {
    const { sha, g } = makeBranchRepo();
    const base = g(['merge-base', sha, 'main']).stdout.trim();
    expect(mainChangesInScope(sha, undefined, base, g)[0].why).toMatch(/no patch_base/);
    expect(mainChangesInScope(sha, base, base, g)).toEqual([]);
    const broken = mainChangesInScope(sha, OTHER, base, g);
    expect(broken[0].why).toMatch(/cannot list the changes/);
  });

  it('does not carry a record made by a different gate version', () => {
    const { work, bare, sha, g } = makeBranchRepo();
    expect(publish(work, bare, sha).status).toBe(0);
    const rebased = advanceMainAndRebase(g, work);
    const carried = carriedAttestation(flagsFor(bare), rebased, 'f'.repeat(64), g) as Refused;
    expect(carried.ok).toBe(false);
    expect(carried.reasons.join('\n')).toMatch(/preship_sha256/);
  });

  it('refuses a record under the patch ref whose payload names another patch-id', () => {
    const { work, bare, sha, g } = makeBranchRepo();
    const pid = branchPatchId(sha, 'main', g)!.patchId;
    const ref = `${PATCH_REF_PREFIX}${pid}/${sha}`;
    pushTag(g, bare, 'forged', sha, fullPayload(sha, 'e'.repeat(40)), ref);
    const rebased = advanceMainAndRebase(g, work);

    const carried = carriedAttestation(flagsFor(bare), rebased, PRESHIP_HASH, g) as Refused;
    expect(carried.ok).toBe(false);
    expect(carried.reasons.join('\n')).toMatch(/patch-id/);
  });

  it('refuses a patch ref that is not an annotated tag, or that names another commit', () => {
    const { work, bare, sha, g } = makeBranchRepo();
    const pid = branchPatchId(sha, 'main', g)!.patchId;
    // A bare commit where a tag object should be.
    g(['push', '-q', bare, `${sha}:${PATCH_REF_PREFIX}${pid}/${sha}`]);
    // A well-formed tag under a ref naming a commit it does not target.
    pushTag(
      g,
      bare,
      'misnamed',
      sha,
      fullPayload(OTHER, pid),
      `${PATCH_REF_PREFIX}${pid}/${OTHER}`
    );
    const rebased = advanceMainAndRebase(g, work);

    const carried = carriedAttestation(flagsFor(bare), rebased, PRESHIP_HASH, g) as Refused;
    expect(carried.ok).toBe(false);
    const why = carried.reasons.join('\n');
    expect(why).toMatch(/not a tag/);
    expect(why).toMatch(/points at/);
  });

  it('readAttestation reports a payload that is not JSON and a ref it cannot fetch', () => {
    const { bare, sha, g } = makeBranchRepo();
    g(['tag', '-a', '-m', 'not json', 'junk', sha]);
    const obj = g(['rev-parse', 'junk']).stdout.trim();
    g(['push', '-q', bare, `${obj}:refs/preship/${sha}`]);
    expect(readAttestation(bare, `refs/preship/${sha}`, obj, g).error).toMatch(/not valid JSON/);
    expect(readAttestation(bare, 'refs/preship/missing', obj, g).error).toMatch(/could not fetch/);
  });

  it('cannot carry anything for a commit with no merge-base', () => {
    const { bare, sha, g } = makeBranchRepo();
    const flags = { remote: bare, base: 'no-such-ref' };
    const carried = carriedAttestation(flags, sha, PRESHIP_HASH, g) as Refused;
    expect(carried.ok).toBe(false);
    expect(carried.reasons[0]).toMatch(/cannot compute the branch diff/);
  });
});
