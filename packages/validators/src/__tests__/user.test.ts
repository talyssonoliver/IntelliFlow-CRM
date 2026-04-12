/**
 * User Validator Tests
 *
 * Tests for timezone validation and user profile schemas.
 *
 * Task: IFC-191 — User Timezone Support
 */

import { describe, it, expect } from 'vitest';
import { updateTimezoneInputSchema, userProfileSchema } from '../user';

describe('updateTimezoneInputSchema', () => {
  it('accepts UTC', () => {
    const result = updateTimezoneInputSchema.safeParse({ timezone: 'UTC' });
    expect(result.success).toBe(true);
  });

  it('accepts America/New_York', () => {
    const result = updateTimezoneInputSchema.safeParse({ timezone: 'America/New_York' });
    expect(result.success).toBe(true);
  });

  it('accepts Asia/Tokyo', () => {
    const result = updateTimezoneInputSchema.safeParse({ timezone: 'Asia/Tokyo' });
    expect(result.success).toBe(true);
  });

  it('accepts Europe/London', () => {
    const result = updateTimezoneInputSchema.safeParse({ timezone: 'Europe/London' });
    expect(result.success).toBe(true);
  });

  it('rejects empty string', () => {
    const result = updateTimezoneInputSchema.safeParse({ timezone: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid timezone Foo/Bar', () => {
    const result = updateTimezoneInputSchema.safeParse({ timezone: 'Foo/Bar' });
    expect(result.success).toBe(false);
  });

  it('rejects random string NotATimezone', () => {
    const result = updateTimezoneInputSchema.safeParse({ timezone: 'NotATimezone' });
    expect(result.success).toBe(false);
  });

  it('rejects abbreviation EST (non-canonical)', () => {
    const result = updateTimezoneInputSchema.safeParse({ timezone: 'EST' });
    expect(result.success).toBe(false);
  });

  it('rejects abbreviation GMT (non-canonical)', () => {
    const result = updateTimezoneInputSchema.safeParse({ timezone: 'GMT' });
    expect(result.success).toBe(false);
  });

  it('rejects abbreviation PST (non-canonical)', () => {
    const result = updateTimezoneInputSchema.safeParse({ timezone: 'PST' });
    expect(result.success).toBe(false);
  });
});

describe('userProfileSchema', () => {
  it('validates correct shape with all fields', () => {
    const result = userProfileSchema.safeParse({
      name: 'John Doe',
      email: 'john@example.com',
      role: 'USER',
      timezone: 'America/New_York',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null name', () => {
    const result = userProfileSchema.safeParse({
      name: null,
      email: 'john@example.com',
      role: 'USER',
      timezone: 'UTC',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null timezone', () => {
    const result = userProfileSchema.safeParse({
      name: 'John',
      email: 'john@example.com',
      role: 'ADMIN',
      timezone: null,
    });
    expect(result.success).toBe(true);
  });
});
