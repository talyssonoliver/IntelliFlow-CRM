/**
 * IFC-142: the daily production database backup (tools/scripts/backup-intelliflow-db.mjs).
 * No Docker and no database: the docker calls, the relay and the clock are injected.
 */
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXCLUDED_DATA,
  backupFreshness,
  check,
  IMAGE,
  REQUIRED_DATA,
  dumpName,
  expiredDumps,
  libpqEnv,
  parseArgs,
  pgDumpArgs,
  resolveDatabaseUrl,
  run,
  tablesWithData,
} from '../backup-intelliflow-db.mjs';

// Built from parts at runtime on a reserved host: no credential-shaped literal is committed.
const SECRET = 'p'.repeat(12);
const URL_ = ['post', 'gres://', 'backup_ro:', SECRET, '@db.example.invalid:5432/postgres'].join(
  ''
);

const toc = (tables: string[]) =>
  tables.map((t, i) => `${100 + i}; 0 0 TABLE DATA ${t.replace('.', ' ')} owner`).join('\n');

function fakes(opts: { dockerUp?: boolean; dumpStatus?: number; listTables?: string[] } = {}) {
  const calls: { args: string[]; env?: Record<string, string | undefined> }[] = [];
  let relayClosed = false;
  const probe = () => ({ status: opts.dockerUp === false ? 1 : 0, stdout: '29.8.2', stderr: '' });
  const exec = async (_cmd: string, args: string[], o: { env?: Record<string, string> } = {}) => {
    calls.push({ args, env: o.env });
    if (args.includes('pg_dump')) {
      const file = args.find((a) => a.startsWith('--file='))!.slice('--file=/backup/'.length);
      const mount = args[args.indexOf('-v') + 1]!.replace(/:\/backup$/, '');
      if ((opts.dumpStatus ?? 0) === 0) writeFileSync(join(mount, file), 'PGDMP');
      return { status: opts.dumpStatus ?? 0, stdout: '', stderr: 'pg_dump: error: boom' };
    }
    return {
      status: 0,
      stdout: toc(opts.listTables ?? [...REQUIRED_DATA, 'public.contacts']),
      stderr: '',
    };
  };
  const relay = async () => ({ port: 54321, close: () => (relayClosed = true) });
  return { calls, probe, exec, relay, relayClosed: () => relayClosed };
}

const lastLog = (root: string) => {
  const lines = readFileSync(join(root, 'logs', 'backup-intelliflow.jsonl'), 'utf8')
    .trim()
    .split('\n');
  return JSON.parse(lines[lines.length - 1]!);
};

describe('pure helpers', () => {
  it('splits the URL into libpq variables with a read-only session and TLS', () => {
    expect(libpqEnv(URL_)).toEqual({
      PGHOST: 'db.example.invalid',
      PGPORT: '5432',
      PGUSER: 'backup_ro',
      PGPASSWORD: SECRET,
      PGDATABASE: 'postgres',
      PGSSLMODE: 'require',
      PGOPTIONS: '-c default_transaction_read_only=on',
    });
    expect(libpqEnv(URL_.replace('db.example.invalid', 'localhost')).PGSSLMODE).toBe('disable');
    expect(() => libpqEnv('mysql://x@y/z')).toThrow('not a postgres URL');
  });

  it('dumps the three schemas, custom format, with the excluded table data left out', () => {
    const args = pgDumpArgs('/backup/x.partial');
    expect(args).toContain('--format=custom');
    expect(args.filter((a) => a.startsWith('--schema='))).toEqual([
      '--schema=public',
      '--schema=auth',
      '--schema=storage',
    ]);
    expect(args.filter((a) => a.startsWith('--exclude-table-data='))).toHaveLength(
      EXCLUDED_DATA.length
    );
    expect(args.join(' ')).not.toMatch(/postgres:\/\//);
  });

  it('keeps every AI insight table (owner, 2026-11-12) and excludes only telemetry and ephemeral data', () => {
    expect(EXCLUDED_DATA.some((t) => /insight|health_scores/.test(t))).toBe(false);
    expect(EXCLUDED_DATA).toContain('public.ai_monitoring_events');
    expect(EXCLUDED_DATA).toContain('auth.refresh_tokens');
  });

  it('reads TABLE DATA entries from pg_restore --list', () => {
    expect([
      ...tablesWithData(`${toc(['public.leads'])}\n12; 0 0 TABLE public leads owner`),
    ]).toEqual(['public.leads']);
  });

  it('expires only dated dumps past the retention', () => {
    const now = new Date('2026-11-20T03:30:00Z');
    expect(
      expiredDumps(
        [
          'intelliflow-2026-11-05.dump',
          'intelliflow-2026-11-06.dump',
          'intelliflow-2026-11-01.dump.partial',
          'notes.txt',
        ],
        now,
        14
      )
    ).toEqual(['intelliflow-2026-11-05.dump', 'intelliflow-2026-11-01.dump.partial']);
  });

  it('parses --root and --retention-days, and names dumps by UTC date', () => {
    expect(parseArgs(['node', 's', '--retention-days', '7']).retentionDays).toBe(7);
    expect(dumpName(new Date('2026-11-12T23:59:00Z'))).toBe('intelliflow-2026-11-12.dump');
  });

  it('resolves credentials env first, then the ops file, then .env.local', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifc142-env-'));
    const ops = join(dir, 'backup.env');
    const local = join(dir, '.env.local');
    writeFileSync(local, `DATABASE_URL="${URL_}"\n`);
    expect(resolveDatabaseUrl({}, { ops, envLocal: local }).source).toBe('.env.local DATABASE_URL');
    writeFileSync(local, `DATABASE_URL=a\nDIRECT_URL=${URL_}\n`);
    expect(resolveDatabaseUrl({}, { ops, envLocal: local }).source).toBe('.env.local DIRECT_URL');
    writeFileSync(ops, `# comment\nINTELLIFLOW_BACKUP_DATABASE_URL='${URL_}'\n`);
    expect(resolveDatabaseUrl({}, { ops, envLocal: local })).toEqual({
      url: URL_,
      source: 'ops backup.env',
    });
    expect(
      resolveDatabaseUrl({ INTELLIFLOW_BACKUP_DATABASE_URL: URL_ }, { ops, envLocal: local }).source
    ).toBe('env INTELLIFLOW_BACKUP_DATABASE_URL');
    expect(
      resolveDatabaseUrl({}, { ops: join(dir, 'none'), envLocal: join(dir, 'none') }).url
    ).toBeUndefined();
  });
});

describe('run', () => {
  const quiet = () => {};
  const base = (root: string, extra: string[] = []) => ({
    argv: ['node', 's', '--root', root, ...extra],
    env: { INTELLIFLOW_BACKUP_DATABASE_URL: URL_ },
    now: new Date('2026-11-12T03:30:00Z'),
    log: quiet,
  });

  it('writes a verified dump through the relay, never puts credentials on a command line, and logs SUCCESS', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ifc142-run-'));
    const f = fakes();
    const r = await run({ ...base(root), probe: f.probe, exec: f.exec, relay: f.relay });

    expect(r.result).toBe('SUCCESS');
    expect(existsSync(join(root, 'archives', 'intelliflow-2026-11-12.dump'))).toBe(true);
    expect(readdirSync(join(root, 'archives')).some((n) => n.endsWith('.partial'))).toBe(false);
    const dump = f.calls[0]!;
    expect(dump.args).toContain(IMAGE);
    expect(dump.args).toContain('--add-host=host.docker.internal:host-gateway');
    expect(dump.args.join(' ')).not.toContain(SECRET);
    expect(dump.env).toMatchObject({
      PGHOST: 'host.docker.internal',
      PGPORT: '54321',
      PGPASSWORD: SECRET,
    });
    expect(f.relayClosed()).toBe(true);
    const line = lastLog(root);
    expect(line).toMatchObject({
      result: 'SUCCESS',
      tablesWithData: 5,
      credentials: 'env INTELLIFLOW_BACKUP_DATABASE_URL',
    });
    expect(JSON.stringify(line)).not.toContain(SECRET);
  });

  it('fails with a log line when Docker is not running', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ifc142-run-'));
    const f = fakes({ dockerUp: false });
    const r = await run({ ...base(root), probe: f.probe, exec: f.exec, relay: f.relay });
    expect(r.result).toBe('FAILURE');
    expect(lastLog(root).reason).toMatch(/^Docker is not running/);
    expect(f.calls).toEqual([]);
  });

  it('fails without credentials, and on a bad retention', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ifc142-run-'));
    const f = fakes();
    expect(
      (
        await run({
          ...base(root, ['--retention-days', '0']),
          probe: f.probe,
          exec: f.exec,
          relay: f.relay,
        })
      ).result
    ).toBe('FAILURE');
    expect(lastLog(root).reason).toContain('invalid --retention-days');
  });

  it('removes the partial file and logs FAILURE when pg_dump fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ifc142-run-'));
    const f = fakes({ dumpStatus: 1 });
    const r = await run({ ...base(root), probe: f.probe, exec: f.exec, relay: f.relay });
    expect(r.result).toBe('FAILURE');
    expect(lastLog(root).reason).toContain('pg_dump failed (exit 1: pg_dump: error: boom)');
    expect(readdirSync(join(root, 'archives'))).toEqual([]);
    expect(f.relayClosed()).toBe(true);
  });

  it('rejects a dump that lacks core data or carries excluded data', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ifc142-run-'));
    const f = fakes({ listTables: ['public.users', 'auth.refresh_tokens'] });
    const r = await run({ ...base(root), probe: f.probe, exec: f.exec, relay: f.relay });
    expect(r.result).toBe('FAILURE');
    expect(lastLog(root).reason).toMatch(
      /missing data public\.tenants,public\.leads,auth\.users; excluded data present auth\.refresh_tokens/
    );
    expect(readdirSync(join(root, 'archives'))).toEqual([]);
  });

  it('prunes dumps older than the retention after a good run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ifc142-run-'));
    const f = fakes();
    await run({ ...base(root), probe: f.probe, exec: f.exec, relay: f.relay });
    writeFileSync(join(root, 'archives', 'intelliflow-2026-10-01.dump'), 'old');
    const r = await run({ ...base(root), probe: f.probe, exec: f.exec, relay: f.relay });
    expect(r).toMatchObject({ result: 'SUCCESS', pruned: ['intelliflow-2026-10-01.dump'] });
  });
});

describe('--check (ops watch)', () => {
  const line = (o: object) => JSON.stringify(o);
  const now = new Date('2026-11-14T09:00:00Z');

  it('is fresh when the newest SUCCESS is within 36 hours, ignoring failures and STALE lines', () => {
    const text = [
      line({ result: 'SUCCESS', finishedAt: '2026-11-12T03:30:15Z' }),
      line({ result: 'SUCCESS', finishedAt: '2026-11-13T03:30:15Z' }),
      line({ result: 'FAILURE', finishedAt: '2026-11-14T03:30:02Z' }),
      line({ check: true, result: 'STALE', at: '2026-11-14T08:00:00Z' }),
      'not json',
    ].join('\n');
    const f = backupFreshness(text, now);
    expect(f).toMatchObject({ fresh: true, lastSuccessAt: '2026-11-13T03:30:15Z' });
    expect(f.ageHours).toBeCloseTo(29.5, 1);
  });

  it('is stale past 36 hours or with no success at all', () => {
    expect(
      backupFreshness(line({ result: 'SUCCESS', finishedAt: '2026-11-12T20:00:00Z' }), now).fresh
    ).toBe(false);
    expect(backupFreshness('', now)).toEqual({ fresh: false, lastSuccessAt: null, ageHours: null });
  });

  it('appends a STALE line and reports STALE; writes nothing when fresh', () => {
    const root = mkdtempSync(join(tmpdir(), 'ifc142-check-'));
    const argv = ['node', 's', '--check', '--root', root];
    expect(check({ argv, now, log: () => {} }).result).toBe('STALE');
    expect(lastLog(root)).toMatchObject({
      check: true,
      result: 'STALE',
      lastSuccessAt: null,
      maxHours: 36,
    });

    writeFileSync(
      join(root, 'logs', 'backup-intelliflow.jsonl'),
      line({ result: 'SUCCESS', finishedAt: '2026-11-14T03:30:00Z' }) + '\n'
    );
    expect(check({ argv, now, log: () => {} }).result).toBe('FRESH');
    expect(
      readFileSync(join(root, 'logs', 'backup-intelliflow.jsonl'), 'utf8')
        .trim()
        .split('\n')
    ).toHaveLength(1);
  });
});
