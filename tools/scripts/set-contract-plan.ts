/**
 * Put a workspace on the CUSTOM contract plan. Operator-run, never over HTTP.
 *
 * A contract plan is agreed outside self-serve checkout (invoiced, or a customer's own
 * agreement), so there is no Stripe subscription. billing.getPlanState reports a CUSTOM
 * tenant as an active contract plan: no trial badge and no trial end. This script records
 * the plan the same way a Stripe plan change does (PrismaTenantModuleRepository
 * .syncModulesToPlan): Tenant.plan plus the plan's modules, in one transaction.
 *
 * Dry run by default: prints the tenant, its current plan, trial end, any live Stripe
 * subscription and the module changes. `--apply` writes.
 *
 * Usage:
 *   DATABASE_URL=<url> pnpm tsx tools/scripts/set-contract-plan.ts --tenant <tenantId> [--apply]
 *
 * Local database only, unless the operator points DATABASE_URL elsewhere on purpose and
 * sets ALLOW_PROD_DB_OPS=1 (owner yes required for production).
 */

import { getModulesForPlan } from '../../packages/domain/src/platform/modules/ModuleRegistry';
import { OperatorError, argValue, assertMayWrite, describeTarget } from './lib/partner-trust';

export interface ContractPlanDb {
  tenant: {
    findUnique(args: { where: { id: string }; select: Record<string, boolean> }): Promise<{
      id: string;
      slug: string;
      name: string;
      plan: string;
      trialEndsAt: Date | null;
    } | null>;
    update(args: { where: { id: string }; data: { plan: 'CUSTOM' } }): unknown;
  };
  stripeSubscription: {
    count(args: { where: { tenantId: string; status: { in: string[] } } }): Promise<number>;
  };
  tenantModule: {
    findMany(args: {
      where: { tenantId: string; enabled: boolean };
      select: { moduleId: true };
    }): Promise<Array<{ moduleId: string }>>;
    upsert(args: {
      where: { tenantId_moduleId: { tenantId: string; moduleId: string } };
      create: { tenantId: string; moduleId: string; enabled: true; enabledAt: Date };
      update: { enabled: true; enabledAt: Date; disabledAt: null };
    }): unknown;
  };
  $transaction(operations: unknown[]): Promise<unknown>;
}

export interface SetContractPlanOptions {
  tenantId: string;
  apply: boolean;
  target: { host: string; local: boolean };
  now?: Date;
}

export interface SetContractPlanResult {
  changed: boolean;
  applied: boolean;
  modulesToEnable: string[];
  lines: string[];
}

export async function setContractPlan(
  db: ContractPlanDb,
  options: SetContractPlanOptions
): Promise<SetContractPlanResult> {
  const tenant = await db.tenant.findUnique({
    where: { id: options.tenantId },
    select: { id: true, slug: true, name: true, plan: true, trialEndsAt: true },
  });
  if (!tenant) throw new OperatorError(`No tenant with id "${options.tenantId}".`);

  const liveSubscriptions = await db.stripeSubscription.count({
    where: { tenantId: tenant.id, status: { in: ['ACTIVE', 'PAST_DUE'] } },
  });
  if (liveSubscriptions > 0) {
    throw new OperatorError(
      `Tenant "${tenant.slug}" has a live Stripe subscription; its plan comes from Stripe. ` +
        'Cancel or move it in Stripe first: a contract plan is for workspaces billed outside it.'
    );
  }

  const enabled = new Set(
    (
      await db.tenantModule.findMany({
        where: { tenantId: tenant.id, enabled: true },
        select: { moduleId: true },
      })
    ).map((row) => row.moduleId)
  );
  const planModules = [...getModulesForPlan('CUSTOM')];
  const modulesToEnable = planModules.filter((moduleId) => !enabled.has(moduleId));
  const changed = tenant.plan !== 'CUSTOM' || modulesToEnable.length > 0;

  const lines = [
    `target database: ${options.target.host}${options.target.local ? ' (local)' : ' (NOT local)'}`,
    `tenant:          ${tenant.name} (${tenant.slug}, ${tenant.id})`,
    `plan:            ${tenant.plan} -> CUSTOM${tenant.plan === 'CUSTOM' ? ' (unchanged)' : ''}`,
    `trial end:       ${tenant.trialEndsAt?.toISOString() ?? '(none stored)'} (no longer applies on CUSTOM)`,
    `modules enabled: ${modulesToEnable.length > 0 ? modulesToEnable.join(', ') : '(none to add)'}`,
  ];

  let applied = false;
  if (!options.apply) {
    lines.push('dry run: nothing written. Re-run with --apply to write.');
  } else if (!changed) {
    lines.push('nothing to do: the tenant is already on the contract plan with its modules.');
  } else {
    assertMayWrite(options.target);
    const now = options.now ?? new Date();
    await db.$transaction([
      db.tenant.update({ where: { id: tenant.id }, data: { plan: 'CUSTOM' } }),
      ...planModules.map((moduleId) =>
        db.tenantModule.upsert({
          where: { tenantId_moduleId: { tenantId: tenant.id, moduleId } },
          create: { tenantId: tenant.id, moduleId, enabled: true, enabledAt: now },
          update: { enabled: true, enabledAt: now, disabledAt: null },
        })
      ),
    ]);
    applied = true;
    lines.push('written.');
  }

  return { changed, applied, modulesToEnable, lines };
}

async function main(argv: readonly string[]): Promise<void> {
  const tenantId = argValue(argv, 'tenant');
  const databaseUrl = process.env['DATABASE_URL'];
  if (!tenantId || !databaseUrl) {
    console.error(
      'Usage: DATABASE_URL=<url> pnpm tsx tools/scripts/set-contract-plan.ts --tenant <tenantId> [--apply]'
    );
    process.exit(1);
  }

  const { PrismaClient } = await import('../../packages/db/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const result = await setContractPlan(prisma as unknown as ContractPlanDb, {
      tenantId,
      apply: argv.includes('--apply'),
      target: describeTarget(databaseUrl),
    });
    for (const line of result.lines) console.log(line);
  } finally {
    await prisma.$disconnect();
  }
}

if (/set-contract-plan\.[cm]?[jt]s$/.test(process.argv[1] ?? '')) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
