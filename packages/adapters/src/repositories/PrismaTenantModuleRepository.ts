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
  type TenantBusinessType,
  type TenantModuleOrigin,
  DATA_PROTECTED_MODULES,
  MODULE_PLAN_MAP,
  dataProtectionFor,
  getModulesForPlan,
  isTenantBusinessType,
  resolveEnabledModules,
} from '@intelliflow/domain';

export class PrismaTenantModuleRepository implements ModuleAccessPort {
  constructor(private readonly prisma: PrismaClient) {}

  async getEnabledModules(
    tenantId: string,
    businessTypeOverride?: TenantBusinessType
  ): Promise<ModuleId[]> {
    // The single resolver (domain): (plan ∩ business type) ∪ explicit OVERRIDE rows − switched-off rows.
    const [{ plan, businessType }, overrides] = await Promise.all([
      this.getTenantProfile(tenantId),
      this.prisma.tenantModule.findMany({ where: { tenantId } }),
    ]);

    return resolveEnabledModules({
      plan,
      businessType: businessTypeOverride ?? businessType,
      overrides: overrides.map((o) => ({
        moduleId: o.moduleId as ModuleId,
        enabled: o.enabled,
        origin: (o.origin ?? 'PLAN') as TenantModuleOrigin,
      })),
    });
  }

  async isModuleEnabled(tenantId: string, moduleId: ModuleId): Promise<boolean> {
    // CORE_CRM is always enabled
    if (moduleId === 'CORE_CRM') return true;
    return (await this.getEnabledModules(tenantId)).includes(moduleId);
  }

  /** Plan and business type in one read. */
  private async getTenantProfile(
    tenantId: string
  ): Promise<{ plan: PlanTier; businessType: TenantBusinessType | null }> {
    // ADR-070: the plan lives on Tenant (Workspace is deprecated and nothing populates it).
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, businessType: true },
    });

    // Fail-safe: an unknown or missing plan resolves to the smallest known tier,
    // never to an undefined MODULE_PLAN_MAP lookup.
    const plan = tenant?.plan;
    const businessType = tenant?.businessType;
    return {
      plan: plan && plan in MODULE_PLAN_MAP ? (plan as PlanTier) : 'STARTER',
      businessType: isTenantBusinessType(businessType) ? businessType : null,
    };
  }

  async getTenantPlan(tenantId: string): Promise<PlanTier> {
    return (await this.getTenantProfile(tenantId)).plan;
  }

  async getBusinessType(tenantId: string): Promise<TenantBusinessType | null> {
    return (await this.getTenantProfile(tenantId)).businessType;
  }

  async setBusinessType(tenantId: string, businessType: TenantBusinessType): Promise<ModuleId[]> {
    // The protection is worked out for the NEW type first and written in the same transaction as the
    // type itself, so a failure in between can never leave the type changed with data hidden.
    const toProtect = await this.modulesToProtect(tenantId, businessType);
    await this.prisma.$transaction([
      this.prisma.tenant.update({ where: { id: tenantId }, data: { businessType } }),
      ...this.protectionUpserts(tenantId, toProtect),
    ]);
    return toProtect;
  }

  /**
   * Nobody loses sight of data they already have: for every vertical module the workspace holds rows in
   * (cases and case documents for LEGAL, tickets for SUPPORT) that only the business type now hides, write an
   * EXISTING_DATA override ON. The row is only written for a module the plan includes, so a later downgrade
   * still switches it off like any other above-plan row. A module the plan does not include, or one someone
   * deliberately switched off, is left alone for a human to decide (see `dataProtectionFor`).
   * Returns the modules protected.
   */
  async protectExistingData(tenantId: string): Promise<ModuleId[]> {
    const toProtect = await this.modulesToProtect(tenantId);
    await this.prisma.$transaction(this.protectionUpserts(tenantId, toProtect));
    return toProtect;
  }

  /** The modules that hold data and would be hidden, for the workspace's type or the one about to be set. */
  private async modulesToProtect(
    tenantId: string,
    businessType?: TenantBusinessType
  ): Promise<ModuleId[]> {
    const [enabledList, plan, moduleRows] = await Promise.all([
      this.getEnabledModules(tenantId, businessType),
      this.getTenantPlan(tenantId),
      this.prisma.tenantModule.findMany({ where: { tenantId } }),
    ]);
    const enabled = new Set(enabledList);
    const [cases, documents, tickets] = await Promise.all([
      this.prisma.case.count({ where: { tenantId } }),
      this.prisma.caseDocument.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.ticket.count({ where: { tenantId } }),
    ]);
    const rows: Record<(typeof DATA_PROTECTED_MODULES)[number], number> = {
      LEGAL: cases + documents,
      SUPPORT: tickets,
    };
    return DATA_PROTECTED_MODULES.filter(
      (moduleId) =>
        dataProtectionFor({
          moduleId,
          plan,
          hasData: rows[moduleId] > 0,
          enabled: enabled.has(moduleId),
          switchedOff: moduleRows.some((r) => r.moduleId === moduleId && !r.enabled),
        }) === 'protect'
    );
  }

  private protectionUpserts(tenantId: string, moduleIds: readonly ModuleId[]) {
    const now = new Date();
    return moduleIds.map((moduleId) =>
      this.prisma.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        create: { tenantId, moduleId, enabled: true, origin: 'EXISTING_DATA', enabledAt: now },
        update: { enabled: true, origin: 'EXISTING_DATA', enabledAt: now, disabledAt: null },
      })
    );
  }

  async enableModule(tenantId: string, moduleId: ModuleId): Promise<TenantModuleRecord> {
    // An explicit enable is an OVERRIDE: it can switch a module on outside the business type.
    const record = await this.prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId } },
      create: {
        tenantId,
        moduleId,
        enabled: true,
        origin: 'OVERRIDE',
        enabledAt: new Date(),
      },
      update: {
        enabled: true,
        origin: 'OVERRIDE',
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
        // An off row belongs to the plan again: a later plan sync that re-enables it must not bring
        // back an OVERRIDE or EXISTING_DATA grant that someone deliberately switched off.
        origin: 'PLAN',
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

    // Apply the plan atomically (RACE-ENTIT-M1):
    //  1. enable every module in the new plan, and
    //  2. disable any enabled override row whose module is NOT in the new plan.
    // Step 2 is the fix for the downgrade leak: without it the method is
    // additive-only, so above-plan override rows stay enabled=true and
    // getEnabledModules merges them back in — a downgraded tenant would keep
    // higher-plan (paid) module access. Running both in one transaction means
    // the enabled set can never be observed in a half-synced state. CORE_CRM is
    // part of every plan, so `notIn planModules` never disables it.
    // The same transaction records the plan on Tenant (the source of truth for getTenantPlan
    // and quota limits), so a Stripe plan change can never leave modules and plan disagreeing.
    await this.prisma.$transaction([
      this.prisma.tenant.update({ where: { id: tenantId }, data: { plan } }),
      ...planModules.map((moduleId) =>
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
      ),
      this.prisma.tenantModule.updateMany({
        where: { tenantId, enabled: true, moduleId: { notIn: [...planModules] } },
        data: { enabled: false, disabledAt: now },
      }),
    ]);

    // Return the resulting enabled set (now bounded by the new plan).
    return this.getEnabledModules(tenantId);
  }
}
