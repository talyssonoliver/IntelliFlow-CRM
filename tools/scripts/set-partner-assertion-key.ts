/**
 * Register a partner's Portal assertion public key (ADR-071). Operator-run, never over HTTP.
 *
 * The key decides whether a Portal-signed login assertion is believed, so changing it needs the
 * owner's yes in production. Dry run by default: it prints the fingerprints and what would
 * change. `--apply` writes. The key is replaced, not appended: after a rotation, assertions
 * signed by the old key fail once and are re-issued (they live at most 60 s).
 *
 * Usage:
 *   DATABASE_URL=<url> pnpm tsx tools/scripts/set-partner-assertion-key.ts \
 *     --partner leangency --public-key <file|-> [--apply]
 *
 * `--public-key` is a file (or `-` for stdin) holding an Ed25519 PEM public key (SPKI), a PEM
 * private key (its public half is derived and the private key is never printed or stored), or
 * the raw 32-byte public key as base64url.
 *
 * Local test database only, unless the operator points DATABASE_URL elsewhere on purpose and
 * sets ALLOW_PROD_DB_OPS=1. Never use `.env.local`'s production URL by accident.
 */

import { readFileSync } from 'node:fs';
import {
  OperatorError,
  argValue,
  assertMayWrite,
  describeTarget,
  fingerprintOfPem,
  openDatabase,
  parseAssertionPublicKey,
  type PartnerTrustDb,
} from './lib/partner-trust';

export interface SetKeyOptions {
  partner: string;
  /** Raw key material (file contents). */
  keyInput: string;
  apply: boolean;
  target: { host: string; local: boolean };
}

export interface SetKeyResult {
  partnerId: string;
  currentFingerprint: string | null;
  newFingerprint: string;
  changed: boolean;
  applied: boolean;
  derivedFromPrivate: boolean;
  lines: string[];
}

export async function setPartnerAssertionKey(
  db: PartnerTrustDb,
  options: SetKeyOptions
): Promise<SetKeyResult> {
  const parsed = parseAssertionPublicKey(options.keyInput);

  const partner = await db.partner.findUnique({
    where: { slug: options.partner },
    select: { id: true, slug: true, assertionPublicKey: true },
  });
  if (!partner) throw new OperatorError(`No partner with slug "${options.partner}".`);

  const currentFingerprint = fingerprintOfPem(partner.assertionPublicKey);
  const changed = currentFingerprint !== parsed.fingerprint;

  const lines = [
    `target database: ${options.target.host}${options.target.local ? ' (local)' : ' (NOT local)'}`,
    `partner:         ${partner.slug} (${partner.id})`,
    `current key:     ${currentFingerprint ?? '(none)'}`,
    `new key:         ${parsed.fingerprint}${changed ? '' : ' (unchanged)'}`,
  ];
  if (parsed.derivedFromPrivate) {
    lines.push('note: a PRIVATE key was supplied; only its public half is used and stored.');
  }

  let applied = false;
  if (!options.apply) {
    lines.push('dry run: nothing written. Re-run with --apply to write.');
  } else if (!changed) {
    lines.push('nothing to do: the stored key already matches.');
  } else {
    assertMayWrite(options.target);
    await db.partner.update({
      where: { id: partner.id },
      data: { assertionPublicKey: parsed.pem },
    });
    applied = true;
    lines.push(
      'written. Swap the Portal private key in the same minute (PORTAL_CRM_ASSERTION_PRIVATE_KEY).'
    );
  }

  return {
    partnerId: partner.id,
    currentFingerprint,
    newFingerprint: parsed.fingerprint,
    changed,
    applied,
    derivedFromPrivate: parsed.derivedFromPrivate,
    lines,
  };
}

function readKeyInput(source: string): string {
  return readFileSync(source === '-' ? 0 : source, 'utf8');
}

async function main(argv: readonly string[]): Promise<void> {
  const partner = argValue(argv, 'partner');
  const keySource = argValue(argv, 'public-key');
  const databaseUrl = process.env['DATABASE_URL'];
  if (!partner || !keySource || !databaseUrl) {
    console.error(
      'Usage: DATABASE_URL=<url> pnpm tsx tools/scripts/set-partner-assertion-key.ts ' +
        '--partner <slug> --public-key <file|-> [--apply]'
    );
    process.exit(1);
  }

  const { db, close } = await openDatabase(databaseUrl);
  try {
    const result = await setPartnerAssertionKey(db, {
      partner,
      keyInput: readKeyInput(keySource),
      apply: argv.includes('--apply'),
      target: describeTarget(databaseUrl),
    });
    for (const line of result.lines) console.log(line);
  } finally {
    await close();
  }
}

if (/set-partner-assertion-key\.[cm]?[jt]s$/.test(process.argv[1] ?? '')) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
