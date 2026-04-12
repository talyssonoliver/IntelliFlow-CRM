import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { InternalSignatureProvider } from '../InternalSignatureProvider';
import type { SignatureProviderPort } from '../../ports/external/SignatureProviderPort';

describe('InternalSignatureProvider', () => {
  const provider = new InternalSignatureProvider();

  it('should implement SignatureProviderPort interface', () => {
    const port: SignatureProviderPort = provider;
    expect(typeof port.computeSignatureHash).toBe('function');
  });

  it('should return a 64-char hex string', async () => {
    const hash = await provider.computeSignatureHash(
      'a'.repeat(64),
      '00000000-0000-4000-8000-000000000001',
      new Date('2026-01-15T12:00:00Z')
    );

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce a real SHA-256 matching Node crypto', async () => {
    const contentHash = 'a'.repeat(64);
    const signerId = '00000000-0000-4000-8000-000000000001';
    const timestamp = new Date('2026-01-15T12:00:00Z');

    const hash = await provider.computeSignatureHash(contentHash, signerId, timestamp);

    const expected = createHash('sha256')
      .update(`${contentHash}:${timestamp.toISOString()}:${signerId}`)
      .digest('hex');

    expect(hash).toBe(expected);
  });

  it('should be deterministic (same inputs produce same hash)', async () => {
    const contentHash = 'b'.repeat(64);
    const signerId = '00000000-0000-4000-8000-000000000002';
    const timestamp = new Date('2026-02-01T00:00:00Z');

    const hash1 = await provider.computeSignatureHash(contentHash, signerId, timestamp);
    const hash2 = await provider.computeSignatureHash(contentHash, signerId, timestamp);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different inputs', async () => {
    const timestamp = new Date('2026-01-15T12:00:00Z');
    const signerId = '00000000-0000-4000-8000-000000000001';

    const hash1 = await provider.computeSignatureHash('a'.repeat(64), signerId, timestamp);
    const hash2 = await provider.computeSignatureHash('b'.repeat(64), signerId, timestamp);

    expect(hash1).not.toBe(hash2);
  });
});
