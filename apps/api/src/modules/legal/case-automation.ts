/**
 * Case Automation Enforcement — PG-190 v2
 *
 * Loads a tenant's `CaseAutomationSetting` row and exposes helpers that
 * turn the stored toggles into actual runtime behavior. Policy rows are
 * owned by case-settings.router.ts; this module is the runtime consumer.
 *
 * Coverage of the 12 toggles on CaseAutomationSetting:
 *
 *   Category-1 (wired here / in cases.router.ts):
 *     - restrictTagCreationToAdmins  → assertCanCreateTag
 *     - preventDeleteWithOpenTasks   → assertCanDeleteCase (cases.router)
 *     - notifyOnDuplicate            → assertRespectNotifyOnDuplicate (cases.router)
 *     - notifyOnAssignmentChange     → emitAssignmentChangeNotification (cases.router)
 *     - notifyOnStatusChange         → emitStatusChangeNotification (cases.router)
 *
 *   Category-2 (follow-up tasks filed in PG-190 attestation notes):
 *     - autoEscalateOverdue          → workers/case-escalation (IFC-310)
 *     - notifyOnDeadlineApproaching  → workers/case-deadline-reminder (IFC-311)
 *     - aiCaseSummarization          → ai-worker/case-summarize (IFC-312)
 *     - aiPriorityPrediction         → ai-worker/case-priority (IFC-312)
 *     - aiResolutionSuggestion       → ai-worker/case-resolution (IFC-312)
 *     - aiTagSuggestions             → ai-worker/case-tag-suggest (IFC-312)
 *     - aiInsightGeneration          → ai-worker/case-insights (IFC-312)
 */

import type { CaseAutomationSetting } from '@intelliflow/db';
import { TRPCError } from '@trpc/server';

export interface CaseAutomationFlags {
  autoEscalateOverdue: boolean;
  notifyOnAssignmentChange: boolean;
  notifyOnDeadlineApproaching: boolean;
  notifyOnStatusChange: boolean;
  notifyOnDuplicate: boolean;
  restrictTagCreationToAdmins: boolean;
  preventDeleteWithOpenTasks: boolean;
  aiCaseSummarization: boolean;
  aiPriorityPrediction: boolean;
  aiResolutionSuggestion: boolean;
  aiTagSuggestions: boolean;
  aiInsightGeneration: boolean;
}

const AUTOMATION_FACTORY_DEFAULTS: CaseAutomationFlags = {
  autoEscalateOverdue: false,
  notifyOnAssignmentChange: true,
  notifyOnDeadlineApproaching: true,
  notifyOnStatusChange: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  preventDeleteWithOpenTasks: true,
  aiCaseSummarization: false,
  aiPriorityPrediction: false,
  aiResolutionSuggestion: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
};

interface HasTenantContext {
  tenant: { tenantId: string };
  prismaWithTenant: {
    caseAutomationSetting: {
      findUnique(args: { where: { tenantId: string } }): Promise<CaseAutomationSetting | null>;
    };
  };
}

interface UserRoleContext {
  user?: { role?: string | null } | null;
}

/**
 * Load the tenant's case-automation row, falling back to factory defaults
 * when no row has been seeded yet (new tenant that hasn't opened settings).
 */
export async function loadCaseAutomation(ctx: HasTenantContext): Promise<CaseAutomationFlags> {
  const row = await ctx.prismaWithTenant.caseAutomationSetting.findUnique({
    where: { tenantId: ctx.tenant.tenantId },
  });
  if (!row) return { ...AUTOMATION_FACTORY_DEFAULTS };
  return {
    autoEscalateOverdue: row.autoEscalateOverdue,
    notifyOnAssignmentChange: row.notifyOnAssignmentChange,
    notifyOnDeadlineApproaching: row.notifyOnDeadlineApproaching,
    notifyOnStatusChange: row.notifyOnStatusChange,
    notifyOnDuplicate: row.notifyOnDuplicate,
    restrictTagCreationToAdmins: row.restrictTagCreationToAdmins,
    preventDeleteWithOpenTasks: row.preventDeleteWithOpenTasks,
    aiCaseSummarization: row.aiCaseSummarization,
    aiPriorityPrediction: row.aiPriorityPrediction,
    aiResolutionSuggestion: row.aiResolutionSuggestion,
    aiTagSuggestions: row.aiTagSuggestions,
    aiInsightGeneration: row.aiInsightGeneration,
  };
}

/**
 * Enforce `restrictTagCreationToAdmins` on caseSettings.tags.create.
 * When the toggle is on, only users with role ADMIN or OWNER can add tags.
 */
export function assertCanCreateTag(
  ctx: UserRoleContext,
  flags: Pick<CaseAutomationFlags, 'restrictTagCreationToAdmins'>
): void {
  if (!flags.restrictTagCreationToAdmins) return;
  const role = ctx.user?.role ?? '';
  if (role === 'ADMIN' || role === 'OWNER') return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      'Tag creation is restricted to workspace admins. Ask an admin to create the tag or disable "Restrict tag creation to admins" in Case Settings.',
  });
}
