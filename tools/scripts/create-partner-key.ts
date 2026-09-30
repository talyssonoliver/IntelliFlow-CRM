/**
 * Mint a Partner API key (ADR-070). Prints the plaintext ONCE; only its sha256 is stored.
 *
 * Usage:
 *   DATABASE_URL=<url> pnpm tsx tools/scripts/create-partner-key.ts \
 *     --partner leangency --partner-name "Leangency Portal" --key-name portal-prod \
 *     --scopes tenants:read,tenants:write,members:write,auth:login-link,usage:read \
 *     [--expires-days 365]
 *
 * The partner row is created on first use. Point DATABASE_URL at the intended database
 * deliberately: this script writes to it.
 */

import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { issuePartnerKey, PARTNER_SCOPES } from '../../apps/api/src/security/partner-auth';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const partnerSlug = arg('partner');
  const keyName = arg('key-name');
  const scopes = (arg('scopes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const days = Number(arg('expires-days'));

  if (!partnerSlug || !keyName || scopes.length === 0 || !process.env['DATABASE_URL']) {
    console.error(
      'Usage: DATABASE_URL=<url> pnpm tsx tools/scripts/create-partner-key.ts ' +
        '--partner <slug> --key-name <label> --scopes <a,b> [--partner-name <name>] [--expires-days <n>]\n' +
        `Scopes: ${PARTNER_SCOPES.join(', ')}`
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
  });
  try {
    const out = await issuePartnerKey(prisma as never, {
      partnerSlug,
      partnerName: arg('partner-name'),
      keyName,
      scopes,
      expiresAt: days > 0 ? new Date(Date.now() + days * 86_400_000) : null,
    });
    console.log(`partner: ${partnerSlug} (${out.partnerId})`);
    console.log(`key id:  ${out.keyId}`);
    console.log('API key (shown once, store it now):');
    console.log(out.plaintext);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
