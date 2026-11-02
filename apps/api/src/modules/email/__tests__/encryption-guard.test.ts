import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { requireEncryptionKey } from '../encryption-guard';

describe('requireEncryptionKey (CA-2)', () => {
  it('passes when the field-encryption key is set', () => {
    expect(() =>
      requireEncryptionKey({ PRISMA_FIELD_ENCRYPTION_KEY: 'k'.repeat(44) })
    ).not.toThrow();
  });

  it.each([{}, { PRISMA_FIELD_ENCRYPTION_KEY: '' }, { PRISMA_FIELD_ENCRYPTION_KEY: '   ' }])(
    'refuses with PRECONDITION_FAILED when the key is missing (%j)',
    (env) => {
      let error: unknown;
      try {
        requireEncryptionKey(env as NodeJS.ProcessEnv);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe('PRECONDITION_FAILED');
    }
  );

  it('reads process.env by default', () => {
    const before = process.env.PRISMA_FIELD_ENCRYPTION_KEY;
    delete process.env.PRISMA_FIELD_ENCRYPTION_KEY;
    try {
      expect(() => requireEncryptionKey()).toThrow(TRPCError);
    } finally {
      if (before !== undefined) process.env.PRISMA_FIELD_ENCRYPTION_KEY = before;
    }
  });
});
