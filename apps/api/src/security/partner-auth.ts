/**
 * Partner API key authentication (ADR-070)
 *
 * A partner (e.g. the Leangency Portal) authenticates with a per-partner API key
 * (`Authorization: Bearer pk_<...>`). Only the sha256 of the key is stored; the
 * plaintext is shown once at creation. Each key carries a list of scopes.
 */

import { createHash, randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@intelliflow/db';

export const PARTNER_SCOPES = [
  'tenants:read',
  'tenants:write',
  'members:write',
  'auth:login-link',
  'usage:read',
] as const;

export type PartnerScope = (typeof PARTNER_SCOPES)[number];

export interface PartnerContext {
  id: string;
  slug: string;
  scopes: string[];
}

export const PARTNER_KEY_PREFIX = 'pk_';

export function hashPartnerKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** Generate a new partner key. The plaintext must be shown to the operator once and never stored. */
export function generatePartnerKey(): { plaintext: string; keyHash: string; keyPrefix: string } {
  const plaintext = `${PARTNER_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return {
    plaintext,
    keyHash: hashPartnerKey(plaintext),
    keyPrefix: plaintext.slice(0, 11),
  };
}

export interface IssuePartnerKeyInput {
  partnerSlug: string;
  /** Used only when the partner does not exist yet. */
  partnerName?: string;
  keyName: string;
  scopes: readonly string[];
  expiresAt?: Date | null;
}

/**
 * Create (or reuse) a partner and mint a key for it. Returns the plaintext once —
 * only its sha256 is persisted. Unknown scopes are rejected.
 */
export async function issuePartnerKey(
  prisma: PrismaClient,
  input: IssuePartnerKeyInput
): Promise<{ partnerId: string; keyId: string; plaintext: string; keyPrefix: string }> {
  const unknown = input.scopes.filter((s) => !(PARTNER_SCOPES as readonly string[]).includes(s));
  if (unknown.length > 0 || input.scopes.length === 0) {
    const detail = unknown.length > 0 ? ` (${unknown.join(', ')})` : ' (none given)';
    throw new Error(`Invalid scopes${detail}; allowed: ${PARTNER_SCOPES.join(', ')}`);
  }

  const partner = await prisma.partner.upsert({
    where: { slug: input.partnerSlug },
    create: { slug: input.partnerSlug, name: input.partnerName ?? input.partnerSlug },
    update: {},
    select: { id: true },
  });
  const key = generatePartnerKey();
  const record = await prisma.partnerApiKey.create({
    data: {
      partnerId: partner.id,
      name: input.keyName,
      keyHash: key.keyHash,
      keyPrefix: key.keyPrefix,
      scopes: [...input.scopes],
      expiresAt: input.expiresAt ?? null,
    },
    select: { id: true },
  });
  return {
    partnerId: partner.id,
    keyId: record.id,
    plaintext: key.plaintext,
    keyPrefix: key.keyPrefix,
  };
}

function extractPartnerKey(req?: Request): string | null {
  const header = req?.headers.get('authorization');
  if (!header) return null;
  const [scheme, token, ...rest] = header.split(' ');
  if (rest.length > 0 || scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.startsWith(PARTNER_KEY_PREFIX) ? token : null;
}

function normalizeScopes(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
}

/**
 * Resolve the partner behind a request, or throw UNAUTHORIZED.
 * The key must exist, be active, be unexpired, and belong to an ACTIVE partner.
 */
export async function authenticatePartner(
  prisma: PrismaClient,
  req?: Request
): Promise<PartnerContext> {
  const unauthorized = new TRPCError({
    code: 'UNAUTHORIZED',
    message: 'A valid partner API key is required.',
  });

  const key = extractPartnerKey(req);
  if (!key) throw unauthorized;

  const record = await prisma.partnerApiKey.findUnique({
    where: { keyHash: hashPartnerKey(key) },
    include: { partner: { select: { id: true, slug: true, status: true } } },
  });

  if (
    !record ||
    !record.isActive ||
    (record.expiresAt && record.expiresAt.getTime() <= Date.now()) ||
    record.partner.status !== 'ACTIVE'
  ) {
    throw unauthorized;
  }

  // Fire-and-forget: a failed bookkeeping write must never fail the request.
  void prisma.partnerApiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch((err: unknown) => console.warn('[partner-auth] lastUsedAt update failed:', err));

  return {
    id: record.partner.id,
    slug: record.partner.slug,
    scopes: normalizeScopes(record.scopes),
  };
}

/** Comma-separated PLATFORM_ADMIN_EMAILS, normalised. Empty (unset) means nobody. */
export function getPlatformAdminEmails(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.PLATFORM_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Fail-closed platform-operator check: the email must be allow-listed AND verified
 * (an unverified sign-up must not be able to claim an operator's address).
 */
export function isPlatformAdmin(
  user: { email?: string | null; emailVerified?: boolean } | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const email = user?.email?.trim().toLowerCase();
  if (!email || user?.emailVerified !== true) return false;
  return getPlatformAdminEmails(env).has(email);
}
