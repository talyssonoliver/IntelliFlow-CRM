/**
 * CLI entry for `seed-help-articles.ts`. Kept separate from the main module
 * so that the importable seed has no self-invoking side effects and remains
 * clean under unit-test coverage.
 *
 * Run: pnpm --filter @intelliflow/db db:seed:help-articles
 */
import { runAndExit } from './seed-help-articles';

void runAndExit();
