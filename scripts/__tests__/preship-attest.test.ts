/**
 * Tests for scripts/preship-attest.mjs — the final-SHA pre-ship attestation
 * tool (ENG-OPS-003.Gap13, issue #644).
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
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { assessState, PAYLOAD_VERSION } from '../preship-attest.mjs';

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

  it('refuses a state with no expected_step_ids (pre-Gap13 state file)', () => {
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

describe('preship-attest CLI', () => {
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

describe('pre-ship.mjs persists run provenance (AC-1)', () => {
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
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'seed']);

    const r = spawnSync('node', ['scripts/pre-ship.mjs', '--only=__no_such_step__'], {
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

    // ...and that state must NOT be attestable: it is an --only subset run.
    const verdict = assessState(state, state.git_head, PRESHIP_HASH);
    expect(verdict.ok).toBe(false);
  });
});
