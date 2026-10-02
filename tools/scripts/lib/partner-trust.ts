/**
 * Shared pieces of the two operator scripts that set a partner's trust anchors (ADR-071):
 * `set-partner-assertion-key.ts` and `set-partner-owner-tenant.ts`.
 *
 * Both anchors decide who may open which tenant, so neither is ever writable over HTTP. They are
 * changed here, by an operator, in a dry run first.
 */

import { createHash, createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { hostOf, isLocalUrl } from './db-target.mjs';

/** SPKI DER prefix of an Ed25519 public key; the 32 raw key bytes follow. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export class OperatorError extends Error {}

export interface ParsedPublicKey {
  /** Canonical Ed25519 SPKI PEM: the value stored in `partners.assertionPublicKey`. */
  pem: string;
  fingerprint: string;
  /** True when the input was a private key and only its public half was derived. */
  derivedFromPrivate: boolean;
}

/** sha256 of the SPKI DER, hex, first 16 characters. */
export function fingerprintOf(key: KeyObject): string {
  const der = key.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex').slice(0, 16);
}

/** Fingerprint of a stored PEM, or null when there is none or it cannot be read. */
export function fingerprintOfPem(pem: string | null | undefined): string | null {
  if (!pem) return null;
  try {
    return fingerprintOf(createPublicKey(pem));
  } catch {
    return null;
  }
}

function toPublic(key: KeyObject, derivedFromPrivate: boolean): ParsedPublicKey {
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new OperatorError(`The key is ${key.asymmetricKeyType ?? 'unknown'}, not Ed25519.`);
  }
  const publicKey = key.type === 'private' ? createPublicKey(key) : key;
  return {
    pem: (publicKey.export({ type: 'spki', format: 'pem' }) as string).trim(),
    fingerprint: fingerprintOf(publicKey),
    derivedFromPrivate,
  };
}

function parsePem(text: string): ParsedPublicKey {
  // Portal env files carry literal "\n" sequences; accept them.
  const pem = text.includes('\\n') && !text.includes('\n') ? text.replace(/\\n/g, '\n') : text;
  try {
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pem)) {
      return toPublic(createPrivateKey(pem), true);
    }
    return toPublic(createPublicKey(pem), false);
  } catch (error) {
    if (error instanceof OperatorError) throw error;
    throw new OperatorError('The PEM could not be parsed as an Ed25519 key.');
  }
}

function parseDer(bytes: Buffer): ParsedPublicKey {
  try {
    return toPublic(createPublicKey({ key: bytes, format: 'der', type: 'spki' }), false);
  } catch (error) {
    if (error instanceof OperatorError) throw error;
  }
  try {
    return toPublic(createPrivateKey({ key: bytes, format: 'der', type: 'pkcs8' }), true);
  } catch (error) {
    if (error instanceof OperatorError) throw error;
    throw new OperatorError('Not a raw 32-byte key, an SPKI DER or a PKCS8 DER Ed25519 key.');
  }
}

/**
 * Accept an Ed25519 key as: a PEM public key (SPKI), a PEM private key (PKCS8, the public half is
 * derived), or a bare base64url / base64 string holding the 32 raw public bytes, an SPKI DER or
 * a PKCS8 DER. Anything else, or a non-Ed25519 key, is rejected.
 */
export function parseAssertionPublicKey(input: string): ParsedPublicKey {
  const text = input.trim();
  if (!text) throw new OperatorError('The key file is empty.');
  if (text.includes('-----BEGIN')) return parsePem(text);

  const compact = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9_+/=-]+$/.test(compact)) {
    throw new OperatorError('The key is neither a PEM nor base64.');
  }
  const bytes = Buffer.from(compact.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (bytes.length === 32) {
    const spki = Buffer.concat([ED25519_SPKI_PREFIX, bytes]);
    return toPublic(createPublicKey({ key: spki, format: 'der', type: 'spki' }), false);
  }
  return parseDer(bytes);
}

/** Host of a database URL with credentials removed, for the operator's eyes. */
export function describeTarget(url: string | undefined): { host: string; local: boolean } {
  const resolved = url ?? '';
  return { host: hostOf(resolved) || '(none)', local: isLocalUrl(resolved) };
}

/**
 * Writes need an explicit decision when the database is not local: the same
 * `ALLOW_PROD_DB_OPS=1` the destructive-op guard uses.
 */
export function assertMayWrite(
  target: { host: string; local: boolean },
  env: NodeJS.ProcessEnv = process.env
): void {
  if (target.local) return;
  if (env.ALLOW_PROD_DB_OPS === '1') return;
  throw new OperatorError(
    `Refusing to write: "${target.host}" is not a local database. ` +
      'Production needs the owner yes and ALLOW_PROD_DB_OPS=1.'
  );
}

export function argValue(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Minimal client surface the scripts need; the real PrismaClient satisfies it. */
export interface PartnerTrustDb {
  partner: {
    findUnique(args: { where: { slug: string }; select: Record<string, boolean> }): Promise<{
      id: string;
      slug: string;
      assertionPublicKey?: string | null;
      ownerTenantId?: string | null;
    } | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  tenant: {
    findUnique(args: {
      where: { id: string };
      select: Record<string, boolean>;
    }): Promise<{ id: string; slug: string; partnerId: string | null; source: string } | null>;
  };
}

/** Open the generated Prisma client on `url`. Imported lazily so tests need no database. */
export async function openDatabase(
  url: string
): Promise<{ db: PartnerTrustDb; close: () => Promise<void> }> {
  const { PrismaClient } = await import('../../../packages/db/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  return { db: prisma as unknown as PartnerTrustDb, close: () => prisma.$disconnect() };
}
