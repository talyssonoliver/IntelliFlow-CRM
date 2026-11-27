/**
 * PG-199 BYOK: the workspace's own AI provider key is stored field-encrypted.
 * A write through the extension stores ciphertext (never the key), a read returns the
 * plaintext to the server code that needs it, and a wrong key cannot read it back.
 * The fake key is built at runtime from repeated characters.
 */
import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

vi.mock('../../generated/prisma/client', () => ({
  Prisma: { defineExtension: (args: unknown) => args },
}));

import {
  ENCRYPTED_FIELDS,
  fieldEncryptionExtension,
  decryptField,
  isEncrypted,
} from '../field-encryption.js';

const FAKE_KEY = 'k'.repeat(24) + 'e'.repeat(12) + 'wxyz';

type Hook = (args: {
  model: string;
  operation: string;
  args: any;
  query: (a: any) => Promise<any>;
}) => Promise<any>;

function hooks(key: Buffer): Record<string, Hook> {
  const ext = fieldEncryptionExtension({ key }) as unknown as {
    query: Record<string, Record<string, Hook>>;
  };
  return ext.query['tenantAIProviderKey']!;
}

describe('TenantAIProviderKey.apiKey encryption (PG-199 BYOK)', () => {
  it('is registered as the only encrypted field of the model', () => {
    expect(ENCRYPTED_FIELDS['TenantAIProviderKey']).toEqual(['apiKey']);
  });

  it('create stores ciphertext, never the key; the non-secret columns pass through', async () => {
    const key = randomBytes(32);
    const query = vi.fn().mockResolvedValue({});
    await hooks(key)['create']!({
      model: 'TenantAIProviderKey',
      operation: 'create',
      args: { data: { tenantId: 't1', provider: 'openai', apiKey: FAKE_KEY, last4: 'wxyz' } },
      query,
    });
    const stored = query.mock.calls[0]![0].data;
    expect(isEncrypted(stored.apiKey)).toBe(true);
    expect(stored.apiKey).not.toContain(FAKE_KEY);
    expect(stored.last4).toBe('wxyz');
    expect(stored.provider).toBe('openai');
    // The round trip: the key is recoverable with the same encryption key.
    expect(decryptField(stored.apiKey, key)).toBe(FAKE_KEY);
  });

  it('upsert (the API write) encrypts both the create and the update branch', async () => {
    const key = randomBytes(32);
    const query = vi.fn().mockResolvedValue({});
    await hooks(key)['upsert']!({
      model: 'TenantAIProviderKey',
      operation: 'upsert',
      args: {
        where: { tenantId: 't1' },
        create: { apiKey: FAKE_KEY },
        update: { apiKey: FAKE_KEY },
      },
      query,
    });
    const { create, update } = query.mock.calls[0]![0];
    expect(isEncrypted(create.apiKey)).toBe(true);
    expect(isEncrypted(update.apiKey)).toBe(true);
    expect(JSON.stringify(query.mock.calls[0])).not.toContain(FAKE_KEY);
  });

  it('a read returns the plaintext key to server code (the worker)', async () => {
    const key = randomBytes(32);
    const write = vi.fn().mockResolvedValue({});
    await hooks(key)['create']!({
      model: 'TenantAIProviderKey',
      operation: 'create',
      args: { data: { apiKey: FAKE_KEY } },
      query: write,
    });
    const ciphertext = write.mock.calls[0]![0].data.apiKey as string;

    const row = await hooks(key)['findFirst']!({
      model: 'TenantAIProviderKey',
      operation: 'findFirst',
      args: {},
      query: vi.fn().mockResolvedValue({ provider: 'openai', apiKey: ciphertext }),
    });
    expect(row.apiKey).toBe(FAKE_KEY);
  });

  it('a different encryption key cannot read the stored key back', async () => {
    const write = vi.fn().mockResolvedValue({});
    await hooks(randomBytes(32))['create']!({
      model: 'TenantAIProviderKey',
      operation: 'create',
      args: { data: { apiKey: FAKE_KEY } },
      query: write,
    });
    const ciphertext = write.mock.calls[0]![0].data.apiKey as string;
    await expect(
      hooks(randomBytes(32))['findFirst']!({
        model: 'TenantAIProviderKey',
        operation: 'findFirst',
        args: {},
        query: vi.fn().mockResolvedValue({ apiKey: ciphertext }),
      })
    ).rejects.toThrow();
  });
});
