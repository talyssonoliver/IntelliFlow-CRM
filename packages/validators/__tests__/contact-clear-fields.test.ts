/**
 * MVP-003 (#28): a field cleared in the contact edit form is saved empty, never ignored. Title and
 * department accept "", a cleared phone becomes null (the number is removed), and plain text
 * fields keep "".
 */
import { describe, it, expect } from 'vitest';
import { updateContactSchema } from '../src/contact';

const ID = '123e4567-e89b-12d3-a456-426614174000';
const parse = (fields: Record<string, unknown>) =>
  updateContactSchema.safeParse({ id: ID, ...fields });

describe('updateContactSchema: clearing optional fields (MVP-003 #28)', () => {
  it.each(['title', 'department'])('accepts an empty %s (saved empty)', (field) => {
    const result = parse({ [field]: '' });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty(field, '');
  });

  it('still trims and bounds a title that is given', () => {
    expect(parse({ title: ' Owner ' }).data?.title).toBe('Owner');
    expect(parse({ title: 'x'.repeat(101) }).success).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['null', null],
  ])('turns a cleared phone (%s) into null: the number is removed', (_label, phone) => {
    const result = parse({ phone });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('phone', null);
  });

  it('still parses a phone number that is given, and refuses a bad one', () => {
    const result = parse({ phone: '+44 7700 900123' });
    expect(result.success).toBe(true);
    expect(result.data?.phone).not.toBeNull();
    expect(parse({ phone: 'not a number' }).success).toBe(false);
  });

  it.each(['streetAddress', 'city', 'zipCode', 'company', 'linkedInUrl', 'contactNotes'])(
    'keeps an empty %s as ""',
    (field) => {
      expect(parse({ [field]: '' }).data).toHaveProperty(field, '');
    }
  );

  it('leaves out every field that was not sent (unchanged)', () => {
    const result = parse({});
    expect(result.data).toEqual({ id: ID });
  });
});
