/**
 * Access checks for route handlers under app/api.
 *
 * proxy.ts does not run its page checks on /api paths, so each handler has to
 * check its own caller. Roles are not used here: every sign-up is ADMIN of its
 * own tenant, and user_metadata can be edited by the user. An operator is a
 * confirmed email on PLATFORM_ADMIN_EMAILS, the same rule as the API's
 * platformAdminProcedure. Unset or empty allows nobody.
 */
import { NextResponse } from 'next/server';
import { createServerClient } from './session';

export interface VerifiedCaller {
  id: string;
  email: string;
  emailConfirmed: boolean;
}

function denied(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

function readToken(request: Request): string | null {
  const [scheme, token, ...rest] = (request.headers.get('authorization') ?? '').split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token && rest.length === 0) return token;
  return readCookie(request.headers.get('cookie'), 'accessToken');
}

/** Asks Supabase about the token, so a forged or expired one is refused. */
export async function getVerifiedCaller(request: Request): Promise<VerifiedCaller | null> {
  try {
    const token = readToken(request);
    if (!token) return null;
    const {
      data: { user },
      error,
    } = await createServerClient().auth.getUser(token);
    if (error || !user) return null;
    return {
      id: user.id,
      email: user.email ?? '',
      emailConfirmed: Boolean(user.email_confirmed_at),
    };
  } catch {
    return null;
  }
}

export function isOperator(
  caller: VerifiedCaller | null,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!caller?.emailConfirmed) return false;
  const email = caller.email.trim().toLowerCase();
  if (!email) return false;
  const operators = (env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return operators.includes(email);
}

/** Returns a refusal to send back, or null when the caller is signed in. */
export async function requireSignedIn(request: Request): Promise<NextResponse | null> {
  const caller = await getVerifiedCaller(request);
  return caller ? null : denied(401, 'Sign in required');
}

/** Returns a refusal to send back, or null when the caller is an operator. */
export async function requireOperator(request: Request): Promise<NextResponse | null> {
  const caller = await getVerifiedCaller(request);
  if (!caller) return denied(401, 'Sign in required');
  return isOperator(caller) ? null : denied(403, 'Not allowed');
}

/**
 * Developer-only actions need a repo checkout and must not run on a deployment.
 * Returns a refusal in production, whoever is calling.
 */
export function refuseInProduction(): NextResponse | null {
  return process.env.NODE_ENV === 'production' ? denied(403, 'Not available in production') : null;
}
