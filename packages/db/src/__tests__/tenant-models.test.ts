import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TENANT_MODELS } from '../tenant-models.generated';

/** The generator is an ES module; this package compiles to CommonJS, so load it dynamically. */
const loadGenerator = () => import('../../scripts/generate-tenant-models.mjs');

describe('TENANT_MODELS', () => {
  it('matches prisma/schema.prisma (regenerate with generate:tenant-models)', async () => {
    const { OUTPUT_PATH, SCHEMA_PATH, parseTenantModels, renderTenantModels } =
      await loadGenerator();
    const expected = renderTenantModels(parseTenantModels(fs.readFileSync(SCHEMA_PATH, 'utf8')));
    expect(fs.readFileSync(OUTPUT_PATH, 'utf8').replaceAll('\r\n', '\n')).toBe(expected);
  });

  it('lists the core tenant-owned models with their tenant relation', () => {
    expect(TENANT_MODELS.Opportunity).toEqual({ nullable: false, relation: 'tenant' });
    expect(TENANT_MODELS.Lead).toEqual({ nullable: false, relation: 'tenant' });
    expect(TENANT_MODELS.Tenant).toBeUndefined();
  });
});

describe('parseTenantModels', () => {
  it('reads required, optional and relation-less tenant columns and ignores comments', async () => {
    const { parseTenantModels } = await loadGenerator();
    const schema = [
      'model A {',
      '  id       String @id',
      '  tenantId String',
      '  tenant   Tenant @relation(fields: [tenantId], references: [id])',
      '}',
      'model B {',
      '  id       String  @id',
      '  tenantId String?',
      '}',
      'model C {',
      '  id String @id',
      '  // tenantId String',
      '}',
      'model D {',
      '  id        String @id',
      '  tenantId  String',
      '  workspace Tenant @relation("Ws", fields: [tenantId, id], references: [id, x])',
      '}',
    ].join('\n');

    expect(parseTenantModels(schema)).toEqual([
      { model: 'A', nullable: false, relation: 'tenant' },
      { model: 'B', nullable: true, relation: null },
      { model: 'D', nullable: false, relation: 'workspace' },
    ]);
  });
});
