/**
 * reset-email's exported pure functions, imported from the module. Replaces
 * reset-email.supplementary2.test.ts, which asserted copies of them (its email check and sender
 * addresses had drifted from the product, #1216). The form, the sent screen, masking, cooldown
 * and HTML escaping are covered by reset-email.render.test.tsx.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildResetEmailPayload, validateEmail } from '../reset-email';

describe('validateEmail', () => {
  it('requires an address, ignoring surrounding spaces', () => {
    expect(validateEmail('')).toEqual({ valid: false, error: 'Email address is required' });
    expect(validateEmail('   ')).toEqual({ valid: false, error: 'Email address is required' });
    expect(validateEmail('  user@example.com  ')).toEqual({ valid: true });
  });

  it.each(['not-email', 'user@', '@example.com', 'a b@example.com', 'a@@example.com'])(
    'rejects %j',
    (input) => {
      expect(validateEmail(input)).toEqual({
        valid: false,
        error: 'Please enter a valid email address',
      });
    }
  );
});

describe('buildResetEmailPayload', () => {
  const expiresAt = new Date('2026-11-08T12:00:00.000Z');
  const base = {
    email: 'jane.doe@example.com',
    resetUrl: 'https://app.example.invalid/r/abc',
    expiresAt,
  };

  afterEach(() => vi.unstubAllEnvs());

  it('greets the user by name, or by the part of the address before @', () => {
    expect(buildResetEmailPayload({ ...base, userName: 'Jane' }).textBody).toContain('Hi Jane,');
    expect(buildResetEmailPayload(base).textBody).toContain('Hi jane.doe,');
    expect(buildResetEmailPayload(base).htmlBody).toContain('Hi jane.doe,');
  });

  it('records the reset source, address and expiry in the metadata', () => {
    expect(buildResetEmailPayload(base).metadata).toEqual({
      source: 'password_reset',
      email: 'jane.doe@example.com',
      expiresAt: '2026-11-08T12:00:00.000Z',
    });
  });

  it('puts the reset link in both bodies', () => {
    const payload = buildResetEmailPayload(base);
    expect(payload.textBody).toContain(base.resetUrl);
    expect(payload.htmlBody).toContain(`href="${base.resetUrl}"`);
  });

  it('sends from the configured addresses, with defaults', () => {
    vi.stubEnv('NEXT_PUBLIC_SENDER_EMAIL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', '');
    expect(buildResetEmailPayload(base)).toMatchObject({
      from: 'crm@leangency.com',
      replyTo: 'hello@leangency.com',
    });

    vi.stubEnv('NEXT_PUBLIC_SENDER_EMAIL', 'noreply@example.invalid');
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', 'help@example.invalid');
    expect(buildResetEmailPayload(base)).toMatchObject({
      from: 'noreply@example.invalid',
      replyTo: 'help@example.invalid',
    });
  });
});
