import { describe, it, expect } from 'vitest';

import { leadEntityLabel } from '../PrismaActivityFeedRepository';

describe('leadEntityLabel (#1223)', () => {
  it('uses the person name when there is one', () => {
    expect(
      leadEntityLabel({
        firstName: 'Jane',
        lastName: 'Smith',
        company: 'Acme',
        email: 'j@a.example',
      })
    ).toBe('Jane Smith');
    expect(
      leadEntityLabel({ firstName: 'Jane', lastName: null, company: 'Acme', email: 'j@a.example' })
    ).toBe('Jane');
  });

  it('falls back to the company, then the email', () => {
    expect(
      leadEntityLabel({
        firstName: null,
        lastName: ' ',
        company: 'Bakery Ltd',
        email: 'b@b.example',
      })
    ).toBe('Bakery Ltd');
    expect(
      leadEntityLabel({ firstName: null, lastName: null, company: '  ', email: 'b@b.example' })
    ).toBe('b@b.example');
    expect(leadEntityLabel({ firstName: null, lastName: null, email: 'b@b.example' })).toBe(
      'b@b.example'
    );
  });
});
