/**
 * Partner router helpers shared by the partner procedures (ADR-070, ADR-071).
 *
 * Split out of `partner.router.ts` so `login-link.ts` can use them without importing the router.
 */

import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@intelliflow/db';
import { supabaseAdmin } from '../../lib/supabase';
import { getPlatformAdminEmails, type PartnerContext } from '../../security/partner-auth';
import { membershipError } from './membership';

const LOGIN_LINK_DEFAULT_NEXT = '/dashboard';

/**
 * The in-app path the login link lands on after sign-in. `redirectTo` may only choose the path:
 * it is honoured when it is same-origin with the app, and ignored (never followed) otherwise.
 */
export function resolveLoginLinkNext(redirectTo: string | undefined, appUrl: string): string {
  if (!redirectTo) return LOGIN_LINK_DEFAULT_NEXT;
  try {
    const target = new URL(redirectTo);
    if (target.origin !== new URL(appUrl).origin) {
      console.warn('[partner] issueLoginLink: ignoring cross-origin redirectTo:', target.origin);
      return LOGIN_LINK_DEFAULT_NEXT;
    }
    const next = `${target.pathname}${target.search}`;
    // pathname always starts with a single '/', but guard against '//host' style values.
    return next.startsWith('/') && !next.startsWith('//') ? next : LOGIN_LINK_DEFAULT_NEXT;
  } catch {
    console.warn('[partner] issueLoginLink: ignoring unparseable redirectTo');
    return LOGIN_LINK_DEFAULT_NEXT;
  }
}

/** Supabase magic links live as long as the project's OTP expiry (default 1h). */
export const LOGIN_LINK_TTL_SECONDS = Number(process.env.PARTNER_LOGIN_LINK_TTL_SECONDS) || 3600;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

export function assertNotOperatorEmail(email: string): void {
  // A partner must never be able to mint an account for a platform operator's address.
  if (getPlatformAdminEmails().has(email)) {
    throw membershipError(
      'CONFLICT',
      'RESERVED_EMAIL',
      'This email address is reserved and cannot be provisioned by a partner.'
    );
  }
}

/** Load a tenant and enforce that the calling partner sourced it. */
export async function loadPartnerTenant(
  prisma: PrismaClient,
  partner: PartnerContext,
  tenantId: string
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, plan: true, status: true, partnerId: true, externalRef: true },
  });
  if (!tenant) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found.' });
  }
  if (tenant.partnerId !== partner.id) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This tenant was not sourced by your partner.',
    });
  }
  return tenant;
}

export interface EnsuredAuthUser {
  id: string;
  created: boolean;
}

/**
 * Create a confirmed Supabase Auth user for the email, so a magic link can sign them in.
 * Never adopts an Auth user this request did not create: an existing identity could belong to
 * someone unrelated to the partner, and attaching it to a partner tenant (then minting a
 * login link) would be an account takeover. An existing email is a CONFLICT instead.
 */
export async function ensureAuthUser(email: string, name?: string): Promise<EnsuredAuthUser> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: name ? { name } : {},
  });
  if (data?.user && !error) {
    return { id: data.user.id, created: true };
  }

  const alreadyExists =
    (error as { code?: string } | null)?.code === 'email_exists' ||
    /already (been )?registered/i.test(error?.message ?? '');
  if (alreadyExists) {
    throw new TRPCError({
      code: 'CONFLICT',
      message:
        'EMAIL_IN_USE: this email belongs to an existing account. ' +
        'Invite the owner by email instead.',
      cause: { code: 'EMAIL_IN_USE' },
    });
  }

  console.error('[partner] Supabase user provisioning failed:', error?.message);
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Could not provision the user account.',
  });
}

/**
 * Best-effort removal of an Auth user this request created, after the CRM write failed.
 * Never deletes an Auth user that a committed CRM user row already references: another
 * request may have adopted the same Supabase identity, and deleting it would lock that
 * tenant's owner out.
 */
export async function discardAuthUser(prisma: PrismaClient, user: EnsuredAuthUser): Promise<void> {
  if (!user.created) return;
  try {
    const referenced = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    if (referenced) return;
    await supabaseAdmin.auth.admin.deleteUser(user.id);
  } catch (err) {
    console.warn('[partner] Failed to clean up Auth user after a failed write:', err);
  }
}
