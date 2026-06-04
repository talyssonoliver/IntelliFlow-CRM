/**
 * Production-safe URL/host resolution (fixes #228).
 *
 * Many services historically did `process.env.FOO || 'http://localhost:...'`.
 * In production a missing env var then silently falls back to a loopback
 * address, so the live app talks to `localhost` (the "localhost on prod live"
 * bug). These helpers make that failure LOUD instead of silent: in production a
 * missing required value throws a clear startup error; in dev/test the localhost
 * default is preserved so local workflows are unchanged.
 *
 * Usage:
 *   const redisHost = requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost');
 *   const appUrl    = requiredProdEnv('APP_URL', process.env.APP_URL, 'http://localhost:3000');
 */

/**
 * True when running in a real production deployment.
 *
 * Deliberately false during the Next.js production *build* (page-data collection
 * / prerender runs server code with NODE_ENV=production but is NOT a runtime
 * deployment — Redis/Vault/etc. are not reachable and need not be set). Those
 * runtime-only values fail fast at actual runtime instead. Build-time config
 * that the client bundle needs (NEXT_PUBLIC_*) is still supplied via the build
 * env, so this guard does not let localhost leak into the bundle.
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
 *
 * @remarks SAFETY CONTRACT
 * Call only inside a function/factory, never at module-init scope (top-level
 * const, class field, or module-level singleton) — at import time a missing var
 * crashes the whole process. Enforced by the no-eager-requiredProdEnv lint rule.
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
