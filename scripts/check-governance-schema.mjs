#!/usr/bin/env node
/**
 * ADR-007 governance-schema gate (single source of truth).
 *
 * Asserts the Prisma-modelled governance surface that ADR-007 requires:
 *   1. the `DataClassification` taxonomy (enum), and
 *   2. that classification is APPLIED per-model on the core PII-bearing entities
 *      (Lead / Contact / Account / Opportunity), and
 *   3. the `DocumentRetentionPolicy` model (retention requirement).
 *
 * Deliberately NOT asserted: DataGovernancePolicy / LegalHold / DSARRequest as
 * Prisma models. Retention-policy / legal-hold / DSAR storage is enforced via
 * raw-SQL tables + the DSAR workflow (#355); modelling them in Prisma would split
 * the source of truth and collide with the existing legal_holds / dsar_requests
 * relations. (See the ADR-007 note in schema.prisma.)
 *
 * This SAME script runs in pre-ship and in `.github/workflows/migration.yml`, so
 * the gate can't rot red only on `main` — a missing governance column fails a PR
 * and pre-ship too.
 *
 * Exit 0 when satisfied, 1 (with the specific misses) otherwise.
 */
import { readFileSync } from 'node:fs';

const SCHEMA = 'packages/db/prisma/schema.prisma';

// Entities that must carry a classification tier (ADR-007 per-model coverage).
const CLASSIFIED_MODELS = ['Lead', 'Contact', 'Account', 'Opportunity'];

let schema;
try {
  schema = readFileSync(SCHEMA, 'utf8');
} catch {
  console.error(`✗ could not read ${SCHEMA}`);
  process.exit(1);
}

/** Return the body (between the braces) of `model <name> { ... }`, or null. */
function modelBody(name) {
  const m = schema.match(new RegExp(`(?:^|\\n)model ${name} \\{([\\s\\S]*?)\\n\\}`));
  return m ? m[1] : null;
}

const failures = [];

// (1) The DataClassification taxonomy — the core of ADR-007.
if (/enum DataClassification \{/.test(schema)) {
  console.log('✓ DataClassification enum present');
} else {
  failures.push('DataClassification enum missing');
}

// (2) Classification is applied per-model on the core PII entities.
for (const model of CLASSIFIED_MODELS) {
  const body = modelBody(model);
  if (body === null) {
    failures.push(`model ${model} not found`);
  } else if (!/\bdataClassification\s+DataClassification\b/.test(body)) {
    failures.push(`${model} missing dataClassification`);
  } else {
    console.log(`✓ ${model} has dataClassification`);
  }
}

// (3) Retention policy model (ADR-007 retention requirement).
if (modelBody('DocumentRetentionPolicy') !== null) {
  console.log('✓ DocumentRetentionPolicy model present');
} else {
  failures.push('DocumentRetentionPolicy model missing');
}

if (failures.length > 0) {
  console.error('\n✗ ADR-007 governance schema check FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    '\nImplement the governance schema per docs/architecture/adr/ADR-007-data-governance.md'
  );
  process.exit(1);
}

console.log(
  '\n✓ ADR-007 governance surface present (taxonomy + per-model classification + retention). ' +
    'DSAR/legal-hold are raw-SQL (#355), intentionally not Prisma-modelled.'
);
