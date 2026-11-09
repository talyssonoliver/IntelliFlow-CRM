import { describe, it, expect } from 'vitest';

import { contactIdFromSearch } from '../upload-prefill';

describe('contactIdFromSearch', () => {
  it('reads the contact id from the query string', () => {
    expect(contactIdFromSearch('?contactId=contact-1')).toBe('contact-1');
    expect(contactIdFromSearch('?from=x&contactId=%20contact-2%20')).toBe('contact-2');
  });

  it('returns null when there is no usable id', () => {
    expect(contactIdFromSearch('')).toBeNull();
    expect(contactIdFromSearch('?contactId=')).toBeNull();
    expect(contactIdFromSearch('?contactId=%20%20')).toBeNull();
    expect(contactIdFromSearch('?contactId=' + 'a'.repeat(65))).toBeNull();
  });
});
