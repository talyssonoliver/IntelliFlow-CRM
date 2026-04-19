/**
 * RequiredFieldsTab Tests - PG-186
 *
 * Validator-level invariants are tested here. Component-level RTL behavior
 * (switch interactions) is tracked as follow-up — see PG-186 audit
 * finding #5. The default-seeding path is covered at the router level in
 * apps/api/src/modules/legal/__tests__/document-settings.router.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { updateDocumentRequiredFieldsSchema } from '@intelliflow/validators';
import { RequiredFieldsTab } from '../components/RequiredFieldsTab';

describe('RequiredFieldsTab — smoke', () => {
  it('exports a function component', () => {
    expect(typeof RequiredFieldsTab).toBe('function');
  });
});

describe('updateDocumentRequiredFieldsSchema', () => {
  it('rejects payload that flips title.isRequired to false', () => {
    const result = updateDocumentRequiredFieldsSchema.safeParse({
      fields: [
        { fieldKey: 'title', isRequired: false },
        { fieldKey: 'description', isRequired: false },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes('title field must remain required'))
      ).toBe(true);
    }
  });

  it('accepts payload that keeps title.isRequired = true', () => {
    const result = updateDocumentRequiredFieldsSchema.safeParse({
      fields: [
        { fieldKey: 'title', isRequired: true },
        { fieldKey: 'description', isRequired: false },
      ],
    });
    expect(result.success).toBe(true);
  });
});
