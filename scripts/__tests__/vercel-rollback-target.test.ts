/**
 * vercel-rollback-target — target selection and verification for
 * .github/workflows/vercel-rollback.yml. The Vercel API is replaced by a
 * stub fetch; no network and no credentials are involved.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiGet,
  forLog,
  isEligible,
  loadState,
  main,
  matchesRef,
  normalizeRef,
  parseDryRun,
  pickRollbackTarget,
  renderSummary,
  runResolve,
  runVerify,
} from '../ops/vercel-rollback-target.mjs';

const dep = (n: number, over: Record<string, unknown> = {}) => ({
  uid: `dpl_${n}`,
  url: `app-${n}-team.vercel.app`,
  createdAt: 1_791_000_000_000 + n,
  state: 'READY',
  target: 'production',
  isRollbackCandidate: true,
  meta: { githubCommitSha: `sha${n}`, githubCommitMessage: `commit ${n}` },
  ...over,
});

// newest first, as the API returns them
const list = [dep(5), dep(4), dep(3), dep(2)];

function stubFetch(currentId: string | undefined, deployments = list, status = 200) {
  return vi.fn(async (url: string) => ({
    ok: status === 200,
    status,
    json: async () =>
      url.includes('/v9/projects/')
        ? { targets: { production: currentId ? { id: currentId } : undefined } }
        : { deployments },
  })) as unknown as typeof fetch;
}

const baseEnv = {
  VERCEL_TOKEN: 'x'.repeat(24),
  VERCEL_PROJECT_ID: 'prj_test',
  VERCEL_ORG_ID: 'team_test',
  ROLLBACK_REASON: 'bad release',
  GITHUB_ACTOR: 'octo',
};

afterEach(() => vi.unstubAllGlobals());

describe('normalizeRef / matchesRef', () => {
  it('strips scheme, trailing slash and case', () => {
    expect(normalizeRef(' HTTPS://App-1.vercel.app/ ')).toBe('app-1.vercel.app');
    expect(normalizeRef(undefined)).toBe('');
    expect(normalizeRef(null)).toBe('');
  });
  it('matches by id or by url', () => {
    expect(matchesRef(dep(1), 'dpl_1')).toBe(true);
    expect(matchesRef(dep(1), 'app-1-team.vercel.app')).toBe(true);
    expect(matchesRef(dep(1), 'other')).toBe(false);
    expect(matchesRef({ uid: 'dpl_9' }, 'other')).toBe(false);
  });
});

describe('isEligible', () => {
  it('accepts READY production deployments', () => {
    expect(isEligible(dep(1))).toBe(true);
    expect(isEligible(dep(1, { isRollbackCandidate: null }))).toBe(true);
  });
  it('rejects non-READY, non-production and non-candidates', () => {
    expect(isEligible(dep(1, { state: 'ERROR' }))).toBe(false);
    expect(isEligible(dep(1, { target: null }))).toBe(false);
    expect(isEligible(dep(1, { isRollbackCandidate: false }))).toBe(false);
  });
});

describe('pickRollbackTarget', () => {
  it('defaults to the newest eligible deployment that is not current', () => {
    expect(pickRollbackTarget({ deployments: list, currentId: 'dpl_5' }).uid).toBe('dpl_4');
  });
  it('skips the current deployment even when it is not the newest', () => {
    expect(pickRollbackTarget({ deployments: list, currentId: 'dpl_4' }).uid).toBe('dpl_5');
  });
  it('skips ineligible deployments', () => {
    const deployments = [
      dep(5),
      dep(4, { state: 'ERROR' }),
      dep(3, { isRollbackCandidate: false }),
      dep(2),
    ];
    expect(pickRollbackTarget({ deployments, currentId: 'dpl_5' }).uid).toBe('dpl_2');
  });
  it('errors when there is no candidate', () => {
    expect(() => pickRollbackTarget({ deployments: [dep(5)], currentId: 'dpl_5' })).toThrow(
      /No rollback candidate/
    );
    expect(() => pickRollbackTarget({ deployments: [], currentId: 'dpl_5' })).toThrow(
      /No rollback candidate/
    );
  });
  it('honours an explicit id or url', () => {
    expect(pickRollbackTarget({ deployments: list, currentId: 'dpl_5', target: 'dpl_2' }).uid).toBe(
      'dpl_2'
    );
    expect(
      pickRollbackTarget({
        deployments: list,
        currentId: 'dpl_5',
        target: 'https://app-3-team.vercel.app/',
      }).uid
    ).toBe('dpl_3');
  });
  it('rejects an explicit target that is unknown, current, or ineligible', () => {
    expect(() =>
      pickRollbackTarget({ deployments: list, currentId: 'dpl_5', target: 'dpl_404' })
    ).toThrow(/not among the recent production deployments/);
    expect(() =>
      pickRollbackTarget({ deployments: list, currentId: 'dpl_5', target: 'dpl_5' })
    ).toThrow(/already the current/);
    const deployments = [dep(5), dep(4, { state: 'ERROR' })];
    expect(() => pickRollbackTarget({ deployments, currentId: 'dpl_5', target: 'dpl_4' })).toThrow(
      /not a READY production deployment eligible/
    );
  });
});

describe('parseDryRun', () => {
  it('only an explicit false disables dry run', () => {
    expect(parseDryRun('false')).toBe(false);
    expect(parseDryRun(' FALSE ')).toBe(false);
    expect(parseDryRun('true')).toBe(true);
    expect(parseDryRun('')).toBe(true);
    expect(parseDryRun(undefined)).toBe(true);
  });
});

describe('renderSummary', () => {
  const args = { current: dep(5), target: dep(4), reason: 'r', actor: 'a' };
  it('describes a dry run', () => {
    const md = renderSummary({ ...args, dryRun: true });
    expect(md).toContain('(dry run, nothing changed)');
    expect(md).toContain('dpl_5');
    expect(md).toContain('https://app-4-team.vercel.app');
    expect(md).toContain('Re-run with `dry_run` set to false');
  });
  it('describes a live run with the undo command', () => {
    const md = renderSummary({ ...args, dryRun: false });
    expect(md).toContain('(LIVE)');
    expect(md).toContain('vercel promote dpl_5');
  });
  it('neutralises untrusted commit messages', () => {
    const evil = dep(4, { meta: { githubCommitMessage: 'a | b\n<script>x</script>' } });
    const md = renderSummary({ ...args, target: evil, dryRun: true });
    expect(md).toContain('a \\| b scriptx/script');
    expect(md).not.toContain('<script>');
  });
  it('tolerates missing metadata', () => {
    const md = renderSummary({
      current: { uid: 'dpl_1' },
      target: undefined as never,
      reason: 'r',
      actor: 'a',
      dryRun: true,
    });
    expect(md).toContain('dpl_1');
  });
});

describe('apiGet / loadState', () => {
  it('sends the token as a bearer header and returns JSON', async () => {
    const f = stubFetch('dpl_5');
    await apiGet('/v9/projects/p?teamId=t', 'secret-token-value', f);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({
      headers: { Authorization: 'Bearer secret-token-value' },
    });
  });
  it('fails with the status but never the token or query', async () => {
    const err = await apiGet(
      '/v7/deployments?teamId=t',
      'secret-token-value',
      stubFetch('x', list, 403)
    ).catch((e: Error) => e);
    expect((err as Error).message).toBe('Vercel API /v7/deployments failed with HTTP 403');
  });
  it('uses the global fetch by default', async () => {
    const f = stubFetch('dpl_5');
    vi.stubGlobal('fetch', f);
    await apiGet('/x', 't');
    expect(f).toHaveBeenCalledOnce();
  });
  it('reads the current id and the production list', async () => {
    const f = stubFetch('dpl_5');
    const state = await loadState({
      token: 't',
      projectId: 'prj_a',
      teamId: 'team_b',
      fetchImpl: f,
    });
    expect(state).toEqual({ currentId: 'dpl_5', deployments: list });
    const urls = (f as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(urls[1]).toContain('target=production&state=READY');
    expect(urls[1]).toContain('projectId=prj_a');
  });
  it('tolerates a response without a deployments array', async () => {
    const f = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('/v9/') ? { targets: { production: { id: 'dpl_1' } } } : {}),
    })) as unknown as typeof fetch;
    expect(
      (await loadState({ token: 't', projectId: 'p', teamId: 't', fetchImpl: f })).deployments
    ).toEqual([]);
  });
  it('fails when no production deployment is live', async () => {
    await expect(
      loadState({ token: 't', projectId: 'p', teamId: 't', fetchImpl: stubFetch(undefined) })
    ).rejects.toThrow(/no live production deployment/);
    const empty = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    await expect(
      loadState({ token: 't', projectId: 'p', teamId: 't', fetchImpl: empty })
    ).rejects.toThrow(/no live production deployment/);
  });
});

describe('runResolve', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-'));

  it('writes the summary and step outputs and returns the pick', async () => {
    const dir = tmp();
    const env = {
      ...baseEnv,
      DRY_RUN: 'true',
      GITHUB_STEP_SUMMARY: path.join(dir, 's.md'),
      GITHUB_OUTPUT: path.join(dir, 'o.txt'),
    };
    const log = vi.fn();
    const res = await runResolve(env, { fetchImpl: stubFetch('dpl_5'), log });
    expect(res.target.uid).toBe('dpl_4');
    expect(res.dryRun).toBe(true);
    expect(fs.readFileSync(env.GITHUB_OUTPUT, 'utf8')).toBe(
      'current_id=dpl_5\ntarget_id=dpl_4\ntarget_url=app-4-team.vercel.app\n'
    );
    expect(fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain('bad release');
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain(baseEnv.VERCEL_TOKEN);
  });

  it('works without GitHub files, an unlisted current deployment, and the default logger', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = { ...baseEnv, DRY_RUN: 'false', ROLLBACK_TARGET: 'dpl_3', GITHUB_ACTOR: undefined };
    const res = await runResolve(env, { fetchImpl: stubFetch('dpl_999') });
    expect(res).toMatchObject({ currentId: 'dpl_999', dryRun: false });
    expect(res.target.uid).toBe('dpl_3');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('refuses to run without required configuration', async () => {
    await expect(
      runResolve(
        { ...baseEnv, VERCEL_TOKEN: '', ROLLBACK_REASON: ' ' },
        { fetchImpl: stubFetch('dpl_5') }
      )
    ).rejects.toThrow('Missing required environment: VERCEL_TOKEN, ROLLBACK_REASON');
  });
});

describe('runVerify', () => {
  const env = { ...baseEnv, EXPECTED_ID: 'dpl_4' };

  it('passes when production is the target', async () => {
    const log = vi.fn();
    await expect(runVerify(env, { fetchImpl: stubFetch('dpl_4'), log })).resolves.toBe(true);
    expect(log).toHaveBeenCalledWith('Verified: production now serves "dpl_4".');
  });

  it('retries until production flips', async () => {
    const calls: string[] = ['dpl_5', 'dpl_5', 'dpl_4'];
    const f = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes('/v9/projects/')
          ? { targets: { production: { id: calls.shift() ?? 'dpl_4' } } }
          : { deployments: list },
    })) as unknown as typeof fetch;
    const sleep = vi.fn(async () => {});
    await expect(runVerify(env, { fetchImpl: f, log: vi.fn(), sleep })).resolves.toBe(true);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('fails loudly when production never flips', async () => {
    const sleep = vi.fn(async () => {});
    await expect(
      runVerify(env, { fetchImpl: stubFetch('dpl_5'), log: vi.fn(), sleep, attempts: 3 })
    ).rejects.toThrow('Rollback NOT verified: production is "dpl_5", expected "dpl_4".');
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('requires EXPECTED_ID', async () => {
    await expect(runVerify(baseEnv, { fetchImpl: stubFetch('dpl_4') })).rejects.toThrow(
      'EXPECTED_ID'
    );
  });

  it('uses real timers and logger by default', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const p = runVerify(env, { fetchImpl: stubFetch('dpl_5'), attempts: 2 });
    const assertion = expect(p).rejects.toThrow(/NOT verified/);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    spy.mockRestore();
    vi.useRealTimers();
  });
});

describe('main', () => {
  it('dispatches subcommands', async () => {
    vi.stubGlobal('fetch', stubFetch('dpl_5'));
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await main(['resolve'], { ...baseEnv, DRY_RUN: 'true' });
    expect((res as { target: { uid: string } }).target.uid).toBe('dpl_4');
    vi.stubGlobal('fetch', stubFetch('dpl_4'));
    await expect(main(['verify'], { ...baseEnv, EXPECTED_ID: 'dpl_4' })).resolves.toBe(true);
    spy.mockRestore();
  });
  it('rejects unknown subcommands', async () => {
    await expect(main(['nope'], {})).rejects.toThrow(/Usage/);
    await expect(main([], {})).rejects.toThrow(/Usage/);
  });
});

describe('forLog', () => {
  it('neutralises CR/LF and other control characters, then JSON-encodes', () => {
    const forged = 'rollback ok\r\n::error::fake line\u0007';
    const out = forLog(forged);
    for (const code of [13, 10, 7]) expect(out.includes(String.fromCharCode(code))).toBe(false);
    expect(out).toBe('"rollback ok  ::error::fake line "');
    expect(JSON.parse(out)).toBe('rollback ok  ::error::fake line ');
  });

  it('handles missing values', () => {
    expect(forLog(undefined)).toBe('""');
    expect(forLog(null)).toBe('""');
    expect(forLog(42)).toBe('"42"');
  });
});
