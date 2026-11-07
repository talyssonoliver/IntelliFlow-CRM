/**
 * check-test-variant-names (#1216 item 5): which file names are coverage variants.
 */
import { describe, it, expect } from 'vitest';
import { VARIANT_TEST_FILE, variantTestFiles } from '../check-test-variant-names.mjs';

describe('variantTestFiles', () => {
  it.each([
    'apps/web/src/a/__tests__/form.supplementary.test.tsx',
    'apps/api/src/m/__tests__/lead.router.supplementary2.test.ts',
    'apps/api/src/m/__tests__/lead.router.additional.test.ts',
    'apps/api/src/m/__tests__/lead.router.b11.test.ts',
    'apps/api/src/m/__tests__/lead.service.batch10.test.ts',
    'apps/api/src/m/__tests__/x.batch10r.test.ts',
    'apps/api/src/m/__tests__/home.router.coverage.test.ts',
    'apps\\web\\src\\x\\__tests__\\y.additional.spec.tsx',
  ])('refuses %s', (file) => {
    expect(variantTestFiles([file])).toEqual([file]);
  });

  it.each([
    'apps/api/src/m/__tests__/lead.router.test.ts',
    'tools/scripts/__tests__/check-diff-coverage.test.ts',
    'apps/web/src/lib/coverage.test.ts',
    'apps/api/src/m/batch-import.test.ts',
    'apps/api/src/m/additional-fields.test.ts',
    'apps/api/src/m/lead.router.supplementary.ts',
    'docs/notes.supplementary.md',
  ])('accepts %s', (file) => {
    expect(variantTestFiles([file])).toEqual([]);
  });

  it('keeps only the offending paths, in order', () => {
    expect(
      variantTestFiles(['a/x.test.ts', 'a/y.b2.test.ts', 'b/z.test.ts', 'b/w.additional.test.ts'])
    ).toEqual(['a/y.b2.test.ts', 'b/w.additional.test.ts']);
  });

  it('is case-insensitive about the suffix', () => {
    expect(VARIANT_TEST_FILE.test('Form.Supplementary.test.tsx')).toBe(true);
  });
});
