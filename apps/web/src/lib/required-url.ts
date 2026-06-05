/**
 * Production-safe URL/host resolution — web-local copy (fixes #228).
 *
 * This is a deliberate copy of `packages/validators/src/required-url.ts` kept
 * separate so it can be imported by `'use client'` components without pulling
 * the full `@intelliflow/validators` package into the client bundle.
 *
 * DO NOT add external imports here — the file must remain dependency-free.
 *
 * Usage:
 *   const supabaseUrl = requiredProdEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
 */

/**
 * True when running in a real production deployment. Deliberately false during
 * the Next.js production *build* (NEXT_PHASE) — runtime-only config (Redis, etc.)
 * need not be set to build, and NEXT_PUBLIC_* values the bundle needs are still
 * supplied via the build env. See packages/validators/src/required-url.ts.
 */
export function isProductionEnv(): boolean {
  if (process.env.NEXT_PHASE === 'phase-production-build') return false;
  return process.env.NODE_ENV === 'production';
}

/**
 * Resolve a required URL/host/config value.
 * - If `value` is set (non-empty), return it.
 * - Else in production: throw (no silent localhost fallback).
 * - Else (dev/test): return `devDefault`.
 *
 * `hint` is appended to the production error to point at the fix.
 */
export function requiredProdEnv(
  name: string,
  value: string | undefined | null,
  devDefault: string,
  hint?: string
): string {
  if (value !== undefined && value !== null && value !== '') {
    return value;
  }
  if (isProductionEnv()) {
    throw new Error(
      `[config] ${name} must be set in production — refusing to fall back to ` +
        `"${devDefault}". Set ${name} in the deployment environment.` +
        (hint ? ` ${hint}` : '')
    );
  }
  return devDefault;
}
