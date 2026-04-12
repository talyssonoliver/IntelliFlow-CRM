/**
 * SyncModulesOnPlanChange Use Case
 *
 * When a tenant's subscription plan changes (via Stripe webhook or admin action),
 * this use case ensures the TenantModule records are synced to match the new plan.
 *
 * Task: IFC-211 Billing Plan Integration
 */

import type { ModuleId, PlanTier } from '@intelliflow/domain';
import type { ModuleAccessPort } from '../ports/repositories/ModuleAccessPort';

export interface SyncModulesOnPlanChangeInput {
  tenantId: string;
  newPlan: PlanTier;
}

export interface SyncModulesOnPlanChangeResult {
  tenantId: string;
  plan: PlanTier;
  enabledModules: ModuleId[];
}

export class SyncModulesOnPlanChange {
  constructor(private readonly moduleAccess: ModuleAccessPort) {}

  async execute(input: SyncModulesOnPlanChangeInput): Promise<SyncModulesOnPlanChangeResult> {
    const enabledModules = await this.moduleAccess.syncModulesToPlan(input.tenantId, input.newPlan);

    return {
      tenantId: input.tenantId,
      plan: input.newPlan,
      enabledModules,
    };
  }
}
