/**
 * PG-184 Runtime Wiring Smoke Test (V-6 / Gate 5)
 *
 * Verifies that `dealSettingsRouter` is registered in the top-level tRPC
 * `appRouter`, and that each sub-router key listed in the plan's Runtime
 * Wiring Contract resolves to a tRPC procedure. Static typechecks cannot
 * catch a forgotten `dealSettings:` entry in `src/router.ts`; this test
 * imports the real `appRouter` and walks `_def.procedures`.
 */

import { describe, it, expect } from 'vitest';
import { appRouter } from '../../../router';

describe('PG-184 — dealSettings wiring', () => {
  it('dealSettings sub-router is registered on appRouter', () => {
    expect(appRouter._def.procedures).toBeDefined();
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    const keys = Object.keys(procedures);
    const dealSettingsKeys = keys.filter((k) => k.startsWith('dealSettings.'));
    expect(dealSettingsKeys.length).toBeGreaterThan(0);
  });

  it.each([
    'dealSettings.pipeline.getAll',
    'dealSettings.winLossReasons.list',
    'dealSettings.winLossReasons.create',
    'dealSettings.winLossReasons.update',
    'dealSettings.winLossReasons.delete',
    'dealSettings.winLossReasons.resetToDefaults',
    'dealSettings.scoringRules.list',
    'dealSettings.scoringRules.create',
    'dealSettings.scoringRules.update',
    'dealSettings.scoringRules.delete',
    'dealSettings.scoringRules.resetToDefaults',
    'dealSettings.duplicateRules.getAll',
    'dealSettings.duplicateRules.updateAll',
    'dealSettings.duplicateRules.resetToDefaults',
    'dealSettings.requiredFields.getAll',
    'dealSettings.requiredFields.updateAll',
    'dealSettings.requiredFields.resetToDefaults',
    'dealSettings.tags.list',
    'dealSettings.tags.create',
    'dealSettings.tags.update',
    'dealSettings.tags.delete',
    'dealSettings.automation.get',
    'dealSettings.automation.update',
    'dealSettings.automation.resetToDefaults',
  ])('%s is a registered tRPC procedure', (path) => {
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures[path]).toBeDefined();
  });
});
