/**
 * PG-196 Account Tiers — Real-Database Integration Test
 *
 * The migration `20261007120000_account_tiers` enforces the single-row tier
 * rules in Postgres (colour palette, non-negative minimum revenue, key format,
 * reserved UNKNOWN key, label length, benefit cap) plus tenant isolation (RLS
 * with USING and WITH CHECK) and tenant cascade. A mocked Prisma client cannot
 * prove any of that, so these assertions run against the real schema.
 *
 * It also proves the router's write sequence is swap-safe: deleting a tenant's
 * tiers and recreating them inside one transaction lets two tiers exchange
 * thresholds without tripping the (tenantId, minRevenue) unique index.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { ACCOUNT_TIER_COLOR_TOKENS } from '../../packages/validators/src/account-tiers';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('⏭️  Skipping account-tiers integration test: DATABASE_URL not set');
}

const TAG = `acctiers_${Date.now()}`;

describeDb('Account tiers schema (PG-196)', () => {
  let prisma: any;
  let tenantId: string;
  let seq = 0;

  const definition = (overrides: Record<string, unknown> = {}) => ({
    tenantId,
    key: `TIER_${seq++}`,
    label: `Tier ${seq}`,
    minRevenue: seq * 1000,
    colorToken: 'slate',
    benefits: [],
    ...overrides,
  });

  const create = (overrides: Record<string, unknown> = {}) =>
    prisma.accountTierDefinition.create({ data: definition(overrides) });

  let dbReady = false;

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    const tenant = await prisma.tenant.create({ data: { name: TAG, slug: TAG } });
    tenantId = tenant.id;
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) await prisma.tenant.deleteMany({ where: { slug: { startsWith: TAG } } });
    await prisma.$disconnect();
  });

  it('accepts every colour of the shared tier palette', async () => {
    for (const colorToken of ACCOUNT_TIER_COLOR_TOKENS) {
      await expect(create({ colorToken })).resolves.toMatchObject({ colorToken });
    }
  });

  it('rejects a colour outside the palette', async () => {
    await expect(create({ colorToken: 'chartreuse' })).rejects.toThrow();
  });

  it('rejects a negative minimum revenue', async () => {
    await expect(create({ minRevenue: -1 })).rejects.toThrow();
  });

  it('rejects the reserved UNKNOWN key and malformed keys', async () => {
    await expect(create({ key: 'UNKNOWN' })).rejects.toThrow();
    await expect(create({ key: 'lower' })).rejects.toThrow();
  });

  it('rejects an empty label and a label over 40 characters', async () => {
    await expect(create({ label: '' })).rejects.toThrow();
    await expect(create({ label: 'x'.repeat(41) })).rejects.toThrow();
  });

  it('rejects more than 12 benefits', async () => {
    const benefits = Array.from({ length: 13 }, (_, i) => `Benefit ${i}`);
    await expect(create({ benefits })).rejects.toThrow();
  });

  it('rejects a duplicate key and a duplicate minimum revenue within a tenant', async () => {
    const first = await create();
    await expect(create({ key: first.key })).rejects.toThrow();
    await expect(create({ minRevenue: first.minRevenue })).rejects.toThrow();
  });

  it('rejects a malformed default tier key in the tenant configuration', async () => {
    const other = await prisma.tenant.create({ data: { name: `${TAG}-cfg`, slug: `${TAG}-cfg` } });
    await expect(
      prisma.accountTierConfig.create({ data: { tenantId: other.id, defaultTierKey: 'smb' } })
    ).rejects.toThrow();
    await expect(
      prisma.accountTierConfig.create({ data: { tenantId: other.id, defaultTierKey: 'SMB' } })
    ).resolves.toMatchObject({ defaultTierKey: 'SMB', notifyOwnerOnUpgrade: false });
  });

  it('lets two tiers swap thresholds via delete-and-recreate in one transaction', async () => {
    const swap = await prisma.tenant.create({ data: { name: `${TAG}-swap`, slug: `${TAG}-swap` } });
    const rows = [
      { tenantId: swap.id, key: 'LOW', label: 'Low', minRevenue: 0, colorToken: 'slate' },
      { tenantId: swap.id, key: 'MID', label: 'Mid', minRevenue: 100, colorToken: 'blue' },
      { tenantId: swap.id, key: 'HIGH', label: 'High', minRevenue: 200, colorToken: 'green' },
    ];
    await prisma.accountTierDefinition.createMany({ data: rows });

    const swappedMin: Record<string, number> = { MID: 200, HIGH: 100 };
    const swapped = rows.map((r) => ({ ...r, minRevenue: swappedMin[r.key] ?? r.minRevenue }));
    await prisma.$transaction([
      prisma.accountTierDefinition.deleteMany({ where: { tenantId: swap.id } }),
      prisma.accountTierDefinition.createMany({ data: swapped }),
    ]);

    const after = await prisma.accountTierDefinition.findMany({
      where: { tenantId: swap.id },
      orderBy: { minRevenue: 'asc' },
    });
    expect(after.map((r: { key: string }) => r.key)).toEqual(['LOW', 'HIGH', 'MID']);
  });

  it('cascades tier rows and configuration when the tenant is deleted', async () => {
    const doomed = await prisma.tenant.create({
      data: { name: `${TAG}-gone`, slug: `${TAG}-gone` },
    });
    await prisma.accountTierDefinition.create({
      data: { tenantId: doomed.id, key: 'ONLY', label: 'Only', minRevenue: 0 },
    });
    await prisma.accountTierConfig.create({ data: { tenantId: doomed.id } });

    await prisma.tenant.delete({ where: { id: doomed.id } });

    expect(await prisma.accountTierDefinition.count({ where: { tenantId: doomed.id } })).toBe(0);
    expect(await prisma.accountTierConfig.count({ where: { tenantId: doomed.id } })).toBe(0);
  });

  it('has a tenant-isolation RLS policy with WITH CHECK on both tables', async () => {
    const policies: Array<{ tablename: string; has_using: boolean; has_check: boolean }> =
      await prisma.$queryRaw`
        SELECT tablename, qual IS NOT NULL AS has_using, with_check IS NOT NULL AS has_check
        FROM pg_policies
        WHERE tablename IN ('account_tier_definitions', 'account_tier_config')
        ORDER BY tablename`;
    expect(policies).toEqual([
      { tablename: 'account_tier_config', has_using: true, has_check: true },
      { tablename: 'account_tier_definitions', has_using: true, has_check: true },
    ]);
    const rls: Array<{ relname: string; relrowsecurity: boolean }> = await prisma.$queryRaw`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relname IN ('account_tier_definitions', 'account_tier_config')
      ORDER BY relname`;
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
  });
});
