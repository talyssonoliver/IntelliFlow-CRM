/**
 * Set a partner's own organisation tenant (ADR-071). Operator-run, never over HTTP.
 *
 * `partners.ownerTenantId` is the tenant that holds the partner's staff identities. A Portal
 * assertion of kind `staff` is honoured only for an identity whose home tenant is this one, so
 * pointing it at the wrong tenant would let that tenant's users open every client as staff. It
 * must therefore be a tenant the partner did NOT source (`partnerId IS NULL`, `source = DIRECT`):
 * the agency's own CRM, never a client's.
 *
 * Dry run by default: prints before and after. `--apply` writes.
 *
 * Usage:
 *   DATABASE_URL=<url> pnpm tsx tools/scripts/set-partner-owner-tenant.ts \
 *     --partner leangency --tenant <tenantId> [--apply]
 *
 * Local test database only, unless the operator points DATABASE_URL elsewhere on purpose and
 * sets ALLOW_PROD_DB_OPS=1.
 */

import {
  OperatorError,
  argValue,
  assertMayWrite,
  describeTarget,
  openDatabase,
  type PartnerTrustDb,
} from './lib/partner-trust';

export interface SetOwnerTenantOptions {
  partner: string;
  tenantId: string;
  apply: boolean;
  target: { host: string; local: boolean };
}

export interface SetOwnerTenantResult {
  partnerId: string;
  before: string | null;
  after: string;
  changed: boolean;
  applied: boolean;
  lines: string[];
}

export async function setPartnerOwnerTenant(
  db: PartnerTrustDb,
  options: SetOwnerTenantOptions
): Promise<SetOwnerTenantResult> {
  const partner = await db.partner.findUnique({
    where: { slug: options.partner },
    select: { id: true, slug: true, ownerTenantId: true },
  });
  if (!partner) throw new OperatorError(`No partner with slug "${options.partner}".`);

  const tenant = await db.tenant.findUnique({
    where: { id: options.tenantId },
    select: { id: true, slug: true, partnerId: true, source: true },
  });
  if (!tenant) throw new OperatorError(`No tenant with id "${options.tenantId}".`);
  if (tenant.partnerId !== null || tenant.source !== 'DIRECT') {
    throw new OperatorError(
      `Tenant "${tenant.slug}" was sourced by a partner (partnerId=${tenant.partnerId ?? 'null'}, ` +
        `source=${tenant.source}). The owner tenant must be a DIRECT tenant with no partner.`
    );
  }

  const before = partner.ownerTenantId ?? null;
  const changed = before !== tenant.id;
  const lines = [
    `target database: ${options.target.host}${options.target.local ? ' (local)' : ' (NOT local)'}`,
    `partner:         ${partner.slug} (${partner.id})`,
    `ownerTenantId:   ${before ?? '(none)'} -> ${tenant.id} (${tenant.slug})${changed ? '' : ' (unchanged)'}`,
  ];

  let applied = false;
  if (!options.apply) {
    lines.push('dry run: nothing written. Re-run with --apply to write.');
  } else if (!changed) {
    lines.push('nothing to do: the owner tenant is already set to this tenant.');
  } else {
    assertMayWrite(options.target);
    await db.partner.update({ where: { id: partner.id }, data: { ownerTenantId: tenant.id } });
    applied = true;
    lines.push('written.');
  }

  return { partnerId: partner.id, before, after: tenant.id, changed, applied, lines };
}

async function main(argv: readonly string[]): Promise<void> {
  const partner = argValue(argv, 'partner');
  const tenantId = argValue(argv, 'tenant');
  const databaseUrl = process.env['DATABASE_URL'];
  if (!partner || !tenantId || !databaseUrl) {
    console.error(
      'Usage: DATABASE_URL=<url> pnpm tsx tools/scripts/set-partner-owner-tenant.ts ' +
        '--partner <slug> --tenant <tenantId> [--apply]'
    );
    process.exit(1);
  }

  const { db, close } = await openDatabase(databaseUrl);
  try {
    const result = await setPartnerOwnerTenant(db, {
      partner,
      tenantId,
      apply: argv.includes('--apply'),
      target: describeTarget(databaseUrl),
    });
    for (const line of result.lines) console.log(line);
  } finally {
    await close();
  }
}

if (/set-partner-owner-tenant\.[cm]?[jt]s$/.test(process.argv[1] ?? '')) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
