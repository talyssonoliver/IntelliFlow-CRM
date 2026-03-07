/**
 * Prisma implementation of ModuleAccessPort
 *
 * Queries TenantModule records and falls back to plan tier defaults
 * from MODULE_PLAN_MAP when no explicit overrides exist.
 *
 * Task: IFC-209 Module Access Service
 */

import type { PrismaClient } from '@intelliflow/db';
import type { ModuleAccessPort, TenantModuleRecord } from '@intelliflow/application';
import {
  type ModuleId,
  type PlanTier,
  CRM_MODULES,
  MODULE_PLAN_MAP,
  getModulesForPlan,
} from '@intelliflow/domain';

export class PrismaTenantModuleRepository implements ModuleAccessPort {
  constructor(private readonly prisma: PrismaClient) {}

  async getEnabledModules(tenantId: string): Promise<ModuleId[]> {
    // 1. Get plan tier for the tenant
    const plan = await this.getTenantPlan(tenantId);
    const planModules = new Set<ModuleId>(getModulesForPlan(plan));

    // 2. Get explicit overrides from TenantModule table
    const overrides = await this.prisma.tenantModule.findMany({
      where: { tenantId },
    });

    // 3. Merge: start with plan defaults, then apply overrides
    const enabledSet = new Set<ModuleId>(planModules);

    for (const override of overrides) {
      const moduleId = override.moduleId as ModuleId;
      if (override.enabled) {
        enabledSet.add(moduleId); // à la carte addition
      } else if (moduleId !== 'CORE_CRM') {
        // Only disable if it's not CORE_CRM (always on)
        enabledSet.delete(moduleId);
      }
    }

    // 4. Return in canonical order
    return CRM_MODULES.filter((m) => enabledSet.has(m));
  }

  async isModuleEnabled(tenantId: string, moduleId: ModuleId): Promise<boolean> {
    // CORE_CRM is always enabled
    if (moduleId === 'CORE_CRM') return true;

    // Check explicit override first
    const override = await this.prisma.tenantModule.findUnique({
      where: { tenantId_moduleId: { tenantId, moduleId } },
    });

    if (override) {
      return override.enabled;
    }

    // Fall back to plan tier
    const plan = await this.getTenantPlan(tenantId);
    return MODULE_PLAN_MAP[plan].includes(moduleId);
  }

  async getTenantPlan(tenantId: string): Promise<PlanTier> {
    // Look up workspace associated with this tenant
    // The Workspace model has a `plan` field (PlanTier enum)
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        members: {
          some: {
            userId: {
              in: await this.prisma.user
                .findMany({ where: { tenantId }, select: { id: true } })
                .then((users) => users.map((u) => u.id)),
            },
          },
        },
      },
      select: { plan: true },
    });

    return (workspace?.plan as PlanTier) ?? 'STARTER';
  }

  async enableModule(tenantId: string, moduleId: ModuleId): Promise<TenantModuleRecord> {
    const record = await this.prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId } },
      create: {
        tenantId,
        moduleId,
        enabled: true,
        enabledAt: new Date(),
      },
      update: {
        enabled: true,
        enabledAt: new Date(),
        disabledAt: null,
      },
    });

    return {
      tenantId: record.tenantId,
      moduleId: record.moduleId as ModuleId,
      enabled: record.enabled,
      enabledAt: record.enabledAt,
      disabledAt: record.disabledAt,
    };
  }

  async disableModule(tenantId: string, moduleId: ModuleId): Promise<TenantModuleRecord> {
    // Cannot disable CORE_CRM
    if (moduleId === 'CORE_CRM') {
      return {
        tenantId,
        moduleId: 'CORE_CRM',
        enabled: true,
        enabledAt: new Date(),
        disabledAt: null,
      };
    }

    const record = await this.prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId } },
      create: {
        tenantId,
        moduleId,
        enabled: false,
        enabledAt: new Date(),
        disabledAt: new Date(),
      },
      update: {
        enabled: false,
        disabledAt: new Date(),
      },
    });

    return {
      tenantId: record.tenantId,
      moduleId: record.moduleId as ModuleId,
      enabled: record.enabled,
      enabledAt: record.enabledAt,
      disabledAt: record.disabledAt,
    };
  }

  async syncModulesToPlan(tenantId: string, plan: PlanTier): Promise<ModuleId[]> {
    const planModules = getModulesForPlan(plan);
    const now = new Date();

    // Upsert each plan module as enabled
    await Promise.all(
      planModules.map((moduleId) =>
        this.prisma.tenantModule.upsert({
          where: { tenantId_moduleId: { tenantId, moduleId } },
          create: {
            tenantId,
            moduleId,
            enabled: true,
            enabledAt: now,
          },
          update: {
            enabled: true,
            enabledAt: now,
            disabledAt: null,
          },
        })
      )
    );

    // Return the full set of enabled modules (includes any à la carte additions)
    return this.getEnabledModules(tenantId);
  }
}
