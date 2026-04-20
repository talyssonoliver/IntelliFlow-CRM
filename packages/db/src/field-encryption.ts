/**
 * Bespoke Prisma 7 field-level encryption extension.
 *
 * Mirrors the AES-256-GCM pattern from DurableAuditLogAdapter.ts.
 * Replaces the deferred `prisma-field-encryption@1.x` library that was
 * incompatible with Prisma 7's DMMF shape.
 *
 * Algorithm  : AES-256-GCM
 * Storage fmt: `v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>`
 * Key env var : PRISMA_FIELD_ENCRYPTION_KEY — 32-byte base64-encoded string
 *
 * Encrypted models / fields (mirrors /// @encrypted schema annotations):
 *   ChainVersion     : prompt, systemPrompt
 *   WebhookEndpoint  : secret
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldEncryptionConfig {
  /** 32-byte AES key. Call deriveKey() to obtain from an env string. */
  key: Buffer;
}

// ---------------------------------------------------------------------------
// Field map — explicit, not DMMF-driven (safe across Prisma major versions)
// ---------------------------------------------------------------------------

const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  ChainVersion: ['prompt', 'systemPrompt'],
  WebhookEndpoint: ['secret'],
};

// ---------------------------------------------------------------------------
// Key derivation helper
// ---------------------------------------------------------------------------

/**
 * Derive a 32-byte Buffer from a base64-encoded env variable.
 *
 * @throws Error if the decoded length is not exactly 32 bytes.
 */
export function deriveKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.byteLength !== 32) {
    throw new Error(
      `[field-encryption] PRISMA_FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes ` +
        `(AES-256). Got ${key.byteLength} bytes. ` +
        `Generate a valid key with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Encrypt / decrypt primitives
// ---------------------------------------------------------------------------

const CIPHER_ALGO = 'aes-256-gcm' as const;
const VERSION_PREFIX = 'v1';

/**
 * Encrypt a UTF-8 plaintext string.
 * Returns `v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>`.
 */
export function encryptField(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12); // GCM standard: 96-bit nonce
  const cipher = createCipheriv(CIPHER_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes by default
  return `${VERSION_PREFIX}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a ciphertext string produced by encryptField().
 * If the value does not start with "v1:" it is returned as-is (backfill
 * compatibility — plaintext rows exist before the first backfill run).
 */
export function decryptField(value: string, key: Buffer): string {
  if (!value.startsWith(`${VERSION_PREFIX}:`)) {
    // Already plaintext — idempotent path
    return value;
  }
  const parts = value.split(':');
  if (parts.length !== 4) {
    throw new Error(
      `[field-encryption] Unexpected ciphertext format — expected 4 colon-separated parts, got ${parts.length}`
    );
  }
  // parts[0] === 'v1' (version)
  const iv = Buffer.from(parts[1]!, 'base64');
  const authTag = Buffer.from(parts[2]!, 'base64');
  const ciphertext = Buffer.from(parts[3]!, 'base64');

  const decipher = createDecipheriv(CIPHER_ALGO, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

/**
 * Return true if the value has been encrypted by this module.
 * Used in tests + idempotent-check paths.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION_PREFIX}:`);
}

// ---------------------------------------------------------------------------
// Data helpers — encrypt/decrypt all annotated fields in a data object
// ---------------------------------------------------------------------------

function encryptData(
  modelName: string,
  data: Record<string, unknown>,
  key: Buffer
): Record<string, unknown> {
  const fields = ENCRYPTED_FIELDS[modelName];
  if (!fields) return data;
  const result = { ...data };
  for (const field of fields) {
    const val = result[field];
    if (typeof val === 'string') {
      result[field] = encryptField(val, key);
    }
    // null / undefined pass through unchanged
  }
  return result;
}

function decryptData(
  modelName: string,
  data: Record<string, unknown>,
  key: Buffer
): Record<string, unknown> {
  const fields = ENCRYPTED_FIELDS[modelName];
  if (!fields) return data;
  const result = { ...data };
  for (const field of fields) {
    const val = result[field];
    if (typeof val === 'string') {
      result[field] = decryptField(val, key);
    }
  }
  return result;
}

/**
 * Apply encryption to a single Prisma write-args payload (`data` / `create` /
 * `update`). Handles both array (createMany) and object (update/upsert) shapes.
 * Mutation is returned — callers assign back to `args[field]`.
 */
function encryptWritePayload(modelName: string, payload: unknown, key: Buffer): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item: Record<string, unknown>) => encryptData(modelName, item, key));
  }
  if (payload && typeof payload === 'object') {
    return encryptData(modelName, payload as Record<string, unknown>, key);
  }
  return payload;
}

/**
 * Build the mutated args object for a Prisma write operation by applying
 * field-level encryption to the appropriate payload key(s).
 */
function buildEncryptedWriteArgs(
  op: 'create' | 'createMany' | 'update' | 'updateMany' | 'upsert',
  args: Record<string, unknown>,
  modelName: string,
  key: Buffer
): Record<string, unknown> {
  const mutated = { ...args };

  if (op === 'upsert') {
    if (mutated['create'])
      mutated['create'] = encryptWritePayload(modelName, mutated['create'], key);
    if (mutated['update'])
      mutated['update'] = encryptWritePayload(modelName, mutated['update'], key);
    return mutated;
  }

  // create / createMany / update / updateMany — payload lives in args.data
  if (mutated['data'] !== undefined) {
    mutated['data'] = encryptWritePayload(modelName, mutated['data'], key);
  }
  return mutated;
}

// ---------------------------------------------------------------------------
// Prisma 7 $extends extension factory
// ---------------------------------------------------------------------------

/**
 * Build a Prisma 7 `$extends` extension that transparently encrypts writes
 * and decrypts reads for the fields listed in ENCRYPTED_FIELDS.
 *
 * Usage:
 *   const prisma = new PrismaClient({ adapter }).
 *     $extends(fieldEncryptionExtension({ key: deriveKey(process.env.PRISMA_FIELD_ENCRYPTION_KEY) }));
 */
export function fieldEncryptionExtension(config: FieldEncryptionConfig) {
  const { key } = config;

  // We iterate the explicit model list and register a query override per model.
  // Prisma 7's $extends query API uses:
  //   query.<Model>.<operation>({ model, operation, args, query }) => Promise<result>
  //
  // For write operations we mutate `args.data` before forwarding to `query()`.
  // For read operations we wrap the returned rows.

  type QueryArgs = {
    model: string | undefined;
    operation: string;
    args: Record<string, unknown>;
    query: (args: Record<string, unknown>) => Promise<unknown>;
  };

  const encryptedModels = Object.keys(ENCRYPTED_FIELDS);

  // Build per-model query overrides
  const modelOverrides: Record<string, object> = {};

  for (const modelName of encryptedModels) {
    // Prisma model names are PascalCase; the query override keys are camelCase
    // (e.g. ChainVersion → chainVersion).
    const modelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1);

    const writeOps = ['create', 'createMany', 'update', 'updateMany', 'upsert'] as const;
    const readOps = [
      'findUnique',
      'findFirst',
      'findMany',
      'findUniqueOrThrow',
      'findFirstOrThrow',
    ] as const;

    const writeOverrides: Record<string, (args: QueryArgs) => Promise<unknown>> = {};
    const readOverrides: Record<string, (args: QueryArgs) => Promise<unknown>> = {};

    for (const op of writeOps) {
      writeOverrides[op] = async ({ model: _m, operation: _op, args, query }: QueryArgs) => {
        const mutatedArgs = buildEncryptedWriteArgs(op, args, modelName, key);
        return query(mutatedArgs);
      };
    }

    for (const op of readOps) {
      readOverrides[op] = async ({ model: _m, operation: _op, args, query }: QueryArgs) => {
        const result = await query(args);
        if (Array.isArray(result)) {
          return result.map((row: Record<string, unknown>) => decryptData(modelName, row, key));
        }
        if (result && typeof result === 'object') {
          return decryptData(modelName, result as Record<string, unknown>, key);
        }
        return result;
      };
    }

    modelOverrides[modelKey] = { ...writeOverrides, ...readOverrides };
  }

  return Prisma.defineExtension({
    name: 'field-encryption',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: modelOverrides as any,
  });
}
