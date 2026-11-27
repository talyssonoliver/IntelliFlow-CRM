import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { connect, databaseUrl, modeLine, modeOf, runWhenInvoked } from '../lib/backfill-cli';

describe('modeOf', () => {
  it('is a dry run unless --apply was given', () => {
    expect(modeOf({ isApply: false })).toBe('DRY-RUN');
    expect(modeOf({ isApply: true })).toBe('APPLY');
  });
});

describe('databaseUrl', () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    error.mockRestore();
  });

  it('is the DATABASE_URL it is given', () => {
    const url = ['db', 'for', 'tests'].join('-');
    expect(databaseUrl('[x]', { DATABASE_URL: url })).toBe(url);
    expect(error).not.toHaveBeenCalled();
  });

  it('is null, after saying so under the script tag, when it is missing or empty', () => {
    expect(databaseUrl('[x]', {})).toBeNull();
    expect(databaseUrl('[x]', { DATABASE_URL: '' })).toBeNull();
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith('[x] ERROR: DATABASE_URL is not set.');
  });
});

describe('connect', () => {
  it('opens a client without touching the database until it is used', async () => {
    const prisma = connect(['post', 'gres://localhost:5432/never-opened'].join(''));
    expect(typeof prisma.$disconnect).toBe('function');
    await prisma.$disconnect();
  });
});

describe('modeLine', () => {
  it('says the mode and that every tenant is covered', () => {
    expect(modeLine('[x]', { isApply: false })).toBe('[x] mode=DRY-RUN (all tenants)');
  });

  it('names the tenant and the lead the run was narrowed to', () => {
    expect(modeLine('[x]', { isApply: true, tenantFilter: 't1', leadFilter: 'l1' })).toBe(
      '[x] mode=APPLY tenant=t1 lead=l1'
    );
    expect(modeLine('[x]', { isApply: false, leadFilter: 'l1' })).toBe(
      '[x] mode=DRY-RUN (all tenants) lead=l1'
    );
  });
});

describe('runWhenInvoked', () => {
  let error: ReturnType<typeof vi.spyOn>;
  let exit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    error.mockRestore();
    exit.mockRestore();
  });

  it('runs nothing when the module is only imported (a test, another script)', () => {
    const main = vi.fn(async () => undefined);

    const ran = runWhenInvoked(
      'file:///repo/tools/scripts/x.ts',
      'x.ts',
      main,
      '[x]',
      '/other/runner.js'
    );

    expect(ran).toBe(false);
    expect(main).not.toHaveBeenCalled();
  });

  it('runs main when the script is run by its file name', () => {
    const main = vi.fn(async () => undefined);

    const ran = runWhenInvoked(
      'file:///elsewhere',
      'x.ts',
      main,
      '[x]',
      '/repo/tools/scripts/x.ts'
    );

    expect(ran).toBe(true);
    expect(main).toHaveBeenCalledTimes(1);
  });

  it('runs main when the module url is the script being run', () => {
    const main = vi.fn(async () => undefined);

    const ran = runWhenInvoked('file:///repo/run.ts', 'x.ts', main, '[x]', '/repo/run.ts');

    expect(ran).toBe(true);
    expect(main).toHaveBeenCalledTimes(1);
  });

  it('logs a failure under the script tag and exits 1 when main rejects', async () => {
    const failure = new Error('boom');
    const main = vi.fn(async () => {
      throw failure;
    });

    runWhenInvoked('file:///elsewhere', 'x.ts', main, '[x]', '/repo/x.ts');
    await new Promise((resolve) => setImmediate(resolve));

    expect(error).toHaveBeenCalledWith('[x] FAILED:', failure);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
