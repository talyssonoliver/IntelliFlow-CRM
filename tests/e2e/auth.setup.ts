/**
 * Playwright SETUP project — provisions the QA persona matrix and writes an
 * authenticated `storageState` per persona, consumed by `dependencies: ['setup']`
 * projects (see playwright.config.ts).
 *
 * The Prisma client can't be loaded under Playwright's ESM loader, so the DB +
 * Supabase work runs in a `tsx` child process (provision-cli.ts); this project
 * orchestrates it and verifies the output. Run with the Option B env loaded:
 *   npx dotenv -e $TEMP/api-localb.env -- playwright test --project=setup
 */
import { test as setup, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { QA_PERSONAS, personaStatePath } from './fixtures/qa-personas';

setup('provision QA personas + write storageState', () => {
  setup.setTimeout(180_000); // Supabase round-trip per persona + tsx spawn

  const cli = path.join('tests', 'e2e', 'fixtures', 'provision-cli.ts');
  // Run the Prisma/Supabase provisioning under node's tsx loader (the client
  // can't load under Playwright's ESM loader). `process.execPath` + `--import tsx`
  // needs no shell (avoids the shell:true arg-escaping warning). Env is inherited
  // (Supabase admin keys + test DATABASE_URL come from the parent, typically
  // `dotenv -e $TEMP/api-localb.env`).
  execFileSync(process.execPath, ['--import', 'tsx', cli], {
    stdio: 'inherit',
    env: process.env,
  });

  // Verify every persona's storageState landed and is well-formed.
  for (const persona of QA_PERSONAS) {
    const rel = personaStatePath(persona.key);
    expect(fs.existsSync(rel), `${rel} should exist`).toBe(true);
    const state = JSON.parse(fs.readFileSync(rel, 'utf8'));
    expect(state.cookies?.[0]?.name).toBe('accessToken');
    expect(
      state.origins?.[0]?.localStorage?.some((e: { name: string }) => e.name === 'accessToken')
    ).toBe(true);
  }
});
