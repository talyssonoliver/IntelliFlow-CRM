#!/usr/bin/env node
/**
 * ADR-007 governance-schema gate.
 *
 * Requires the Accepted data-governance schema to be present:
 *   - `dataClassification` on the core PII-bearing entities (Lead/Contact/
 *     Account/Opportunity), and
 *   - the DataGovernancePolicy / LegalHold / DSARRequest models.
 *
 * This is the single source of truth for the check. It runs in pre-ship and in
 * `.github/workflows/migration.yml` (both call this script) so the gate can't rot
 * red only on `main` — a missing governance column fails a PR / pre-ship too.
 *
 * Exit 0 when satisfied, 1 (with the specific misses) otherwise.
 */
import { readFileSync } from 'node:fs';

const SCHEMA = 'packages/db/prisma/schema.prisma';

const CLASSIFIED_MODELS = ['Lead', 'Contact', 'Account', 'Opportunity'];
const REQUIRED_MODELS = ['DataGovernancePolicy', 'LegalHold', 'DSARRequest'];

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

for (const model of CLASSIFIED_MODELS) {
  const body = modelBody(model);
  if (body === null) {
    failures.push(`model ${model} not found`);
  } else if (!/\bdataClassification\b/.test(body)) {
    failures.push(`${model} missing dataClassification`);
  } else {
    console.log(`✓ ${model} has dataClassification`);
  }
}

for (const model of REQUIRED_MODELS) {
  if (modelBody(model) === null) {
    failures.push(`${model} model missing`);
  } else {
    console.log(`✓ ${model} model exists`);
  }
}

if (failures.length > 0) {
  console.error('\n✗ ADR-007 governance schema check FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    '\nImplement the governance schema per docs/architecture/adr/ADR-007-data-governance.md'
  );
  process.exit(1);
}

console.log('\n✓ All governance requirements met (ADR-007)');
