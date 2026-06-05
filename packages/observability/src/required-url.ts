/**
 * Production-safe URL/host resolution — observability-local copy (fixes #228).
 *
 * Inlined here to avoid a circular/cross-package dependency on
 * @intelliflow/validators, which would pull a large dep tree into the
 * observability bundle. Logic is identical to packages/validators/src/required-url.ts.
 *
 * DO NOT add external imports — must remain dependency-free.
 */

/**
 * True when running in a real production deployment. Deliberately false during
 * the Next.js production *build* (NEXT_PHASE) — kept identical to
 * packages/validators/src/required-url.ts.
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
