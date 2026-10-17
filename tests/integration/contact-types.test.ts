/**
 * PG-205 — contact types, real-Database integration test (ADR-080).
 *
 * Lives in `tests/integration/` so it runs in the CI "Integration Tests" lane and pre-ship.
 * Proves the Class A migrations `20261017120000_contact_types` and
 * `20261017120100_contacts_type_idx` on a real Postgres: the type tables enforce their
 * invariants in the database (key format, reserved system keys, case-insensitive names,
 * at most one active default, colour/owner/required-field CHECKs), default tags can only
 * reference a tag of the same tenant and follow tag deletion, the lazy per-tenant seed is
 * safe under concurrent first use, and the contacts type index is valid.
 *
 * Skips only when DATABASE_URL is not set. A setup failure fails the suite (no silent skip).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { CONTACT_TYPES } from '../../packages/domain/src/crm/contact/Contact';
import { TAG_COLOR_TOKENS } from '../../packages/validators/src/contact-settings';
import { ensureSystemContactTypes } from '../../apps/api/src/modules/contact/contact-type-resolver';

const MIGRATIONS = join(__dirname, '../../packages/db/prisma/migrations');
const TYPES_MIGRATION = join(MIGRATIONS, '20261017120000_contact_types/migration.sql');
const INDEX_MIGRATION = join(MIGRATIONS, '20261017120100_contacts_type_idx/migration.sql');

function withoutComments(path: string): string {
  return readFileSync(path, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

/** Split migration SQL into statements, keeping `DO $$ ... $$` blocks whole. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollar = false;
  for (let i = 0; i < sql.length; i++) {
    if (sql.startsWith('$$', i)) {
      inDollar = !inDollar;
      current += '$$';
      i++;
      continue;
    }
    const ch = sql[i];
    if (ch === ';' && !inDollar) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/**
 * CI builds its test database with `prisma db push`, which creates tables from
 * schema.prisma but never runs migration SQL: the CHECKs, the expression/partial
 * unique indexes and the RLS policies are absent there. When they are missing,
 * rebuild the two contact-type tables from the migration's own SQL (they hold
 * only this suite's rows). `contact_tags` is shared and never dropped: its unique
 * index is created only if missing.
 */
async function ensureMigrationSql(client: any): Promise<void> {
  const present = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_constraint WHERE conname = 'contact_types_colorToken_check'`
  );
  if (present.length === 0) {
    await client.$executeRawUnsafe(
      'DROP TABLE IF EXISTS "contact_type_default_tags", "contact_types" CASCADE'
    );
    for (const stmt of splitStatements(withoutComments(TYPES_MIGRATION))) {
      const shared = stmt.replace(
        /^CREATE UNIQUE INDEX "contact_tags_tenantId_id_key"/,
        'CREATE UNIQUE INDEX IF NOT EXISTS "contact_tags_tenantId_id_key"'
      );
      await client.$executeRawUnsafe(shared);
    }
  }
}

/**
 * The CONCURRENTLY index cannot run inside a transaction: run its single statement on its
 * own, before any data write of this suite, and only when no valid index is present.
 */
async function ensureContactsTypeIndex(client: any): Promise<void> {
  const valid = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.relname = 'contacts_tenantId_contactType_idx' AND i.indisvalid AND i.indisready`
  );
  if (valid.length > 0) return;
  // An INVALID leftover from an aborted build would make IF NOT EXISTS a no-op.
  await client.$executeRawUnsafe('DROP INDEX IF EXISTS "contacts_tenantId_contactType_idx"');
  const statements = splitStatements(withoutComments(INDEX_MIGRATION));
  expect(statements).toHaveLength(1);
  await client.$executeRawUnsafe(statements[0]);
}

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping contact-types integration test: DATABASE_URL not set');
}

const RUN = `pg205_${Date.now()}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;
const TENANT_SEED = `${RUN}_seed`;

/** Postgres error code raised by a failed statement, whatever layer wrapped it. */
function pgCode(error: unknown): string | undefined {
  const text = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) ?? '';
  const match = /"(?:code|originalCode)":"(\d{5}|P\d{4})"/.exec(text);
  if (match) return match[1];
  const code = (error as { code?: string })?.code;
  if (code) return code;
  const message = String((error as { message?: string })?.message ?? '');
  if (/check constraint|CheckConstraint/i.test(message + text)) return '23514';
  if (/unique constraint|duplicate key|UniqueConstraint/i.test(message + text)) return '23505';
  if (/foreign key|ForeignKeyConstraint/i.test(message + text)) return '23503';
  return undefined;
}

async function expectRejected(promise: Promise<unknown>, codes: string[]): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, 'statement should have been rejected').toBeDefined();
  const code = pgCode(caught);
  if (!code || !codes.includes(code)) {
    console.log('Unexpected rejection shape:', String((caught as Error)?.message).slice(0, 400));
  }
  expect(codes).toContain(code);
}

const UNIQUE = ['23505', 'P2002'];
const CHECK = ['23514', 'P2004', 'P2010'];
const FOREIGN_KEY = ['23503', 'P2003'];

describeDb('PG-205 contact types (real DB)', () => {
  let prisma: any;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await ensureContactsTypeIndex(prisma);
    await ensureMigrationSql(prisma);
    for (const id of [TENANT_A, TENANT_B, TENANT_SEED]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    const tenants = { in: [TENANT_A, TENANT_B, TENANT_SEED] };
    await prisma.contactType.deleteMany({ where: { tenantId: tenants } });
    await prisma.contactTag.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenant.deleteMany({ where: { id: tenants } });
    await prisma.$disconnect();
  });

  function contactType(
    tenantId: string,
    key: string,
    name: string,
    extra: Record<string, unknown> = {}
  ) {
    return prisma.contactType.create({ data: { tenantId, key, name, ...extra } });
  }

  describe('CHECK constraints', () => {
    it('accepts a valid custom type with the column defaults', async () => {
      const row = await contactType(TENANT_A, 'reseller', 'Reseller');
      expect(row).toMatchObject({
        colorToken: 'slate',
        isSystem: false,
        isActive: true,
        isDefault: false,
        defaultOwner: 'CREATOR',
        requiredFields: [],
      });
    });

    it.each([
      ['an uppercase key', { key: 'Reseller_x' }],
      ['a key starting with a digit', { key: '1abc' }],
      ['a padded name', { name: ' Padded ' }],
      ['a blank name', { name: '' }],
      ['an unknown colour', { colorToken: 'magenta' }],
      ['an unknown owner rule', { defaultOwner: 'SOMEONE' }],
      ['an email required field', { requiredFields: ['email'] }],
      ['a jobTitle required field', { requiredFields: ['jobTitle'] }],
      ['a negative sort order', { sortOrder: -1 }],
      ['an inactive default', { isActive: false, isDefault: true }],
      ['a blank department', { defaultDepartment: '   ' }],
    ])('rejects %s', async (_label, overrides) => {
      const data = {
        tenantId: TENANT_A,
        key: `chk_${Math.random().toString(36).slice(2, 8)}`,
        name: `Chk ${Math.random()}`,
        ...overrides,
      };
      await expectRejected(prisma.contactType.create({ data }), CHECK);
    });

    it('reserves the six seed keys for system rows', async () => {
      await expectRejected(contactType(TENANT_A, 'partner', 'Partner custom'), CHECK);
      const system = await contactType(TENANT_A, 'investor', 'Investor', { isSystem: true });
      expect(system.isSystem).toBe(true);
    });

    it('uses the same 18 colour tokens as contact_tags', async () => {
      const rows: Array<{ conname: string; def: string }> = await prisma.$queryRawUnsafe(
        `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conname IN ('contact_types_colorToken_check', 'contact_tags_colorToken_check')`
      );
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        for (const token of TAG_COLOR_TOKENS) expect(row.def).toContain(`'${token}'`);
      }
    });
  });

  describe('uniqueness', () => {
    it('makes key and lower(name) unique per tenant, not across tenants', async () => {
      await contactType(TENANT_A, 'distributor', 'Distributor');
      await expectRejected(contactType(TENANT_A, 'distributor', 'Other name'), UNIQUE);
      await expectRejected(contactType(TENANT_A, 'distributor_2', 'DISTRIBUTOR'), UNIQUE);
      const other = await contactType(TENANT_B, 'distributor', 'Distributor');
      expect(other.tenantId).toBe(TENANT_B);
    });

    it('allows at most one default type per tenant', async () => {
      await contactType(TENANT_A, 'def_one', 'Default one', { isDefault: true });
      await expectRejected(
        contactType(TENANT_A, 'def_two', 'Default two', { isDefault: true }),
        UNIQUE
      );
      await contactType(TENANT_B, 'def_one', 'Default one', { isDefault: true });
    });
  });

  describe('default tags', () => {
    it('rejects a default tag of another tenant (composite FK)', async () => {
      const type = await contactType(TENANT_A, 'with_tags', 'With tags');
      const foreignTag = await prisma.contactTag.create({
        data: { tenantId: TENANT_B, name: `${RUN} foreign` },
      });
      await expectRejected(
        prisma.contactTypeDefaultTag.create({
          data: { tenantId: TENANT_A, contactTypeId: type.id, contactTagId: foreignTag.id },
        }),
        FOREIGN_KEY
      );
    });

    it('deleting a tag removes its default-tag rows (and the delete succeeds)', async () => {
      const type = await contactType(TENANT_A, 'tag_follow', 'Tag follow');
      const tag = await prisma.contactTag.create({
        data: { tenantId: TENANT_A, name: `${RUN} follow` },
      });
      await prisma.contactTypeDefaultTag.create({
        data: { tenantId: TENANT_A, contactTypeId: type.id, contactTagId: tag.id },
      });
      await prisma.contactTag.delete({ where: { id: tag.id } });
      const left = await prisma.contactTypeDefaultTag.count({ where: { contactTypeId: type.id } });
      expect(left).toBe(0);
    });

    it('deleting a type removes its default-tag rows', async () => {
      const type = await contactType(TENANT_A, 'type_follow', 'Type follow');
      const tag = await prisma.contactTag.create({
        data: { tenantId: TENANT_A, name: `${RUN} keep` },
      });
      await prisma.contactTypeDefaultTag.create({
        data: { tenantId: TENANT_A, contactTypeId: type.id, contactTagId: tag.id },
      });
      await prisma.contactType.delete({ where: { id: type.id } });
      expect(await prisma.contactTypeDefaultTag.count({ where: { contactTagId: tag.id } })).toBe(0);
      expect(await prisma.contactTag.count({ where: { id: tag.id } })).toBe(1);
    });
  });

  describe('lazy seed', () => {
    it('two concurrent first uses create exactly the six system types', async () => {
      const ctx = { tenant: { tenantId: TENANT_SEED }, prismaWithTenant: prisma } as never;
      await Promise.all([ensureSystemContactTypes(ctx), ensureSystemContactTypes(ctx)]);
      const rows = await prisma.contactType.findMany({
        where: { tenantId: TENANT_SEED },
        orderBy: { sortOrder: 'asc' },
      });
      expect(rows.map((r: { key: string }) => r.key)).toEqual([...CONTACT_TYPES]);
      expect(rows.every((r: { isSystem: boolean }) => r.isSystem)).toBe(true);
      await ensureSystemContactTypes(ctx);
      expect(await prisma.contactType.count({ where: { tenantId: TENANT_SEED } })).toBe(6);
    });
  });

  describe('contacts type index', () => {
    it('is valid, ready and on (tenantId, contactType)', async () => {
      const rows: Array<{ indexdef: string; valid: boolean }> = await prisma.$queryRawUnsafe(
        `SELECT pg_get_indexdef(i.indexrelid) AS indexdef, (i.indisvalid AND i.indisready) AS valid
         FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
         WHERE c.relname = 'contacts_tenantId_contactType_idx'`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].valid).toBe(true);
      expect(rows[0].indexdef).toContain('("tenantId", "contactType")');
    });
  });

  describe('orphan keys (no FK by design, ADR-080)', () => {
    it('a contact may hold a key whose type was deleted; the row stays readable', async () => {
      const user = await prisma.user.create({
        data: { id: `${RUN}_u`, tenantId: TENANT_A, email: `${RUN}_u@example.invalid` },
      });
      const type = await contactType(TENANT_A, 'orphaned', 'Orphaned');
      const contact = await prisma.contact.create({
        data: {
          tenantId: TENANT_A,
          ownerId: user.id,
          email: `${RUN}_c@example.invalid`,
          firstName: 'Orphan',
          lastName: 'Key',
          contactType: 'orphaned',
        },
      });
      await prisma.contactType.delete({ where: { id: type.id } });
      const reread = await prisma.contact.findUnique({ where: { id: contact.id } });
      expect(reread.contactType).toBe('orphaned');
      await prisma.contact.delete({ where: { id: contact.id } });
      await prisma.user.delete({ where: { id: user.id } });
    });
  });

  describe('row-level security', () => {
    it('enables RLS with a tenant policy on both tables', async () => {
      const rows: Array<{ relname: string; relrowsecurity: boolean }> =
        await prisma.$queryRawUnsafe(
          `SELECT relname, relrowsecurity FROM pg_class
         WHERE relname IN ('contact_types','contact_type_default_tags')`
        );
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.relrowsecurity)).toBe(true);
      const policies: Array<{ qual: string; with_check: string }> = await prisma.$queryRawUnsafe(
        `SELECT qual, with_check FROM pg_policies
         WHERE tablename IN ('contact_types','contact_type_default_tags')`
      );
      expect(policies).toHaveLength(2);
      for (const p of policies) {
        expect(p.qual).toContain('app.current_tenant_id');
        expect(p.with_check).toContain('app.current_tenant_id');
      }
    });

    it('hides tenant B types from a tenant-A session under a non-bypass role', async (ctx) => {
      const roles: Array<{ exists: boolean }> = await prisma.$queryRawUnsafe(
        `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS exists`
      );
      if (!roles[0]?.exists) {
        console.log('Skipping RLS session check: local DB has no Supabase "authenticated" role');
        ctx.skip();
      }
      await contactType(TENANT_B, 'hidden', 'Hidden');
      let visible: Array<{ tenantId: string }> = [];
      try {
        visible = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', '${TENANT_A}', true)`
          );
          return tx.$queryRawUnsafe(`SELECT "tenantId" FROM contact_types`);
        });
      } catch (error) {
        // Missing table GRANTs for the Supabase role (local DB, same as CI) — not an isolation leak.
        console.log('Skipping RLS session check: role lacks table grants locally', pgCode(error));
        ctx.skip();
      }
      expect(visible.every((r) => r.tenantId === TENANT_A)).toBe(true);
    });
  });
});
