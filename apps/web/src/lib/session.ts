/**
 * Session Management Library for IntelliFlow CRM
 *
 * Implements session handling with Supabase Auth for Next.js 16
 * Following FLOW-001 (Login + MFA) specifications
 *
 * @module apps/web/src/lib/session
 */

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Session data structure
 */
export interface SessionData {
  userId: string;
  email: string;
  role: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/**
 * Create Supabase client for server-side operations
 */
export function createServerClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Decrypt and validate session from cookie
 * Used by proxy.ts for route protection
 */
export async function decrypt(sessionCookie: string | undefined): Promise<SessionData | null> {
  if (!sessionCookie) {
    return null;
  }

  try {
    // Parse the session cookie (JSON format)
    const session = JSON.parse(sessionCookie) as SessionData;

    // Check if session is expired
    if (session.expiresAt && Date.now() > session.expiresAt * 1000) {
      return null;
    }

    // Verify the access token with Supabase
    const supabase = createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(session.accessToken);

    if (error || !user) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email || '',
      role: (user.user_metadata?.role as string) || 'USER',
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Encrypt and store session in cookie
 */
export async function encrypt(session: SessionData): Promise<string> {
  return JSON.stringify(session);
}

/**
 * Get current session from cookies
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;
  return decrypt(sessionCookie);
}

/**
 * Create session from Supabase auth response
 */
export function createSessionFromAuth(
  userId: string,
  email: string,
  accessToken: string,
  refreshToken: string | undefined,
  expiresIn: number,
  role: string = 'USER'
): SessionData {
  return {
    userId,
    email,
    role,
    accessToken,
    refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
  };
}

/**
 * Clear session cookie
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}

/**
 * Check if user has required role
 */
export function hasRole(session: SessionData | null, requiredRoles: string[]): boolean {
  if (!session) return false;
  return requiredRoles.includes(session.role);
}

/**
 * Protected route roles
 */
export const PROTECTED_ROUTES: Record<string, string[]> = {
  '/dashboard': ['USER', 'MANAGER', 'ADMIN'],
  '/leads': ['USER', 'MANAGER', 'ADMIN'],
  '/contacts': ['USER', 'MANAGER', 'ADMIN'],
  '/analytics': ['MANAGER', 'ADMIN'],
  '/admin': ['ADMIN'],
  '/settings': ['USER', 'MANAGER', 'ADMIN'],
};

/**
 * Public routes (no auth required)
 */
export const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/auth/verify-email',
  '/auth/mfa/verify',
];
