/**
 * RetentionPoliciesTab Tests - PG-186
 *
 * NOTE: structural smoke coverage only — full RTL behavior tests
 * (DataTable, Add Policy dialog, legalHoldOverride switch) are tracked
 * as a follow-up (PG-186 audit finding #5). The default-seeding path is
 * covered at the router level in
 * apps/api/src/modules/legal/__tests__/document-settings.router.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { RetentionPoliciesTab } from '../components/RetentionPoliciesTab';

describe('RetentionPoliciesTab — smoke', () => {
  it('exports a function component', () => {
    expect(typeof RetentionPoliciesTab).toBe('function');
  });
});
