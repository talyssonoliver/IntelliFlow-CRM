/**
 * Entry point for `pnpm run validate:sprint`: the strict sprint gate with the
 * dated reopen exemptions applied (owner ruling 2026-10-06; see
 * tools/scripts/reopen-exemptions.json and lib/reopen-exemptions.ts).
 * sprint-validation.ts runs its gates on import.
 */
import { loadReopenExemptions } from './lib/reopen-exemptions.js';
import { findRepoRoot, useReopenExemptions } from './lib/validation-utils.js';

useReopenExemptions(loadReopenExemptions(findRepoRoot()));
import('./sprint-validation.js').catch((error: unknown) => {
  console.error('[sprint-gates] failed to run sprint-validation:', error);
  process.exit(1);
});
