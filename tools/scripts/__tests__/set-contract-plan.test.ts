import { describe, expect, it, vi } from 'vitest';
import { main, setContractPlan, type ContractPlanDb } from '../set-contract-plan';

const LOCAL = { host: 'localhost:5433', local: true };
const REMOTE = { host: 'db.example.invalid', local: false };

function fakeDb(opts: { plan?: string; liveSubs?: number; enabled?: string[] } = {}) {
  const transaction = vi.fn(async (ops: unknown[]) => ops);
  const db = {
    tenant: {
      findUnique: vi.fn(async () => ({
        id: 't1',
        slug: 'acme',
        name: 'Acme',
        plan: opts.plan ?? 'PROFESSIONAL',
        trialEndsAt: new Date('2026-11-22T00:00:00Z'),
      })),
      update: vi.fn((args: unknown) => ({ op: 'tenant.update', args })),
    },
    stripeSubscription: { count: vi.fn(async () => opts.liveSubs ?? 0) },
    tenantModule: {
      findMany: vi.fn(async () => (opts.enabled ?? ['CORE_CRM']).map((moduleId) => ({ moduleId }))),
      upsert: vi.fn((args: unknown) => ({ op: 'tenantModule.upsert', args })),
    },
    $transaction: transaction,
  };
  return { db: db as unknown as ContractPlanDb, raw: db };
}

describe('setContractPlan', () => {
  it('dry run reports the change and writes nothing', async () => {
    const { db, raw } = fakeDb();
    const result = await setContractPlan(db, { tenantId: 't1', apply: false, target: LOCAL });

    expect(result.changed).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.modulesToEnable).toContain('COMMERCE');
    expect(result.lines.join('\n')).toMatch(/PROFESSIONAL -> CUSTOM/);
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it('writes the plan and every plan module in one transaction', async () => {
    const { db, raw } = fakeDb();
    const result = await setContractPlan(db, { tenantId: 't1', apply: true, target: LOCAL });

    expect(result.applied).toBe(true);
    expect(raw.$transaction).toHaveBeenCalledTimes(1);
    expect(raw.tenant.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { plan: 'CUSTOM' },
    });
    expect(raw.tenantModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_moduleId: { tenantId: 't1', moduleId: 'COMMERCE' } },
      })
    );
  });

  it('refuses a workspace with a live Stripe subscription', async () => {
    const { db } = fakeDb({ liveSubs: 1 });
    await expect(
      setContractPlan(db, { tenantId: 't1', apply: false, target: LOCAL })
    ).rejects.toThrow(/live Stripe subscription/);
  });

  it('refuses to write to a non-local database without the explicit opt-in', async () => {
    const { db, raw } = fakeDb();
    vi.stubEnv('ALLOW_PROD_DB_OPS', '');
    await expect(
      setContractPlan(db, { tenantId: 't1', apply: true, target: REMOTE })
    ).rejects.toThrow(/Refusing to write/);
    expect(raw.$transaction).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('does nothing when the tenant is already on the contract plan with its modules', async () => {
    const all = ['CORE_CRM', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS', 'LEGAL', 'COMMERCE'];
    const { db, raw } = fakeDb({ plan: 'CUSTOM', enabled: all });
    const result = await setContractPlan(db, { tenantId: 't1', apply: true, target: LOCAL });

    expect(result.changed).toBe(false);
    expect(raw.$transaction).not.toHaveBeenCalled();
  });
});

describe('set-contract-plan command line', () => {
  const LOCAL_URL = ['post', 'gres://', 'localhost:5433/test'].join('');

  function deps(db: ContractPlanDb) {
    const disconnect = vi.fn(async () => {});
    return {
      disconnect,
      log: vi.fn(),
      error: vi.fn(),
      createDb: vi.fn(async () => Object.assign(db, { $disconnect: disconnect })),
    };
  }

  it('prints the usage and exits 1 without a tenant or a database URL', async () => {
    const d = deps(fakeDb().db);
    expect(await main(['--apply'], { DATABASE_URL: LOCAL_URL }, d)).toBe(1);
    expect(await main(['--tenant', 't1'], {}, d)).toBe(1);
    expect(d.error).toHaveBeenCalledWith(expect.stringMatching(/^Usage:/));
    expect(d.createDb).not.toHaveBeenCalled();
  });

  it('runs a dry run, prints each line and disconnects', async () => {
    const { db, raw } = fakeDb();
    const d = deps(db);
    expect(await main(['--tenant', 't1'], { DATABASE_URL: LOCAL_URL }, d)).toBe(0);
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/PROFESSIONAL -> CUSTOM/));
    expect(raw.$transaction).not.toHaveBeenCalled();
    expect(d.disconnect).toHaveBeenCalledTimes(1);
  });

  it('applies with --apply on a local database', async () => {
    const { db, raw } = fakeDb();
    const d = deps(db);
    expect(await main(['--tenant', 't1', '--apply'], { DATABASE_URL: LOCAL_URL }, d)).toBe(0);
    expect(raw.$transaction).toHaveBeenCalledTimes(1);
  });

  it('reports a refusal, exits 1 and still disconnects', async () => {
    const d = deps(fakeDb({ liveSubs: 1 }).db);
    expect(await main(['--tenant', 't1'], { DATABASE_URL: LOCAL_URL }, d)).toBe(1);
    expect(d.error).toHaveBeenCalledWith(expect.stringMatching(/live Stripe subscription/));
    expect(d.disconnect).toHaveBeenCalledTimes(1);
  });

  it('prints a thrown value that is not an Error', async () => {
    const { db, raw } = fakeDb();
    raw.tenant.findUnique.mockRejectedValueOnce('connection refused');
    const d = deps(db);
    expect(await main(['--tenant', 't1'], { DATABASE_URL: LOCAL_URL }, d)).toBe(1);
    expect(d.error).toHaveBeenCalledWith('connection refused');
  });
});
