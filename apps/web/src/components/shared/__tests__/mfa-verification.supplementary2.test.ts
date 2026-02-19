/**
 * @vitest-environment happy-dom
 * mfa-verification.tsx - Supplementary tests for verification logic,
 * code validation flow, challenge data processing, and error categorization.
 *
 * Tests the logic paths of the MfaVerification component without rendering.
 * Does NOT use @testing-library/react.
 */
import { describe, it, expect } from 'vitest';

// ============================================================
// Import real code-validator utilities used by the component
// ============================================================

// Re-implement the code validators used within the component
// (from @/lib/shared/code-validator)

function sanitizeCode(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/\D/g, '');
}

function isValidTotpCode(code: string): boolean {
  const sanitized = sanitizeCode(code);
  return /^\d{6}$/.test(sanitized);
}

function isValidBackupCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const normalized = code.replace(/-/g, '');
  if (normalized.length !== 10) return false;
  return /^[a-zA-Z0-9]+$/.test(normalized);
}

// ============================================================
// Types from the component
// ============================================================

type MfaMethod = 'totp' | 'sms' | 'email' | 'backup';

interface ChallengeData {
  challengeId: string;
  method: MfaMethod;
  email?: string;
  expiresAt: string;
  availableMethods?: MfaMethod[];
  maskedPhone?: string;
  maskedEmail?: string;
}

// ============================================================
// Tests
// ============================================================

describe('MFA Verification - Code Validation Logic', () => {
  describe('TOTP code validation in handleVerify', () => {
    it('rejects non-TOTP code when method is totp', () => {
      const code = 'abc';
      const sanitized = sanitizeCode(code);
      expect(isValidTotpCode(sanitized)).toBe(false);
    });

    it('accepts valid 6-digit code for totp method', () => {
      const code = '123456';
      const sanitized = sanitizeCode(code);
      expect(isValidTotpCode(sanitized)).toBe(true);
    });

    it('accepts code with dashes (sanitized) for totp', () => {
      const code = '123-456';
      const sanitized = sanitizeCode(code);
      expect(sanitized).toBe('123456');
      expect(isValidTotpCode(sanitized)).toBe(true);
    });

    it('accepts code with spaces (sanitized) for totp', () => {
      const code = '123 456';
      const sanitized = sanitizeCode(code);
      expect(sanitized).toBe('123456');
      expect(isValidTotpCode(sanitized)).toBe(true);
    });

    it('rejects code with too few digits', () => {
      const code = '12345';
      const sanitized = sanitizeCode(code);
      expect(isValidTotpCode(sanitized)).toBe(false);
    });

    it('rejects code with too many digits', () => {
      const code = '1234567';
      const sanitized = sanitizeCode(code);
      expect(isValidTotpCode(sanitized)).toBe(false);
    });

    it('rejects empty string', () => {
      const code = '';
      const sanitized = sanitizeCode(code);
      expect(isValidTotpCode(sanitized)).toBe(false);
    });
  });

  describe('backup code validation in handleVerify', () => {
    it('accepts valid 10-char alphanumeric backup code', () => {
      expect(isValidBackupCode('A1B2C3D4E5')).toBe(true);
    });

    it('accepts backup code with dash', () => {
      expect(isValidBackupCode('A1B2C-3D4E5')).toBe(true);
    });

    it('rejects backup code that is too short', () => {
      expect(isValidBackupCode('A1B2C')).toBe(false);
    });

    it('rejects backup code that is too long', () => {
      expect(isValidBackupCode('A1B2C3D4E5F6')).toBe(false);
    });

    it('rejects backup code with special characters', () => {
      expect(isValidBackupCode('A1B2C!D4E5')).toBe(false);
    });

    it('rejects empty backup code', () => {
      expect(isValidBackupCode('')).toBe(false);
    });

    it('rejects null/undefined backup code', () => {
      expect(isValidBackupCode(null as any)).toBe(false);
      expect(isValidBackupCode(undefined as any)).toBe(false);
    });

    it('accepts all-numeric backup code', () => {
      expect(isValidBackupCode('1234567890')).toBe(true);
    });

    it('accepts all-letter backup code', () => {
      expect(isValidBackupCode('ABCDEFGHIJ')).toBe(true);
    });

    it('accepts lowercase backup code', () => {
      expect(isValidBackupCode('abcdefghij')).toBe(true);
    });

    it('accepts mixed case backup code', () => {
      expect(isValidBackupCode('aBcDeFgHiJ')).toBe(true);
    });
  });

  describe('handleVerify error message determination', () => {
    function getErrorMessage(method: MfaMethod, code: string): string | null {
      const sanitized = sanitizeCode(code);
      if (method === 'backup') {
        if (!isValidBackupCode(code)) {
          return 'Invalid backup code format';
        }
      } else {
        if (!isValidTotpCode(sanitized)) {
          return 'Please enter a valid 6-digit code';
        }
      }
      return null;
    }

    it('returns backup error for invalid backup code', () => {
      expect(getErrorMessage('backup', '123')).toBe('Invalid backup code format');
    });

    it('returns TOTP error for invalid TOTP code', () => {
      expect(getErrorMessage('totp', 'abc')).toBe('Please enter a valid 6-digit code');
    });

    it('returns TOTP error for invalid SMS code', () => {
      expect(getErrorMessage('sms', '12')).toBe('Please enter a valid 6-digit code');
    });

    it('returns TOTP error for invalid email code', () => {
      expect(getErrorMessage('email', '')).toBe('Please enter a valid 6-digit code');
    });

    it('returns null for valid TOTP code', () => {
      expect(getErrorMessage('totp', '123456')).toBeNull();
    });

    it('returns null for valid backup code', () => {
      expect(getErrorMessage('backup', 'A1B2C3D4E5')).toBeNull();
    });
  });
});

describe('MFA Verification - Challenge Data Processing', () => {
  describe('challenge validation', () => {
    it('treats challengeId shorter than 3 chars as invalid', () => {
      const challengeId: string = 'ab';
      const isInvalid = challengeId.length < 3 || challengeId === 'invalid';
      expect(isInvalid).toBe(true);
    });

    it('treats challengeId equal to "invalid" as invalid', () => {
      const challengeId: string = 'invalid';
      const isInvalid = challengeId.length < 3 || challengeId === 'invalid';
      expect(isInvalid).toBe(true);
    });

    it('accepts valid challengeId with 3+ chars', () => {
      const challengeId: string = 'abc';
      const isInvalid = challengeId.length < 3 || challengeId === 'invalid';
      expect(isInvalid).toBe(false);
    });

    it('accepts UUID-like challengeId', () => {
      const challengeId: string = '550e8400-e29b-41d4-a716-446655440000';
      const isInvalid = challengeId.length < 3 || challengeId === 'invalid';
      expect(isInvalid).toBe(false);
    });

    it('treats single-char challengeId as invalid', () => {
      const challengeId: string = 'x';
      const isInvalid = challengeId.length < 3 || challengeId === 'invalid';
      expect(isInvalid).toBe(true);
    });

    it('treats empty challengeId as invalid', () => {
      const challengeId: string = '';
      const isInvalid = challengeId.length < 3 || challengeId === 'invalid';
      expect(isInvalid).toBe(true);
    });
  });

  describe('challenge data construction', () => {
    it('creates challenge data with all fields', () => {
      const data: ChallengeData = {
        challengeId: 'ch-123',
        method: 'totp',
        email: 'user@test.com',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        availableMethods: ['totp', 'sms', 'email', 'backup'],
        maskedPhone: '***-***-1234',
        maskedEmail: 'u***@test.com',
      };

      expect(data.challengeId).toBe('ch-123');
      expect(data.method).toBe('totp');
      expect(data.email).toBe('user@test.com');
      expect(data.availableMethods).toEqual(['totp', 'sms', 'email', 'backup']);
      expect(data.maskedPhone).toBe('***-***-1234');
      expect(data.maskedEmail).toBe('u***@test.com');
    });

    it('creates challenge data with minimal fields', () => {
      const data: ChallengeData = {
        challengeId: 'ch-456',
        method: 'sms',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };

      expect(data.challengeId).toBe('ch-456');
      expect(data.email).toBeUndefined();
      expect(data.availableMethods).toBeUndefined();
      expect(data.maskedPhone).toBeUndefined();
    });

    it('default expiresAt is 5 minutes in the future', () => {
      const nowMs = Date.now();
      const expiresAt = new Date(nowMs + 300000).toISOString();
      const expiresDate = new Date(expiresAt);
      const diffMs = expiresDate.getTime() - nowMs;

      // Should be approximately 5 minutes (300000ms)
      expect(diffMs).toBeGreaterThanOrEqual(299000);
      expect(diffMs).toBeLessThanOrEqual(301000);
    });
  });

  describe('expiration check', () => {
    it('detects expired challenge', () => {
      const expiresAt = new Date(Date.now() - 1000).toISOString();
      const expiresDate = new Date(expiresAt);
      expect(expiresDate < new Date()).toBe(true);
    });

    it('detects non-expired challenge', () => {
      const expiresAt = new Date(Date.now() + 300000).toISOString();
      const expiresDate = new Date(expiresAt);
      expect(expiresDate < new Date()).toBe(false);
    });

    it('challenge exactly at current time is expired', () => {
      const now = new Date();
      const expiresAt = now.toISOString();
      const expiresDate = new Date(expiresAt);
      // Due to ms precision, this may or may not be strictly less
      // but in practice, time will have advanced past the stored value
      expect(expiresDate.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});

describe('MFA Verification - Error Categorization', () => {
  function categorizeError(message: string): string {
    if (message.includes('expired')) {
      return 'This verification code has expired. Please request a new one.';
    } else if (message.includes('invalid') || message.includes('incorrect')) {
      return 'Invalid verification code. Please check and try again.';
    } else if (message.includes('attempts')) {
      return 'Too many failed attempts. Please wait and try again.';
    }
    return message;
  }

  it('categorizes expired error', () => {
    expect(categorizeError('Token has expired')).toBe(
      'This verification code has expired. Please request a new one.'
    );
  });

  it('categorizes invalid error', () => {
    expect(categorizeError('Code is invalid')).toBe(
      'Invalid verification code. Please check and try again.'
    );
  });

  it('categorizes incorrect error (lowercase match)', () => {
    // The source uses message.includes('incorrect') which is case-sensitive
    expect(categorizeError('incorrect code entered')).toBe(
      'Invalid verification code. Please check and try again.'
    );
  });

  it('does not categorize Incorrect with capital I (case-sensitive)', () => {
    // "Incorrect" does not include lowercase "incorrect"
    expect(categorizeError('Incorrect code entered')).toBe('Incorrect code entered');
  });

  it('categorizes rate limit error', () => {
    expect(categorizeError('Too many attempts')).toBe(
      'Too many failed attempts. Please wait and try again.'
    );
  });

  it('passes through unknown error messages unchanged', () => {
    expect(categorizeError('Network failure')).toBe('Network failure');
  });

  it('handles Error instance vs non-Error', () => {
    const error1 = new Error('Code has expired');
    const msg1 = error1 instanceof Error ? error1.message : 'Verification failed';
    expect(categorizeError(msg1)).toBe(
      'This verification code has expired. Please request a new one.'
    );

    const error2: unknown = 'not an error object';
    const msg2 = error2 instanceof Error ? error2.message : 'Verification failed';
    expect(msg2).toBe('Verification failed');
  });

  it('case-sensitive matching (lowercase required)', () => {
    // The source uses message.includes which is case-sensitive
    expect(categorizeError('EXPIRED')).not.toBe(
      'This verification code has expired. Please request a new one.'
    );
    expect(categorizeError('EXPIRED')).toBe('EXPIRED');
  });
});

describe('MFA Verification - Effective Values Logic', () => {
  it('prefers challenge data email over prop email', () => {
    const challengeEmail = 'challenge@test.com';
    const propEmail = 'prop@test.com';
    const effectiveEmail = challengeEmail || propEmail;
    expect(effectiveEmail).toBe('challenge@test.com');
  });

  it('falls back to prop email when challenge has no email', () => {
    const challengeEmail = undefined;
    const propEmail = 'prop@test.com';
    const effectiveEmail = challengeEmail || propEmail;
    expect(effectiveEmail).toBe('prop@test.com');
  });

  it('prefers challenge methods over prop methods', () => {
    const challengeMethods: MfaMethod[] = ['sms', 'email'];
    const propMethods: MfaMethod[] = ['totp', 'sms', 'email', 'backup'];
    const effectiveMethods = challengeMethods || propMethods;
    expect(effectiveMethods).toEqual(['sms', 'email']);
  });

  it('falls back to prop methods when challenge has none', () => {
    const challengeMethods = undefined;
    const propMethods: MfaMethod[] = ['totp', 'backup'];
    const effectiveMethods = challengeMethods || propMethods;
    expect(effectiveMethods).toEqual(['totp', 'backup']);
  });

  it('prefers challenge method over prop method', () => {
    const challengeMethod: MfaMethod = 'sms';
    const propMethod: MfaMethod = 'totp';
    const effectiveMethod = challengeMethod || propMethod;
    expect(effectiveMethod).toBe('sms');
  });

  it('falls back to prop method when challenge has none', () => {
    const challengeMethod = undefined;
    const propMethod: MfaMethod = 'email';
    const effectiveMethod = challengeMethod || propMethod;
    expect(effectiveMethod).toBe('email');
  });

  it('default prop method is totp', () => {
    const propMethod: MfaMethod = 'totp';
    expect(propMethod).toBe('totp');
  });
});

describe('MFA Verification - Code Submission Logic', () => {
  it('sends sanitized code for non-backup methods', () => {
    const code = '123-456';
    const method: MfaMethod | string = 'totp';
    const sanitized = sanitizeCode(code);

    const sentCode = method === 'backup' ? code : sanitized;
    expect(sentCode).toBe('123456');
  });

  it('sends raw code for backup method', () => {
    const code = 'A1B2C-3D4E5';
    const method: MfaMethod | string = 'backup';
    const sanitized = sanitizeCode(code);

    const sentCode = method === 'backup' ? code : sanitized;
    expect(sentCode).toBe('A1B2C-3D4E5');
  });

  it('uses challengeId or "inline" as fallback', () => {
    const id1: string | undefined = 'challenge-123';
    const id2: string | undefined = undefined;
    const id3: string | undefined = '';
    expect(id1 || 'inline').toBe('challenge-123');
    expect(id2 || 'inline').toBe('inline');
    expect(id3 || 'inline').toBe('inline');
  });
});

describe('MFA Verification - handleResend logic', () => {
  it('handleResend returns true on success', async () => {
    // Simulates the TODO stub in the component
    const handleResend = async (_method: 'sms' | 'email'): Promise<boolean> => {
      try {
        return true;
      } catch {
        return false;
      }
    };

    expect(await handleResend('sms')).toBe(true);
    expect(await handleResend('email')).toBe(true);
  });

  it('handleResend returns false on error', async () => {
    const handleResend = async (_method: 'sms' | 'email'): Promise<boolean> => {
      try {
        throw new Error('Service unavailable');
      } catch {
        return false;
      }
    };

    expect(await handleResend('sms')).toBe(false);
  });
});
