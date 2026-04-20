/**
 * field-encryption-extension.test.ts
 *
 * Unit tests for the bespoke Prisma 7 field-encryption extension.
 *
 * Coverage:
 *   (a) Roundtrip: plaintext write → encrypted DB storage → plaintext read
 *   (b) Raw storage: ciphertext starts with "v1:" — never matches plaintext
 *   (c) Idempotent decrypt: already-encrypted value returned as-is on second decrypt
 *   (d) Null passthrough: null / undefined values are not modified
 *   (e) Key validation: deriveKey() rejects wrong-length keys
 *   (f) Extension wires: query overrides exist for all target model/operation pairs
 *   (g) encryptField / decryptField primitives produce valid v1: tokens
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes, createHash } from 'node:crypto';

/* eslint-disable @typescript-eslint/no-unsafe-function-type */
// In Prisma 7, Prisma.defineExtension wraps args in a function. Mock it as an
// identity function so tests can inspect the extension args directly.
vi.mock('../../generated/prisma/client', () => ({
  Prisma: {
    defineExtension: (args: unknown) => args,
  },
}));

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------
import {
  encryptField,
  decryptField,
  isEncrypted,
  deriveKey,
  fieldEncryptionExtension,
} from '../field-encryption.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a fresh random 32-byte key for each test. */
function makeKey(): Buffer {
  return randomBytes(32);
}

/** Generate a valid base64-encoded 32-byte key string. */
function makeBase64Key(): string {
  return randomBytes(32).toString('base64');
}

// ---------------------------------------------------------------------------
// 1. Primitive: encryptField / decryptField
// ---------------------------------------------------------------------------

describe('encryptField / decryptField', () => {
  it('produces a v1: prefixed ciphertext', () => {
    const key = makeKey();
    const plaintext = 'Hello, IntelliFlow!';
    const cipher = encryptField(plaintext, key);
    expect(cipher).toMatch(/^v1:/);
  });

  it('ciphertext has exactly 4 colon-separated parts', () => {
    const key = makeKey();
    const cipher = encryptField('test', key);
    expect(cipher.split(':')).toHaveLength(4);
  });

  it('decrypts to the original plaintext', () => {
    const key = makeKey();
    const plaintext = 'my secret prompt — unicode ✓ 🔒';
    const cipher = encryptField(plaintext, key);
    expect(decryptField(cipher, key)).toBe(plaintext);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const key = makeKey();
    const plaintext = 'determinism check';
    const c1 = encryptField(plaintext, key);
    const c2 = encryptField(plaintext, key);
    // Different IVs → different outputs
    expect(c1).not.toBe(c2);
    // But both decrypt to the same plaintext
    expect(decryptField(c1, key)).toBe(plaintext);
    expect(decryptField(c2, key)).toBe(plaintext);
  });

  it('throws on tampered auth tag', () => {
    const key = makeKey();
    const cipher = encryptField('tamper test', key);
    const parts = cipher.split(':');
    // Corrupt the auth tag (index 2)
    parts[2] = Buffer.from('deadbeefdeadbeef', 'hex').toString('base64');
    const tampered = parts.join(':');
    expect(() => decryptField(tampered, key)).toThrow();
  });

  it('throws on wrong key', () => {
    const key1 = makeKey();
    const key2 = makeKey();
    const cipher = encryptField('wrong key test', key1);
    expect(() => decryptField(cipher, key2)).toThrow();
  });

  it('throws on malformed ciphertext (wrong part count)', () => {
    const key = makeKey();
    expect(() => decryptField('v1:a:b', key)).toThrow(/4 colon-separated parts/);
  });
});

// ---------------------------------------------------------------------------
// 2. Idempotent-decrypt (already-encrypted values pass through on decrypt)
// ---------------------------------------------------------------------------

describe('isEncrypted / idempotent behavior', () => {
  it('isEncrypted returns true for a v1: ciphertext', () => {
    const key = makeKey();
    const cipher = encryptField('abc', key);
    expect(isEncrypted(cipher)).toBe(true);
  });

  it('isEncrypted returns false for plaintext', () => {
    expect(isEncrypted('hello world')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted('v0:something')).toBe(false);
  });

  it('decryptField passes through plaintext values unchanged (backfill safety)', () => {
    const key = makeKey();
    const plaintext = 'not yet encrypted';
    // Value does not start with "v1:" — must be returned as-is
    expect(decryptField(plaintext, key)).toBe(plaintext);
  });

  it('double-encrypt then decrypt gives back the original plaintext', () => {
    // This simulates: encrypt on first write, then the backfill re-reads the
    // already-encrypted value and re-saves it — the extension must decrypt first
    // then re-encrypt. The decrypt-first step returns plaintext, not a nested
    // ciphertext. Test uses the primitives to verify the invariant.
    const key = makeKey();
    const original = 'original prompt text';
    const cipher1 = encryptField(original, key);

    // Simulate "read back" — decrypt the stored ciphertext
    const afterRead = decryptField(cipher1, key);
    expect(afterRead).toBe(original);

    // Simulate "re-save" — encrypt the read-back value
    const cipher2 = encryptField(afterRead, key);
    expect(isEncrypted(cipher2)).toBe(true);

    // Final decrypt — must still be the original plaintext
    expect(decryptField(cipher2, key)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// 3. deriveKey
// ---------------------------------------------------------------------------

describe('deriveKey', () => {
  it('returns a 32-byte Buffer from a valid base64 key', () => {
    const b64 = makeBase64Key();
    const key = deriveKey(b64);
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.byteLength).toBe(32);
  });

  it('throws when the decoded key is not 32 bytes', () => {
    const shortKey = randomBytes(16).toString('base64'); // 16 bytes
    expect(() => deriveKey(shortKey)).toThrow(/exactly 32 bytes/);
  });

  it('throws when given an empty string', () => {
    expect(() => deriveKey('')).toThrow(/exactly 32 bytes/);
  });
});

// ---------------------------------------------------------------------------
// 4. fieldEncryptionExtension — wiring verification
// ---------------------------------------------------------------------------

describe('fieldEncryptionExtension', () => {
  it('returns an object with a "name" property of "field-encryption"', () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key });
    // Prisma defineExtension returns an object with a name property
    expect(ext).toMatchObject({ name: 'field-encryption' });
  });

  it('includes query overrides for chainVersion and webhookEndpoint', () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    // The extension object has a `query` property with per-model overrides
    const query = ext['query'] as Record<string, unknown>;
    expect(query).toBeDefined();
    expect(query['chainVersion']).toBeDefined();
    expect(query['webhookEndpoint']).toBeDefined();
  });

  it('chainVersion override covers write operations', () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const chainVersionOps = query['chainVersion'] as Record<string, unknown>;
    for (const op of ['create', 'createMany', 'update', 'updateMany', 'upsert']) {
      expect(typeof chainVersionOps[op]).toBe('function');
    }
  });

  it('chainVersion override covers read operations', () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const chainVersionOps = query['chainVersion'] as Record<string, unknown>;
    for (const op of [
      'findUnique',
      'findFirst',
      'findMany',
      'findUniqueOrThrow',
      'findFirstOrThrow',
    ]) {
      expect(typeof chainVersionOps[op]).toBe('function');
    }
  });

  it('webhookEndpoint override covers write + read operations', () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const webhookOps = query['webhookEndpoint'] as Record<string, unknown>;
    for (const op of ['create', 'update', 'findUnique', 'findMany']) {
      expect(typeof webhookOps[op]).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Extension write hooks: encrypt fields in args.data before query
// ---------------------------------------------------------------------------

describe('fieldEncryptionExtension — write hook (ChainVersion)', () => {
  it('encrypts prompt and systemPrompt in create args', async () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const chainVersionOps = query['chainVersion'] as Record<string, unknown>;
    const createOp = chainVersionOps['create'] as Function;

    let capturedArgs: Record<string, unknown> = {};
    const mockQuery = vi.fn(async (args: Record<string, unknown>) => {
      capturedArgs = args;
      return { id: 'test-id', prompt: args['data'] };
    });

    await createOp({
      model: 'ChainVersion',
      operation: 'create',
      args: {
        data: { prompt: 'my prompt', systemPrompt: 'my system prompt', chainType: 'SCORING' },
      },
      query: mockQuery,
    });

    const data = capturedArgs['data'] as Record<string, unknown>;
    // prompt must be encrypted
    expect(typeof data['prompt']).toBe('string');
    expect(isEncrypted(data['prompt'] as string)).toBe(true);
    // systemPrompt must be encrypted
    expect(isEncrypted(data['systemPrompt'] as string)).toBe(true);
    // Other fields pass through unchanged
    expect(data['chainType']).toBe('SCORING');
  });

  it('does NOT encrypt null systemPrompt', async () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const chainVersionOps = query['chainVersion'] as Record<string, unknown>;
    const createOp = chainVersionOps['create'] as Function;

    let capturedArgs: Record<string, unknown> = {};
    const mockQuery = vi.fn(async (args: Record<string, unknown>) => {
      capturedArgs = args;
      return {};
    });

    await createOp({
      model: 'ChainVersion',
      operation: 'create',
      args: { data: { prompt: 'prompt text', systemPrompt: null } },
      query: mockQuery,
    });

    const data = capturedArgs['data'] as Record<string, unknown>;
    expect(data['systemPrompt']).toBeNull();
  });

  it('encrypts fields in update args', async () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const chainVersionOps = query['chainVersion'] as Record<string, unknown>;
    const updateOp = chainVersionOps['update'] as Function;

    let capturedArgs: Record<string, unknown> = {};
    const mockQuery = vi.fn(async (args: Record<string, unknown>) => {
      capturedArgs = args;
      return {};
    });

    await updateOp({
      model: 'ChainVersion',
      operation: 'update',
      args: { where: { id: 'abc' }, data: { prompt: 'updated prompt' } },
      query: mockQuery,
    });

    const data = capturedArgs['data'] as Record<string, unknown>;
    expect(isEncrypted(data['prompt'] as string)).toBe(true);
  });

  it('encrypts fields in upsert.create and upsert.update', async () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const chainVersionOps = query['chainVersion'] as Record<string, unknown>;
    const upsertOp = chainVersionOps['upsert'] as Function;

    let capturedArgs: Record<string, unknown> = {};
    const mockQuery = vi.fn(async (args: Record<string, unknown>) => {
      capturedArgs = args;
      return {};
    });

    await upsertOp({
      model: 'ChainVersion',
      operation: 'upsert',
      args: {
        where: { id: 'abc' },
        create: { prompt: 'create prompt' },
        update: { prompt: 'update prompt' },
      },
      query: mockQuery,
    });

    const create = capturedArgs['create'] as Record<string, unknown>;
    const update = capturedArgs['update'] as Record<string, unknown>;
    expect(isEncrypted(create['prompt'] as string)).toBe(true);
    expect(isEncrypted(update['prompt'] as string)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Extension read hooks: decrypt fields in returned rows
// ---------------------------------------------------------------------------

describe('fieldEncryptionExtension — read hook (ChainVersion)', () => {
  it('decrypts prompt on findUnique', async () => {
    const key = makeKey();
    const plaintext = 'decrypted prompt content';
    const ciphertext = encryptField(plaintext, key);

    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const chainVersionOps = query['chainVersion'] as Record<string, unknown>;
    const findUniqueOp = chainVersionOps['findUnique'] as Function;

    const mockQuery = vi.fn(async () => ({
      id: 'row-1',
      prompt: ciphertext,
      systemPrompt: null,
    }));

    const result = (await findUniqueOp({
      model: 'ChainVersion',
      operation: 'findUnique',
      args: { where: { id: 'row-1' } },
      query: mockQuery,
    })) as Record<string, unknown>;

    expect(result['prompt']).toBe(plaintext);
    expect(result['systemPrompt']).toBeNull();
  });

  it('decrypts each row returned by findMany', async () => {
    const key = makeKey();
    const rows = [
      { id: '1', prompt: encryptField('prompt one', key), systemPrompt: null },
      { id: '2', prompt: encryptField('prompt two', key), systemPrompt: encryptField('sys', key) },
    ];

    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const chainVersionOps = query['chainVersion'] as Record<string, unknown>;
    const findManyOp = chainVersionOps['findMany'] as Function;

    const mockQuery = vi.fn(async () => rows);

    const result = (await findManyOp({
      model: 'ChainVersion',
      operation: 'findMany',
      args: {},
      query: mockQuery,
    })) as Array<Record<string, unknown>>;

    expect(result[0]!['prompt']).toBe('prompt one');
    expect(result[1]!['prompt']).toBe('prompt two');
    expect(result[1]!['systemPrompt']).toBe('sys');
  });

  it('returns plaintext unchanged (idempotent read — backfill rows)', async () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const chainVersionOps = query['chainVersion'] as Record<string, unknown>;
    const findUniqueOp = chainVersionOps['findUnique'] as Function;

    const mockQuery = vi.fn(async () => ({
      id: 'old-row',
      prompt: 'plaintext prompt before backfill',
    }));

    const result = (await findUniqueOp({
      model: 'ChainVersion',
      operation: 'findUnique',
      args: { where: { id: 'old-row' } },
      query: mockQuery,
    })) as Record<string, unknown>;

    // Must be returned as-is, no error
    expect(result['prompt']).toBe('plaintext prompt before backfill');
  });
});

// ---------------------------------------------------------------------------
// 7. WebhookEndpoint.secret encryption
// ---------------------------------------------------------------------------

describe('fieldEncryptionExtension — WebhookEndpoint.secret', () => {
  it('encrypts secret on create', async () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const webhookOps = query['webhookEndpoint'] as Record<string, unknown>;
    const createOp = webhookOps['create'] as Function;

    let capturedArgs: Record<string, unknown> = {};
    const mockQuery = vi.fn(async (args: Record<string, unknown>) => {
      capturedArgs = args;
      return {};
    });

    await createOp({
      model: 'WebhookEndpoint',
      operation: 'create',
      args: { data: { secret: 'whsec_supersecret', url: 'https://example.com' } },
      query: mockQuery,
    });

    const data = capturedArgs['data'] as Record<string, unknown>;
    expect(isEncrypted(data['secret'] as string)).toBe(true);
    // Non-encrypted fields pass through
    expect(data['url']).toBe('https://example.com');
  });

  it('decrypts secret on findMany', async () => {
    const key = makeKey();
    const secret = 'whsec_mysecrettoken';
    const ciphertext = encryptField(secret, key);

    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const webhookOps = query['webhookEndpoint'] as Record<string, unknown>;
    const findManyOp = webhookOps['findMany'] as Function;

    const mockQuery = vi.fn(async () => [
      { id: 'wh-1', secret: ciphertext, url: 'https://example.com' },
    ]);

    const result = (await findManyOp({
      model: 'WebhookEndpoint',
      operation: 'findMany',
      args: {},
      query: mockQuery,
    })) as Array<Record<string, unknown>>;

    expect(result[0]!['secret']).toBe(secret);
  });

  it('passes null secret through unchanged', async () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const webhookOps = query['webhookEndpoint'] as Record<string, unknown>;
    const findManyOp = webhookOps['findMany'] as Function;

    const mockQuery = vi.fn(async () => [{ id: 'wh-no-secret', secret: null }]);

    const result = (await findManyOp({
      model: 'WebhookEndpoint',
      operation: 'findMany',
      args: {},
      query: mockQuery,
    })) as Array<Record<string, unknown>>;

    expect(result[0]!['secret']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Full roundtrip via mock query layer
//    Simulates: plaintext write → encrypted DB → plaintext read
// ---------------------------------------------------------------------------

describe('roundtrip via mock query layer', () => {
  it('(a) plaintext write → encrypted storage → plaintext read', async () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const chainVersionOps = query['chainVersion'] as Record<string, unknown>;
    const createOp = chainVersionOps['create'] as Function;
    const findUniqueOp = chainVersionOps['findUnique'] as Function;

    // --- Write phase ---
    const plainPrompt = `integration roundtrip — ${randomBytes(4).toString('hex')}`;
    let storedPrompt = '';

    const mockCreate = vi.fn(async (args: Record<string, unknown>) => {
      const data = args['data'] as Record<string, unknown>;
      storedPrompt = data['prompt'] as string;
      return { id: 'rt-id', prompt: storedPrompt };
    });

    await createOp({
      model: 'ChainVersion',
      operation: 'create',
      args: { data: { prompt: plainPrompt } },
      query: mockCreate,
    });

    // (b) raw query returns ciphertext starting with "v1:"
    expect(storedPrompt).toMatch(/^v1:/);
    expect(storedPrompt).not.toBe(plainPrompt);

    // --- Read phase ---
    const mockFindUnique = vi.fn(async () => ({
      id: 'rt-id',
      prompt: storedPrompt, // simulated DB storage — still encrypted
    }));

    const readResult = (await findUniqueOp({
      model: 'ChainVersion',
      operation: 'findUnique',
      args: { where: { id: 'rt-id' } },
      query: mockFindUnique,
    })) as Record<string, unknown>;

    // (a) reads back as plaintext
    expect(readResult['prompt']).toBe(plainPrompt);
  });

  it('(c) already-encrypted value is returned as-is (idempotent decrypt)', async () => {
    const key = makeKey();
    const ext = fieldEncryptionExtension({ key }) as unknown as Record<string, unknown>;
    const query = ext['query'] as Record<string, unknown>;
    const chainVersionOps = query['chainVersion'] as Record<string, unknown>;
    const findUniqueOp = chainVersionOps['findUnique'] as Function;

    const plaintext = 'backfill idempotency check';
    const ciphertext = encryptField(plaintext, key);

    // Simulate finding a row that already has encrypted data
    const mockQuery = vi.fn(async () => ({ id: 'x', prompt: ciphertext }));

    const result1 = (await findUniqueOp({
      model: 'ChainVersion',
      operation: 'findUnique',
      args: { where: { id: 'x' } },
      query: mockQuery,
    })) as Record<string, unknown>;

    // Read twice — must return plaintext both times, no double-decrypt error
    const result2 = (await findUniqueOp({
      model: 'ChainVersion',
      operation: 'findUnique',
      args: { where: { id: 'x' } },
      query: mockQuery,
    })) as Record<string, unknown>;

    expect(result1['prompt']).toBe(plaintext);
    expect(result2['prompt']).toBe(plaintext);
  });
});

// ---------------------------------------------------------------------------
// 9. Deterministic hash integrity
//    SHA-256 hash of plaintext must equal hash of decrypted ciphertext
// ---------------------------------------------------------------------------

describe('hash integrity', () => {
  it('SHA-256 of decrypted value equals SHA-256 of original plaintext', () => {
    const key = makeKey();
    const plaintext = 'hash-integrity test prompt';
    const cipher = encryptField(plaintext, key);
    const decrypted = decryptField(cipher, key);
    const hashOriginal = createHash('sha256').update(plaintext).digest('hex');
    const hashDecrypted = createHash('sha256').update(decrypted).digest('hex');
    expect(hashDecrypted).toBe(hashOriginal);
  });
});
