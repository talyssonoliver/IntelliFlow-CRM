/**
 * Provisioning CLI — run via `tsx` (NOT Playwright's loader, which can't load the
 * Prisma client). Provisions every QA persona and writes their storageState.
 *
 *   npx tsx tests/e2e/fixtures/provision-cli.ts
 *
 * The Playwright `setup` project shells out to this so the DB/Prisma work happens
 * in a Node/tsx context that resolves `@intelliflow/db` correctly.
 */
import { provisionAllPersonas } from './provision';
import { writeAllPersonaStates, writeMeta } from './storage-state';

(async () => {
  const sessions = await provisionAllPersonas();
  const paths = writeAllPersonaStates(sessions);
  writeMeta(sessions);
  for (let i = 0; i < sessions.length; i++) {
    // Never log tokens — key + tenant + path only.
    console.log(`  ✓ ${sessions[i].key} → ${paths[i]} (tenant ${sessions[i].tenantId})`);
  }
  console.log(`provisioned ${sessions.length} personas`);
})().catch((e) => {
  console.error('PROVISION FAILED:', e?.message ?? e);
  process.exit(1);
});
