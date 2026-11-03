/**
 * Production license-key check for the API and worker services.
 *
 * In production a service refuses to start unless the SHA-256 of IFC_LICENSE_KEY
 * matches the constant below. Development and tests are unaffected. It reads the
 * environment only: no network call, no telemetry, and the key is never printed.
 * See docs/operations/env-requirements.md.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/** SHA-256 hex digest of the production key. Holds no key, only its digest. */
export const EXPECTED_LICENSE_SHA256 =
  '65828cfeaf9318b49788b0940139ea0cd5c40911ae36b8af6a8086e444f6ea06';

const SHA256_HEX = /^[0-9a-f]{64}$/;

export type LicenseCheckResult = { ok: true } | { ok: false; reason: string };

export function checkLicenseKey(
  env: NodeJS.ProcessEnv,
  expectedSha256: string = EXPECTED_LICENSE_SHA256
): LicenseCheckResult {
  if (env.NODE_ENV !== 'production') return { ok: true };

  if (!SHA256_HEX.test(expectedSha256)) {
    return { ok: false, reason: 'this build has no license hash configured' };
  }
  const key = env.IFC_LICENSE_KEY;
  if (!key) return { ok: false, reason: 'IFC_LICENSE_KEY is not set' };

  const actual = createHash('sha256').update(key).digest();
  const matches = timingSafeEqual(actual, Buffer.from(expectedSha256, 'hex'));
  return matches ? { ok: true } : { ok: false, reason: 'IFC_LICENSE_KEY is not valid' };
}

/** Prints a clear error and exits 1 when the check fails. */
export function enforceLicenseKey(env: NodeJS.ProcessEnv = process.env): void {
  const result = checkLicenseKey(env);
  if (result.ok) return;
  process.stderr.write(
    `[license] Refusing to start in production: ${result.reason}. ` +
      'Set the licensed IFC_LICENSE_KEY on this service. ' +
      'See docs/operations/env-requirements.md.\n'
  );
  process.exit(1);
}
