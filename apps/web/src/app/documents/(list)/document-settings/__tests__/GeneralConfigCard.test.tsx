/**
 * GeneralConfigCard Tests - PG-186
 *
 * NOTE: structural smoke coverage only — full RTL behavior tests are
 * tracked as a follow-up (PG-186 audit finding #5). Validator-level
 * input bounds (1..500 MB) are enforced in
 * packages/validators/src/document-settings.ts and tested in
 * packages/validators/src/__tests__/document-settings.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { GeneralConfigCard } from '../components/GeneralConfigCard';

describe('GeneralConfigCard — smoke', () => {
  it('exports a function component', () => {
    expect(typeof GeneralConfigCard).toBe('function');
  });
});
